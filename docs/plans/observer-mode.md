# Plan: observer mode (режим наблюдателя)

Status: **implemented 2026-08-22**. Owner: Pavel.

## 1. Goal

A mode for any church member on a phone: find and read anything — songs
(lyrics in any language, sheet music of any image type), any Bible
translation, any message («Послание») — with a search simple enough for
people who rarely use computers, full-screen reading for everything, and a
session-only viewing history (no favorites). Plus a passive **group mode**:
the leader has a «📡 Транслировать в группу» toggle; while it is on,
whatever the leader opens (song, lyrics, a verse from the verse mode, the
notes picture) appears on the screens of all observers who joined the group
mode. Full screen works like the musician page: full screen = only the
broadcast content; normal screen = choice buttons (text languages, image
types), «leave group mode», the standard «← Главная» button (same
`common.button.back` as on every page — Pavel's follow-up, no home icon).

Decisions taken with Pavel (2026-08-22): access only through a new
`observer` role (shared per-group login; admin keeps the button as
everywhere); a verse from the leader's verse mode is shown ALONE, auto-fitted
to the screen; the observer picks the text language himself (remembered,
default UI language, fallback to the leader's); history in `sessionStorage`
(gone when the tab closes).

## 2. Implementation

### Role & access
- `users.ROLE` enum + `observer`; `Security::$roleRoutes['observer'] =
  index, ajax, observer` — **no settings page** (shared login: nobody may
  change its password from the UI). `Security::isObserver()`.
- `Ajax::execute`: for the observer role only a **whitelist** of read-only
  commands is callable (`Ajax_Observer::$observerCommands`: `ping`,
  `get_user_settings`, `get_languages`, `get_all_song_lists`,
  `get_songs_for_search`, `get_song_list`, `get_song_images`, `get_bible_*`,
  `search_bible_verses`, `search_messages`, `search_message_paragraphs`,
  `get_message`, `observer_get_state`, `observer_list_messages`); everything
  else → 403. Other roles are not affected.
- Settings page: the role slot «Наблюдатель» (create / share like the other
  roles) — `Ajax_Settings` allowed roles + labels, `settings.js` ALL_ROLES +
  badge colour.
- Home page: «👀 Наблюдатель» button for `observer` and `admin`; the
  settings button is hidden for the observer.
- Migration `database/migrations/add_observer_mode.sql` (+ runner
  `run_add_observer_mode.php`, re-runnable).

### Join link / QR code (auto-login, added 2026-08-22 after the phone test)
- `users.JOIN_TOKEN` (migration `add_join_token.sql` + runner): a 128-bit
  random hex token carried ONLY by observer accounts; `/join/<token>`
  (`App.php`, before the login check → `Security::joinByToken()`) starts the
  session exactly like a password login and redirects to `/observer`;
  anything else → `/login`. Saved to the phone's home screen, the link logs
  in again on every opening (sessions last 18 h).
- Settings page, observer slot: «📱 QR-код входа» → modal with the QR
  (`public/js/vendor/qrcode.min.js`, qrcode-generator 1.4.4, MIT — the only
  vendored dependency, no network calls), the link, «Копировать ссылку»,
  «🖨 Печать» (Blob + `<a target=_blank>` + onload print), «🔄 Новая ссылка»
  (regenerates the token → old QR codes stop working). «Поделиться» of the
  observer account appends the link. Server: `Ajax_Settings::get_join_link
  {user_id, regenerate}` (admin only, observer accounts of the own group).

### Observer channel (group mode)
- Table `current_observer` (groupId PK, active, song_id, verse_idx, langs,
  updated_at). WS event `observer_update` with the compact state
  `{active, song_id, verse_idx, langs[]}` (group-scoped).
- Trait `app/Ajax_Observer.php` (included in `public/index.php`, `use` in
  `Ajax.php`):
  - `observer_set_active {active}` (leader/admin): the toggle; OFF also
    drops the song.
  - `observer_set_song {song_id, verse_idx, langs[]}` (leader/admin): no-op
    while the toggle is off (the DB row is authoritative, like the NULL
    display target for screens).
  - `observer_get_state`: state + the song in the leader-list shape (all
    `TEXT*`, `hasText_*`, `bookName`, `imageName`) + `groups[]` with the
    image per group (`songImageGroups`).
  - `observer_list_messages`: ID/CODE/TITLE/CITY + `hasText_*` for the
    browsable list.
- Leader page: `leader.js` keeps `$scope.observer.active` (restored via
  `observer_get_state`, synced across leader sessions by `observer_update`)
  and calls `observer_set_song` **in addition to** (never instead of) the
  existing `set_image` / `set_leader_text` / `clear_image`: song open (notes
  or «Аа»), verse mode open, verse on/off, language switch (fallback langs),
  close/leave → `song_id 0`. Turning the toggle on re-sends what is
  currently open. `leader.html`: the toggle button in the header (`v=35`).

### Observer page (`templates/observer.html`, `public/js/observer.js`)
- Tabs Песни / Библия / Послания / История; «📡 Группа» button with a
  status dot (leader broadcasting or not).
- Songs: one search field over the group's allowed collections
  (`get_songs_for_search`, filtered client-side: exact number → number
  prefix → all words in the name → all words in any language's lyrics with
  a snippet), collection chips (a chip without a query lists the whole
  collection).
- Bible: translation chips, language chips (languages the translation
  supports), word search (`search_bible_verses`, ≥ 3 chars), book grid →
  chapter grid → chapter viewer with prev/next chapter; a search result opens
  the chapter scrolled to the highlighted verse.
- Messages: title/code filter over `observer_list_messages` + word search
  returning paragraphs (`search_message_paragraphs`) → message viewer with
  language buttons, scrolled to the paragraph.
- Viewer (dark, full viewport): ✕, title, A−/A+ (font size remembered),
  language / image-type buttons for songs; a tap on the content toggles
  fullscreen (bars hidden + best-effort browser fullscreen; iPhone Safari
  has no element fullscreen — the fixed overlay is the fullscreen). Image
  type choice remembered by name (`observerSongView` in sessionStorage),
  the musician's «selected stays, first with image shown» rule.
- History: `sessionStorage.observerHistory` (40 items, songs / chapters /
  messages, reopen by tap, clear button).
- Group mode: `observer_get_state` on enter / reconnect / song change;
  `observer_update` applied live. Waiting screen explains «leader not
  broadcasting» vs «nothing shown yet». Song → text (own language, leader's
  as fallback) or image type; `verse_idx ≥ 0` + text view → the single verse
  (same `\r\n` line-index contract as tech/leader verse mode; own language,
  then the leader's, then the group order) auto-fitted to the content box.
  Group mode survives a reload (`observerGroup` flag).
- i18n: `observer.*`, `leader.observer.*`, `home.role.observer`,
  `role.observer` in all four dictionaries (+ the previously missing
  `leader.button.delete`).

## 3. Regression analysis

- No existing command, table or WS type changed. `current`, `current_notes`,
  display targets, notes channel, favorites: untouched. The leader page only
  ADDS calls; a failing `observer_set_song` cannot affect the screens.
- `Ajax::execute` gained one extra check that applies to the observer role
  only.
- Settings: additive role slot; `create_group_user` still rejects unknown
  roles.
- Smoke after deploy: login works (200); admin home shows «Наблюдатель»;
  `/observer` loads, song search / Bible / messages open and go fullscreen;
  leader toggle ON → observer in group mode sees the song the leader opens,
  a verse from the verse mode, the waiting screen after close; toggle OFF →
  «трансляция выключена»; musician page, tech console and screens behave
  as before while the toggle is on.
