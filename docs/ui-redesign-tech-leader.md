# Compact UI redesign: Tech, Leader, and Sermon Preparation

## Status and scope

This document is the implementation specification for the approved compact UI redesign of:

- the Tech console in its Songs, Bible, and Message modes;
- the Leader page at three portrait device sizes;
- the Sermon Preparation page using the final, document-first concept.

The redesign changes presentation and responsive layout only. Existing permissions, AngularJS data flows, AJAX commands, WebSocket messages, display-target behavior, observer behavior, media behavior, and database structures must remain unchanged.

The generated design images are visual references only. This document is normative where an image contains invented metadata, controls, or behavior that the current application does not support.

## Shared design language

### Principles

1. Put the working content above the fold. Page identity and secondary controls must not consume several vertical rows.
2. Use one compact application bar and one context bar where the page needs contextual controls.
3. Prefer thin separators and continuous work surfaces over nested cards.
4. Use color to communicate state, not as decoration.
5. Preserve familiar control locations. In particular, sheet-music thumbnails on the Leader page always remain at the far right of their row.
6. Do not hide frequent live-operation actions behind multi-level menus.
7. Rare import or insertion actions may be grouped into a single existing Bootstrap dropdown.
8. All touch targets on tablet and phone layouts must be at least 44 CSS pixels in both dimensions.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#EDF1F4` | Page background and quiet context bands |
| Surface | `#FFFFFF` | Work surfaces, inputs, and rows |
| Ink | `#17212B` | Primary text |
| Secondary | `#6E7883` | Metadata and inactive controls |
| Active | `#176B87` | Selected modes, primary actions, and active rails |
| Broadcast | `#1E7E34` | Group broadcast and active-on-screen state |
| Danger | `#C4473A` | Destructive actions and screen-off state |
| Message accent | `#765276` | Message citations and message-specific selection |
| Divider | `#DCE3E8` | Panel and row separators |

- UI typeface: `"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif`.
- Sermon document body: `Georgia, "Times New Roman", serif`; UI controls remain sans serif.
- Base spacing unit: 4 px; common gaps are 8, 12, and 16 px.
- Default corner radius: 6 px. Use larger radii only for a modal or a clearly distinct overlay.
- Avoid gradients. Shadows are limited to overlays, dropdowns, and dragged rows.
- Do not uppercase ordinary section labels or add decorative tracking.

### Interaction states

- Selected items use a 3 px active rail or a thin active border plus a very light tint.
- The item currently shown to musicians/screens uses the existing broadcast green and must remain distinguishable without animation. The current pulse may remain, but `prefers-reduced-motion` must disable it.
- Hover must never be the only way to discover a destructive or essential action on touch devices.
- Keyboard focus must be clearly visible.
- Loading, empty, disconnected, disabled, and error states must continue to use the existing logic and translated strings.

## Tech console

### Target environment

The Tech console is used on a desktop monitor, HD resolution or higher. Optimize primarily for:

- 1366 x 768;
- 1920 x 1080;
- larger desktop screens without allowing lines of text to become excessively long.

The selected direction is the first generated Tech concept: a dense operational console with a horizontal application bar, a compact context bar, and independently scrolling work panes.

### Application bar

- Target height: 48-52 px.
- Left: Back action, page title `Тех режим`, and user name as quiet metadata if space permits.
- Center: one segmented switch containing `Песни`, `Библия`, and `Послание`.
- Right: group broadcast state, Leader display target, Sermon display target, request-access action, and the existing external-screen disable action when applicable.
- The active display target must retain the strong active treatment already used by the application.
- The bar is sticky. It must not grow to a second line at 1366 px width.

### Context bar

- Target height: 38-44 px, followed immediately by search or primary content.
- Its controls change with `pageMode`; do not render unrelated mode controls.
- Long collections or translations may scroll horizontally inside their control group instead of wrapping into several rows.
- Secondary groups use a quiet `Canvas` background rather than separate cards.

### Songs mode

Context bar contents:

- song-list selection;
- active content languages;
- `Все песни`;
- `Добавить`;
- media and standard-wallpaper actions, grouped without pushing the working area down.

Work area:

1. A single full-width song search field.
2. Below it, a 38/62 split:
   - left: selected playlist;
   - right: prepared song verses.
3. The playlist is independently scrollable and preserves drag reordering, song/media rows, edit/delete actions, audio controls, video controls, and active media state.
4. Song rows should be approximately 52-58 px high where content permits. Keep sheet thumbnails visible.
5. Verse blocks are numbered or separated clearly, have a large click area, and preserve multi-selection behavior.
6. Adjacent selected verses read as one selected range while remaining separate clickable values in the DOM.
7. Do not add per-verse actions or metadata that are not present in the current controller.

### Bible mode

Context bar contents:

- primary translation;
- parallel-language toggles and their translation selectors;
- the existing one/two/three verses-per-screen selector.

Work area:

1. Book search and full-text search share one compact row.
2. With no full-text search, use three independently scrolling panes:
   - books: approximately 24%;
   - chapters: approximately 14%;
   - verses: approximately 62%.
3. Chapters use a compact number grid rather than a tall single-column list when space permits.
4. Verse numbers occupy a narrow gutter. Text remains the dominant visual element.
5. A selected continuous range uses the active tint and rail without obscuring parallel text.
6. Full-text results replace the navigator body but do not move or resize the application and context bars.

### Message mode

Context bar contents:

- active content languages;
- only the existing message-related controls.

Work area:

1. Title search and text search remain in one compact row.
2. Below it, use a 34/66 split:
   - left: search results;
   - right: message paragraphs.
3. Search result rows show the existing code, title, and city fields only.
4. The paragraph panel header is sticky and contains the existing audio controls when the selected message has audio and timecodes.
5. Preserve play/pause, stop, rewind, calibration mode, paragraph timecodes, and stop-marker behavior.
6. Paragraphs use a narrow number/time gutter and a readable text column.
7. Do not add microphone status, audio-level meters, speaker metadata, or duration metadata unless those values already exist in the current response.

### Tech constraints

- Preserve all existing `ng-model`, `ng-click`, `ng-show`, `ng-if`, drag handles, element IDs used by JavaScript, and modal behavior.
- Do not change display-target resolution, `current`/`current_notes` behavior, observer propagation, WebSocket event types, or AJAX commands.
- A CSS/markup reflow is preferred. Controller changes are allowed only when a visual control cannot be expressed using existing state.
- Keep modal content and media upload flows functionally identical.

## Leader page

### Device strategy

The Leader page must support three portrait layouts:

| Layout | Representative viewport | Structure |
| --- | --- | --- |
| Phone | 390 x 844 | Compact single column |
| Medium tablet, 9-11 inch | 768/800 x 1024/1280 | Touch-oriented single column |
| Large tablet, 14 inch | Approximately 1200 x 1920 | Utility rail plus service-order pane |

Physical screen size must not be inferred directly from CSS pixels. Choose breakpoints from actual viewport widths and validate them on the target devices. A reasonable starting point is:

- phone: up to 540 px;
- medium portrait: 541-899 px;
- large portrait: 900 px and above while `orientation: portrait`.

Landscape behavior may use the nearest wider layout but must not be the basis for the portrait design.

### Invariant: sheet music is always on the right

Every song representation that includes a sheet-music image must place that image at the extreme right of its row. This applies to:

- selected songs;
- autocomplete/search results;
- the `Все песни` list;
- preview rows and any future song list.

Never move the image to the left, above the title, into a separate drawer, or between text actions. Users rely on its current right-side position.

The canonical selected-song row order is:

1. drag handle;
2. optional service sequence number;
3. title, book name, and language badges;
4. delete action where space permits;
5. `¶` verse-mode action;
6. `Аа` full-text action;
7. sheet-music thumbnail at the extreme right.

### Shared Leader header and controls

- Keep Back, `Ведущий`, and `Управление списком песен` in a compact sticky header.
- Group broadcast remains visible as a green stateful control.
- The QR action remains adjacent to the broadcast control and appears only under the same conditions as today.
- Collection selection, `Все песни`, search, selected count, drag ordering, clear-list action, verse mode, full-text mode, and notes opening all remain available.
- Song rows must preserve the existing green active-song treatment driven by `activeSongImage`.

### Phone layout

- Header target height: 46-50 px. Use an icon-only Back action if needed, but retain an accessible label.
- Broadcast and QR controls are compact; they must not force the title into more than two lines.
- Collections form a horizontally scrollable chip row. They do not stack into one button per line.
- Search is full width and may become sticky directly below the header/collection row.
- The selected-song list is one continuous surface with thin row separators, not detached cards.
- Target row height: 82-92 px, allowing a two-line title.
- `¶` and `Аа` targets are approximately 40-44 px. The sheet thumbnail is approximately 56 x 64 px and remains flush right.
- Metadata may wrap below the title, but actions and thumbnail must not overflow horizontally.
- Delete stays visible as a small action before `¶`; it must not appear to the right of the sheet thumbnail.

### Medium tablet layout, 9-11 inch

- Use one column; do not create a permanent sidebar.
- Header target height: 52 px.
- Collections, `Все песни`, and search consume no more than two compact rows below the header.
- The selected-song list uses the available width with rows approximately 72-80 px high.
- Recommended thumbnail size: 58-64 px.
- Keep large 44 px actions for delete, `¶`, and `Аа`.
- The active song has a restrained green outline and a compact `На экране` state label.
- Show only one clear-list action. Do not duplicate it above and below the list.

### Large tablet layout, 14 inch

- Use a two-column work area below the header.
- Left utility rail: approximately 280-320 px, containing collection selection, content language controls where applicable, `Все песни`, search, search results, and selected count.
- Right pane: `Порядок служения`, containing the sortable selected-song list.
- Both panes scroll independently when necessary; the header stays fixed.
- Target selected-song row height: 74-82 px.
- Recommended sheet thumbnail size: 64 px square or the closest aspect-correct size.
- Search-result thumbnails in the left rail also stay at the extreme right of each result row.
- Use the additional width for clearer metadata and touch spacing, not oversized typography.
- The clear-list action may sit in a pinned footer of the right pane.

### Leader constraints

- Preserve all existing song selection, observer broadcast, QR, drag reorder, verse mode, full-screen text, notes opening, deletion, clearing, and modal flows.
- Do not turn language badges into language selectors unless the current action already supports that behavior.
- Do not add sequence persistence separate from the current favorite order.
- On touch devices, dragging begins only from the drag handle so vertical scrolling remains reliable.

## Sermon Preparation

### Selected direction

Use the final generated concept: a calm, document-first workspace. The editor occupies most of the viewport, while Bible/Message sources remain in a narrow persistent panel that can use the existing collapse behavior on constrained screens.

### Header

- Target height: 48-52 px and sticky.
- Left: Back and `Подготовка проповеди`.
- Center/flexible area: sermon title and date.
- Right: existing save status, sermon list, new sermon, Save button, and export dropdown.
- Keep title and date editable; do not render them as static display text.
- Do not add a preview command unless it is wired to an existing supported behavior.

### Desktop and wide-tablet workspace

- Use a two-column body immediately below the header:
  - source panel: approximately 250-280 px;
  - editor: remaining width.
- Avoid a separate metadata row above this body; title, date, and save actions belong in the header.
- The editor and source panel may scroll independently, but citation insertion must not lose the editor selection/caret behavior already handled by the current JavaScript.

### Source panel

- Keep the `Библия` and `Послание` tabs at the top.
- Bible mode retains translation selection, UI/content language controls, book search, book selection, chapter selection, verse selection, and citation insertion.
- Prefer progressive navigation and a compact breadcrumb such as `Римлянам › 5` once a book and chapter are selected. This is a presentation change only; the underlying state remains `selectedBook` and `selectedChapter`.
- Selected verses use the active blue rail/tint. The insertion button remains pinned at the bottom of the source panel when practical.
- Message mode retains title/text search, result selection, paragraph selection, expansion/back behavior, and message citation insertion.
- Message selection uses the message accent color without changing citation-chip semantics.

### Editor toolbar

- Target height: 38-42 px.
- Keep undo/redo, bold, underline, italic, strike, ordered/unordered lists, block style, font size, and text color visible or directly reachable.
- Group image, video, new slide, selection-to-slide, PowerPoint, and draw.io actions under one `Вставить` dropdown where this can be done with existing Bootstrap behavior.
- Grouping actions must not break the browser user-gesture chain used for file selection or export.
- Tooltips and accessible names remain translated.

### Document surface

- Use a white continuous writing surface with comfortable internal padding rather than a nested card.
- UI controls use the shared sans serif. The editable sermon body may use Georgia for stronger separation between application chrome and authored content.
- Keep the existing heading scale, blockquotes, Bible citation chips, Message citation chips, images, video chips, PowerPoint slides, and sermon-slide blocks.
- Citation chips use blue for Bible and the message accent for Message sources.
- Slide blocks remain visually distinct and must preserve `data-bg`, active-slide state, editing, deletion, and conversion behavior.
- The existing save status may be repeated in a slim bottom status line if it is the same state. Do not add word-count logic solely because it appeared in the generated concept.

### Narrow portrait behavior

- On medium portrait tablets, the source panel may collapse to a compact tab/header and open above or beside the editor using the existing `biblePanelCollapsed` state.
- On phones, stack source and editor rather than reducing the editor to an unusably narrow column.
- The toolbar may scroll horizontally or group rare insertion actions, but formatting actions must retain 44 px touch targets.
- The editor should receive at least 60% of the visible viewport height after the source panel is collapsed.

### Sermon Preparation constraints

- Preserve contenteditable DOM invariants, caret restoration, selection handling, chip editing, image resizing, video insertion, slide conversion, imports, exports, and save behavior.
- Do not rename or remove IDs/classes used by `sermon_prep.js` or `sermon_chip_editor.js` without updating and testing their selectors.
- Do not introduce a new editor library.
- Preserve the Blob/link export patterns documented in `CLAUDE.md`.

## Implementation boundaries

Expected primary files:

- `templates/tech.html`;
- `templates/leader.html`;
- `templates/sermon_prep.html`.

Possible supporting files only when necessary:

- a new shared, namespaced stylesheet referenced from `templates/layout.html`;
- `public/js/tech.js`, `public/js/leader.js`, or `public/js/sermon_prep.js` only for behavior that cannot be achieved through markup/CSS while preserving current state;
- all four dictionaries under `public/js/i18n/` for every new or changed user-facing string.

Do not change:

- PHP backend behavior;
- AJAX command names or payloads;
- WebSocket message types;
- display-target resolution;
- `current`, `current_notes`, or `current_observer` semantics;
- database schema.

If any JavaScript source changes, regenerate its `.min.js` without mangling and bump the `?v=` query parameter in every referencing template. Never edit a generated `.min.js` directly.

## Acceptance checklist

### Functional

- Every current control remains reachable and invokes the same existing handler.
- Songs/media can still be added, reordered, selected, edited where supported, and removed.
- Tech verse selection and display behavior remain unchanged in all three modes.
- Message audio calibration and stop markers still work.
- Leader observer broadcast and QR behavior remain unchanged.
- Leader sheet thumbnails are on the right in every song list and search result.
- Sermon citations, editing, uploads, slide operations, imports, exports, and saving still work.

### Responsive and visual

- Tech: verify at 1366 x 768 and 1920 x 1080.
- Leader: verify at 390 x 844, 768 x 1024, 800 x 1280, and approximately 1200 x 1920 portrait.
- Sermon Preparation: verify at 1366 x 768, 1920 x 1080, 800 x 1280 portrait, and 390 x 844.
- No horizontal page overflow at target sizes.
- Sticky bars do not cover search results, dropdowns, modals, or focused editor content.
- Touch controls meet the 44 px minimum on phone/tablet layouts.
- Long Russian, German, English, and Lithuanian labels do not overlap controls.

### Regression

- Run `npm run min:check`.
- If shared mechanisms are touched, follow `docs/deploy-checklist.md` and run the appropriate smoke protocol.
- Test disconnected-state banners and reduced-motion mode.
- Test keyboard focus order and basic screen-reader names for icon-only controls.
