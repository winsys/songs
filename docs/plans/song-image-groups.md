# Plan: sheet-music image groups (несколько картинок нот на песню)

Status: **implemented 2026-08-22** (same session as this plan).
Owner: Pavel. Maestro-consumable plan document.

## 1. Goal

A song may carry any number of sheet images, organised in **groups that belong
to the song collection** (сборник). Every collection starts with two groups:
«НОТЫ» (holds the existing main sheet as its first page) and an empty
«АККОРДЫ». Admins edit the group list (rename, reorder, add, delete). The ZIP
import asks which group to import into, whether existing images are replaced or
only missing ones added, or creates a new group on the fly. On the musician
page translucent (50 %) buttons name the groups of the current collection; each
musician picks a group for themselves, the choice survives song switches for
the browser session, and when the chosen group has no image for a song the
groups are tried in order and the first image found is shown (the choice stays).
Fullscreen shows only the current image. Formats: JPG and PNG.

## 2. Current architecture (verified facts)

- The main sheet is a DERIVED path, no DB column: `/images/<LISTID>/<NUM>.jpg`
  (SQL `concat(...)` as `imageName` in Ajax_Common, `set_image`, leader.html).
  Musicians read it from the notes channel (`current_notes.image`,
  `notes_update` WS, `get_notes`); the tech console also consumes `get_notes`.
- Song numbers are free text: `д001`, `304 (1)`, `422_C`, `503_E-F` (144 songs
  with non-ASCII characters in production). `set_image` used to strip
  non-ASCII characters from the notes path (`д001` → `001.jpg`).
- Production PHP 7.2 has **no zip extension** — the old ZIP import could not
  have worked there (`class_exists('ZipArchive')` → error).
- `public/images/<list>` is `root:root 2775`; www-data writes through the root
  group (tools `update_rights.sh` scheme); uploaded files appear as `www-data root`.

## 3. Implementation

### Storage (file-based, no per-image table)
- `app/SongImages.php` — helper class (included in `public/index.php`).
  - page 1 of the **main** group (`IS_MAIN=1`) = legacy `/images/<L>/<NUM>.jpg`;
  - every other page = `/images/<L>/g<GROUP_ID>/<NUM>_<page>.jpg|png`;
  - listing = `scandir` + exact-NUM regex (`^<NUM>_(\d{1,3})\.(jpe?g|png)$`), so
    `422_C` and `503_2` never collide with page suffixes; group dirs are named
    by the immutable group ID, renaming/reordering never moves files.
- Table `song_image_groups` (ID, LISTID, NAME, SORT_ORDER, IS_MAIN) —
  migration `database/migrations/add_song_image_groups.sql` + runner
  `run_add_song_image_groups.php`; seeds «НОТЫ»(main)+«АККОРДЫ» for every
  collection without groups; `SongImages::groups()` also seeds lazily and
  `create_song_list` seeds explicitly. Missing table ⇒ `groups()` returns `[]`
  and the musician page falls back to the single main image.

### Server commands
- `get_notes` (Ajax_Common) + `with_groups: 1` → adds `list_id`, `num`,
  `groups: [{id, name, is_main, images: [...]}]`. Without the flag (tech
  console) the response is unchanged. Notes-channel writers untouched.
- `set_image`: notes path keeps the real song number (only `/`, `\`, control
  characters dropped) — fixes `д001`-style songs on the musician page and the
  tech console's song highlight.
- Ajax_Import: `get_image_groups` (with image counts), `add_image_group`,
  `rename_image_group`, `delete_image_group` (not for IS_MAIN; removes the
  `g<ID>` dir), `reorder_image_groups` (full id list). Admin-only mutations.
- `import_song_images_zip`: params `group_id` (default main), `mode`
  (`replace` = overwrite the same page slot, legacy default; `add` = skip
  existing). Entry names `<NUM>.ext` → page 1, `<NUM>_2.ext` / `<NUM>-2` /
  `<NUM> 2` → page 2 (exact song numbers win; unknown numbers are still saved
  as page 1 with a warning — images may precede the texts). Only real
  JPEG/PNG content (`getimagesizefromstring`). Page 1 of the main group is
  always written as `<NUM>.jpg` (PNG bytes allowed — same as the tech upload).
  ZIP entry names: raw bytes (`FL_ENC_RAW`), valid UTF-8 kept, otherwise
  decoded from CP866 (Windows Explorer archives with Cyrillic names).
- `app/ZipReader.php` — pure-PHP reader (central directory, store/deflate,
  CRC check; no ZIP64/encryption) used when ZipArchive is missing. Verified
  byte-for-byte against ZipArchive on deflate/stored/CP866/commented archives.

### Musician page (`templates/musician.html`, `public/js/musician.js`)
- `get_notes with_groups` on every `notes_update` / reconnect (sequence-guarded
  as before). Bottom bar (`ng-if="!fullScreen && notes.groups.length"`): one
  50 %-opacity button per group (selected = blue, shown-as-fallback = white
  inset ring, no image for this song = dimmed label) + `‹ 1/2 ›` pager when
  the shown group has several pages.
- Selection memory: `sessionStorage.musicianImageGroup` =
  `{byList: {listId: groupId}, lastName}`; for a collection without an
  explicit choice a group with the same NAME as the last choice is used
  (defaults exist everywhere), else the first group.
- Fallback: selected group without images → first group (in order) with
  images; the selection is not changed.
- Fullscreen = the `<img>` element itself (unchanged), so nothing else is
  visible; pages flip by horizontal swipe (`ng-swipe-*`, ngTouch) or arrow
  keys; tap toggles fullscreen (suppressed for 500 ms after a swipe).
  `fullscreenchange` keeps the flag in sync (ESC), webkit-prefixed fallback
  for iPad Safari. Pages of the shown group are preloaded.

### Import page (`templates/import.html`, `public/js/import.js`)
- Section 4: group list (inline rename on blur/Enter, ▲▼ reorder, delete with
  confirmation panel, «основная» badge, image counts), add-group row; ZIP
  target select (groups + «создать новую группу…» with a name field), mode
  radio (replace / add), file input. New group + import = two calls
  (`add_image_group` then `import_song_images_zip`).

### i18n (all four dicts): 28 new keys (`ajax.error.group*`,
`import.field.imageGroups|zipGroup|zipMode`, `import.groups.*`,
`import.log.group*|skippedExists|noSongForImage|invalidImage|badFileName`,
`import.option.zipNewGroup`, `import.placeholder.groupName`,
`import.zip.mode*`) + updated `import.hint.zipFormat`, `import.log.zipImported`
(`{skipped}`).

### Follow-up (same day)
- **«Нет картинок» placeholders:** `public/no_image/{ru,de,en,lt}.png`
  (generated with PIL/DejaVu, 1600×1000: «Для этой песни пока нет картинок /
  Ноты или аккорды ещё не загружены» per UI language). The musician page
  shows the one for `window.UI_LANG` when a song is on but no group has an
  image (and as an `onerror` fallback of a listed page); notes OFF keeps the
  configured placeholder.
- **Edit dialog (tech page):** block «Группы картинок» — every group of the
  song's collection with its page thumbnails (click = enlarge), ✕ delete
  (native confirm), «➕ Добавить картинку» (multi-file, uploaded one by one
  as the next pages). Commands `get_song_images`, `upload_song_page_image`
  (next free page or `page` to replace; page 1 of the main group = legacy
  `<NUM>.jpg`), `delete_song_page_image` — roles admin/leader/tech. Applies
  immediately, independent of Save; hidden for a not-yet-saved song.
  `showEnlargedImage()` was a dead reference before — now implemented
  (`editConfig.enlargedImage`, stacked-modal `modal-open` fix).
- **Dialog headers:** Bootstrap 3's `.modal-header/.modal-footer`
  `::before/::after` clearfix pseudo-elements become flex items inside the
  `display:flex; justify-content:space-between` headers and pushed the title
  and the close button away from the edges — disabled for the edit dialog,
  the song-list popups (tech + leader), confirmation and enlarged-image
  dialogs; `.close` no longer floats (`margin-left:auto` / `order:2`).

### Follow-up 2 (same day)
- **Multilingual group names:** column `song_image_groups.NAMES` (JSON
  `{ui_lang: name}`, migration `add_song_image_group_names.sql` + runner,
  defaults translated: НОТЫ → NOTEN / SHEET MUSIC / NATOS, АККОРДЫ → AKKORDE /
  CHORDS / AKORDAI). `NAME` stays the name the group was created with and is
  the fallback for every language without a translation.
  `SongImages::displayName()` picks `T::lang()`; `get_notes` (musician),
  `get_song_images` (edit dialog) and `get_image_groups.display_name`
  (import page) return the localized name, the import page edits
  translations in a 🌐 panel per group (`set_image_group_names`, admin).
  The musician's remembered choice matches by translated OR original name.
- **Placeholder «нет картинок»:** regenerated portrait 1000×1400 (1:1.4).
- **Settings:** the UI-language card title is English-only («🌐 UI language»).

### Follow-up 3 (same day) — ONE image per group
- Pavel: a song has at most one image per group ("type"). Pages removed:
  non-main groups store `/images/<L>/g<ID>/<NUM>.jpg|png` (the legacy
  `<NUM>_1.<ext>` written by the first build is still recognised by
  `SongImages::slotFiles()` and replaced on the next upload; the two such
  files on production were renamed at deploy). ZIP entries are plain song
  numbers (no `_2` page suffix parsing).
- API: `get_notes with_groups` → `groups[].image` (path|null);
  `get_song_images` → `groups[].image`; `upload_song_group_image` /
  `delete_song_group_image` replace the page commands.
- Musician page: group buttons larger (56 px, 20 px font) at the TOP,
  centred; no pager/swipe.
- Edit dialog: per group a thumbnail + ✕ + one button whose label depends on
  the image («➕ Добавить картинку» / «✏️ Изменить картинку»); the classic
  «Картинка» row (deferred upload on Save) is shown for NEW songs only, with
  the same label logic; the ZIP import hint says one image per song and group.

## 4. Regression analysis

- `current_notes` / `notes_update`: no writer changed; `get_notes` gains an
  opt-in field set — the tech console (no flag) sees the identical response.
- `current` table: untouched (the screen keeps showing the main sheet).
- Leader / tech pages: no changes (main image derivation unchanged).
- `set_image` sanitizer: only affects songs with non-ASCII/space/paren numbers,
  which were broken before (wrong file + wrong console highlight).
- ZIP import defaults (no group_id, mode replace) reproduce the old behaviour
  for `<NUM>.jpg` files; gif/webp are now skipped with a warning (they were
  saved but never displayable); `.jpeg`/`.JPG`/`.png` page-1 files now land as
  `<NUM>.jpg` (were saved under their own name and never displayed).
- Smoke after deploy: musician page shows the main sheet with «НОТЫ»/«АККОРДЫ»
  buttons; leader song toggle still switches notes; tech console still follows
  the notes channel; import page lists groups for every collection; a ZIP with
  `001.jpg` + `001_2.jpg` into «АККОРДЫ» shows two pages on the musician page.

## 5. Deploy

1. `php database/migrations/run_add_song_image_groups.php` on the server.
2. `git pull` in `/srv/songs`; `curl -s -o /dev/null -w '%{http_code}' /login` → 200.
3. Smoke list from §4.
