# Compact UI redesign: Sermon Display

## Status and scope

This document is the implementation specification for the approved redesign of the Sermon Display page.

The page is used as a live presentation console by the preacher. It combines private sermon notes with a local preview of the content sent to the configured main display. The redesign changes layout, control placement, sizing, and responsive behavior only.

Preserve all existing sermon selection, note rendering, citation activation, slide/image/video activation, display clearing, font scaling, content navigation, zoom/pan, Fullscreen API behavior, display-target resolution, AJAX commands, WebSocket messages, and database semantics.

Generated design images are visual references only. This document is normative wherever an image contains invented text, metadata, controls, or behavior.

## Approved direction

The selected design is a dark, full-viewport, landscape-only operating surface with:

- sermon notes on the left;
- a clean display preview on the right;
- compact controls that do not reduce the reading area unnecessarily;
- different control placement on tablets and phones;
- no page scrolling outside the internal notes area.

The page is always used in landscape orientation on every supported device. No portrait layout is required for this mode.

The page must fill the available viewport at all times. Browser fullscreen remains controlled by the existing Fullscreen API action because browsers may require a user gesture and may refuse automatic fullscreen entry.

## Design language

### Principles

1. Notes are the working surface and must remain the most information-dense part of the page.
2. The preview represents the actual output and must remain free of permanent decorative chrome.
3. Controls stay in stable, familiar positions and never float over sermon text.
4. Color identifies content type and live state; it is not decorative.
5. Live-operation controls must have large touch targets without creating a tall toolbar.
6. Preserve the current one-tap activation model and navigation gestures.
7. Do not introduce a second presentation state, presenter timeline, slide counter, or media metadata unless it already exists in the current implementation.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| Page black | `#000000` | Display preview background |
| Notes surface | `#202A35` | Notes reading surface; may be tuned close to the current dark surface |
| Toolbar | `#18222C` | Tablet top bar and phone control dock |
| Toolbar raised | `#24313D` | Touch buttons and selected utility controls |
| Primary text | `#E0E6EC` | Notes and control labels |
| Secondary text | `#8E9BA8` | Date, metadata, and inactive state |
| Divider | `#3A4652` | Pane, toolbar, and control separators |
| Bible accent | `#2F9ED3` | Bible citations and active Bible content |
| Message accent | `#A853C6` | Message citations and active Message content |
| Slide accent | `#F07A24` | Slides and active slide state |
| Success | `#1E7E34` | Existing positive/live state where applicable |
| Danger | `#C4473A` | Stop, clear, or destructive emphasis where applicable |

- UI and notes typeface: `"Segoe UI Variable Text", "Segoe UI", Arial, sans-serif`.
- Base spacing unit: 4 px; common gaps are 8, 12, and 16 px.
- Default control radius: 6 px.
- Avoid gradients and ambient shadows. Use borders, dividers, and semantic accents.
- Overlay shadows are permitted only where required to separate a menu from the dark surface.
- All icon-only controls require translated accessible names and visible focus styling.

## Target devices and layout selection

The same functional mode must support three landscape device classes:

| Device class | Representative viewport | Approved layout |
| --- | --- | --- |
| Phone | 844 x 390 or 915 x 412 | Notes, central vertical dock, preview |
| Medium tablet, 9-11 inch | 1024 x 768 or 1280 x 800 | Notes with top toolbar, preview |
| Large tablet, approximately 14 inch | 1366 x 768, 1600 x 900, or 1920 x 1200 | Notes with top toolbar, wider preview |

Do not infer physical inches directly from CSS pixels. Choose the final phone/tablet breakpoint using viewport width, height, aspect ratio, and actual content fit. A reasonable starting point is a phone landscape layout when viewport height is at most approximately 540 px and the input is touch-oriented.

Portrait orientation does not need a separate production layout. If encountered, show a minimal translated request to rotate the device rather than stacking the two working surfaces.

## Tablet layout: approved image 2

### Proportions

- Medium 9-11 inch tablet:
  - notes pane: 58% of viewport width;
  - display preview: 42%.
- Large approximately 14 inch tablet:
  - notes pane: 55%;
  - display preview: 45%.
- The divider is included in the notes-side calculation and should be 1-2 px.
- Both panes occupy the full viewport height.

```text
┌──────────────────────── notes 58% / 55% ────────────────────────┬──────── preview 42% / 45% ────────┐
│ Back │ sermon title/date │ A− A+ │ sermon selector │ menu      │                                      │
├─────────────────────────────────────────────────────────────────┤                                      │
│                                                                 │                                      │
│  Scrollable sermon notes                                        │          live display preview        │
│  Bible / Message / slide / image / video items                   │                                      │
│                                                                 │                                      │
│                                                                 │                            fullscreen│
│  contextual video controls, only while video is active          │                                      │
└─────────────────────────────────────────────────────────────────┴──────────────────────────────────────┘
```

### Tablet top toolbar

- The toolbar belongs to the notes pane only. It must not extend across or tint the preview.
- Target height: 48-52 px.
- Recommended left-to-right order:
  1. Back action;
  2. current sermon title and date, ellipsized when necessary;
  3. notes font decrease;
  4. notes font increase;
  5. existing sermon selector;
  6. compact overflow action only if an existing action cannot fit directly.
- The title/date area is flexible. All actions remain fixed-size and must not wrap to a second row.
- The sermon selector uses the existing `selectedSermonId` and `loadSermon()` flow.
- Font actions use the existing `changeNotesFontSize(-1/+1)` flow and retain the current limits and immediate persistence.
- Do not replace font controls with named presets.

### Tablet notes pane

- The notes body begins immediately below the toolbar and receives the remaining height.
- Only the notes body scrolls during ordinary reading; the toolbar remains fixed.
- Use comfortable horizontal padding of approximately 20-28 px depending on viewport width.
- Preserve the authored document hierarchy, inline formatting, Bible citations, Message citations, sermon slides, images, PowerPoint slides, and video chips.
- Keep current semantic accents:
  - Bible: blue;
  - Message: purple;
  - slide: orange.
- Active content must remain clearly identifiable by border/rail and tint without changing the stored sermon HTML.
- When the active item changes through keyboard, swipe, or tap, preserve the existing smooth scroll into view.

### Tablet preview pane

- Use pure black as the default preview background.
- Render the existing text, title, image, slide, video, empty state, and zoom badge through the current elements and precedence rules.
- Do not place a permanent header over the preview.
- Keep the existing browser-fullscreen action in the lower-right corner of the preview as a compact overlay.
- The fullscreen action must remain reachable with a 44 px minimum touch target but visually quiet when inactive.
- The zoom-reset badge remains visible only while the current slide/image is zoomed.

### Contextual video controls

- Show the existing video controls only while video is active.
- Keep them attached to the bottom of the notes pane, not across the whole viewport.
- Preserve play/pause, stop, seek, current time, YouTube readiness, and display synchronization behavior.
- The controls may compress labels on smaller tablets but must not hide Stop or make the seek target unusable.

## Phone layout: approved image 4 with corrected fullscreen placement

### Proportions

- Notes pane: approximately 62% of viewport width.
- Central control dock: 48-52 px, fixed width.
- Display preview: all remaining width.
- The dock is a real layout column. It must not overlay or reduce the readable content through absolute positioning.

```text
┌────────────────── notes ≈62% ───────────────────┬─ 48-52 px ─┬──────── remaining preview ────────┐
│ sermon title/date                               │ Back       │                                    │
├─────────────────────────────────────────────────┤ Sermons    │                                    │
│                                                 │ A−         │                                    │
│ scrollable sermon notes                         │ A+         │        live display preview        │
│                                                 │ Clear      │                                    │
│                                                 │            │                                    │
│ compact video controls when required            ├────────────┤                                    │
│                                                 │ Fullscreen │                                    │
└─────────────────────────────────────────────────┴────────────┴────────────────────────────────────┘
```

### Phone notes pane

- Do not use a full-width top toolbar; it consumes too much height in landscape.
- Keep a compact, non-interactive title/date strip at the top of the notes pane, approximately 32-36 px high.
- The remaining notes area scrolls independently.
- Use approximately 12-16 px horizontal padding and preserve current document formatting.
- Do not reduce notes text below a readable starting size to fit more content; use the existing persisted notes scale.
- Video controls, when active, use a compact bottom row inside the notes pane and must not cover the selected item.

### Central control dock

- Dock width: 48-52 px.
- Every control occupies a minimum 44 x 44 px touch target.
- Controls use icons in the narrow dock; accessible names and tooltips come from all four UI dictionaries.
- Recommended top-to-bottom order:
  1. Back;
  2. open the existing sermon selector/menu;
  3. decrease notes font size;
  4. increase notes font size;
  5. clear the active display content using the existing clear path.
- Keep enough separation between font controls and Clear to reduce accidental activation.
- The dock stays fixed while the notes pane scrolls.

### Fullscreen action invariant

The fullscreen action must not be grouped visually with the other phone controls.

- Pin it to the bottom of the central dock.
- Separate it from the upper control group with flexible empty space and a visible horizontal divider.
- Preserve the same 44 x 44 px minimum target.
- Invoke the existing `toggleFullscreen()` behavior; do not create a second fullscreen state.
- Entering or leaving browser fullscreen must not change panel proportions or reset active content.

### Phone preview pane

- The preview is a clean black surface with no permanent title or toolbar.
- Preserve the same content precedence and rendering behavior as the tablet preview.
- Keep pinch-zoom/pan available for active slides and images.
- Preserve single-finger vertical swipe navigation while unzoomed and prevent it from triggering after a multi-touch gesture.
- The zoom badge remains contextual and must not collide with the dock.

## Existing behaviors that must remain unchanged

### Sermon and content selection

- Load the sermon list and current sermon through the existing controller state.
- Preserve title/date display and the existing empty state when no sermon is selected.
- Tapping the active content item again retains the current clear/toggle behavior.
- Preserve activation and display behavior for:
  - Bible citation;
  - Message citation;
  - image;
  - PowerPoint slide;
  - sermon slide;
  - local or YouTube video.
- Preserve active classes and current scroll-to-active behavior.

### Navigation

- Keep Up/Down keyboard navigation when focus is not in an input, select, or textarea.
- Keep vertical swipe navigation on the preview while unzoomed.
- A gesture that ever contains two fingers must never be interpreted as a content-navigation swipe.
- A one-finger drag while display zoom is greater than 1 belongs to panning, not navigation.

### Notes scaling

- Keep the current notes font-size persistence and limits.
- Keep two-finger pinch scaling on the notes pane.
- The visible A− and A+ actions and pinch gesture operate on the same underlying value.
- Scaling notes must not scale the preview or alter authored HTML.

### Display zoom and pan

- Preserve touch zoom and pan for active slides and images, including local echo and synchronization with the main display.
- Preserve the current maximum zoom and server clamps.
- Preserve reset on content change and on external display clear.
- Do not enable zoom for video or ordinary text unless separately approved.
- Do not add desktop mouse-wheel zoom or mouse-drag pan.
- The redesign must not regress the protections that prevent a completed pinch from changing content.

### Fullscreen

- Preserve the current browser Fullscreen API behavior.
- The page itself must already fill `100vw` by `100dvh` before browser fullscreen is entered.
- Provide a `100vh` fallback where needed.
- Account for landscape safe-area insets on phones with a notch or rounded screen corners.
- Do not automatically call `requestFullscreen()` without a user gesture.

### Display target and synchronization

- Preserve `channel: 'sermon'` on display commands.
- Preserve the current technician-controlled sermon display target, including `null`/muted behavior.
- Preserve `current` table behavior, display transform persistence, and `sermon_display_cleared` handling.
- Do not introduce new display targets, WebSocket message types, or cross-page state.

## Clear display action

The approved phone dock contains a compact Clear action. If the current template does not expose a dedicated control, implementation may add only a thin UI wrapper around the existing display-clear behavior.

- It must use the same local clearing and server command path already used when active sermon content is toggled off.
- It must clear the same active classes and local preview state as the current behavior.
- It must preserve display-target resolution and muted-channel behavior.
- It must stop active video through the existing stop/clear flow.
- Do not create a new AJAX command or a different definition of “clear screen.”
- The tablet layout does not require a persistent Clear button if the approved top toolbar has no room; the existing toggle behavior remains available.

## Responsive implementation guidance

- Prefer CSS grid for the three-column phone layout and two-column grid/flex for tablets.
- Use CSS custom properties for panel proportions so the 58/42, 55/45, and 62%/dock/rest layouts are explicit and testable.
- Avoid device-model detection and user-agent sniffing.
- Use landscape aspect ratio and viewport fit to select layouts.
- The notes pane, preview, and phone dock must never wrap or stack in landscape.
- Menus must open inward and remain within the viewport.
- The sermon selector overlay on phone may open over the notes pane but must not cover the entire preview or persist after selection.
- Sticky/fixed controls must not cover the selected note item, video seek bar, zoom badge, or browser safe areas.
- Long Russian, German, English, and Lithuanian sermon titles must ellipsize without displacing controls.

## Accessibility and interaction states

- Every control must be reachable by keyboard on devices that provide one.
- Focus styling must be visible against the dark surface.
- Icon-only actions require translated `aria-label` or equivalent accessible text.
- Active citations/slides/images must remain distinguishable without relying only on color.
- Preserve existing loading and empty states.
- Respect `prefers-reduced-motion`; smooth scrolling or transitions may be reduced without changing behavior.
- Maintain sufficient text and control contrast on the dark surfaces.
- Do not make hover the only indication or activation path.

## Implementation boundaries

Expected primary files:

- `templates/sermon_layout.html`;
- `public/js/sermon.js` only where compact control placement needs a wrapper around existing behavior;
- all four dictionaries under `public/js/i18n/` for any new or changed user-facing labels, accessible names, or tooltips.

Possible shared files only if required by existing project structure:

- `templates/layout.html` or an existing shared stylesheet for common compact tokens;
- existing main-display templates only if a regression in established zoom/fullscreen synchronization must be corrected during implementation.

Do not change:

- sermon content storage or authored HTML;
- database schema;
- AJAX command names or payload semantics;
- WebSocket message types;
- display-target resolution;
- the `current`, `current_notes`, or `current_observer` responsibilities;
- main-display or streaming-display rendering behavior;
- sermon preparation layout as part of this task.

Prefer markup and CSS reflow. Preserve existing IDs and selectors used by `sermon.js`. If an ID must change, update every corresponding selector and test the full interaction matrix.

If `public/js/sermon.js` changes:

1. edit the source file only;
2. regenerate `public/js/sermon.min.js` with Terser `--compress` and without `--mangle`;
3. bump the `?v=N` query string in every template that references it;
4. run `npm run min:check`.

## Acceptance checklist

### Layout

- Page fills the complete viewport in landscape with no document-level scrollbars.
- Medium tablet uses 58/42 notes/preview proportions.
- Large tablet uses 55/45 notes/preview proportions.
- Phone uses approximately 62% notes, a 48-52 px central dock, and the remaining width for preview.
- Tablet controls remain in the compact top toolbar of the notes pane.
- Phone fullscreen is at the bottom of the dock, separated from all other controls by space and a divider.
- No control overlays sermon notes or permanent preview content.

### Functional regression

- Sermon selection and empty state still work.
- Bible citations, Message citations, slides, images, PowerPoint slides, and videos activate and clear correctly.
- Active styling and automatic scrolling remain correct.
- A−, A+, and notes pinch scaling share the current persisted setting.
- Up/Down keyboard navigation and unzoomed vertical swipe navigation still work.
- Slide/image pinch zoom and pan still synchronize with the main display.
- A pinch never triggers next/previous navigation.
- Video play/pause, stop, seek, time display, YouTube readiness, and synchronization still work.
- Fullscreen entry/exit does not reset selected sermon, active content, media playback, or zoom.
- Technician-triggered `sermon_display_cleared` still clears local state.
- Muted and cross-group display targets retain current behavior.

### Device verification

- Phone landscape: 844 x 390 and 915 x 412.
- Medium tablet landscape: 1024 x 768 and 1280 x 800.
- Large tablet landscape: 1366 x 768, 1600 x 900, and 1920 x 1200 where available.
- Android Chrome and iPad Safari touch behavior.
- Browser fullscreen entered and exited by user action.
- Safe-area handling on a notched phone.
- Long UI labels in all four supported UI languages.

### Quality gate

- No horizontal or vertical document-level overflow at target sizes.
- Notes remain readable at the current default scale.
- All touch targets are at least 44 x 44 px.
- Keyboard focus order follows the visual control order.
- Run `npm run min:check` after implementation.
- If shared display mechanisms are touched, consult `docs/deploy-checklist.md` and run the relevant smoke protocol.
