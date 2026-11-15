# Phase 1 Groups C and D — Canvas interaction and JSON persistence — Results

## Goal and delivered scope
Implemented Group C **R01** minimap, **R02** current-canvas navigation list, **R12** fit all, **R05** group selection/movement, **R06** orphan-aware recursive close, **R08** per-node comments, and Group D **R09** explicit JSON save/load under the [approved plan](plan.md). Python docstrings hide with comments; each Load opens a separate tab; Visualize This explicitly chooses a new or live existing canvas.

The plan retains its original gesture/list scope. Subsequent delivered refinements use **Nodes** instead of Functions, plain empty-canvas drag for pan and **Shift+left drag** for marquee, and compact hidden comment/whitespace blocks. Persistence and source-token restore defects were repaired in their dedicated feature records; the original completion claim alone is not their validation evidence.

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
- Shift+left marquee on empty canvas selects wholly enclosed frames with a 3-screen-pixel threshold; intersection alone is insufficient.
- Double-clicking non-code header chrome selects the undirected connected component, independently of visual focus or body wheel ownership.
- Dragging a selected header moves the group by `startPos + screenDelta / scale`; an unselected header replaces selection with that frame.
- Plain empty-canvas left/right/middle drag pans; Space+primary remains a pan override. Pan preserves group selection; a primary click without drag clears it.
- Marquee overlay is viewport-space; selection uses `.VpwNode_selected`. Source surfaces, controls, declaration rows, grips, connector widgets, and popups are excluded.
- Pointer cancellation/blur/disposal removes gesture state; unfinished marquee preserves previous selection. Applied movement positions remain.

### 4. Camera Geometry, Controls Toolbar, Minimap, Navigation List, Fit All — R01/R02/R12
- `src/web_visualizer/src/vp/canvas_camera.js`: owns world/screen translation, world-centered `getState`/`setState`, `viewportBounds`, `frameBounds`, `fitAll`, and selected-frame `fitNode`.
- `src/web_visualizer/src/vp/canvas_controls.js`, `.css`: unscaled toolbar with Fit all, Nodes (N), Save canvas, Load canvas, and non-modal status.
- The current Nodes dropdown includes every registered top-level source, diagnostic, and unavailable-source frame, sorted deterministically. Activation focuses and centers/fits the existing frame in the usable viewport without changing its dimensions/collapse/scroll state, creating a node, or clearing group selection. It supersedes the original callable-only Functions list.
- Bottom-right passive SVG minimap (180×120px) shows node and viewport rectangles; its input shield prevents navigation/selection gestures leaking through.
- Fit all unions current outer-frame bounds, reserves toolbar/minimap space and padding, and uses scale **0.2–3**. Empty/hidden zero-size viewports are no-ops; content too large at minimum zoom stays at 0.2 with an explicit limit notice.

### 5. Comment and Docstring Hiding — R08
- `src/vscodeextension/src/outlineproviderAPI/SymbolDefinition.ts`: added `CommentRange` (`range`, `kind: 'comment' | 'docstring'`), `commentRanges` and `commentHidingError` on `OutlineRange`.
- `src/vscodeextension/src/outlineproviders/lspextenderpython.ts`: AST-based docstring extraction (Script, FunctionDefinition, ClassDefinition first pure-string statements including parenthesized/raw/concatenated, excluding byte/f-strings/assignments, handling statement groups with semicolons).
- `src/vscodeextension/src/outlineproviders/lspextendertypescript.ts`: extracts token spans and scans trivia gaps with `ts.createScanner` for SingleLineCommentTrivia/MultiLineCommentTrivia, excluding strings, regexes, and template literals.
- `src/web_visualizer/src/utils/misc_utils.js`: updated `SyntaxHighlighter.run` to return `{ html, exactLanguage }`.
- `src/web_visualizer/src/vpw/vpw_code_editor.js`, `.css`:
  - Renders original line ordinals through `data-vp-line-number`, leaving gaps for hidden rows.
  - `vp_setCommentsVisible(visible)` hides classified spans plus comment/whitespace-only rows and wholly hidden blocks, retaining original source text nodes and manual frame geometry.
  - Hidden-comment bodies remain selectable but not content-editable. Stale classifications after local display edits report **Source mapping unavailable** rather than using wrong coordinates.
- `src/web_visualizer/src/vpw/vpw_outline_window.js`: added Comments titlebar button with `aria-pressed`, default `true` for File, `false` for Symbol.

### 6. Source References & Declaration Restoration
- `src/vscodeextension/src/outlineproviderAPI/source_reference.ts`: shared `SourceReference` type with SHA-256 document hashing.
- `src/vscodeextension/src/visualprogramming/outline_entities.ts`: extracted `translateOutlineRanges`.
- `src/vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts`: populates `sourceReference` on `Symbol` and `File`; implemented `provideSavedOutline` without calling definition provider.
- `src/vscodeextension/src/outlineproviderAPI/extensionactivator.ts`: registered `vp.executeSavedOutlineProvider`.
- Unchanged source restores exact identity; changed source requires unique full provider ancestry. Missing/ambiguous declarations and identity conflicts remain explicit unavailable nodes, not nearby-name or old-cursor substitution. Restored source comes from current workspace text, never saved bodies.

### 7. JSON Format & Frame State Contracts — R09
- `src/vscodeextension/src/visualprogramming/canvas_format.ts`: `CanvasFileV1` format and `parseCanvasFile` strict allowlist validation.
- `src/web_visualizer/src/vgf/vgf_window_tiled.js`: `vp_getFrameState()` and `vp_restoreFrameState()`.
- `src/web_visualizer/src/vpw/vpw_message_window.js`: uses `textContent` and `pre-wrap` for plain diagnostic text.
- Version 1 preserves graph IDs/root flags, distinct edge origins/targets, geometry/collapse/expanded height, per-node comment state, and world-centered camera. It excludes source bodies/HTML, local display edits, focus, selection, pending requests, and code scroll offsets.
- Validation occurs before source reads/new-tab creation: allowlisted fields/versions, finite geometry, unique IDs/endpoints, safe ordered ranges/offsets, and persistent `file:`/`vscode-remote:` references. Invalid data cannot partially replace a live canvas.
- Save captures currently present graph state without saving source edits; pending navigation and unsaved source edits are reported. Disposal and stale replies cannot settle another tab's operation.

### 8. Multi-Tab Manager, Destination Picker, and Save/Load
- `src/vscodeextension/src/visualprogramming/extensionactivator.ts`: `VpTabManager` with `LiveTabRecord` tracking, most-recently-active order, session-scoped `New-x` counter.
- `chooseCanvasForVisualization()`: QuickPick offers `New canvas` as first item, followed by live canvases (`New-x` and imported).
- `visualizeSelections()` replaces single-tab cursor dispatcher.
- Save/Load commands and webview-host message handshake (`canvas_ready`, `canvas_save`, `canvas_load`, `canvas_export_request`, `canvas_export_response`, `canvas_restore`, `canvas_restore_result`, `canvas_operation_result`).

### 9. Graph Reconstruction & Anchors
- `src/web_visualizer/src/vp/canvas_persistence.js`: serialize and restore registry with honest anchors (`SourceNavigation.describe` and `SourceNavigation.restore`).
- `src/web_visualizer/src/vpw/vpw_unavailable_window.js`: explicit source card for unresolvable source references.
- Instant connector docking (`{ animate: false }`).

## Behavioral validation

### Automated

- Full installed VS Code compiled extension suite: **189 passing, 0 failing**, including 12 canvas-format, 7 canvas-restore, and 7 comment/docstring tests plus existing regressions.
- `src/web_visualizer/tests/canvas_graph_interaction.html`: **13 passed, 0 failed**. Covered all seven approved close-set cases, undirected components, full marquee enclosure, scaled group movement, dock/undock/delete target identity, hidden-comment line-number gaps, and serialization/restore round trip.
- Close cases preserved independently rooted/shared descendants while deleting orphan cycles/self-loops correctly. Distinct roots/edges were not inferred from in-degree or merged by name.

These are original integration outcomes. Later persistence repairs recorded **194 host tests and 20 browser checks**, including real toolbar Save/Load and identical re-save JSON. Source-token restoration subsequently recorded **21 browser checks** and a real no-existing-canvas palette load, preserving an unavailable saved declaration honestly. Later drag-pan coverage recorded **25 browser checks**. These counts are separate historical runs, not a combined suite or a newly rerun result.

### Actual VS Code/provider surface

- Opened real `trino_ingestion_dag_factory.py` → `_build_dag` → nested `ingestion_dag`; inspected all headings/bodies, compact/full decorator metadata, and complete `CONFIG_DIR`/`SQL_TASK_TIMEOUT` values.
- Comments toggle hid/restored the builder docstring with matching `aria-pressed` state.
- Original Functions list showed the two existing callable frames; activation closed the list and focused/revealed the same window. Later Nodes validation covered source kinds, diagnostics, unavailable sources, activation/removal, and real mixed-language nodes.
- Minimap showed all three node rectangles plus viewport tracking; Fit all centered them inside available space.
- Destination picker offered New canvas and existing canvases and created monotonically named `New-1`/`New-2` tabs.

## Decisions and remaining validation boundaries

- The detailed schema, restore algorithm, close-set cases, source-coordinate rules, and acceptance matrix remain in the approved plan; this record does not replace those contracts with a completion label.
- JSON references the same persistent workspace/source URIs, not a portable source bundle or automatic session restore. Missing source remains a re-saveable reference card with retained graph relationships.
- Exact source-token anchors require matching hash/surface/range/offset consistency. Changed/missing anchors preserve the edge and original origin metadata using an explicit visible fallback, never guessed current offsets.
- Generic-language comment support remains explicit-language highlighter-based; Python docstrings and JS/TS comment trivia use syntax-aware classification. Classification uncertainty leaves source visible with a concrete unavailable reason.
- Later live Save/Load validation used VS Code simple dialogs, not macOS native sheets. Remote authorities and closing a panel mid-dialog were not manually exercised in that run. The original record does not establish that every planned manual matrix scenario ran.
