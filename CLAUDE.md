# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Minification

- PHPStorm + UglifyJS auto-generates `.min.js` from `.js` source files on save — **never manually edit `.min.js`**
- Always edit the `.js` source; exception: files without a `.js` counterpart (e.g. `csrf_interceptor.min.js`)
- If a template references `foo.min.js`, read and edit `foo.js` instead
- Manual minification (if needed): `npx terser public/js/foo.js -o public/js/foo.min.js --compress` — do **not** use `--mangle` (Angular 1.6.6 DI breaks with mangled parameter names; use array DI notation)

## Stack

- **Backend:** PHP 7 + MySQL 5.7 (utf8/utf8mb4 mixed — `current` table is utf8, watch for 4-byte chars)
- **Frontend:** AngularJS 1.6.6 + Bootstrap 3 + jQuery
- **Real-time:** Workerman WebSocket server on port 2345 (browser) / 2346 (internal PHP)
- **Auth:** Session-based + Google OAuth; WebSocket uses HMAC-SHA256 tokens

## URL Routing

All requests go through `public/index.php` via `.htaccess` rewrite (`?route=<path>`). Routing is handled in `app/App.php` by matching the route string. AJAX requests all hit `route=ajax` with a `command` JSON payload.

## AJAX Architecture

`app/Ajax.php` dispatches commands by method name using traits:
- `Ajax_Common` — songs, favorites, user settings, languages
- `Ajax_Tech` — display control (`set_slide`, media, Bible, messages)
- `Ajax_Sermon` — sermon CRUD, audio uploads
- `Ajax_Settings` — display customization, user management, wallpapers
- `Ajax_Import` — song list and MIDI/MusicXML imports

All AJAX responses are JSON. CSRF token is validated from `X-CSRF-Token` header (injected by the AngularJS `csrf_interceptor`).

## Key Patterns

**Static service locator:** `Info::get('key')` / `Info::set('key', $val)` — used to pass config and DB globally.

**Database:** `app/Database.php` wraps MySQLi with `select()` (array), `get()` (single row), `getValue()` (scalar), `exec()`.

**Roles & permissions:** Defined in `app/Security.php`. Roles: `admin`, `leader`, `musician`, `preacher`, `tech`, `screen`. Role checks via `Security::isAdmin()`, `canManageUsers()`, etc. Route access is enforced in `App.php` before rendering.

**WebSocket client:** `public/js/websocket_auth.js` exports `createAuthenticatedWebSocket(url, onMessage, onError, onStatusChange)` — returns `{ destroy() }`, NOT a raw WebSocket. Handles ping/pong, auto-reconnect, and session keepalive.

**Slides:** Stored in `current` table with `image='__slide__'`, `text`=inner HTML, `song_name`=bg color hex. Per-slide background color is stored as `data-bg` on `.sermon-slide` elements. Streaming screen (`text_layout_streaming.html`) skips `__slide__` items entirely.

## Configuration

Copy `app/config_example.php` → `app/config.php` (git-ignored). Requires: DB credentials, `encryption_key` (base64 AES-256 key), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `lang_delete_password`.

Set `APP_ENV=development` for verbose PHP errors.

## WebSocket Server

Start with: `php websocket-server.php start`

Runs as a separate process on localhost:2345. The browser JS connects to this; internal PHP triggers via port 2346.

## Templates

PHP renders HTML templates from `templates/` by including them. The main wrapper is `templates/layout.html` (AngularJS app bootstrap, CSS/JS includes). Role-specific pages: `leader.html`, `musician.html`, `tech.html`, `sermon_prep.html`, `sermon.html`, `settings.html`, `text_layout.html`, `text_layout_streaming.html`, `sermon_layout.html`.
