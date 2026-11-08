# Phase 1 Groups C and D — Canvas interaction and JSON persistence — Results

## Executive Summary
Implemented all Phase 1 Group C (R01 minimap, R02 current-canvas function list, R12 fit all, R05 group selection/movement, R06 orphan-aware recursive close, R08 per-node comments) and Group D (R09 explicit JSON save/load) requirements from `specs/roadmap.md:86–125`. Python docstrings hide with comments; every Load opens a separate tab; Visualize This explicitly chooses a New canvas or any live existing canvas (`New-x` or imported).

## Changes Implemented

### 1. Canvas Graph Ownership (`src/web_visualizer/src/vp/canvas_graph.js`)
- Created `CanvasGraph` class owning `nodes: Map<string, {window, independentRoot}>`, `edges: Map<string, {connection, sourceId, targetId}>`, and `selection: Set<string>`.
- Monotonic `n1...` / `e1...` IDs with support for explicit restored IDs.
- Integrated into `VpwWorld` (`world.vp_graph`), `VgfWindowTitled` (`frame.vp_canvasNodeId`), and `Controller`.
- Ticket cancellation on node removal prevents late-arriving definition replies from recreating closed branches.

### 2. Orphan-Aware Recursive Close — R06
- Implemented `CanvasGraph.closeSet(k)`:
  - `C` = forward-reachable nodes from `k` via docked edges.
  - `seeds` = remaining independent roots in `C \ {k}` + nodes in `C \ {k}` with incoming edges from outside `C`.
  - `protected` = forward traversal from `seeds` within `C`, excluding `k` and its edges.
  - `deleteSet` = `{k}` ∪ (`C \ protected`).
- Deletion is batch-executed and idempotent, without recursive `vp_requestClose` loops.

### 3. Canvas Selection and Group Movement — R05 (`src/web_visualizer/src/vp/canvas_selection.js`, `.css`)
- Marquee drag on empty canvas selects wholly enclosed frames (with 3-screen-pixel threshold).
- Double-clicking header chrome selects the undirected connected component.
- Dragging header of selected frame moves all selected nodes together by `startPos + screenDelta / scale`.
- Space+primary drag or middle-click drag pans the canvas.
- Marquee overlay styled with `.VgfSelectionMarquee` and frame selection outline `.VpwNode_selected`.
- Replaced old unconditional empty-canvas left-drag handler in `vgf_navigationarea.js`.

### 4. Camera Geometry, Controls Toolbar, Minimap, Function List, Fit All — R01/R02/R12
- `src/web_visualizer/src/vp/canvas_camera.js`: owns world/screen geometry translation, `getState`, `setState`, `viewportBounds`, `frameBounds`, and `fitAll`.
- `src/web_visualizer/src/vp/canvas_controls.js`, `.css`:
  - Top-left toolbar with Fit all, Functions (N), Save canvas, Load canvas, and non-modal status region.
  - Functions dropdown lists top-level callables sorted by label, URI, position, ID; activating reveals the window without refitting or clearing selection.
  - Bottom-right passive SVG minimap (180×120px) showing node rects and viewport rect with input shield preventing accidental interaction.
  - Fit all centers union of outer frames in available viewport respecting toolbar/minimap padding and safe scale bounds [0.2, 3].

### 5. Comment and Docstring Hiding — R08
- `src/vscodeextension/src/outlineproviderAPI/SymbolDefinition.ts`: added `CommentRange` (`range`, `kind: 'comment' | 'docstring'`), `commentRanges` and `commentHidingError` on `OutlineRange`.
- `src/vscodeextension/src/outlineproviders/lspextenderpython.ts`: AST-based docstring extraction (Script, FunctionDefinition, ClassDefinition first pure-string statements including parenthesized/raw/concatenated, excluding byte/f-strings/assignments, handling statement groups with semicolons).
- `src/vscodeextension/src/outlineproviders/lspextendertypescript.ts`: extracts token spans and scans trivia gaps with `ts.createScanner` for SingleLineCommentTrivia/MultiLineCommentTrivia, excluding strings, regexes, and template literals.
- `src/web_visualizer/src/utils/misc_utils.js`: updated `SyntaxHighlighter.run` to return `{ html, exactLanguage }`.
- `src/web_visualizer/src/vpw/vpw_code_editor.js`, `.css`:
  - Renders line numbers via `data-vp-line-number` attribute in `content: attr(data-vp-line-number)`, leaving gaps when rows are hidden.
  - `vp_setCommentsVisible(visible)` toggles comment-only rows (`display: none`), comment spans, and `contentEditable`.
  - Refuses stale classifications with `Source mapping unavailable` if body was edited.
- `src/web_visualizer/src/vpw/vpw_outline_window.js`: added Comments titlebar button with `aria-pressed`, default `true` for File, `false` for Symbol.

### 6. Source References & Declaration Restoration
- `src/vscodeextension/src/outlineproviderAPI/source_reference.ts`: shared `SourceReference` type with SHA-256 document hashing.
- `src/vscodeextension/src/visualprogramming/outline_entities.ts`: extracted `translateOutlineRanges`.
- `src/vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts`: populates `sourceReference` on `Symbol` and `File`; implemented `provideSavedOutline` without calling definition provider.
- `src/vscodeextension/src/outlineproviderAPI/extensionactivator.ts`: registered `vp.executeSavedOutlineProvider`.

### 7. JSON Format & Frame State Contracts — R09
- `src/vscodeextension/src/visualprogramming/canvas_format.ts`: `CanvasFileV1` format and `parseCanvasFile` strict allowlist validation.
- `src/web_visualizer/src/vgf/vgf_window_tiled.js`: `vp_getFrameState()` and `vp_restoreFrameState()`.
- `src/web_visualizer/src/vpw/vpw_message_window.js`: uses `textContent` and `pre-wrap` for plain diagnostic text.

### 8. Multi-Tab Manager, Destination Picker, and Save/Load
- `src/vscodeextension/src/visualprogramming/extensionactivator.ts`: `VpTabManager` with `LiveTabRecord` tracking, most-recently-active order, session-scoped `New-x` counter.
- `chooseCanvasForVisualization()`: QuickPick offers `New canvas` as first item, followed by live canvases (`New-x` and imported).
- `visualizeSelections()` replaces single-tab cursor dispatcher.
- Save/Load commands and webview-host message handshake (`canvas_ready`, `canvas_save`, `canvas_load`, `canvas_export_request`, `canvas_export_response`, `canvas_restore`, `canvas_restore_result`, `canvas_operation_result`).

### 9. Graph Reconstruction & Anchors
- `src/web_visualizer/src/vp/canvas_persistence.js`: serialize and restore registry with honest anchors (`SourceNavigation.describe` and `SourceNavigation.restore`).
- `src/web_visualizer/src/vpw/vpw_unavailable_window.js`: explicit source card for unresolvable source references.
- Instant connector docking (`{ animate: false }`).

## Validation Outcomes

### 1. Compiled Extension Tests
Executed:
```sh
RUN_DIR=$(mktemp -d /tmp/scv-groups-c-d.XXXXXX)
SCV_ROOT="$PWD" VSCODE_CLI=1 \
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir="$RUN_DIR/test-profile" \
  --extensions-dir="$HOME/.vscode/extensions" \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index" \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/vscodeextension/src/test/testfiles"
```
**Outcome: 189 passing (2s), 0 failing.**
- `Canvas Format Validation`: 12 tests passed.
- `Canvas Restore Validation`: 7 tests passed.
- `Comment & Docstring Visibility Extraction`: 7 tests passed.
- All 163 existing regression tests passed.

### 2. Standalone Browser Interaction Suite
Executed via Chromium Puppeteer in `src/web_visualizer/tests/canvas_graph_interaction.html`:
**Outcome: 13 passed, 0 failed.**
- CloseSet Case 1 (A -> B -> C, close B): `{B, C}` deleted, `A` survives.
- CloseSet Case 2 (A -> B -> C; X -> C -> D, close B): only `{B}` deleted.
- CloseSet Case 3 (A -> B -> C -> A, close B): `{B, C}` deleted, `A` survives.
- CloseSet Case 4 (A -> B; B <-> C, close A): all deleted.
- CloseSet Case 5 (A -> B; B <-> C; X -> C, close A): only `{A}` deleted.
- CloseSet Case 6 (A -> B; B reopened as root, close A): only `{A}` deleted.
- CloseSet Case 7 (K -> K self-loop, close K): `{K}` deleted.
- Connected component undirected traversal.
- Selection marquee whole enclosure requirement.
- Group movement with scale factor.
- Edge target updates on dock, undock, delete.
- Code editor comment hiding preserving line number gaps.
- CanvasPersistence serialization and restore round-trip.

### 3. Real Airflow Diagram End-to-End Verification
Executed in live VS Code development host against `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py`:
- Opened 2 levels deep: file `trino_ingestion_dag_factory.py` → `_build_dag` → nested `ingestion_dag`.
- Rendered headings verified:
  - `trino_ingestion_dag_factory.py`
  - `function _build_dag(config_path: Path) -> DAG`
  - `@dag(… ingestion_dag() -> None`
- Decorator metadata verified: `@dag(…` rendered with compact ellipsis and navigable properties.
- Body text verified at all 3 levels.
- Variables verified: `CONFIG_DIR = Path(...)` and `SQL_TASK_TIMEOUT = timedelta(...)` rendered in full, verified not mistaken for comments/docstrings.
- Comments toggle tested on `_build_dag`:
  - `aria-pressed="false"`, docstring `"""Build one DAG:..."""` row hidden (`display: none`).
  - Clicked Comments button: `aria-pressed="true"`, docstring row restored (`display: ""`).
- Functions list dropdown: opened and verified showing `Functions (2)`: `ingestion_dag` (line 196) and `_build_dag` (line 96); activating closed dropdown and focused/revealed window.
- Minimap: verified SVG rendering 3 node rectangles and viewport tracking rectangle with passive input shield.
- Fit all: verified centering all 3 nodes horizontally and vertically within available viewport (`inViewportHoriz: true`).
- Destination picker: verified opening with `New canvas`, creating `New-1`, then `New-2`, and offering live canvases for selection.
