# Canvas Interaction Follow-up — Completed Results

## User requests

1. Restore smooth click/new-box motion while retaining the new sizing, resizing, and placement features.
2. Stop connection edges escaping above the source window when its connected rows scroll out of view.
3. Fix two-finger touchpad panning freezing in the middle of a gesture.

All three fixes are implemented, exercised in both browser themes and the actual VS Code development host, rebuilt, packaged, and installed into regular VS Code. This record was written after validation and cleanup. No extraction logic or protected `specs/` files changed.

## Causes and changes

### 1. Smooth opening and camera movement

The previous cutover removed the original entrance transform to protect measured placement, but left viewport reveal as an immediate camera jump.

- `vpw/vpw_view_entity_window.js` and `.css`: restore a 300ms fade and 20px inner-content translation. The outer measured frame stays at its final position/size. Source connections receive per-frame movement notifications. Interaction finishes the entrance immediately; a reused window does not reanimate.
- `vp/controller.js`: begin entrance after attachment, fitting, final placement, and connection creation.
- `vp/window_positioner.js`: ease the minimal reveal translation with `requestAnimationFrame` over 300ms. A newer response supersedes the previous reveal. Native input cancels reveal before the same event pans/zooms/drags; cancellation does not swallow the event, restore an old position, or snap later. Active wheel gestures and drag take priority over new auto-reveal. Reduced-motion preferences disable entrance/reveal animation.

All paths remain under `src/web_visualizer/src/`. Intrinsic width, initial body-height policy, manual sizes, collision clearance, LEFT placement, and foreground ordering remain intact.

### 2. Scrolled connection origins

The old origin used the offscreen row's DOM rect. Display visibility does not detect scroll clipping. Its clamp covered only the frame's right/bottom edges, not the top/left or the actual body viewport.

`vpw/vpw_entity_connection.js` now:

1. Computes the existing source anchor in screen coordinates.
2. Intersects the frame with nested clipping ancestors' client viewports, excluding scrollbar gutters.
3. Clamps the source anchor on all four sides; fully clipped rows pin to the nearest visible boundary.
4. Converts back to the existing docking-button-local coordinate convention using the actual world scale.

Display-hidden/collapsed sources still fall back to a visible ancestor. Existing scroll, resize, and move events supply updates. No source text, navigation offsets, edge-routing system, or token-end anchor redesign was added.

The earlier Group A checks covered visible connected sources and missed rows fully clipped above the viewport. This follow-up explicitly covers both fully clipped directions, horizontal clipping, and nested scrollports.

### 3. Continuous touchpad panning

Two causes were present:

- The body/title wheel handler stopped propagation even if that surface could not scroll in the requested direction.
- Canvas panning added each wheel delta to integer `offsetTop`/`offsetLeft`, discarding subpixel movement between events.

Changes:

- `vgf/vgf_window_tiled.js`: consume ordinary/Shift-wheel only if the dominant axis can scroll farther. Unscrollable title directions and exhausted surfaces bubble to canvas navigation. Ctrl/Alt zoom continues to bubble.
- `vgf/vgf_navigationarea.js`: accumulate floating-point CSS positions; Shift-wheel accepts horizontal `deltaX` as well as the conventional `deltaY` mapping. A canvas-started gesture stays on the canvas when it crosses a box. After 180ms idle, the next gesture can start as local content scrolling. A body-started gesture scrolls content, then continues panning at its limit.

## Verification

### Build and installation

Commands observed passing:

```sh
npm run build:ext
npm --prefix src/vscodeextension run publish
'/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' \
  --install-extension "$PWD/src/vscodeextension/release/code-visualizer-local.vsix" --force
```

Inspected the actual JS stitcher, CSS, media-copy, TypeScript, and VSIX stages rather than relying only on the combined exit status. Final package: `src/vscodeextension/release/code-visualizer-local.vsix`, 234 files, 9.4MB. CLI reported successful installation.

`cmp` confirmed that installed JS/CSS media and changelog match the final rebuilt package inputs. Final browser asset SHA-1 values:

| Asset | Hash |
|---|---|
| JS | `ea7e4b29e7a1b4b4585c44d469269e8b4b7c0611` |
| CSS | `481fb0d712da3e84b4cbeb8c8a6ae81799551475` |

The extension remains `visualprogrammingx.sourcecodevisualizer-local@0.1.9`. Existing regular VS Code windows were not forcibly reloaded; use **Developer: Reload Window**, close old diagrams, then visualize again to replace already-loaded webview code.

### Native Chromium — light and dark

Served existing fixture pages with `npm run serve:web` on 8080. Used headed Chromium on 9222 and native CDP mouse, wheel, and keyboard input. Throwaway runtime helpers created source-backed fixtures, instrumented geometry, and were removed after verification; no permanent DOM-wiring tests were added.

Final smoke outputs:

```text
NATIVE_BROWSER_REGRESSIONS_PASSED light: origins bounded at .2/1/3, touchpad delta=6; dark: origins bounded at .2/1/3, touchpad delta=6
NATIVE_MOTION_REGRESSIONS_PASSED light/dark: multi-frame reveal, stable measured geometry, wheel interruption, rapid batches, reduced motion
NATIVE_HORIZONTAL_EDGE_REGRESSIONS_PASSED light/dark: left, right and nested clipping
```

| Scenario | Observation |
|---|---|
| Native declaration click opens a new box | Multiple camera interpolation frames; inner translation present; logical outer frame untransformed. Child world position and measured size remain constant throughout entrance. |
| Wheel during reveal | The same input pans by its exact delta. No later camera snap or continued reveal movement. |
| Rapid batches and oversized error | New responses supersede old reveal. Frames remain disjoint with collision clearance. Oversized last node begins at the 20px inset without shrinking. |
| Reduced motion | No entrance animations; immediate final placement/reveal. |
| Two connected rows in an 80-method class, scrolled fully above | Both origins pin to the visible body top instead of extending toward the hidden row positions. |
| Source row fully below, collapse/expand | Origins remain bounded; visible-parent fallback works on collapse. Repeated at scales 0.2, 1, 3. |
| Native horizontal code scrolling | Sources clipped on the left/right pin to the corresponding visible boundary. Nested scroll viewport further constrains origins. |
| Canvas-started gesture crosses content | Canvas keeps moving; content does not steal the ongoing gesture. |
| New gesture begins in scrollable body | Body scrolls natively without moving the world. On reaching the limit, further input pans the canvas. |
| Thirty native 0.2px wheel events | Exactly 6px canvas movement in each theme; no integer-position freeze. |

PNG/JSON runtime artifacts were removed at the user's request. The observed results remain documented here.

### Actual VS Code development host

Launched the installed VS Code executable with the local extension, a separate `/tmp/scv-canvas-followup-live` profile, and CDP port 9333. Used actual local visualization commands and declaration rows, not injected mock outlines.

Opened `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py` as source only. It was not executed, imported, saved, or modified.

- Opened file → `_build_dag` → nested `ingestion_dag`; inspected rendered headings, compact `@dag(…` metadata/full hover, and operator body. Also opened `_load_config` as another real connected source.
- Shortened the file window and scrolled connected declarations fully above/below its body viewport. Settled origins pinned at body Y=116 and Y=226 respectively, while raw row rects were outside those boundaries.
- Captured actual source-click entrance and 20 distinct camera positions, with untransformed outer frames.
- Sent thirty native 0.2px wheel events from confirmed canvas background, then a 12px event after crossing into the file body: world moved exactly 18px; body scrollTop stayed 0.
- **Show in code** on the nested DAG selected the actual declaration: status bar `Ln 196, Col 9`, zero-based `(195,8)`.


## Verification limits and harness corrections

- Native Chromium wheel streams exercise the touchpad input path, including fractional deltas and gesture continuity. This is not a claim of physically operating the user's touchpad hardware.
- A synthetic source-backed 80-method `Path(PurePath)` fixture exercises the screenshot's scrolling structure. An early attempt to visualize the available Python 3.9 standard-library `Path` produced no class outline in that host; live-provider clipping proof therefore used the actual Airflow hierarchy instead. No unrelated provider/extraction changes were made.
- Initial smoke attempts read geometry before nested scroll/docking/camera updates settled or clicked a collapse control after reveal moved it offscreen. Corrected the throwaway harness to wait for current endpoints and settled geometry and bring controls into view. Final scripts passed without manually forcing line updates.
- One live gesture probe initially pointed into another scrollable file window rather than canvas background. Confirmed `VgfInteractionArea` hit-testing and repeated the corrected scenario; the resulting 18px measurement is recorded.
- No extraction source changed, so the prior 140-test result was not presented as a newly run suite. This follow-up's proof is the actual interaction smoke, live-provider surface, and successful compilation/package/install.

Architecture documentation and extension changelog were updated. Owned smoke scripts were removed, browser smoke pages closed, and temporary web/Chromium/development-host services stopped. Existing user windows and source files were not forcibly reloaded or modified.

## Camera transition refinement

The user requested visible motion from the current view to a newly opened node rather than an instant camera jump. This refinement changes only camera timing/easing; it does not change source extraction, placement, zoom, or connection anchor semantics.

### Executed change

- Increased reveal duration from 300ms to 450ms.
- Replaced the fast-start cubic ease-out with smoothstep ease-in/out (`p * p * (3 - 2 * p)`).
- Start the clock inside the first animation callback, using its actual `performance.now()` execution time rather than request scheduling time or a potentially stale shared RAF timestamp. Time spent laying out the response before that callback cannot consume the visible transition.
- Retained immediate native-input cancellation and the accessibility reduced-motion branch.
- Updated architecture documentation, extension changelog, and the requested [full roadmap checklist](../../docs/roadmap-status.md). The approved `specs/roadmap.md` was not changed.

### Runtime verification

Native Chromium, 1542×1182, actual declaration-row clicks in the existing light/dark fixture pages:

| Scenario | Observed moving duration | Distinct camera positions |
| --- | ---: | ---: |
| Light, normal response | 450ms | 56 |
| Light, response blocked for 550ms before first callback | 456ms | 57 |
| Dark, normal response | 450ms | 56 |
| Dark, response blocked for 550ms before first callback | 450ms | 57 |

Each scenario started at the old camera, passed through intermediate positions, kept the new node's world geometry fixed, and finished with the target inside the viewport inset. A subsequent native wheel event moved the camera immediately and canceled reveal, with no later snap during a 600ms observation. Emulated reduced motion produced immediate reveal and no running entrance/camera animations.

Actual regular VS Code, using the installed extension rather than an extension-development path:

- Reloaded only the isolated `/tmp/scv-camera-installed-live` host.
- Opened the TypeScript declaration fixture as source, then used actual commands/rows: file → `Worker implements Reader` → `read(): void`.
- Observed **441ms of visible movement across 56 camera positions**, unchanged world placement, the real `console.log(\"implemented\")` body, and the complete target inside the viewport.
- The actual webview reported reduced motion **false**. The separate accessibility check deliberately enabled it.


The throwaway harness was corrected to measure callback execution time instead of a potentially stale RAF timestamp, wait by elapsed time rather than an assumed frame rate, and use the delivered native wheel delta rather than assuming the CDP input value survives device scaling unchanged.

### Build and installation

- `npm run build:ext`: passed.
- `npm --prefix src/vscodeextension run publish`: passed; produced `release/code-visualizer-local.vsix`.
- `code --install-extension ./src/vscodeextension/release/code-visualizer-local.vsix --force`: successfully installed into regular VS Code.
- Installed JavaScript and CSS matched the generated extension payload byte-for-byte (`cmp`).
- Roadmap documentation check: all R01–R19 appear exactly once, seven numbered requests checked, and all evidence links resolve.

No extraction change or new permanent test was needed for this timing-only refinement. The previous 140-test suite result remains historical; it was not rerun or presented as fresh evidence here. Native wheel automation does not claim physical operation of the user's touchpad. Existing user windows still need a reload/reopened diagram to load the new webview bundle.

## Responsive headings; source-formatted bodies

### Request and executed change

Only headings should reflow when a node changes width. Code bodies must keep the real source's line breaks and indentation, with scrolling when necessary.

- `vgf_window_tiled.css`: titles use normal whitespace and can wrap long tokens. The client container follows the node width so declaration rows can wrap independently of intrinsic-width code editors.
- `vgf_window_tiled.js`: removed the obsolete title scroll-surface class/listener and title-only wheel branch. Body scrolling and canvas gesture handling remain.
- `vpw_outline_window.js` / `.css`: declaration rows use normal wrapping and `textContent`, avoiding the forced `<br>` elements produced by assigning multiline text through `innerText`. Highlighted window headings keep their original text/model; only presentation changes.
- Code-editor `white-space: pre`, intrinsic width, source ranges, and extraction logic were not changed.
- Removed all PNG and JSON files under `features/`, as requested, and removed their Markdown links. Historical observations, the suite log, and other existing formats remain. New visual captures were temporary, not feature artifacts.
- Updated architecture documentation, changelog, and roadmap status.

### Observed verification

- Both browser themes, native grip drags: a source-backed multiline constructor rendered **1 → 3 → 1 lines** at **1100 → 320 → 1100px**. Declaration rows also changed from one to three lines. Neither narrowed heading nor row needed horizontal scrolling. Original heading text, metadata, and body text stayed unchanged.
- Both themes, a 67-line body with a long source line: initial widths **1260px light / 1262px dark**, initial body height **400px**. After native narrowing to 320px, code remained unwrapped; native two-axis scrolling worked, the final sentinel was reachable, and every source line matched.
- Actual installed extension: opened `webviewcreator.ts` → `WebviewCreator` → the pictured constructor. Native resizing **1050 → 320 → 1050px** produced **1 → 3 → 1 heading lines**. Original multiline model text and range `(9,10) → (10,58)` remained unchanged. **Show in code** selected **Ln 10, Col 11**.
- Actual installed extension in the Airflow DAG workspace: opened the required external file → `_build_dag` → `ingestion_dag`. Inspected rendered headings, compact `@dag(…` metadata/full hover, and the complete operator body through `execution_timeout=SQL_TASK_TIMEOUT`; body whitespace remained `pre`. **Show in code** selected **Ln 196, Col 9**.
- Opened `REQUIRED_KEYS` through the actual source editor. Its existing body retained the complete three-line `frozenset(...)` value. **Show in code** selected **Ln 28, Col 1**. The external Airflow file was not executed, imported, modified, or saved.
- `npm run build:ext`: passed. VSIX packaging and forced regular-VS-Code installation passed. Installed JS/CSS matched generated payloads byte-for-byte.
- Case-insensitive artifact glob found no PNG/JSON files anywhere under `features/`. No Markdown links to those removed artifacts remained; retained feature/roadmap file links resolved.

Initial live probes stalled in command-picker/symbol lookup or assumed variables appeared as declaration rows. The final smoke used the actual source editor and DAG workspace, checked assignment values in their existing bodies, and passed. These harness corrections did not require production provider changes.

No new permanent test or full extension-suite rerun was added for this display-only change. Verification used actual browser resizing/scrolling and installed-extension source navigation. Existing user windows need a reload and reopened diagram to load the new bundle.

## Independent line-number gutter

### Request and implementation

Fix code shifting when line numbers gain a digit and unindented variable values touching their line number.

- `vpw_code_editor.js` reserves one shared gutter from the rendered row count, with a two-digit minimum.
- `vpw_code_editor.css` positions direct-row CSS counters outside code flow, right-aligned, with a 12px gap before source text. Numbers are non-selectable and ignore pointer events.
- Source text, indentation, line breaks, body scrolling, and source-coordinate mapping are unchanged. Architecture documentation and changelog describe the new gutter.

### Observed verification

- Native Chromium in both themes: a 1002-line fixture kept identical code starts across **9/10, 99/100, and 999/1000**. All 1002 source rows matched their input text. The unindented `OPERATIONS` tuple had a 12px number-to-code gap, within 0.001px browser rounding.
- Native double-clicks on rows **1, 99, and 999** emitted the expected source-selection start/end coordinates, including the first row's nonzero source-column origin.
- Actual installed VS Code: opened the required Airflow source file → `_build_dag` → nested `ingestion_dag`; inspected headings, compact decorator metadata/full hover, and original formatted operator body.
- Actual DAG rows 9 and 10 had the same first-code X coordinate: **1040.6484375px**. Body whitespace remained `pre`.
- Native double-click on `SQL_TASK_TIMEOUT` inside the DAG body opened its actual constant node. Its unindented `timedelta(minutes=18)` value had an exact **12px** gutter gap. **Show in code** selected **Ln 41, Col 1**.
- The external Airflow file was only inspected as source; it was not executed, imported, modified, or saved.
- VSIX packaging/compilation and forced installation into regular VS Code passed. Installed JS/CSS matched the generated payload byte-for-byte.

The first browser probe used exact equality for a fractional CSS coordinate; its 11.9995625px result required a subpixel tolerance, not a production change. Corrected smoke checks passed in both themes.

No new permanent test framework or full extension-suite rerun was added. Temporary scripts and visual captures were kept outside `features/`; no PNG/JSON artifacts were added there. Existing user windows need a reload and reopened diagram for the updated bundle.

## Bounded width for every newly created node

### Request and executed change

“Initial” means creation of any node, not only a constructor or `__init__`. The user requested a maximum initial width after long code lines and signatures produced excessively wide boxes. This supersedes the earlier uncapped-width policy; approved historical plans and protected `specs/` were not rewritten.

- Added a 1200-world-pixel maximum to shared `VgfWindowTitled.vp_fitToContent()`. All new outline/file/declaration/message nodes use this fit path.
- Apply the bounded width before measuring height so wrapped headings, including bodyless signatures, get enough vertical space.
- Smaller nodes remain content-sized. Code bodies preserve source text and scroll rather than wrap. The existing 400px fitted body-height policy remains.
- Explicit grip double-click uses the same bounded fit. Manual resizing can exceed 1200px, and reusing an existing node does not change its chosen size.
- Updated architecture, changelog, roadmap status, and the historical Group A sizing note.

### Observed verification

- Both browser themes: long-code functions, bodyless long signatures, classes with long declaration rows, and files initially measured **1200px** wide. New error windows also stayed within the cap. Short functions measured **108px light / 110px dark**.
- Wrapped bodyless heading height was **166px**, contained by its frame. Fitting and collapse → fit → expand preserved usable heading/body geometry and the fitted body-height bound.
- Native grip resize reached **1300px**; requesting the same node retained 1300px. Grip double-click returned it to 1200px.
- A 100-line body, including a 2000-character string, preserved every source row. Native horizontal scrolling worked; both horizontal/vertical ends were reachable. Native double-click on the right-end `markerAtEnd` emitted source coordinates **line 1, character 2028** with the correct end.
- Actual installed VS Code: opened the required Airflow source file → `_build_dag` → nested `ingestion_dag`, inspecting headings, compact decorator metadata/full hover, and the complete original operator body. New widths were **554 / 479 / 429px**, demonstrating that short nodes are not expanded to the cap.
- Native body lookup opened `SQL_TASK_TIMEOUT` as a **185px** constant node containing `timedelta(minutes=18)`. **Show in code** selected **Ln 41, Col 1**. The external file was not executed, imported, modified, or saved.
- Compilation/VSIX packaging and forced regular-VS-Code installation passed. Installed JS/CSS matched generated payloads byte-for-byte.

Initial smoke corrections: the error fixture needed the existing array-shaped response contract; an oversized native drag did not reach its requested 1450px, so the final manual-resize check used 1300px. No production change was made for those harness issues.

No new permanent test framework or full extension-suite rerun was added. Visual captures and throwaway scripts stayed outside `features/`. Existing user windows need a reload and reopened diagram for the new bundle.
