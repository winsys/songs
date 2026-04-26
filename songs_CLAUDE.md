# Worship Songs — Project Context

> This document is a consolidated handoff of project context, conventions, and accumulated lessons. Read it before making non-trivial changes.

---

## 1. Project overview

**Worship Songs** is a church worship management platform (production: songs.winsys.lv, repo: github.com/winsys/songs).

It serves five user roles:

- **Ведущий (Leader)** — manages the song list of a service
- **Музыкант (Musician)** — sees the active song and sheet music
- **Проповедник (Preacher)** — prepares and delivers sermons
- **Техник (Technician)** — controls main and streaming displays
- **Администратор (Administrator)** — full access, manages users and database
- (`screen` role exists for display-only endpoints)

Capabilities: synchronized setlist management, digital sheet music, sermon preparation with rich-text + slide integration, technical screen control (main display, streaming display, wallpapers, media playlist), database administration, multi-language song/Bible content.

**Project is open for collaborative development** and intentionally avoids adding new third-party framework dependencies.

---

## 2. Tech stack

- **Backend:** PHP (Workerman WebSocket server), PSR-4 autoloading, MySQL
- **Frontend:** AngularJS 1.x, jQuery, Bootstrap 3
- **Auth:** Local username/password (encrypted with `enc:` prefix scheme) + Google OAuth (`GoogleAuth.php`) + Google One Tap
- **Export tools:** TurndownService (Markdown export), Blob + `<a target="_blank">` pattern (PDF export)
- **Custom JS modules:** `sermon_prep.js`, `sermon_chip_editor.js`, `songs_service.js`, `sermon.js`, `tech.js`, `leader.js`, `csrf_interceptor.js`, `websocket_auth.js`

---

## 3. Repository conventions

### Languages
- **All UI-facing text and end-user documentation: Russian.**
- **All code comments, JSDoc/PHPDoc, and developer documentation: English.**
- A previous translation pass on comments was started but is **incomplete** — many PHP/JS files still contain mixed Russian/English comments. See section 9.

### File generation
- `*.min.js` files are **auto-generated**. Never edit them directly. Edit only the source `.js` file.
- After editing any `.js` file in `public/js/`, **bump its `?v=N` query string** in every `<script>` tag in HTML templates that includes it. This is the cache-busting contract for the project.
- Same rule for CSS files included via `?v=`.

### Backups
- Before structural edits to PHP files, a `.bak` copy is created.

### Russian-language docs
- Documentation aimed at end users (README sections, landing pages, settings hints) must be in **direct, functional Russian**. Concrete descriptions of what the system does mechanically — not marketing language, not abstract benefit claims. Imperative `"Забудьте о…"` style is explicitly unwanted.

---

## 4. Architecture notes

### Routing & rendering
- `app/App.php` is the front controller. Views live in `templates/` as `<view>.html`.
- Page rendering: view file is captured into `$pageContent`, then injected into `templates/layout.html`.

### Database layer
- `app/Database.php` provides `select()`, `get()`, `exec()`. The MySQL handle is exposed via `Info::get('dbh')` for `mysqli_real_escape_string`.
- `Info` is a global service container.

### AJAX
- Single endpoint: `/ajax`. Dispatch happens in `app/Ajax*.php` modules by `command` field of the POST body.
- All AJAX requires CSRF (handled by `csrf_interceptor.js` for AngularJS `$http`).
- Multipart uploads send `_csrf_token` as a POST field instead.

### Auth
- Sessions in PHP. `Security::isLoggedIn()`, `Security::startUserSession($user)`, `Security::doLogin()`, `Security::doLogout()`.
- Passwords are stored with `enc:` prefix (custom symmetric encryption using `encryption_key` from `app/config_example.php`). On first successful login of a legacy plaintext password, it auto-migrates to encrypted form.
- Google OAuth supports multiple accounts per user via `user_google_accounts` table.

### Multi-language content (NOT UI language)
- Tables `song_list` and `messages` have a column per content language: `TEXT`, `TEXT_LT`, `TEXT_EN`, … and similarly `NAME` / `NAME_LT` / `NAME_EN` for Bible books.
- Registry: table `languages` with `code`, `label`, `col_suffix` (`''` for default Russian, `_LT`, `_EN`, …), `sort_order`, `is_default`.
- Adding a language adds a column to both tables; deleting a language requires a special password from config.
- `getActiveLangs()`, `nameCol(lang)`, `textCol(lang)` in `tech.js` resolve which column to read.
- **This system is for displayed content. It is unrelated to UI translation.** Do not conflate the two.

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

## 5. Hard-earned lessons (do not relearn these)

### Browser user-gesture chain
- `window.open()` and `iframe.print()` get blocked when called after Bootstrap's dropdown close mechanism breaks the user-gesture chain.
- **Reliable PDF export pattern:** Blob + `<a target="_blank">` click, with an embedded `window.onload` print script in the HTML payload. Same pattern used for MD export.

### contenteditable cursor detection
- `Range.toString()`-based end-of-block detection is unreliable: browsers inject `\u00a0` non-breaking spaces.
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

### Bulk text processing
- For Cyrillic detection in bash/Python tooling, use the Unicode range `\u0400`–`\u04ff`. Do **not** use a regex character class like `[а-яёА-ЯЁ]` — it misses several letters and is locale-dependent.
- Use Python with explicit `replacements` lists (ordered, longest-first to avoid prefix collisions) rather than chained `sed`.
- Package outputs with `zip -r` from the parent directory, excluding `.git`.

### Unminified-only edits
- `*.min.js` is regenerated. If a fix appears in `tech.min.js` but not `tech.js`, it will be lost on next build. Always edit the source.

---

## 6. User preferences and working style

- The maintainer (Pavel) is technical and works directly in the codebase. He makes his own structural and architectural decisions and informs Claude after the fact (e.g., "I moved that button into a `<ul>` dropdown"). Claude's role is to provide working implementations and diagnose bugs — not to second-guess structural choices.
- Pavel provides **precise bug-reproduction steps**, and clearly reports when a fix did not work. Iterative diagnosis is expected until the bug is actually resolved — do not declare victory prematurely.
- **Minimal dependencies** — do not add new libraries unless essential.
- Pavel prefers concise, mechanical descriptions of behavior over framing/marketing copy.

---

## 7. Active work areas

### Sermon prep editor
- `sermon_prep.html`, `sermon_prep.js`, `sermon_chip_editor.js`
- Rich-text chip editor, formatting toolbar, PDF/MD export, keyboard navigation out of slide blocks, styles dropdown with proportional heading scaling.

### Sermon layout / presentation mode
- `sermon_layout.html`, `sermon.js`
- Per-sermon font scaling (stored & restored), compact notes-panel header, `.message-cite` chip layout with absolute-positioned remove button.

### General codebase maintenance
- Comment translation pass (Russian → English) — **incomplete; see section 9**.
- JSDoc/PHPDoc additions across JS and PHP — partially done.
- `?v=` cache-busting tags — maintained on every JS edit.

---

## 8. Planned but not yet implemented

### Automated testing
- **Not yet started.** Proposed stack:
  - **PHPUnit** for backend — first priority
  - **Jest + angular-mocks** for JS — second
  - **PHPStan + ESLint** for static analysis — third
  - **Playwright** for E2E multi-role WebSocket flows — last (most setup overhead)

### Landing/description page
- Russian-only, light theme, large 🎵 emoji logo, no navbar. Iterated to near-final state but not yet shipped.

### UI internationalization (English UI option)
- **Goal:** add an English UI variant.
  - Login form fully in English.
  - Language selector in `settings.html` (saved to `user_settings.ui_lang`).
  - Logged-in users keep their selected UI language across sessions.
- **Critical constraint:** must not break any existing functionality. In particular, the UI-language system must be **completely separate** from the multi-language *content* system in the `languages` table.
- **Proposed architecture (minimally invasive):**
  1. Single dictionary files: `public/js/i18n/ru.json`, `public/js/i18n/en.json` — flat key → string.
  2. New `public/js/i18n.js` exposing global `t('key', params)`. Initialized before AngularJS bootstraps, from `<script>window.UI_LANG = 'en'</script>` injected by PHP into `layout.html` based on session.
  3. AngularJS filter `| i18n` wrapping the same `t()`, so templates can use `{{ 'leader.title' | i18n }}`.
  4. PHP helper `T::s('key')` reading the same JSON, used by server-rendered pages (`GoogleAuth.php` error and success pages).
  5. `<select ng-model="settings.ui_lang">` in `settings.html`. After save: `window.location.reload()` so PHP-rendered chrome picks it up.
- **Phasing (to ship safely):**
  1. Infra: DB migration `ALTER user_settings ADD ui_lang VARCHAR(5) NOT NULL DEFAULT 'ru'`, `i18n.js`, AngularJS filter, PHP helper, `layout.html` wiring. (~3–4 h)
  2. English login (no selector — user not yet authenticated). (~30 min)
  3. Selector in `settings.html` + persistence. (~30 min)
  4. Translate `index.html`, `leader.html`, `musician.html`. (~2 h)
  5. Translate `tech.html` + `tech.js` messages. (~3 h, more modals/confirms)
  6. Translate `sermon*.html` + `sermon*.js`. (~2 h)
  7. Translate `settings.html`, `import.html`. (~3 h)
  8. Translate `GoogleAuth.php` rendered pages + AJAX status messages. (~1 h)
- **Total estimate:** ~15–18 hours for full coverage. First three phases (~5 h) deliver the working framework + English login + selector; the rest can be incremental, file by file.

### Risks for the i18n work
- **String concatenation in JS** (`'Удалить [' + msg + ']?'`) — must become parameterized: `t('confirm.delete', {name: msg})` with a `{name}` placeholder.
- **Inline `onclick` attributes with text** — quoting is fragile; care needed when injecting `<?= T::s(...) ?>`.
- **Modal configs with `label`** in `confirmationDialogConfig` — these live in JS and are easy to translate, but every site must be found.
- **Emojis embedded in strings** (`'✅ Успешно сохранено'`) — keep them in the dictionary value or split out, but be consistent.
- **Always bump `?v=`** on translated JS files so cached old strings are not served.

### Comment translation (Russian → English)
- **Status:** previous pass was partial. Many files still contain Russian comments — `Ajax_Import.php`, `Ajax_Settings.php`, `Ajax_Sermon.php`, `Security.php`, `GoogleAuth.php`, `migrate_passwords.php`, `tech.js`, `sermon_chip_editor.js`, `settings.js`, plus CSS-block comments inside `tech.html`, `sermon_layout.html`, `leader.html`.
- **Volume:** roughly 3000–3500 total comment lines, of which ~40–60% are still Russian → ~1200–2000 lines of actual translation work.
- **Constraints:**
  - Edit only text inside `//`, `/* */`, `/** */`. Never code, never string literals.
  - Preserve PHPDoc/JSDoc tag alignment (`@param`, `@return`).
  - Domain-specific comments referencing "русский язык", Cyrillic ranges, default-language behavior must be translated **by meaning**, not literally.
  - Section-divider pseudographics (`── ─ ━`) stay; only translate the inner text.
- **Recommended approach:** hybrid — script extracts comments to a flat file, batch-translate, second script writes back at original positions. Then per-file diff review.
- **Time estimate:** ~5–7 h hybrid; ~8–12 h purely manual file-by-file.
- **Order:** finish this pass **before** the i18n UI work, so when you start sprinkling `t('...')` calls across templates, the surrounding code reads in one language only.

---

## 9. Known files with Russian comments still present

(Non-exhaustive — confirmed from search results.)

- `app/Ajax_Import.php` — language CRUD logic, `// --- Вычислить суффикс и имя колонки ---`, `// Защиты:`, etc.
- `app/Ajax_Settings.php` — group user CRUD comments, role labels.
- `app/Ajax_Sermon.php` — display targets, media path validation comments.
- `app/Security.php` — `[SECURITY #N]` blocks have mixed Russian/English.
- `app/GoogleAuth.php` — error rendering helpers, comments like `// Fallback: старая колонка`.
- `database/migrate_passwords.php` — entirely Russian.
- `public/js/tech.js` — large blocks: language resolution, Bible verse selection, wallpaper management, media-type detection.
- `public/js/sermon_chip_editor.js` — chip rendering, comment ID management.
- `public/js/settings.js` — Google account linking section header.
- CSS comment blocks inside `templates/tech.html`, `templates/sermon_layout.html`, `templates/leader.html`.

---

## 10. Files Claude should never auto-edit

- Anything matching `*.min.js` — regenerated from source.
- `app/config_example.php` — sensitive config; always confirm with maintainer before editing.
- `database/migrate_passwords.php` — one-shot migration; do not modify after deploy.
- Anything in `vendor/` (if present) — managed by Composer.

---

## 11. Quick reference: where things live

```
app/
  App.php                    # front controller, view rendering
  Ajax.php                   # AJAX dispatcher
  Ajax_Import.php            # languages, songs, messages import
  Ajax_Settings.php          # user/group settings, Google linking
  Ajax_Sermon.php            # sermons CRUD, display targets, media
  Database.php               # MySQL wrapper
  GoogleAuth.php             # OAuth login + account linking
  Info.php                   # service container
  Security.php               # auth, CSRF, password encryption, roles
  config_example.php         # secrets template

database/
  migrate_passwords.php      # one-shot plaintext → encrypted migration

public/js/
  csrf_interceptor.js        # AngularJS $http CSRF header
  websocket_auth.js          # authenticated WS connection
  songs_service.js           # AngularJS service, languages, song lookup
  leader.js                  # leader role controller
  tech.js                    # technician role controller (largest)
  sermon.js                  # sermon presentation mode
  sermon_prep.js             # sermon prep editor
  sermon_chip_editor.js      # citation chip editor (self-contained)
  settings.js                # user/group/Google settings
  *.min.js                   # AUTO-GENERATED, never edit

templates/
  layout.html                # base HTML wrapper
  login.html                 # login form (currently Russian)
  index.html                 # home / role hub
  leader.html                # leader interface
  musician.html              # musician interface
  tech.html                  # technician interface (largest)
  sermon.html, sermon_layout.html, sermon_prep.html
  settings.html
  import.html
```

---

## 12. Working agreements

- When editing a JS file: bump `?v=N` everywhere it is referenced.
- When editing a `.min.js` file: don't. Edit the source instead.
- Before bulk operations: dry-run on one file, show diff, get confirmation.
- When a fix fails: do not declare success. Ask for the next reproduction step or examine the actual DOM state.
- Use English in new comments. When near old Russian comments, prefer to translate them in the same change rather than leaving mixed-language blocks.
