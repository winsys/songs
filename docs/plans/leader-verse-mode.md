# Plan: leader's split-screen verse mode (слова песни по куплетам)

Status: **implemented 2026-08-22** (same session as this plan).
Owner: Pavel. Maestro-consumable plan document.

## 1. Goal

A new display mode on the **leader page**: a per-song button opens a full-screen
split view (like the sermon presentation page). Left half = big language buttons
(languages the song actually has) + clickable verse chips; right half = the
currently broadcast verse rendered by the same rules as the main display, with
vertical swipe gestures for prev/next verse and a 70%-transparent full-width
close button on top. Verse switches must reach **everyone**: the main screen and
the tech console. A new group setting controls whether several languages can be
selected at once (default: OFF — buttons behave as a radio switch).

## 2. Current architecture (verified facts)

- Leader page already broadcasts songs via `set_image` / `clear_image` with
  `channel:'leader'` → `Ajax_Common::resolveDisplayTarget()` reads
  `user_settings.leader_display_target` (NULL = do not broadcast). `set_image`
  also feeds the notes channel (`setNotes`) and emits `leader_song_changed` so
  the tech console selects the song (tech.js ~2520).
- Verse broadcast today exists only on the tech console:
  `Ajax_Tech::set_text` — UPSERT into `current` keyed by `image_name`, but it
  writes to the caller's OWN group (no `channel` support).
- Tech console follows verse changes of its group via WS `update_needed` →
  `restoreCurrentState()` → `chapter_indices` (verse indices into the
  default-language `\r\n` split). Multi-language text is joined with
  `'\r\n- - - - - - - -\r\n'` (tech.js `splitText` / `toggleCurrentTextChapter`).
- Main display (`text_layout.html`): renders `current.text` pre-wrap, auto-fit
  font capped by `main_font_max_size`, `$`-markers replaced (`'$ $'`,
  `$*****$`, stray `$`), colors/font from group `user_settings`.
- `get_languages` already returns the group's active languages in the group's
  order (first = default = verse skeleton base).
- `get_favorites` returns `l.*` — all `TEXT{suffix}` columns + `hasText_<code>`
  flags, `NAME`, `imageName` — the leader page has everything client-side.

## 3. Implementation

### Server
- **New trait `app/Ajax_Leader.php`** (registered in `app/Ajax.php`), command
  `set_leader_text`: same UPSERT semantics as `Ajax_Tech::set_text`, but the
  group is resolved via `resolveDisplayTarget()` (`channel:'leader'`; NULL →
  no-op) and `updateSocket($targetGroupId)`. A separate file so the concurrent
  sermon-mode session editing `Ajax_Tech.php` is untouched.
- **Setting** `user_settings.leader_text_multilang` TINYINT(1) DEFAULT 0:
  migration `database/migrations/add_leader_text_multilang.sql` (+ applied to
  production DB directly), `database_full.sql`, defaults in
  `Ajax_Common::get_user_settings`, persisted in
  `Ajax_Settings::save_user_settings`.

### Leader page (`templates/leader.html` + `public/js/leader.js`)
- New 52×52 "¶" button on each favorites row (next to "Аа") → opens the mode.
- Overlay `#leaderVerseMode` (ng-show, NOT ng-if — gesture listeners attach
  once), 50/50 split:
  - left: language buttons (`justify-content:space-between`, ≥48px tall,
    flex-grow) + verse chips (scrollable);
  - right: full-width close button (`opacity:0.3`, same height as the language
    buttons) + display area (group's main-screen colors/font, pre-wrap,
    binary-search auto-fit capped at `main_font_max_size`).
- Open = existing `set_image` `channel:'leader'` (notes on for musicians, song
  image on the target screen, `leader_song_changed` to the tech console) —
  identical to the "Аа" button. Close = existing `clear_image`
  `channel:'leader'`. No new semantics on open/close.
- Verse click / swipe → `set_leader_text` with the tech-console text format:
  selected-language parts joined with `'\r\n- - - - - - - -\r\n'` (this IS the
  "line" between translations — the main screen shows the same), `song_name` =
  song NAME, `chapter_indices` = base-skeleton verse index. Toggle-off → same
  command with `text:''` (screen falls back to the song image row).
- Verse skeleton built exactly like tech.js `splitText`: base = first langList
  entry (fallback: first language with text), indices survive language
  switches; chips show the first selected language.
- Language buttons: radio by default; toggles when `leader_text_multilang=1`
  (the last selected language cannot be deselected). Changing languages while
  a verse is on re-broadcasts it in the new language set.
- Swipe on the right half: up = next verse, down = previous (threshold 50px —
  same convention as sermon.js).

### Settings (`templates/settings.html` + `public/js/settings.js`)
- New collapsible card «Экран ведущего» (shown to admin/leader/tech:
  `canEditFavoritesOrder || canEditAllSettings`) with checkbox №20 bound to
  `settings.leader_text_multilang` (ng-true-value 1 / 0).

### i18n (all four dicts: ru/de/en/lt)
- `leader.verses.open`, `settings.card.leaderScreen`,
  `settings.leaderTextMultilang`, `settings.hint.leaderTextMultilang`.
- Close button reuses `common.button.close`.

## 4. Regression analysis (shared mechanisms touched)

- `current` table: one NEW writer (`set_leader_text`), semantics copied from
  the existing `set_text` UPSERT — consumers (main screen, streaming screen,
  tech restore) already handle exactly this row shape. No existing writer
  changed.
- Notes channel: only pre-existing `set_image`/`clear_image` calls are reused —
  contract untouched.
- `leader_song_changed`, `update_needed`: no changes; the tech console follows
  the new mode through the same events it already consumes.
- `save_user_settings` / `get_user_settings`: additive column only.
- Smoke after deploy (5 min): leader verse mode → verse on main screen +
  highlighted on tech console; tech verse click still works; leader "Аа" and
  notes toggles unchanged; NULL leader target → screens untouched; media
  (video/wallpaper) survives opening the mode but is replaced by a verse click
  (same as tech behavior).

## 5. Deploy

1. Apply `add_leader_text_multilang.sql` to production DB (additive, safe
   before code deploy).
2. `git pull` on the server (standard deploy).
3. Run the smoke list from §4.
