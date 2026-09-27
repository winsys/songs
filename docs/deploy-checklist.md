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
- **Notes stay on (Sept 2026):** the leader leaving a song view (notes /
  text fullscreen, verse mode) sends `clear_image` `channel:'leader'`
  `keep_notes:1` — screen cleared as before, notes untouched. The leader
  switches notes by clicking a list row: `set_image` / `clear_image` with
  `notes_only:1` (notes channel + `leader_song_changed` only, NO screen
  change); a song leaving the list is switched off the same way. The tech
  console's song toggle is unchanged (`set_tech_image` / `clear_notes:1`).
  Leader pages also listen to `notes_update` (list "on" highlight).
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
- **Writers:** `observer_set_active`, `observer_set_song`, `observer_set_text`
  (Ajax_Observer, leader/tech/admin) — called by `leader.js` and `tech.js` IN
  ADDITION to their existing `set_image` / `set_tech_image` / `set_text` /
  `set_leader_text` / `set_bible_text` / `set_message_text` / `clear_image`;
  all are no-ops while `active = 0`. The toggle is ONE per group (leader
  page + tech console share it). Nothing else writes the table.
- **Readers:** `observer_get_state` (observer page: enter group mode,
  reconnect, song change; leader page: restore the toggle).
- The observer role may only call the whitelist in
  `Ajax_Observer::$observerCommands` (read-only views + its channel) —
  adding a command the observer page needs means adding it there.
- Changing the row shape ⇒ re-check `observer.js` `applyGroupState` and the
  leader's `observerSend` hooks (song open/close, verse on/off, language
  switch, toggle on re-send).

### 2.1e The group playlist — `favorites` + `tech_media_favorites`
- One shared `sort_order` sequence over both tables. `favorites` holds songs
  AND leader notes (Sept 2026): a note is a row with `NOTE` set (utf8mb4
  text) and a synthetic `SONGID` = `'N'` + 14 hex chars, so the unique key
  `(groupId, SONGID)` and the `LEFT JOIN song_list` stay harmless. The column
  self-migrates on first use (`ensureFavoriteNotes()` in `get_favorites`,
  `get_favorites_with_text`, `add_favorite_note`, `update_favorite_note`);
  manual DDL: `database/migrations/add_favorite_notes.sql`.
- **Writers:** `add_to_favorites`, `add_favorite_note`, `update_favorite_note`,
  `reorder_favorites` (type `song` / `note` → `favorites`, media types →
  `tech_media_favorites`), `delete_favorite_item`, `clear_favorites`, media
  commands in Ajax_Tech.
- **Readers:** `get_favorites` (leader page: note rows have `NOTE` non-null,
  `ID` / `imageName` null), `get_favorites_with_text` (tech console:
  `itemType` `'note'`). Anything that walks the list looking for a song must
  skip note rows (they match no `LISTID` / `NUM` / `imageName`).
- A song that leaves the list (delete / clear, on either page) is switched
  off if it was ON (notes channel): the leader sends `clear_image` channel
  `'leader'`, the tech console `clear_image clear_notes:1`; the tech console
  also drops the verse list of a selected song that vanished on reload.

### 2.2 WebSocket message types (group-routed via port 2346)
| Type | Producers | Consumers |
|---|---|---|
| `update_needed` | `updateSocket()` after most writes | both screens (refetch), tech console (reload+restore), leader (favorites) — musician IGNORES it since Aug 2026 |
| `notes_update` | `setNotes()`/`clearNotes()`, `upload_song_image` | musician page (refetch `get_notes`); tech console (sync song highlight with the notes channel); leader page (refresh the "on" row) |
| `musician_message` | `send_musician_message` (leader page button «Сообщение музыкантам»; own group; payload `{text, id, style}` — style = the group's `musician_msg_*` settings at send time) | musician page (slide-in overlay over the notes, 0.6 s in + 5 s + 0.6 s out, text fitted up to `musician_msg_font_max`); leader page ("message on screen" label for the same 6.2 s) |
| `display_transform` | `set_display_transform` (sermon pinch zoom/pan, ~10Hz during gesture) | main screen (applies CSS transform directly, no refetch); streaming ignores |
| `video_seek` | `video_seek` (sermon page: slider seek, seek made inside its YouTube player, periodic position sync every 5 s while playing; dropped server-side when `current.video_src` differs) | main screen (seeks its YouTube iframe via `yt_bridge.js` / `<video>`; explicit seeks always, periodic ones only to catch up when lagging > 2.5 s — never rewinds); streaming ignores |
| `leader_song_changed` | `set_image` channel `'leader'` | tech console (follow song, prepare verses) |
| `leader_langs_changed` | `set_leader_langs` (leader verse mode: open + every language switch) | tech console (mirror language toggles, rebuild song chips, re-map highlight by index) |
| `observer_update` | `observer_set_active`, `observer_set_song`, `observer_set_text` (leader page + tech console, observer channel) — payload `{active, song_id, verse_idx, langs, text, title}` | observer page (group mode: apply state, fetch `observer_get_state` on song change, text overlay rendered from the payload); leader page + tech console (toggle sync) |
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
- Any UI string: keys in ALL FIVE dictionaries (ru/de/en/lt/pl), rendered via
  `window.t()` / `T::s()`.

### 2.5 Bible translations (one row per translation)
- Storage: `bible_translations` (NAME, LANG, SORT_ORDER) → own `bible_books`
  (BOOK_NUM 1–66 canonical, NAME) → own `bible_verses` (TEXT only; the
  parallel TEXT_xx / NAME_xx columns are legacy, see
  `database/migrations/drop_bible_parallel_columns.sql`). A translation's
  `supported_langs` is derived from its Genesis 1:1 row — an empty first
  verse hides the translation from the language filter.
- Pipeline: source file (git-ignored) → `python database/translations/build.py`
  → tracked `<name>.sql` → on the server
  `php database/translations/apply.php <name>.sql` (statement by statement
  over mysqli inside the file's own transaction; prints the translation list
  with book/verse counts before and after). `--check` only parses the file.
- Swapping a translation is safe for stored data: nothing persists
  translation or book IDs — sermon chips resolve by `data-book-num` +
  chapter/verse, the consoles pick a translation at load time. Cross-
  translation navigation relies on canonical BOOK_NUM + verse numbering, so
  a source with another versification shifts a few verses (Psalm headings,
  Joel 3, Malachi 4 between NRSV- and KJV-numbered Bibles).
- **Parallel Bible display (Sept 2026, `app/BibleMap.php`):** the tech
  console can add parallel languages (each mapped to one translation of
  that language) to the Bible verse it projects; `get_bible_parallel`
  (Ajax_Tech) returns the chapter's texts keyed by the PRIMARY verse
  number, mapped through `BibleMap` (Synodal LXX ↔ Masoretic Psalms,
  Hebrew Joel/Malachi chapter splits, psalm-superscription offsets via
  end-alignment). A translation's tradition is detected FROM THE DATA
  (Ps 9 max verse > 30 ⇒ LXX; Joel = 4 chapters / Malachi = 3 ⇒ Hebrew),
  cached per request — importing a re-versified source changes mapping
  behavior automatically. Books other than 19/29/39 join verse-number to
  verse-number. The display pipeline is unchanged: the console composes
  one flat text (language blocks joined with the song separator) and sends
  it through the untouched `set_bible_text` / `observer_set_text`.
- Aug 2026: Lithuanian = «Karaliaus Jokūbo versija 2016» (LT-KJV, KJV
  versification, 31 102 verses) replacing «Lithuanian Bible» (Tikėjimo
  Žodis); `lithuanian.sql` deletes every LANG='lt' translation first.

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
   **Кнопка «Отключить экран» (Sept 2026):** видна у техника всякий раз,
   когда на главном экране что-то есть (куплет, стих, цитата Послания — в
   том числе из проповеди, слайд, картинка, видео), и пропадает на пустом
   экране / когда включены только ноты музыканта. После обрыва сети
   (выключить и включить Wi-Fi) техстраница сама перечитывает состояние.
   **Видео (Aug 2026):** YouTube-ролик со страницы проповеди — перемотка
   ползунком и внутри плеера повторяется на главном экране (~1 с);
   пауза/пуск и ⏹ работают как раньше; обычный видеофайл — то же самое.
5. **Bible/messages:** техник выводит стих — стих на экране, навигация
   стрелками работает.
   **Параллельные языки (Sept 2026):** включить язык в «Параллельные языки»
   (например EN при Синодальном) — стих на экране в двух языках через
   разделитель; Пс 50:3 Синодального даёт KJV Ps 51:1 («Have mercy»), в
   подписи обе ссылки; выключение языка возвращает один язык; выбор другого
   перевода в выпадашке заменяет блок; наблюдатель в групповом режиме видит
   тот же двуязычный текст.
6. **Reconnect:** перезагрузить вкладку экрана — актуальное состояние
   восстановилось (включая зум-трансформацию, когда фича появится).
   **Индикатор сети (Sept 2026):** на техстранице или у ведущего оборвать
   сеть (выключить Wi-Fi) — через ~2 с сверху красная плашка «Нет
   соединения с сервером», видимая и поверх попапа выбора песни;
   восстановить сеть — зелёная «Соединение восстановлено» на пару секунд;
   на странице нот, главном экране и трансляции плашки нет.
7. **Auth spot-check:** страница логина открывается, вход работает (CSRF/
   session не задеты). **Ссылка автовхода наблюдателя (Aug 2026):**
   `/join/<мусор>` → редирект на `/login`; QR/ссылка из настроек → сразу
   `/observer` под общим аккаунтом; «Новая ссылка» делает старую недействительной.
   **Remember-me / PWA (Sept 2026):** после входа приходит кука `remember`
   (см. заголовок ответа); удалить сессионную куку (или закрыть браузер) и
   открыть `/` — вход происходит сам, без пароля; `/logout` убивает и куку,
   и строку в `auth_token` (повторное открытие `/` ведёт на `/login`);
   `/manifest.json` отдаётся с иконками 192/512 (200, валидный JSON).
   У ведущего при включённой трансляции рядом с тогглом появляется «📱 QR-код»
   — тот же QR/ссылка, что в настройках (без «Новой ссылки»); при выключенной
   трансляции кнопки нет.
8. **Musician image groups (Aug 2026):** страница музыканта показывает ноты
   открытой песни и полупрозрачные кнопки «НОТЫ»/«АККОРДЫ»; переключение
   группы без картинки показывает первую найденную (кнопка выбора остаётся);
   в полноэкранном режиме только картинка; на странице импорта у выбранного
   сборника виден список групп. Песня без картинок → заглушка «Для этой
   песни пока нет картинок» на языке интерфейса. В окне редактирования
   песни (техстраница) блок «Группы картинок»: добавление/удаление страниц
   применяется сразу, заголовок окна — название слева, ✕ справа.

10. **Перестановка песен (Sep 2026):** у ведущего потянуть песню за ⠿ на
   другое место — порядок сохранился после обновления страницы И совпал в
   тех-консоли (WS `update_needed`); в тех-консоли перетащить медиа-карточку
   между песнями — порядок общий (единый `sort_order` двух таблиц); при
   настройке «новые сверху» порядок после перетаскивания тот, что на экране.
   Тач: перетаскивание работает пальцем за ⠿, страница при этом не скроллится,
   клик по карточке после перетаскивания не срабатывает.
   **Заметки ведущего (Sept 2026):** у ведущего «＋» → «Заметка» → текст →
   «Сохранить»: янтарная строка в списке ведущего и в тех-консоли, на экраны
   ничего не уходит; перетаскивание заметки за ⠿ меняет порядок в обоих
   местах; «Изменить» в свайпе (✏️ на десктопе) правит текст; нумерация и
   счётчик у ведущего считают только песни. «＋» → «Новая песня в сборник»
   открывает прежний диалог песни.
   **Пианист (Sept 2026):** в `/piano` песни перетаскиваются за ⠿; порядок
   сохраняется после обновления страницы (в сессии).
   **Удаление включённой песни (Sept 2026):** ведущий или техник очищает
   список / удаляет включённую песню — у техника пропадают её куплеты, у
   музыканта — ноты.
   **Ноты остаются (Sept 2026):** ведущий открывает ноты / «Аа» / ¶ песни и
   выходит из просмотра — у музыканта ноты остаются, строка у ведущего
   пульсирует «На экране»; клик по строке песни у ведущего выключает ноты,
   клик по другой песне — переключает; главный экран от клика по строке не
   меняется; у техника клик по песне включает/выключает ноты, как раньше.
   **Сообщение музыкантам (Sept 2026):** у ведущего под списком кнопка
   «💬 Сообщение музыкантам» → текст → Enter: у музыканта (и в полноэкранном
   режиме нот) снизу выезжает крупный текст, держится 5 с и уезжает; на
   кнопке ведущего всё это время «Сообщение отображается»; в настройках
   «Экран ведущего → Сообщение музыкантам» меняются цвета, прозрачность,
   высота, шрифт, макс. размер — новое сообщение идёт уже с ними.
   **Меню «Медиа» / «Заставки» у техника:** открытое меню закрывается при
   переключении Песни/Библия/Послание, клике мимо него, Esc и уходе со
   вкладки.

9. **Observer mode (Aug 2026):** вход общим логином роли «Наблюдатель» →
   главная показывает только «Наблюдатель» и «Выйти» (настроек нет);
   `/observer`: поиск песни по номеру/словам → текст на языках и картинки
   по типам, тап — полный экран; Библия: перевод → книга → глава, поиск по
   словам; Послания: список + поиск по тексту; История. Ведущий включает
   «📡 Транслировать в группу» → наблюдатель в групповом режиме видит
   открытую ведущим песню (текст/ноты по своему выбору), куплет из режима
   куплетов — крупно, после закрытия — экран ожидания; при выключенной
   кнопке — «трансляция выключена». Музыкант, техстраница и экраны при
   включённой кнопке ведут себя как раньше. **Техстраница:** та же кнопка
   в шапке (состояние общее с ведущим); песня/куплет техника → у
   наблюдателя; стих Библии / абзац Послания → текст с подписью поверх
   песни, снятие стиха возвращает песню; обои/видео наблюдателей не
   трогают.

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
