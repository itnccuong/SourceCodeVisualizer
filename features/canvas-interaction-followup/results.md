# Canvas Interaction Follow-up — Completed Results

## Delivered scope

Restore smooth node opening/reveal, bound scrolled connection origins, and keep fractional touchpad panning continuous. Subsequent user-requested refinements make headings responsive while preserving source-formatted bodies, separate the line-number gutter, and cap every new node's fitted width. No extraction logic changed.

Source paths below are relative to `src/web_visualizer/src/`.

## Current behavior and implementation

### Smooth opening and camera reveal

- `vpw/vpw_view_entity_window.{js,css}` gives new content a **300ms fade and 20px inner translation**. The outer measured frame stays at its final position/size, so collision placement and saved geometry remain reliable. Connections receive per-frame movement notifications. Interaction finishes entrance immediately; reused windows do not reanimate.
- `vp/controller.js` starts entrance only after attachment, fitting, final placement, and connection creation.
- `vp/window_positioner.js` eases minimal camera reveal over **450ms**, using smoothstep `p * p * (3 - 2 * p)`. The clock starts at actual execution of the first animation callback; response layout or delayed scheduling cannot consume the visible transition.
- A newer response supersedes an older reveal. Native input cancels reveal before that same event pans/zooms/drags, without swallowing input, restoring an old position, or snapping later. Active wheel gestures and drags take priority over new auto-reveal. Reduced motion makes entrance/reveal immediate.
- Intrinsic measurement, manual dimensions, collision clearance, LEFT placement, and normal foreground ordering remain intact. Reveal preserves zoom and shows the beginning of oversized nodes rather than shrinking them.

### Scrolled connection origins

`vpw/vpw_entity_connection.js` computes the source point in screen coordinates, intersects the frame with nested clipping ancestors' client viewports excluding scrollbar gutters, and clamps all four sides. Fully clipped rows pin to the nearest visible boundary. Conversion back to docking-button-local coordinates uses actual world scale.

Display-hidden/collapsed sources use a visible ancestor fallback. Existing scroll, resize, and move events update origins; no polling loop, source rewrite, or edge-routing redesign was introduced. This specifically covers fully clipped rows above/below the body, horizontal clipping, and nested scrollports rather than merely visible connected rows.

### Continuous wheel/touchpad gestures

- `vgf/vgf_navigationarea.js` accumulates floating-point CSS positions rather than integer `offsetTop`/`offsetLeft`, preserving subpixel deltas. Shift-wheel accepts horizontal `deltaX` and conventional `deltaY` mapping.
- A canvas-started gesture stays on the canvas when crossing content. After **180ms idle**, a new gesture may begin as local content scrolling.
- In the ordinary hover-scroll path, `vgf/vgf_window_tiled.js` consumes ordinary/Shift-wheel only when the dominant axis can scroll farther; unscrollable/exhausted surfaces bubble to canvas navigation. Ctrl/Alt zoom continues to bubble.
- The separately delivered clicked-body lock takes precedence: ordinary input stays in that body even at limits or outside its bounds until ownership is released. This distinguishes the current explicit lock from hover-only gesture handoff.

### Responsive headings; source-formatted bodies

- `vgf/vgf_window_tiled.css` lets titles and long tokens wrap and makes declaration-row width follow the node, independently of intrinsic-width code editors.
- `vgf/vgf_window_tiled.js` no longer owns the superseded title-only scroll listener/wheel branch.
- `vpw/vpw_outline_window.{js,css}` renders declaration rows with normal wrapping and `textContent`, avoiding synthetic `<br>` elements from multiline `innerText` assignment. Highlighted headings retain original model text/ranges; only presentation changes.
- Body `white-space:pre`, source indentation/line breaks, immutable ranges, and two-axis scrolling remain unchanged. Heading resize cannot reformat source bodies.

### Independent line-number gutter

`vpw/vpw_code_editor.js` reserves one shared gutter from the rendered row count with a two-digit minimum. Its CSS positions generated row numbers outside source flow, right-aligned with a **12px gap**, non-selectable and pointer-transparent. Code starts stay aligned across digit boundaries. Original line ordinals/source text, indentation, scrolling, and source-coordinate mapping remain intact; hidden rows do not renumber surviving source.

### Bounded creation/auto-fit width

- Shared `VgfWindowTitled.vp_fitToContent()` applies a **1200-world-pixel maximum** to every newly created outline, file, declaration, and message node, superseding the earlier uncapped-fit policy.
- Apply width before measuring height so wrapped headings, including bodyless signatures, receive enough vertical space. Smaller nodes remain content-sized; code scrolls instead of wrapping. Fitted body height remains at most **400px**.
- Grip double-click uses the same bounded fit. Manual resizing may exceed 1200px; reusing an existing node preserves the chosen size. Collapse → fit → expand preserves usable expanded geometry.

## Behavioral validation

### Native Chromium, dark and light themes

| Scenario | Observed result |
|---|---|
| Declaration-row opening and rapid batches | Camera passed through multiple positions; inner content translated while logical outer geometry stayed fixed. New responses superseded old reveal and collision clearance held. |
| Input during reveal | The same native wheel input immediately panned; no later camera snap or continued reveal. Reduced motion left no running entrance/reveal animation. |
| Reveal scheduling delay | Normal and deliberately blocked-before-first-callback responses showed approximately 450–456ms visible movement, with 56–57 distinct positions; layout delay did not consume motion. |
| Fully clipped connected rows and collapse | Origins stayed at body top/bottom boundaries and used visible-parent fallback on collapse at scales 0.2/1/3. |
| Horizontal/nested clipping | Origins pinned to the corresponding left/right or nested viewport boundary. |
| Canvas gesture crosses content | Canvas retained ownership; a new hover-body gesture scrolled content and handed off at its limit. |
| Thirty native 0.2px wheel events | Exactly 6px canvas movement in each theme, with no integer-position freeze. |
| Responsive multiline heading/declaration row | Native resize 1100 → 320 → 1100px produced 1 → 3 → 1 visual lines; original heading/model/metadata/body text stayed unchanged. |
| Long source after narrowing | Code remained unwrapped; both scroll axes reached the source ends and final sentinel; every source row matched input. |
| Gutter boundaries | A 1002-line fixture had identical code starts across 9/10, 99/100, and 999/1000; all rows matched source and unindented values retained the 12px gap within subpixel tolerance. |
| Gutter/source selection | Native double-clicks on rows 1/99/999 emitted exact original ranges, including a first row with nonzero source-column origin. |
| Bounded initial fit | Long functions, bodyless signatures, classes, files, and errors stayed within 1200px; short nodes remained content-sized. Wrapped bodyless headings fit their frame. |
| Manual size/reuse/fit | Native resize reached 1300px; reuse retained it; grip double-click returned to 1200px. |
| Right-end token after long-line scroll | All rows of a 100-line body with a 2000-character string remained intact; `markerAtEnd` emitted the correct original line 1, character 2028 range. |

### Actual VS Code webview/provider surface

- In the real Airflow source hierarchy, opened `trino_ingestion_dag_factory.py` → `_build_dag` → `ingestion_dag`, plus `_load_config`. Headings, compact/full decorator metadata, complete operator source, and **Show in code** remained correct. The external file was inspected only, not executed or modified.
- Shortened/scrolled connected file declarations above and below their viewport; actual origins pinned to visible boundaries. Source-click entrance yielded distinct camera positions with untransformed outer frames.
- A native fractional canvas gesture followed by crossing into the file body moved the world by the delivered total delta while body scroll stayed unchanged.
- An installed-extension TypeScript file → `Worker implements Reader` → `read(): void` path showed 441ms of visible motion across 56 positions, fixed world placement, the real implementation body, and a fully revealed target. Its ordinary reduced-motion preference was false; accessibility was tested separately by enabling it.
- Actual `webviewcreator.ts` → `WebviewCreator` constructor resized 1050 → 320 → 1050px with 1 → 3 → 1 heading lines. Original multiline range `(9,10) → (10,58)` stayed unchanged; **Show in code** selected the real declaration.
- Actual DAG rows 9/10 retained identical code starts. Body lookup opened `SQL_TASK_TIMEOUT` with its complete unindented `timedelta(minutes=18)` value, a 12px gutter gap, and correct editor navigation. `REQUIRED_KEYS` retained its complete three-line value.
- Under the width cap, the actual file/builder/nested-DAG nodes remained smaller than 1200px rather than expanding to the maximum. Source formatting and constant navigation stayed intact.

## Decisions and verification limits

- Native wheel automation exercises fractional input and gesture continuity; it does not claim physical operation of the user's touchpad.
- Standalone source-backed fixtures establish geometry; real provider/webview scenarios establish integration. An available standard-library `Path` did not provide a usable class outline in one host, so live clipping proof used the actual Airflow hierarchy rather than changing extraction.
- No full extension-suite rerun is claimed for these interaction/display-only refinements; prior suite counts remain historical. No permanent browser test framework was added.
- Timing checks use callback execution time, settled geometry, delivered native deltas, and subpixel tolerance. Harness assumptions were corrected without adding production provider retries or weakening source/geometry invariants.
