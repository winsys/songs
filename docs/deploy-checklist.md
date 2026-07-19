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
  (Ajax_Tech).
- **Readers:** `get_image` (incl. `transform`) → main screen
  `text_layout.html` AND streaming `text_layout_streaming.html` (skips
  `__slide__`, ignores `transform`); `get_current_state` → tech console
  state restore (`restoreCurrentState`).
- `transform` column (July 2026): zoom/pan state of the slide/image, JSON
  `{"s","x","y"}` or '' = identity; auto-resets on every DELETE+INSERT.
- **Gotcha (fixed e19074d, keep honoring):** the screen's text branch
  deduplicates renders via `$scope.srcText` — every non-text branch MUST
  reset `srcText`, or returning to the same text renders a blank screen.
- Changing row shape/semantics ⇒ re-check: main screen, streaming screen,
  tech restore-after-reload, sermon right-pane consistency.

### 2.2 WebSocket message types (group-routed via port 2346)
| Type | Producers | Consumers |
|---|---|---|
| `update_needed` | `updateSocket()` after most writes | both screens (refetch), tech console (reload+restore), leader (favorites), musician |
| `display_transform` | `set_display_transform` (sermon pinch zoom/pan, ~10Hz during gesture) | main screen (applies CSS transform directly, no refetch); streaming ignores |
| `leader_song_changed` | `set_image` channel `'leader'` | tech console (follow song, prepare verses) |
| `display_target_changed` | `set_display_target` (tech) | sermon page (local copy), tech selects |
| `sermon_display_cleared` | `disable_external_display` | sermon page (deactivate UI) |
| `access_request` / `access_response` | display-access flow | tech console |
- New type: no WS-server restart needed. Changed/removed type: grep ALL of
  `tech.js`, `leader.js`, `sermon.js`, `text_layout*.html`, `musician`.

### 2.3 Display-target resolution (channels)
- `resolveDisplayTarget()` gates: `set_image`, `clear_image`,
  `set_tech_image`, `set_message_text`, `set_video`, `video_control`,
  `set_slide`. NULL target = command must not touch any screen — but
  side-channels (e.g. `leader_song_changed`) must still fire.
- Tech-page calls WITHOUT `channel` use the legacy own-group path — never
  break it.

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
2. **Tech → screen:** техник кликает куплет — куплет на главном экране;
   повторный клик снимает; стриминговый экран показывает текст песни и
   игнорирует слайды.
3. **Wallpaper survival:** техник ставит обои/фон; ведущий открывает и
   закрывает песню — обои целы (цель NULL).
4. **Sermon:** страница проповеди показывает слайд (цель канала задана) —
   слайд на главном экране; «Отключить экран» у техника убирает его и
   деактивирует UI проповедника.
5. **Bible/messages:** техник выводит стих — стих на экране, навигация
   стрелками работает.
6. **Reconnect:** перезагрузить вкладку экрана — актуальное состояние
   восстановилось (включая зум-трансформацию, когда фича появится).
7. **Auth spot-check:** страница логина открывается, вход работает (CSRF/
   session не задеты).

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
