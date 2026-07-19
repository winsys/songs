# Plan: pinch-to-zoom / pan of the main display from the sermon page

Status: **researched, not implemented** (feasibility study 2026-07-19).
Owner: Pavel. Prepared as a Maestro-consumable plan document.

## 1. Goal

While a **slide** (`__slide__`) or an **image** (sermon/tech image) is active, the
preacher should be able to pinch-zoom and pan on the **right half of the sermon
presentation page** (`#display-panel` in `sermon_layout.html`), and the zoom/pan
must be mirrored on the **main display** (`text_layout.html`) in near-real-time.
Verdict: **feasible with existing architecture, no new dependencies.** The
recommended v1 transport is throttled AJAX + the existing group WebSocket
broadcast; an optional low-latency phase 2 upgrades the WS server to relay
client messages.

## 2. Current architecture (verified facts)

### Sermon page (right pane = gesture surface)
- `templates/sermon_layout.html` — `#display-panel` is the right 50% × 100vh,
  `position:relative; overflow:hidden` (line ~432). Overlays inside it:
  - `#display-image` — `<img>`, absolute, fills panel, `object-fit:contain` (~485);
  - `#display-slide-wrap` — absolute `inset:0`, padding `4% 5% 5%`, holds
    `#display-slide-content` (100%×100%, base font 32px) (~520);
  - video overlay (z 11) and text (`#display-text-wrap`) — **out of scope**.
- The pane has **no pointer handlers today** — gestures will not conflict.
- `public/js/sermon.js`: slide click → local preview + `set_slide` (channel
  `'sermon'`, line ~648); image chip → `showImage(path)` + `set_tech_image`
  (channel `'sermon'`, ~787). Local state: `displaySlideHtml`, `displayImageSrc`.

### Main display
- `templates/text_layout.html` (all logic inline in the template):
  - slide → `#slide-overlay` (fixed, inset 0, padding `4vh 6vw 5vh`) >
    `#slide-content`, font auto-fitted by `_fitSlideContent()` (max
    `slide_font_max_size`, default 52px);
  - image → `#overlay-image` (fixed 100vw×100vh `<img>`, `object-fit:contain`);
  - update path: WS `update_needed` → debounced `fetchText()` → AJAX
    `get_image` → full re-render. The WS callback receives **every** message
    type (`createAuthenticatedWebSocket` passes all data through), so adding a
    new type branch is trivial.
- `templates/text_layout_streaming.html` ignores `__slide__` entirely (line
  ~161) — streaming screen is **out of scope** for transforms.

### Transport & state
- PHP → WS: `Ajax_Sermon::broadcastToGroup($groupId, $msg)` → tcp 2346 →
  `websocket-server.php` routes by `msg['groupId']` to all connections of the
  group. **New message types need no WS server restart.**
- Browser → server today: **AJAX only**. `websocket-server.php` (123 lines)
  ignores authenticated client messages except `ping` (line 78–83). A
  client→WS relay is a code change + restart + security surface (see §5B).
- Display targeting: every sermon-page display command carries
  `channel:'sermon'`; `Ajax_Common::resolveDisplayTarget()` reads
  `user_settings.sermon_display_target` (NULL = "do not broadcast" → no-op).
  The transform command must go through the **same gate**.
- State storage: `current` table (utf8, one row per group):
  `groupId, image, text, song_name, chapter_indices, video_src, video_state`.
  `set_slide` / `set_tech_image` do DELETE+INSERT (`Ajax_Tech.php` ~753/~85) —
  so a new content push naturally resets any per-row extras.

## 3. Design

### 3.1 Transform model
State = `{s, x, y}`:
- `s` — scale, clamp `[1, 6]` (server hard-clamps to `[1, 10]`);
- `x, y` — translation of the content element as a **fraction of its own box**
  (CSS `transform: translate(x*100%, y*100%) scale(s)`, `transform-origin:
  50% 50%`), clamped so content never fully leaves the viewport; at `s == 1`
  force `x = y = 0`.

Fractions transfer across different surface sizes. Known approximation: pane
and hall screen have different aspect ratios and (for HTML slides) different
auto-fitted font/reflow, so the focal point maps approximately, not
pixel-perfect. For images and draw.io SVG slides the divergence is small; for
reflowed text slides it is acceptable (the preacher zooms "into an area", not
into a pixel). A phase-2 refinement for images can normalize to the drawn
content rect (computed from `naturalWidth/Height` vs element box on each side).

Transform applies to the **content element** (`#display-slide-content` /
`#overlay-image` on screen; `#display-slide-content` / `#display-image` on the
pane). Background color and padding stay static; wrappers already have
`overflow:hidden`. Add `will-change: transform` while a gesture is active.

### 3.2 Transport — v1 (recommended): throttled AJAX + existing broadcast
New AJAX command `set_display_transform` (Ajax_Tech):

```
args: { channel:'sermon', s, x, y, persist: 0|1 }
1. $target = resolveDisplayTarget($userId); if null → return ok (muted channel);
2. clamp s/x/y (floats; s∈[1,10], |x|,|y| ≤ 2);
3. broadcastToGroup($target, {type:'display_transform', data:{s,x,y}});
4. if persist: UPDATE current SET transform='<json or empty for identity>'
   WHERE groupId=$target;   // no updateSocket — the event IS the update
```

- During a gesture: sermon.js sends at a ~100 ms trailing throttle
  (persist:0). On gesture end (`pointerup`, all fingers lifted): one final
  send with `persist:1`.
- Screen applies incoming transforms with `transition: transform 120ms linear`
  — 10 Hz packets render as continuous motion.
- Latency: one HTTP POST + one WS push (~100–200 ms end-to-end over the
  production host). Fine for deliberate zoom/pan; not a laser-pointer.
- Reuses the entire existing auth/CSRF/target-resolution machinery; zero WS
  server changes; works after a plain `git pull`.

### 3.3 Transport — phase 2 (optional): client→WS relay
Only if v1 latency disappoints. `websocket-server.php` `onMessage` gains a
whitelist branch: authenticated connection sends
`{type:'display_transform', data:{...}}` → server resolves
`sermon_display_target` of the **sender's group** (mysqli query, cached in
memory; invalidate cache on `display_target_changed` passing through the
relay port) → rebroadcast to target group. Costs: WS server restart on
deploy, DB access from Workerman, and a new security surface (client-originated
broadcasts — must whitelist exactly one type and validate payload shape;
never relay arbitrary types, or any client could spoof `update_needed` etc.).
Persistence still goes through AJAX on gesture end.

### 3.4 Persistence & reset
- Migration `database/migrations/add_display_transform.sql`:
  `ALTER TABLE current ADD COLUMN transform VARCHAR(255) NOT NULL DEFAULT '';`
  (ASCII JSON like `{"s":2.1,"x":-0.32,"y":0.18}`; empty = identity). Update
  `database/database_full.sql` too.
- `get_image` (Ajax_Common ~355) selects explicit columns — add `transform`.
- `fetchText()` on the screen applies `row.transform` (or identity) on every
  slide/image render → late-joining screens, reloads and WS reconnects restore
  the zoom; and since `set_slide`/`set_tech_image` DELETE+INSERT the row, every
  content switch auto-resets to identity.
- **Screen-disable resets zoom** (decision): the tech page's "Отключить экран"
  (`disable_external_display`) deletes the `current` row, which kills the
  persisted transform; the screen must ALSO clear its cached local transform
  in the empty-response branch of `fetchText()` (and generally whenever the
  rendered content changes), so nothing zoomed survives a screen clear.
- `get_current_state` (tech page) untouched — tech UI ignores transforms.

### 3.5 Gesture engine (sermon.js, vanilla Pointer Events, ~150 lines)
- Active **only** while `displaySlideHtml || displayImageSrc` (per request:
  "при включенном слайде или изображении"); a CSS class on `#display-panel`
  toggles `touch-action: none` only in that state, so normal scrolling is
  unaffected otherwise.
- Two pointers = pinch: baseline (distance d0, midpoint m0, state0); on move
  `s = clamp(s0·d/d0)` and translate so the content point under m0 follows the
  midpoint (standard pinch math in element-fraction units). Two-finger drag
  pans via midpoint movement.
- One pointer = pan, **only when s > 1** (so taps/clicks keep working);
  `setPointerCapture` for reliability.
- Double-tap: toggle 1× ↔ 2.5× centered on the tap point. Small `⟲` reset
  button (and a `×N.N` zoom badge) shown while s > 1. All new user-facing
  strings (button tooltip, badge) go through the UI i18n dictionaries
  (ru/de/en/lt, `window.t()`) — no hardcoded text.
- Touch gestures only — no desktop mouse support (wheel/drag), per decision.
  Panning the zoomed content by gestures is REQUIRED behavior, not optional:
  one-finger pan when s > 1, two-finger pan always.
- Local echo: apply `style.transform` directly on the pane element per
  `pointermove` (no `$apply` per frame — zero digest cost).
- iOS Safari: `preventDefault()` on proprietary `gesturestart/gesturechange`
  events + `touch-action:none`; Pointer Events are fine on iOS 13+.
- Reset local transform to identity whenever the active slide/image changes
  (chip click handlers already funnel through `$timeout` blocks — hook there).

### 3.6 Screen-side handler (text_layout.html)
```js
if (data.type === 'display_transform') applyDisplayTransform(data.data);
```
`applyDisplayTransform` caches the last transform and sets `style.transform`
on whichever overlay is visible; `fetchText()` calls it with the persisted
value (or identity) after rendering slide/image. Transition 120 ms linear.

## 4. Implementation checklist (order)

1. DB: migration + `database_full.sql` + run ALTER on production DB.
2. PHP: `set_display_transform` in `Ajax_Tech.php`; add `transform` to
   `get_image` SELECT in `Ajax_Common.php`. (`php -l` with PHP 7.2.)
3. Screen: `text_layout.html` — WS type branch, `applyDisplayTransform`,
   apply-on-render in `fetchText`, CSS (`will-change`, transition).
4. Pane: `sermon.js` — gesture engine, echo, throttle sender, reset button +
   zoom badge; CSS in `sermon_layout.html`.
5. Build chores: `npx terser public/js/sermon.js -o public/js/sermon.min.js
   --compress` (no `--mangle`), bump `sermon.min.js?v=15` → `?v=16` in
   `sermon_layout.html`. `text_layout.html` JS is inline — no minify step.
6. Test matrix: Android Chrome + iPad Safari pinch + pan (no desktop-mouse
   support — out of scope by decision); slide vs image vs draw.io SVG slide;
   target = own group / other group / NULL (muted → pane zooms locally, screen
   silent — correct); screen reload mid-zoom (persistence); content switch
   (reset); tech "Отключить экран" (zoom must reset with the screen clear);
   video (gestures inactive); streaming screen unaffected.

## 5. Edge cases & risks

- **Muted channel (target NULL):** command no-ops server-side — pane still
  zooms locally. Intentional and consistent with all sermon commands.
- **HTML slide reflow divergence** pane↔screen: focal-point drift; accepted
  for v1 (documented above).
- **`update_needed` mid-gesture** (tech replaced content): screen re-renders
  with the new row's transform (identity); pane resets on its own next
  activation. No stuck states: UPDATE of a missing row matches 0 rows.
- **utf8 table:** transform JSON is ASCII — safe.
- **Security:** floats are clamped server-side; JSON is server-generated
  (no injection); command sits behind the same session+CSRF+channel gate as
  `set_slide`. Phase 2 relay is the only option with a real new surface.
- **Latency expectation management:** v1 is ~100–200 ms behind the finger.
  Smooth for framing a detail; do not sell it as a live pointer.

## 6. Effort estimate

| Step | Estimate |
|---|---|
| DB migration + PHP command + get_image | 1.5 h |
| Screen side (text_layout) | 1.5–2 h |
| Gesture engine + pane UI (sermon.js) | 4–6 h |
| Multi-device testing + fixes | 2–3 h |
| **Total v1** | **~9–12 h** |
| Phase 2 WS relay (only if needed) | +4–6 h |

## 7. Decisions (Pavel, 2026-07-19)

1. **Tech page:** no dedicated zoom UI there, but "Отключить экран"
   (`disable_external_display`) must reset the zoom together with clearing
   the screen (see §3.4 — row deletion + explicit cache clear on empty fetch).
2. **Desktop mouse (wheel/drag): not needed.** Touch gestures only. Panning
   the zoomed image by gestures is required v1 behavior.
3. **Max zoom 6× confirmed.**
4. **Video zoom: not needed** — stays out of scope.
5. Any new user-facing strings introduced by this feature go through the UI
   i18n dictionaries (ru/de/en/lt) — standing project rule.
