# Canvas usability and persistence repairs

## Requested behavior
1. Moving focus to another node releases the old source body's wheel ownership.
2. Hiding comments also hides whitespace-only rows and empty comment/whitespace blocks.
3. Explicit Save and Load work through the extension host, with settled cancellation/error outcomes and separate loaded tabs.
4. Replace Functions with Nodes and list every current canvas node.

## Executed changes

### Body ownership
`src/web_visualizer/src/vgf/vgf_navigationarea.js` releases a body lock on its owning frame's `vp_windowUnfocused`, and removes that listener during lock cleanup. Refocusing the same frame keeps its lock; focusing a newly opened child releases the parent without an outside click.

### Comment whitespace
`src/web_visualizer/src/vpw/vpw_code_editor.js` classifies original whitespace-only rows, hides them with comments, and hides an entire editor block when every row is hidden. Showing comments restores rows and blocks. Text nodes and original line ordinals remain intact for source navigation. Existing manual outer-frame dimensions remain unchanged.

### All-node picker
`canvas_controls.js`, `canvas_controls.css`, and the selection exclusion in `canvas_selection.js` use Nodes names/classes rather than Functions. The list includes files, classes, variables, functions, diagnostics, and unavailable sources. Labels use source/model identity rather than titlebar controls. Source entries show URI/line where available; diagnostics and unavailable references retain meaningful labels.

Activation focuses the existing node and calls `CanvasCamera.fitNode()` to center its outer frame in the usable viewport, reserving toolbar/minimap space. Zoom fits the frame between 20% and 100%; small nodes are not magnified. A frame too large at minimum zoom is aligned at its beginning with an explicit limit message. Pending automatic reveals are cancelled. No node is created, moved, resized, expanded, or cleared from group selection; body scroll position stays unchanged.

Native pointer/keyboard checks covered offscreen large frames, ordinary frames, collapsed nodes, and minimum-zoom overflow. Center/leading-edge errors stayed below one pixel; dimensions, positions, graph selection/count, collapsed state, and a nonzero body scroll offset were preserved. Existing canvas interaction checks passed unchanged.

### Save/Load
The runtime-confirmed toolbar no-op was `Controller` calling nonexistent `_request_getId()` before sending any host message. It now uses the existing `_requestId_get()` allocator.

Additional repaired stages:
- Separate operation tickets and disabled Save/Load controls, matching success/cancel/error replies by ID without navigation tickets or stale cross-operation settlement.
- Absolute Save suggestions and lifetime checks; host replies return to the originating tab. Readiness/export/restore promises reject on disposal or undeliverable messages.
- Export ends current reveal/entrance presentation before snapshotting.
- `outline_entities.ts` normalizes serialized outline ranges and dispatches by `CLASS_TYPE`, populating live source text and hashes. Restoration checks document versions and identity conflicts.
- Strict canvas validation rejects malformed/coerced fields, unsafe coordinates/offsets, invalid references/URIs, and invalid source-token ranges.
- Reconstruction preserves source/diagnostic metadata, unavailable references/comment state, original edge origins, and fractional positions, without competing initial focus/docking animations.
- `vgf_window_tiled.js` no longer calls nonexistent `vp_collapse()` when restoring collapsed frames. It uses the existing toggle state and restores saved expanded height after the normal toggle listener.

Main persistence files: `vp/controller.js`, `vp/canvas_persistence.js`, `visualprogramming/extensionactivator.ts`, `visualizer.ts`, `canvas_format.ts`, and `outline_entities.ts`.

## Observed validation

### Automated
- Installed VS Code compiled extension suite: **194 passing**, runner exit code 0. Includes new format validation and serialized-outline restoration regressions.
- Chromium `tests/canvas_graph_interaction.html`: **20 passed, 0 failed**. New coverage includes focus-driven body unlock, whitespace/block compaction with preserved source mapping, all-node picker kinds/activation/removal, collapsed-frame restoration, and operation cancellation/error/stale-reply transitions.

### Actual VS Code extension host
An isolated VS Code development host exercised real workspace providers and built-in simple file dialogs (`files.simpleDialog.enable=true`), not a mock file API or macOS native sheets.

- Opened real `outlineproviders/providerregistrer.ts` as a file diagram. Hiding comments left zero visible blank rows; all three comment/whitespace-only inter-declaration editor blocks became hidden. Screenshot inspected.
- Clicked the source body: one wheel lock. Opened `activate` through its declaration control: two nodes, zero old body locks, Nodes (2).
- Saved two connected nodes with the child collapsed. JSON retained IDs, root flags, references/hashes, declaration edge, fractional placement, collapse/expanded height, comment state, and viewport, without source bodies.
- Loading through the real toolbar/dialog opened a separate canvas tab. Original and restored geometry/comment states matched; restored nodes showed current source, not unavailable cards.
- Re-saving the restored canvas produced identical JSON.
- Cancelled both toolbar Save and Load: controls were disabled while pending, then re-enabled; no additional tab appeared.
- Loaded an unsupported version 99 file: `Cannot load canvas: Unsupported canvas version: 99`; no new tab or graph replacement.
- Command-palette Load and Save opened the real file dialogs. Save suggested the imported canvas path. Dialogs were cancelled without writing.

### Required Airflow runtime surface
The real `trino_ingestion_dag_factory.py` was inspected as source without execution or modification.

- Opened file → `_build_dag(config_path: Path) -> DAG` → nested `ingestion_dag() -> None` through actual diagram declaration navigation.
- Inspected all three rendered headings and body text. Nested `@dag(…` metadata retained its full decorator in the tooltip.
- Opened `CONFIG_DIR =` with visible body `Path(__file__).with_name("config_oracle2iceberg")` and `SQL_TASK_TIMEOUT =` with visible body `timedelta(minutes=18)` through source selection navigation.
- Real Nodes (7) dropdown listed both files, the TypeScript function, both Python functions, and both Python variables. Screenshot inspected.
- The Python extension displayed an invalid-interpreter notification for the configured external venv. Document symbols and all diagram navigation above nevertheless completed. No claim is made about executing Python or Airflow.

## Limits
macOS native file sheets, remote source authorities, and closing a panel mid-dialog were not manually exercised in this run. Existing manual node sizes remain stable when hiding comments; only source-row/block whitespace is compacted.
