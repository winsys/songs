# Compact UI redesign: Home, Observer, Settings, and Data Import

## Status and scope

This document is the implementation specification for the approved compact UI redesign of:

- the Home page;
- the Observer page;
- the Settings page;
- the Data Import page.

The redesign changes presentation, information hierarchy, and responsive layout only. Existing permissions, routes, AngularJS models and handlers, AJAX commands, WebSocket behavior, database structures, import formats, and session behavior must remain unchanged.

Generated design images are visual references only. This document is normative wherever an image contains invented labels, values, controls, metadata, or behavior that the current application does not support.

## Shared design language

### Principles

1. Put the primary task above the fold and keep application chrome to one compact row.
2. Prefer continuous work surfaces and thin row separators over grids of decorative cards.
3. Use color to communicate selection, live state, success, warning, or danger; do not use it as decoration.
4. Keep frequent actions visible. Secondary help and filters may move into a drawer on narrow screens.
5. Preserve familiar reading and operational modes when no redesign was approved for them.
6. Do not add activity feeds, analytics, recent-item systems, presets, or workflow steps that the application does not already support.
7. All touch targets on tablet and phone layouts must be at least 44 CSS pixels in both dimensions.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| Canvas | `#EDF1F4` | Page background and quiet context bands |
| Surface | `#FFFFFF` | Work surfaces, form controls, and rows |
| Ink | `#17212B` | Primary text |
| Secondary | `#6E7883` | Metadata, hints, and inactive controls |
| Active | `#176B87` | Selected modes, active rails, and primary actions |
| Broadcast | `#1E7E34` | Group mode, success, and active broadcast state |
| Danger | `#C4473A` | Destructive actions and errors |
| Message accent | `#765276` | Message-specific selection where already used |
| Divider | `#DCE3E8` | Panel and row separators |

- UI typeface: `"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif`.
- Base spacing unit: 4 px; common gaps are 8, 12, and 16 px.
- Default corner radius: 6 px. Larger radii are reserved for modals and distinct overlays.
- Avoid gradients. Shadows are limited to overlays, dropdowns, and lifted drag states.
- Do not uppercase ordinary labels or add decorative letter spacing.
- Use a 3 px active rail or a thin border with a very light tint for selected navigation and result rows.
- Provide a visible keyboard focus state and preserve `prefers-reduced-motion` behavior.

## Device strategy

These pages are not full-screen presentation modes. Optimize primarily for portrait use on 9-11 inch tablets, with responsive support for phones and larger screens.

Representative validation viewports:

| Device class | Representative viewport | Expected behavior |
| --- | --- | --- |
| Phone | 390 x 844 | Single-column navigation, bottom tabs or drill-down where specified |
| Medium tablet | 768/800 x 1024/1280 | Primary target; compact split layouts where useful |
| Large tablet | Approximately 1200 x 1920 portrait | Wider rails and work surfaces without oversized typography |
| Desktop | 1366 x 768 and 1920 x 1080 | Use available width for Data Import and administration workflows |

Choose final breakpoints from actual viewport widths and content fit rather than physical screen size alone. No target layout may create horizontal page scrolling.

## Home page

### Selected direction

Use the approved first concept: a compact role-oriented launcher. Remove the proposed last-used-mode block and do not add recent actions.

### Product identity

- Preserve the current logo exactly: `🎵`.
- Preserve the current product name exactly: `Worship Songs`.
- Do not substitute a church-building mark, rename the product, or create a new brand treatment.
- Keep the current user and church identity in the header when those values are available today.

### Layout

- Use one compact top bar containing product identity and user/church context.
- Below it, group destinations by task instead of rendering one undifferentiated tile grid.
- The approved groups are:
  - `Служение`: `Ведущий`, `Музыкант`, `Пианино`, `Наблюдатель`, `Тех. режим`;
  - `Проповедь`: `Показ проповеди`, `Подготовка проповеди`;
  - `Экраны`: `Основной экран`, `Экран трансляции`;
  - `Администрирование`: `Настройки`, `Импорт данных`;
  - quiet final action: `Выйти`.
- Render only destinations currently allowed for the signed-in role. Empty groups must not be shown.
- Preserve every current route and permission check.

### Destination rows

- Medium and large tablets use a dense two-column grid inside each group.
- Phones use a single column.
- Rows are continuous, restrained surfaces with thin borders or separators, not floating promotional cards.
- Each row contains an existing icon or simple functional symbol, label, optional short description, and a right-facing navigation affordance.
- Use narrow role accents only where they help distinguish destinations. Do not fill every row with a different color.
- Minimum row height is 56 px on tablets and 52 px on phones, while retaining 44 px minimum action targets.

### Explicit exclusions

- No `Продолжить`, last-used-mode, or resume block.
- No recent actions, activity history, timestamps, or usage statistics.
- No favorites or pinning unless an existing feature already provides them.
- No new route, role, or administrative action.

## Observer page

### Selected direction

Use the approved second concept: `Библиотека`. On tablets, content navigation and filters form a narrow left rail while search results occupy the main pane. On phones, navigation moves to a bottom tab bar and filters open as a compact sheet.

The existing full-screen reading mode is explicitly outside the redesign and must remain visually and behaviorally unchanged.

### Shared header

- Keep a compact page identity area and the existing Back/menu behavior.
- Keep the existing green `Групповой режим` action and its current availability and state logic.
- The group-mode action must remain clearly distinguishable from ordinary navigation without dominating the search surface.

### Tablet layout

- Use a two-pane body below the header:
  - left library rail: approximately 190-220 px;
  - right search/results pane: remaining width.
- The rail contains the existing content modes: `Песни`, `Библия`, `Послания`, and `История`.
- Context filters appear below the active mode in the same rail:
  - song collections and content language for Songs;
  - existing translation/language controls for Bible;
  - only existing search options for Messages;
  - no invented filter controls for History.
- Keep the rail and results pane independently scrollable when content requires it.
- Search stays at the top of the result pane. Result count/sort information, where it already exists, sits directly below it.
- Results are dense rows separated by rules; selected or active items use the shared active rail/tint.

### Phone layout

- Use one content column.
- Place the four content modes in a persistent bottom tab bar: `Песни`, `Библия`, `Послания`, `История`.
- Keep search near the top of the active content pane.
- Move contextual filters into a bottom sheet opened by an explicit filter action.
- The bottom sheet contains only controls already present in the current page and must not obscure the final focused input.
- Preserve enough bottom padding that result rows are never covered by the tab bar.

### Reading and group modes

- Do not redesign the existing dark full-screen reader.
- Preserve its current layout, typography, close action, font-size actions, Bible navigation, image/text handling, tap behavior, and scroll behavior.
- Do not restyle the passive group-view screen as part of the library redesign. Preserve its current state transitions, waiting states, language/image-group selection, and broadcast rendering.
- Search/library chrome must not leak into either full-screen mode.

### Observer constraints

- Preserve the observer role's read-only AJAX whitelist.
- Preserve session-only history and its existing clear behavior.
- Preserve the current Songs, Bible, Messages, and History search behavior and data models.
- Do not add editing, sharing, favorites, or content-management actions.
- In code and data-flow descriptions, retain the existing Message terminology. In user-facing Russian UI, use the established translation `Послания` where that is the current product wording.

## Settings page

### Selected direction

Use the approved first concept: category navigation plus a focused form canvas. The page should feel like one administration workspace rather than a long stack of unrelated cards.

### Information architecture

Group the current controls into these navigation categories without changing permissions or adding settings:

1. `Основное`
   - UI language;
   - display name;
   - favorites order.
2. `Контент`
   - available song lists and their order;
   - available content languages and their order.
3. `Экраны`
   - placeholder/background image;
   - main display settings;
   - streaming display settings.
4. `Проповедь`
   - existing sermon notes, citation-chip, and slide settings.
5. `Экран ведущего`
   - existing leader-screen settings.
6. `Пользователи группы`
   - role slots and preacher entries;
   - name, login, and password editing according to current permissions;
   - sharing and Observer QR/join actions;
   - linked Google accounts.

Hide categories that contain no controls for the current permission set.

### Tablet and desktop layout

- Use a sticky compact application bar with Back and `Настройки`.
- Below it, use a two-column workspace:
  - left category rail: approximately 210-230 px;
  - right form canvas: remaining width with a comfortable maximum line length.
- Keep category navigation visible while the form scrolls.
- Align labels and controls consistently. Use dividers and section headings inside the canvas instead of nesting every field in a separate card.
- User accounts appear as compact role rows. Expanding a row reveals the existing editable fields, account links, and actions.
- The QR overlay remains a modal and preserves all current actions.

### Phone layout

- The category list becomes the first-level screen.
- Opening a category uses a drill-down view with a clear Back action to the category list.
- Do not compress a permanent side rail beside the form.
- Preserve a sticky bottom save/status bar without covering inputs or account actions.

### Display previews and range controls

- Where display color, font, or background controls benefit from context, show a compact live preview using the current setting values.
- A preview must not introduce a new output mode or persist separate data.
- Font-size settings must remain continuous range inputs with a visible numeric value.
- Never replace a font-size range with presets such as `Маленький`, `Средний`, or `Большой`.
- Preserve the current numeric ranges and steps from the existing controls:
  - main and streaming maximum font sizes;
  - sermon notes font scale;
  - sermon slide maximum font size;
  - streaming height percentage.
- A font-family selector may remain a dropdown and must be clearly labeled as font family, not font size.

### Saving and status

- Use one persistent bottom save/status strip:
  - left: current save/error/unsaved state already available to the controller;
  - right: the existing global Save action.
- Do not invent autosave, version history, reset-to-default, or change-summary behavior.
- Preserve the page reload behavior after changing UI language.

### Settings constraints

- Preserve all current permission checks and `ng-show`/`ng-if` behavior.
- Preserve list/language selection and reordering semantics.
- Preserve image upload, color values, range values, user creation/editing, sharing, join-link regeneration, QR printing/copying, and Google account linking/unlinking.
- Do not merge UI languages with content languages; they are separate systems.

## Data Import page

### Selected direction

Use the approved second concept: a compact three-pane `Рабочая станция` for administration. It is optimized for desktop and large tablet use while remaining operable on a portrait tablet.

### Terminology

- The user-facing Russian name is the proper name `Послания` (`The Message`).
- Never label this product area `Сообщения`.
- Keep backend command, controller, and field names unchanged where they already use `message`, `msg`, or similar technical terms.

### Top-level navigation

- Keep the existing three modes as a compact top tab bar:
  - `Песни`;
  - `Послания`;
  - `Языки`.
- The active tab uses the shared active rail/tint and does not rely on color alone.
- Preserve the current tab state and loading behavior.

### Wide workbench layout

Use three panes below the tab bar:

1. Task rail, approximately 190-220 px.
2. Main form/editor, flexible and dominant.
3. `Справка и протокол`, approximately 280-340 px.

The task rail and help/protocol pane stay visible while the main form scrolls. Avoid multiple nested page scrollbars where one pane can use its own bounded scroll region.

### Task rail

The rail exposes only operations already supported by the active top-level mode.

For Songs, organize the existing flow without turning it into new persisted workflow state:

- choose or create a song list;
- choose content language;
- import SOG song texts;
- manage image groups, order, translations, deletion, and creation;
- select ZIP target group and replace/add mode;
- run ZIP import.

For Messages, expose:

- import from SOG file;
- manual entry or editing;
- current content language.

For Languages, expose:

- current language list;
- add language;
- existing protected/default and deletion behavior.

The rail is navigation, not a new wizard. Do not mark operations complete unless the current controller already provides an equivalent state.

### Main form/editor

- Show only the form associated with the selected operation.
- Use aligned, compact fields and keep the primary action near the end of the form.
- Songs retain list creation, language selection, file selection, image-group management, ZIP target, and replace/add controls.
- The `Послания` manual editor retains:
  - file/manual submode;
  - new/translate/edit mode;
  - code lookup and suggestions;
  - title and city where applicable;
  - paragraph separator;
  - body and character count;
  - audio URL;
  - timecodes and mismatch feedback;
  - the existing save/import action.
- Languages retain current list, protected default language, deletion confirmation/password, and add-language controls.
- Destructive confirmation panels remain adjacent to the item being deleted and use the Danger token.

### Help and protocol pane

- Combine existing contextual help, sample downloads, warnings, progress, and operation log in the right pane.
- The pane may use two compact internal tabs such as `Справка` and `Протокол`, but both must map directly to existing content and log state.
- Help content changes with the active top-level mode and selected task.
- Progress remains visible while an import runs.
- Logs retain their current order, success/warning/error distinction, and exact messages.
- Do not add a global activity feed or persist protocol data beyond current behavior.

### Portrait tablet and phone behavior

- On portrait tablets, keep the task rail and main form visible where width permits. Move `Справка и протокол` into a right-side drawer opened by an explicit action.
- The drawer must show live progress while an import runs and must be dismissible without cancelling the operation.
- On narrower devices, collapse the task rail to a compact task selector or drill-down list before reducing form controls below usable widths.
- File controls, destructive confirmations, and primary actions must retain 44 px touch targets.
- Data Import is not optimized as a phone-first workflow, but the page must remain navigable without horizontal page scrolling.

### Data Import constraints

- Preserve SOG and ZIP formats, sample download URLs, upload limits, multipart CSRF handling, progress updates, and current logs.
- Preserve image-group main/protected behavior, ordering, translations, counts, and ZIP replace/add semantics.
- Preserve message code lookup, manual modes, audio URL, paragraph counting, and timecode validation.
- Preserve language schema operations and password confirmation.
- Do not introduce drag-and-drop upload, background jobs, import queues, undo, scheduling, or bulk operations unless implemented separately and explicitly approved.

## Responsive and interaction requirements

- Sticky bars and rails must not cover focused controls, validation messages, dropdowns, suggestion lists, modal content, or bottom-sheet actions.
- Use `100dvh` with a safe fallback only where a viewport-bound pane is necessary; account for mobile browser chrome and safe-area insets.
- Long Russian, German, English, and Lithuanian UI labels must wrap or truncate without overlapping controls.
- Icon-only actions require translated accessible names or titles.
- Do not remove semantic labels from inputs for visual compactness.
- Hover must not be required to discover essential or destructive actions on touch devices.
- Loading, empty, disabled, offline, and error states must remain reachable and readable.

## Implementation boundaries

Expected primary templates:

- `templates/index.html`;
- `templates/observer.html`;
- `templates/settings.html`;
- `templates/import.html`.

Likely supporting sources only when necessary:

- a shared namespaced stylesheet or existing page-local styles;
- `public/js/observer.js`, `public/js/settings.js`, or `public/js/import.js` only when the responsive presentation cannot be expressed with markup and CSS while preserving current state;
- all four dictionaries under `public/js/i18n/` for every new or changed user-facing string.

Do not change:

- route or permission behavior;
- PHP backend behavior or database schema;
- AJAX command names, request payloads, or response shapes;
- WebSocket message types or observer-channel semantics;
- import file formats or validation rules;
- the existing Observer full-screen reading mode.

Prefer CSS and markup reflow. Preserve existing element IDs, AngularJS bindings, event handlers, and selectors used by JavaScript. If any JavaScript source changes, regenerate its `.min.js` without mangling and bump the `?v=` query parameter in every referencing template. Never edit generated `.min.js` files directly.

## Acceptance checklist

### Home

- Current `🎵 Worship Songs` identity remains unchanged.
- No last-used-mode or recent-actions block exists.
- Only destinations allowed for the current role are visible.
- All current destinations and Logout still navigate correctly.

### Observer

- Tablet uses library rail plus result pane; phone uses bottom tabs and a filter sheet.
- Songs, Bible, Messages, and History searches retain current behavior.
- Group mode retains current state and read-only semantics.
- Existing full-screen reading and passive group-view modes are visually and behaviorally unchanged.

### Settings

- Categories and fields respect the current permission set.
- UI language and content language remain separate.
- Every font-size or scale setting remains a range slider with a visible numeric value.
- Save, image upload, reordering, user management, QR, sharing, and Google account flows still work.

### Data Import

- User-facing terminology consistently says `Послания`, never `Сообщения`.
- All existing Songs, Messages, and Languages operations remain reachable.
- File selection, progress, logs, samples, image groups, manual editing, timecodes, and destructive confirmations retain current behavior.
- The help/protocol drawer on portrait tablet does not cancel or reset active work.

### Cross-page visual and responsive checks

- Verify at 390 x 844, 768 x 1024, 800 x 1280, approximately 1200 x 1920 portrait, 1366 x 768, and 1920 x 1080 where relevant.
- No horizontal page overflow at target sizes.
- Touch controls meet the 44 px minimum on phone and tablet layouts.
- Focus order and visible focus styling remain logical.
- Sticky elements do not cover page content.
- Run `npm run min:check` after implementation.
- If shared mechanisms are touched, consult `docs/deploy-checklist.md` and run the appropriate smoke protocol.
