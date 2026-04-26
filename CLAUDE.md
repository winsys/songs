# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 1. Project overview

**Worship Songs** is a church worship management platform (production: songs.winsys.lv, repo: github.com/winsys/songs).

It serves six user roles:

- **Ведущий (Leader)** — manages the song list of a service
- **Музыкант (Musician)** — sees the active song and sheet music
- **Проповедник (Preacher)** — prepares and delivers sermons
- **Техник (Technician)** — controls main and streaming displays
- **Администратор (Administrator)** — full access, manages users and database
- **screen** — display-only endpoints (index, ajax, text, text_stream, settings)

Capabilities: synchronized setlist management, digital sheet music, sermon preparation with rich-text + slide integration, technical screen control (main display, streaming display, wallpapers, media playlist), database administration, multi-language song/Bible content.

**Project is open for collaborative development** and intentionally avoids adding new third-party framework dependencies.

---

## 2. Tech stack

- **Backend:** PHP 7 + MySQL 5.7 (utf8/utf8mb4 mixed — `current` table is utf8, watch for 4-byte chars)
- **Frontend:** AngularJS 1.6.6 + Bootstrap 3 + jQuery
- **Real-time:** Workerman WebSocket server on port 2345 (browser) / 2346 (internal PHP)
- **Auth:** Session-based + Google OAuth; WebSocket uses HMAC-SHA256 tokens
- **Export tools:** TurndownService (Markdown export), Blob + `<a target="_blank">` pattern (PDF export)
- **Custom JS modules:** `sermon_prep.js`, `sermon_chip_editor.js`, `songs_service.js`, `sermon.js`, `tech.js`, `leader.js`, `csrf_interceptor.js`, `websocket_auth.js`

---

## 3. Build & Minification

- **PHPStorm no longer auto-minifies.** Always run terser manually after editing any `.js` file.
- Command: `npx terser public/js/foo.js -o public/js/foo.min.js --compress` — do **not** use `--mangle` (AngularJS 1.6.6 DI breaks with mangled parameter names; use array DI notation)
- Always edit the `.js` source; exception: files without a `.js` counterpart (e.g. `csrf_interceptor.min.js`) can be edited directly.
- If a template references `foo.min.js`, read and edit `foo.js` instead.
- After editing any `.js` or `.css` file, **bump its `?v=N` query string** in every `<script>`/`<link>` tag in HTML templates that includes it — this is the cache-busting contract.
- `*.min.js` files are auto-generated; never edit them directly.

---

## 4. URL Routing

All requests go through `public/index.php` via `.htaccess` rewrite (`?route=<path>`). Routing is handled in `app/App.php` by matching the route string. AJAX requests all hit `route=ajax` with a `command` JSON payload.

---

## 5. AJAX Architecture

`app/Ajax.php` dispatches commands by method name using traits:
- `Ajax_Common` — songs, favorites, user settings, languages; exposes `getLanguages()` static helper (cached per request)
- `Ajax_Tech` — display control (`set_slide`, media, Bible, messages)
- `Ajax_Sermon` — sermon CRUD, audio uploads
- `Ajax_Settings` — display customization, user management, wallpapers
- `Ajax_Import` — song list and MIDI/MusicXML imports

All AJAX responses are JSON. CSRF token is validated from `X-CSRF-Token` header (injected by the AngularJS `csrf_interceptor`). Multipart uploads send `_csrf_token` as a POST field instead.

---

## 6. Key Patterns

**Static service locator:** `Info::get('key')` / `Info::set('key', $val)` — used to pass config and DB globally.

**Database:** `app/Database.php` wraps MySQLi with `select()` (array), `get()` (single row), `getValue()` (scalar), `exec()`. The MySQL handle is available via `Info::get('dbh')` for `mysqli_real_escape_string`.

**Roles & permissions:** Defined in `app/Security.php`. Roles: `admin`, `leader`, `musician`, `preacher`, `tech`, `screen`. Role checks via `Security::isAdmin()`, `canManageUsers()`, etc. Route access is enforced in `App.php` before rendering.

**WebSocket client:** `public/js/websocket_auth.js` exports `createAuthenticatedWebSocket(url, onMessage, onError, onStatusChange)` — returns `{ destroy() }`, NOT a raw WebSocket. Handles ping/pong, auto-reconnect, and session keepalive.

**Slides:** Stored in `current` table with `image='__slide__'`, `text`=inner HTML, `song_name`=bg color hex. Per-slide background color is stored as `data-bg` on `.sermon-slide` elements. Streaming screen (`text_layout_streaming.html`) skips `__slide__` items entirely.

---

## 7. Architecture notes

### Routing & rendering
- `app/App.php` is the front controller. Views live in `templates/` as `<view>.html`.
- Page rendering: view file is captured into `$pageContent`, then injected into `templates/layout.html`.

### Auth
- Sessions in PHP. `Security::isLoggedIn()`, `Security::startUserSession($user)`, `Security::doLogin()`, `Security::doLogout()`.
- Passwords stored with `enc:` prefix (custom symmetric encryption using `encryption_key` from `app/config_example.php`). On first successful login of a legacy plaintext password, it auto-migrates to encrypted form.
- Google OAuth supports multiple accounts per user via `user_google_accounts` table.

### Multi-language content (NOT UI language)
- Tables `song_list` and `messages` have a column per content language: `TEXT`, `TEXT_LT`, `TEXT_EN`, … and similarly `NAME` / `NAME_LT` / `NAME_EN` for Bible books.
- Registry: table `languages` with `code`, `label`, `col_suffix` (`''` for default Russian, `_LT`, `_EN`, …), `sort_order`, `is_default`.
- Adding a language adds a column to both tables; deleting requires a special password from config.
- `Ajax_Common::getLanguages()` returns `[{code, col_suffix}, ...]`, cached per request — use `self::getLanguages()` from any trait to build dynamic SQL column lists.
- `getActiveLangs()`, `nameCol(lang)`, `textCol(lang)` in `tech.js` resolve which column to read on the JS side.
- **This system is for displayed content. It is completely separate from UI language translation.** Do not conflate the two.

### Sermon prep editor (`sermon_prep` mode)
- Files: `templates/sermon_prep.html`, `public/js/sermon_prep.js`, `public/js/sermon_chip_editor.js`.
- Rich-text contenteditable with chip-based citations (`.message-cite` for sermon quotes, Bible-verse chips with verse-level comments).
- `sermon_chip_editor.js` injects its own CSS and modal HTML at runtime — no manual HTML edits required.
- Export: PDF via Blob + `<a target="_blank">` with embedded `window.onload` print script. MD export via TurndownService.

### Sermon presentation mode (`sermon_layout`)
- Files: `templates/sermon_layout.html`, `public/js/sermon.js`.
- Two-pane layout: left = scrollable notes panel, right = display surface (text/image/video/slide overlays).
- Notes font scaling: 50–300% in 10% steps, default 100%, stored per sermon.
- Bible/message chips can scale together with notes (toggle in settings).
- Compact 44px header with `⋮` dropdown for secondary controls.

---

## 8. Configuration

Copy `app/config_example.php` → `app/config.php` (git-ignored). Requires: DB credentials, `encryption_key` (base64 AES-256 key), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `lang_delete_password`.

Set `APP_ENV=development` for verbose PHP errors.

---

## 9. WebSocket Server

Start with: `php websocket-server.php start`

Runs as a separate process on localhost:2345. The browser JS connects to this; internal PHP triggers via port 2346.

---

## 10. Templates / File reference

PHP renders HTML templates from `templates/` by including them. Main wrapper: `templates/layout.html`.

```
app/
  App.php                    # front controller, view rendering
  Ajax.php                   # AJAX dispatcher
  Ajax_Common.php            # songs, favorites, user settings, languages; getLanguages()
  Ajax_Import.php            # languages, songs, messages import
  Ajax_Settings.php          # user/group settings, Google linking
  Ajax_Sermon.php            # sermons CRUD, display targets, media
  Ajax_Tech.php              # display control, Bible, messages
  Database.php               # MySQL wrapper
  GoogleAuth.php             # OAuth login + account linking
  Info.php                   # service container
  Security.php               # auth, CSRF, password encryption, roles
  config_example.php         # secrets template

database/
  database_full.sql          # full schema (source of truth)
  migrations/
    add_indexes.sql          # indexes added April 2026

public/js/
  csrf_interceptor.js        # AngularJS $http CSRF header
  websocket_auth.js          # authenticated WS connection, returns {destroy()}
  songs_service.js           # AngularJS service, languages, song lookup
  leader.js                  # leader role controller
  tech.js                    # technician role controller (largest)
  sermon.js                  # sermon presentation mode
  sermon_prep.js             # sermon prep editor
  sermon_chip_editor.js      # citation chip editor (self-contained, injects own CSS/HTML)
  settings.js                # user/group/Google settings
  import.js                  # import controller
  *.min.js                   # AUTO-GENERATED, never edit

templates/
  layout.html                # base HTML wrapper
  login.html                 # login form
  index.html                 # home / role hub
  leader.html                # leader interface
  musician.html              # musician interface
  tech.html                  # technician interface (largest)
  sermon.html
  sermon_layout.html         # sermon presentation mode
  sermon_prep.html           # sermon preparation editor
  settings.html
  import.html
  text_layout.html           # main display screen (slides shown here)
  text_layout_streaming.html # streaming screen (slides NOT shown)
```

---

## 11. Hard-earned lessons

### Browser user-gesture chain
- `window.open()` and `iframe.print()` get blocked when called after Bootstrap's dropdown close mechanism breaks the user-gesture chain.
- **Reliable PDF export pattern:** Blob + `<a target="_blank">` click, with an embedded `window.onload` print script in the HTML payload. Same pattern used for MD export.

### contenteditable cursor detection
- `Range.toString()`-based end-of-block detection is unreliable: browsers inject ` ` non-breaking spaces.
- Use `Range.compareBoundaryPoints` instead.
- When moving focus away from a nested `contenteditable` (e.g. exiting a `.sermon-slide-inner`), wrap `focus()` + `Selection.addRange()` in `setTimeout(0)` — otherwise Chrome silently discards the range.

### Font scaling with inline styles
- WYSIWYG editors leave inline `font-size` on child elements. These override container-level CSS.
- **Fix:** store original pixel values in `data-base-font-px` attributes on each element, then rescale proportionally. Apply `style.fontSize` directly to the container DOM element.
- The base font for sermon prep is exposed as the CSS variable `--sp-base-font`. Heading scaling in the styles dropdown uses `em` units relative to that variable.

### AngularJS + native events
- `ng-change` does not see plain JS functions invoked outside the digest cycle.
- For reliable cross-context event handling, use `document.addEventListener('change')` and call `$scope.$apply()` / `$scope.$applyAsync()` if needed.

### `ng-if` destroys the DOM subtree
- Each time the predicate flips, `ng-if` recreates the elements — wiping inline styles previously set imperatively.
- **Fix:** apply such styles inside the `$timeout` callback that runs after the new subtree is rendered, not before.

### PHP deployment quirks
- A 500 error mid-render with no log entry is the classic symptom of `error_reporting(0)` hiding a fatal after partial output.
- Nullable return types (`?array`) require **PHP 7.1+**. Confirm the deploy target before using.

### Dynamic language columns in SQL
- Never hardcode language column names (`TEXT_LT`, `NAME_EN`, etc.) in PHP queries — use `self::getLanguages()` from `Ajax_Common` to build SELECT/WHERE clauses dynamically.
- Pattern: iterate `getLanguages()`, skip entries where `col_suffix === ''` (that's the default Russian column, already included), append `TEXT{col_suffix}` etc. for the rest.
- COALESCE fallback pattern in Bible queries: `COALESCE(v.TEXT_LT, v1.TEXT_LT)` — fallback to translation 1 data when current translation lacks text.

### Bulk text processing
- Use `python` (not `python3`) on this system.
- For Cyrillic detection, use the Unicode range `Ѐ`–`ӿ`. Do **not** use `[а-яёА-ЯЁ]` — it misses letters and is locale-dependent.
- Use Python with explicit `replacements` lists (ordered, longest-first to avoid prefix collisions) rather than chained `sed`.

---

## 12. Language conventions

- **All UI-facing text and end-user documentation: Russian.**
- **All code comments, JSDoc/PHPDoc, and developer documentation: English.**
- Comment translation (Russian → English): **COMPLETE as of April 2026** — all PHP and JS files translated.
- When adding new comments, write in English only.

---

## 13. Working style

- Pavel is technical and works directly in the codebase. He makes his own structural and architectural decisions and informs Claude after the fact. Claude's role is to provide working implementations and diagnose bugs — not to second-guess structural choices.
- Pavel provides **precise bug-reproduction steps**, and clearly reports when a fix did not work. Iterative diagnosis is expected until the bug is actually resolved — do not declare victory prematurely.
- **Minimal dependencies** — do not add new libraries unless essential.
- Prefer concise, mechanical descriptions of behavior over framing/marketing copy.
- **Commit/push workflow:** After completing any set of changes, ask: "Нужно ли делать коммит и пуш?" If yes: `git add -A`, commit, then `git push` (origin/master) AND `git push github`.

---

## 14. Files never to auto-edit

- Anything matching `*.min.js` — regenerated from source.
- `app/config_example.php` — sensitive config; always confirm before editing.
- `database/migrate_passwords.php` — one-shot migration; do not modify after deploy.
- Anything in `vendor/` — managed by Composer.

---

## 15. Working agreements

- When editing a JS file: run terser, bump `?v=N` everywhere it is referenced.
- When editing a `.min.js` file: don't. Edit the source instead.
- Before bulk operations: dry-run on one file, show diff, get confirmation.
- When a fix fails: do not declare success. Ask for the next reproduction step or examine the actual DOM state.
- Use English in all new comments.
- Single endpoint `/ajax`, command dispatch by trait method name. All AJAX requires CSRF.

---

## 16. Planned but not yet implemented

### Automated testing
- **Not yet started.** Proposed stack:
  - **PHPUnit** for backend — first priority
  - **Jest + angular-mocks** for JS — second
  - **PHPStan + ESLint** for static analysis — third
  - **Playwright** for E2E multi-role WebSocket flows — last (most setup overhead)

### UI internationalization (English UI option)
- **Goal:** add an English UI variant. Login form in English; language selector in `settings.html` (saved to `user_settings.ui_lang`).
- **Critical constraint:** completely separate from the multi-language *content* system in the `languages` table.
- **Proposed architecture (minimally invasive):**
  1. Dictionary files: `public/js/i18n/ru.json`, `public/js/i18n/en.json` — flat key → string.
  2. `public/js/i18n.js` exposing global `t('key', params)`. Initialized from `<script>window.UI_LANG = 'en'</script>` injected by PHP into `layout.html`.
  3. AngularJS filter `| i18n` wrapping `t()`, so templates can use `{{ 'leader.title' | i18n }}`.
  4. PHP helper `T::s('key')` reading the same JSON, for server-rendered pages.
  5. `<select ng-model="settings.ui_lang">` in `settings.html`. After save: `window.location.reload()`.
- **Risks:** string concatenation in JS must become parameterized `t('key', {name: x})`; inline `onclick` attributes with text need careful quoting; modal `label` configs live in JS; always bump `?v=` on translated JS files.
- **Total estimate:** ~15–18 hours for full coverage.
