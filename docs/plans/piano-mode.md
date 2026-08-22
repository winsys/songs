# Plan: pianist mode (режим пианиста)

Status: **implemented 2026-08-22**. Owner: Pavel.

## 1. Goal

Bring back a pianist mode: practically the leader page, but private. The
pianist searches and adds songs from the allowed collections to a personal
list that lives in the current login session, and opens sheet music / lyrics
on his own screen. Nothing he does reaches any screen or shared state; the
list disappears at logout. Available to the roles musician, leader, tech and
admin.

## 2. Implementation

- **Route** `/piano` → `templates/piano.html` (`Security::$roleRoutes`: piano
  added to leader, musician, tech; admin has everything). Home page button
  «🎹 Пианист» for those roles (`home.role.piano`).
- **Server** `app/Ajax_Piano.php` (trait, included in `public/index.php`,
  `use Ajax_Piano` in `Ajax.php`): `piano_get_favorites`,
  `piano_add_favorite` (song must belong to `user_settings.available_lists`
  when set), `piano_delete_favorite`, `piano_clear_favorites`. Storage =
  `$_SESSION['piano_favorites']` (ordered song IDs); `doLogout()` wipes the
  session, a fresh login gets a fresh session. No DB writes, no
  `updateSocket`, no `broadcastToGroup`. Rows come in the leader's favorites
  shape (`FID`/`SONGID` = song ID, `dispName`, `imageName`, `bookName`,
  `hasText_*`, all `TEXT*` columns). Songs deleted meanwhile are pruned.
- **Page** `templates/piano.html` is generated from `leader.html` by
  `make_piano_html.py` (scratch script; one-off): no WebSocket banner, no
  verse mode (¶), no add-song photo popup, no `wrap<ID>` fullscreen; the
  notes thumbnail opens `#pianoNotesFs` — a full-viewport overlay (browser
  fullscreen best-effort) showing the image of the chosen image group with
  the musician-style translucent type buttons (choice shared through
  `sessionStorage.musicianImageGroup`; no image → `/no_image/<lang>.png`).
  «Аа» keeps the leader's black auto-fitted lyrics screen
  (`#pianoTextFs`). Search (angucomplete), collection buttons, full list
  popup, song preview and the confirmation dialog are the leader's.
- **JS** `public/js/piano.js` (controller `Piano`): leader logic minus
  broadcasting; `get_song_images` provides the groups for the notes view.
- **i18n** (4 dicts): `home.role.piano`, `piano.title`, `piano.subtitle`,
  `piano.thumb.openNotes`, `piano.thumb.openText`; the rest reuses `leader.*`.

## 3. Regression analysis

- No shared mechanism touched: `current`, `current_notes`, favorites tables,
  WS types and display targets are untouched; the leader page is unchanged.
- New route only for the four roles; `piano_*` commands are session-scoped
  and harmless for any logged-in user.
- Smoke: log in as a musician → «Пианист» on the home page → add a song from
  search and from the full list → open notes (type buttons, tap closes) and
  lyrics → delete / clear → log out and in: the list is empty; the tech
  console and the screens never react.
