# Deploy checklist — shared-mechanism impact map + smoke protocol

Guard artifact (Maestro `/guard`, 2026-07-19). The project has no automated
test net (deliberate) and deploys go straight to production, so this checklist
is the regression gate. It has two parts: an **impact map** consulted at
change time, and a **5-minute smoke protocol** run after deploying anything
that touches a shared mechanism.

Reference case for why this exists: the July 13 display-target enforcement
(78bca47/3b5ddb9) silently broke the tech console following the leader's song;
it sat in production for 6 days and surfaced during Sunday-service prep
(fixed in edeb58f). Every mechanism below has non-obvious consumers like that.

---

## 1. When this applies

Run the smoke protocol after deploying any change that touches:

- the `current` table (any reader/writer),
- WebSocket message types or `websocket-server.php`,
- display-target resolution (`resolveDisplayTarget`, `channel` args,
  `user_settings.{leader,sermon}_display_target`),
- `Ajax_*` commands used by more than one page,
- `websocket_auth.js`, `csrf_interceptor`, session/auth code,
- the languages registry / dynamic language columns,
- UI i18n dictionaries or `t()` / `T::s()` plumbing.

Pure content edits (one page, one role, no shared state) need only their own
scenario re-checked.

## 2. Impact map: shared mechanisms → consumers to re-check

### 2.1 `current` table (one row per group = "what is on screen")
- **Writers:** `set_image`, `clear_image` (Ajax_Common); `set_tech_image`,
  `set_text` (UPSERT), `set_slide`, `set_message_text`, `set_bible_text`,
  `set_video`, `video_control`, `disable_external_display`,
  `set_display_transform` (UPDATE of `transform` only, on gesture end)
  (Ajax_Tech); `set_leader_text` (Ajax_Leader, Aug 2026 — the leader's
  split-screen verse mode: same UPSERT semantics as `set_text`, but the
  group is resolved via the LEADER-channel display target, NULL = no-op;
  text format and `chapter_indices` follow the tech `splitText` contract,
  so the tech console's highlight restore must keep working).
- **Readers:** `get_image` (incl. `transform`) → main screen
  `text_layout.html` AND streaming `text_layout_streaming.html` (skips
  `__slide__`, ignores `transform`); `get_current_state` → tech console
  state restore (`restoreCurrentState`).
- `transform` column (July 2026): zoom/pan state of the slide/image, JSON
  `{"s","x","y"}` or '' = identity; auto-resets on every DELETE+INSERT.
- **Gotcha (fixed e19074d, keep honoring):** the screen's text branch
  deduplicates renders via `$scope.srcText` — every non-text branch MUST
  reset `srcText`, or returning to the same text renders a blank screen.
- **Media-guard (Aug 2026):** song selection / notes toggles (`set_image`,
  `set_tech_image` with a sheet path, `clear_image` in notes-off form) SKIP
  the row write when `hasActiveMediaRow()` — a video (any state) or a
  full-screen image with empty text keeps playing. Text rows and slides are
  NOT protected. Explicit media commands (`set_video`, wallpaper click,
  `disable_external_display`) still replace/clear the row.
- Changing row shape/semantics ⇒ re-check: main screen, streaming screen,
  tech restore-after-reload, sermon right-pane consistency.

### 2.1b `current_notes` table — the NOTES CHANNEL (Aug 2026)
- One row per group: the sheet-music image musicians currently see.
  Completely separate from `current`; screen commands never touch it.
- **Writers:** `setNotes()` from `set_image` (leader song click; always own
  group, ignores display target) and `set_tech_image` (tech song click);
  `clearNotes()` from `clear_image` with `channel:'leader'` OR
  `clear_notes:1` (tech song toggle-off, playlist clear, active-song
  delete). These four paths are THE ONLY notes off/on switches.
- **Readers:** `get_notes` → musician page; `get_current_state.notes_image`
  → tech console restore (selected song survives any screen content; the
  screen row is NEVER a fallback for the selected song — with shared
  display targets it can hold another group's image).
- `upload_song_image` re-broadcasts `notes_update` when the uploaded sheet
  is the group's current notes (musicians re-pull with a fresh buster).
- `get_notes` fetches on the musician page and tech console are
  sequence-guarded: an out-of-order (stale) response is discarded, so rapid
  song toggles can't pin a previous song's sheet.
- **Stale-client safety net (Aug 2026):** `get_image` called by a
  musician-ROLE session returns the notes-channel image in the legacy
  response shape (old cached musician.js reads the screen row otherwise).
  Musician role has no screen routes, so screens are unaffected.
- **Image groups (Aug 2026, `app/SongImages.php`):** `get_notes` with
  `with_groups: 1` (musician page ONLY) adds `list_id`, `num`, `groups[]`
  with page paths; without the flag (tech console) the response shape is
  unchanged. The channel still stores ONLY the main sheet path
  `/images/<L>/<NUM>.jpg` — never a page/group path. `set_image` keeps
  non-ASCII song numbers (`д001`, `304 (1)`) in that path since this change.

### 2.1c Sheet-music image groups (Aug 2026)
- Table `song_image_groups` (per collection: NAME = as created, NAMES = JSON
  translations per UI language with fallback to NAME, SORT_ORDER, IS_MAIN);
  every reader must go through `SongImages::displayName()` for user-facing
  names (`set_image_group_names` edits the translations);
  image files are the source of truth, ONE image per song and group:
  main group = legacy `/images/<L>/<NUM>.jpg`, every other group
  `/images/<L>/g<ID>/<NUM>.jpg|png` (legacy `<NUM>_1.<ext>` still read).
- **Writers:** `import_song_images_zip` (`group_id`, `mode` replace|add),
  `add/rename/delete/reorder_image_group(s)` (Ajax_Import, admin), the
  legacy `upload_song_image` (main image only — unchanged),
  `upload_song_group_image` / `delete_song_group_image` (tech edit dialog,
  roles admin/leader/tech; replace / remove the group's image).
- **Readers:** `get_notes with_groups` (musician, `groups[].image`),
  `get_image_groups` (import page), `get_song_images` (tech edit dialog).
  Leader/tech lists and the screens use the main sheet only.
- Musician page with a song on but no image in any group shows
  `public/no_image/<ui_lang>.png` (also on a load error of a listed page);
  notes OFF keeps the configured placeholder.
- Changing file naming or the IS_MAIN rule ⇒ re-check `SongImages::songPages`,
  `parseEntryName`, the musician fallback order and the import log.
- Production has NO php zip extension: `ZipReader` (pure PHP) is the import
  path there; ZipArchive only on machines that have it (names read RAW).

### 2.1d `current_observer` table — the OBSERVER CHANNEL (Aug 2026)
- One row per group: `active` (the leader's «📡 Транслировать в группу»
  toggle), `song_id`, `verse_idx` (-1 = whole song), `langs` (leader's
  selection, observer fallback). Separate from `current` / `current_notes`.
- **Writers:** `observer_set_active`, `observer_set_song` (Ajax_Observer,
  leader/admin only) — called by `leader.js` IN ADDITION to its existing
  `set_image` / `set_leader_text` / `clear_image`; `observer_set_song` is a
  no-op while `active = 0`. Nothing else writes it.
- **Readers:** `observer_get_state` (observer page: enter group mode,
  reconnect, song change; leader page: restore the toggle).
- The observer role may only call the whitelist in
  `Ajax_Observer::$observerCommands` (read-only views + its channel) —
  adding a command the observer page needs means adding it there.
- Changing the row shape ⇒ re-check `observer.js` `applyGroupState` and the
  leader's `observerSend` hooks (song open/close, verse on/off, language
  switch, toggle on re-send).

### 2.2 WebSocket message types (group-routed via port 2346)
| Type | Producers | Consumers |
|---|---|---|
| `update_needed` | `updateSocket()` after most writes | both screens (refetch), tech console (reload+restore), leader (favorites) — musician IGNORES it since Aug 2026 |
| `notes_update` | `setNotes()`/`clearNotes()`, `upload_song_image` | musician page (refetch `get_notes`); tech console (sync song highlight with the notes channel) |
| `display_transform` | `set_display_transform` (sermon pinch zoom/pan, ~10Hz during gesture) | main screen (applies CSS transform directly, no refetch); streaming ignores |
| `video_seek` | `video_seek` (sermon page: slider seek, seek made inside its YouTube player, periodic position sync every 5 s while playing; dropped server-side when `current.video_src` differs) | main screen (seeks its YouTube iframe via `yt_bridge.js` / `<video>`; explicit seeks always, periodic ones only to catch up when lagging > 2.5 s — never rewinds); streaming ignores |
| `leader_song_changed` | `set_image` channel `'leader'` | tech console (follow song, prepare verses) |
| `leader_langs_changed` | `set_leader_langs` (leader verse mode: open + every language switch) | tech console (mirror language toggles, rebuild song chips, re-map highlight by index) |
| `observer_update` | `observer_set_active`, `observer_set_song` (leader page, observer channel) — payload `{active, song_id, verse_idx, langs}` | observer page (group mode: apply state, fetch `observer_get_state` on song change); leader page (toggle sync across sessions) |
| `display_target_changed` | `set_display_target` (tech) | sermon page (local copy), tech selects |
| `sermon_display_cleared` | `disable_external_display` | sermon page (deactivate UI) |
| `access_request` / `access_response` | display-access flow | tech console |
- New type: no WS-server restart needed. Changed/removed type: grep ALL of
  `tech.js`, `leader.js`, `sermon.js`, `text_layout*.html`, `musician`.

### 2.3 Display-target resolution (channels)
- `resolveDisplayTarget()` gates: `set_image`, `clear_image`,
  `set_tech_image`, `set_message_text`, `set_video`, `video_control`,
  `video_seek`, `set_slide`, `set_leader_text`. NULL target = command must
  not touch any screen — but
  side-channels (e.g. `leader_song_changed`) must still fire.
- The pianist page (`/piano`, Aug 2026) never broadcasts: its `piano_*`
  commands only touch `$_SESSION['piano_favorites']`; it must stay free of
  `set_image` / `set_tech_image` / `updateSocket` / notes-channel writes.
- The observer page (`/observer`, Aug 2026) is read-only by construction
  (role whitelist in `Ajax::execute`); the observer channel is not a display
  target — `resolveDisplayTarget` is not involved, screens never react to it.
- Tech-page calls WITHOUT `channel` act on the caller's OWN group only.
  A client-supplied `target_group_id` is IGNORED since Aug 2026 (it let
  stale/crafted clients write into another group's screen row); the same
  applies to `set_bible_text`. Cross-group routing happens ONLY via the
  technician-set display targets resolved server-side.
- The WS server derives a connection's group from the `users` table at auth
  time; the client-claimed `groupId` is ignored (it was unauthenticated —
  the HMAC token covers only userId). Changing group membership takes
  effect on the next WS reconnect.

### 2.4 Build & i18n contracts
- Any JS edit: terser (no `--mangle`) + `?v=N` bump in every referencing
  template.
- Any UI string: keys in ALL FOUR dictionaries (ru/de/en/lt), rendered via
  `window.t()` / `T::s()`.

## 3. Smoke protocol (≈5 minutes, run on production after deploy)

Setup: one browser as ведущий, one as техник (same group), one screen tab
(`/text`), streaming tab (`/text_stream`) if streaming is affected.

1. **Leader → tech follow:** ведущий открывает песню — на техстранице песня
   выделяется и появляются куплеты (при цели «не транслировать» экран НЕ
   меняется).
   **Режим «Слова по куплетам» (Aug 2026):** ведущий открывает ¶-режим и
   кликает куплет — куплет на главном экране И подсвечен на техстранице;
   свайп вверх/вниз листает куплеты везде; закрытие режима снимает ноты и
   очищает экран (играющее медиа переживает открытие, но заменяется кликом
   по куплету — как у техника).
2. **Tech → screen:** техник кликает куплет — куплет на главном экране;
   повторный клик снимает; стриминговый экран показывает текст песни и
   игнорирует слайды.
3. **Wallpaper survival:** техник ставит обои/фон; ведущий открывает и
   закрывает песню — обои целы (цель NULL).
4. **Sermon:** страница проповеди показывает слайд (цель канала задана) —
   слайд на главном экране; «Отключить экран» у техника убирает его и
   деактивирует UI проповедника.
   **Видео (Aug 2026):** YouTube-ролик со страницы проповеди — перемотка
   ползунком и внутри плеера повторяется на главном экране (~1 с);
   пауза/пуск и ⏹ работают как раньше; обычный видеофайл — то же самое.
5. **Bible/messages:** техник выводит стих — стих на экране, навигация
   стрелками работает.
6. **Reconnect:** перезагрузить вкладку экрана — актуальное состояние
   восстановилось (включая зум-трансформацию, когда фича появится).
7. **Auth spot-check:** страница логина открывается, вход работает (CSRF/
   session не задеты). **Ссылка автовхода наблюдателя (Aug 2026):**
   `/join/<мусор>` → редирект на `/login`; QR/ссылка из настроек → сразу
   `/observer` под общим аккаунтом; «Новая ссылка» делает старую недействительной.
8. **Musician image groups (Aug 2026):** страница музыканта показывает ноты
   открытой песни и полупрозрачные кнопки «НОТЫ»/«АККОРДЫ»; переключение
   группы без картинки показывает первую найденную (кнопка выбора остаётся);
   в полноэкранном режиме только картинка; на странице импорта у выбранного
   сборника виден список групп. Песня без картинок → заглушка «Для этой
   песни пока нет картинок» на языке интерфейса. В окне редактирования
   песни (техстраница) блок «Группы картинок»: добавление/удаление страниц
   применяется сразу, заголовок окна — название слева, ✕ справа.

9. **Observer mode (Aug 2026):** вход общим логином роли «Наблюдатель» →
   главная показывает только «Наблюдатель» и «Выйти» (настроек нет);
   `/observer`: поиск песни по номеру/словам → текст на языках и картинки
   по типам, тап — полный экран; Библия: перевод → книга → глава, поиск по
   словам; Послания: список + поиск по тексту; История. Ведущий включает
   «📡 Транслировать в группу» → наблюдатель в групповом режиме видит
   открытую ведущим песню (текст/ноты по своему выбору), куплет из режима
   куплетов — крупно, после закрытия — экран ожидания; при выключенной
   кнопке — «трансляция выключена». Музыкант, техстраница и экраны при
   включённой кнопке ведут себя как раньше.

Any step fails ⇒ do not leave it "to check later": fix forward or roll back.

## 4. Rollback

```
git revert <bad-commit> && git push origin master && git push github master
tools\deploy.cmd            # = ssh root@server.winsys.lv "cd /srv/songs && git pull"
```
- WS server restart is NOT needed for message-type changes; it IS needed if
  `websocket-server.php` itself changed: `php websocket-server.php restart`.
- DB migrations: write the reverse `ALTER` into the migration file header
  before applying the forward one.

## 5. Access hygiene (least privilege)

- Routine DB diagnostics use the read-only MySQL user (`songs_ro`, SELECT
  only). The root account is reserved for migrations and admin tasks.
- **Creation pending** (run once as root, replace the password):

```sql
CREATE USER IF NOT EXISTS 'songs_ro'@'%' IDENTIFIED BY '<strong-password>';
GRANT SELECT ON songs.* TO 'songs_ro'@'%';
FLUSH PRIVILEGES;
```

- Secrets stay out of the repo (`app/config.php` is git-ignored); production
  data dumps are never committed.
