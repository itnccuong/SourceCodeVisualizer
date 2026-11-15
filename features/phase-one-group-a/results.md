# Phase 1 Group A — Completed Results

## Goal and acceptance

Complete **R04, R19, R10, R11, R13, R15, R18** under the [approved plan](plan.md). Preserve complete source and navigation; keep declaration-only methods bodyless; provide bounded zoom, intrinsic initial sizing, frame-owned resizing, and measured non-overlapping placement.

The original uncapped-width policy was subsequently replaced by a user-requested **1200px creation/auto-fit cap** in [the interaction follow-up](../canvas-interaction-followup/results.md). Manual resizing remains uncapped. The approved plan retains its original requirements; this note distinguishes them from current sizing behavior.

## Delivered behavior and implementation

### JavaScript declaration boundaries — R19

- Reuse the TypeScript compiler and fragment cache for callable JavaScript assignments/initializers. Optional `isDeclarationSymbol` and display-child projection extend the shared adapter contract without mutating provider objects.
- Collapse only a syntax-certified anonymous wrapper representing the same initializer implementation; preserve its callable children and all intervening source. Non-callable locals remain source gaps.
- Preflight raw children, extract each included child once, then partition and validate effective ranges. Unrelated overlaps/crossings retain explicit safety errors.
- Assignment headings include their exact binding/receiver target. RHS-only provider ranges expand only with proven assignment syntax. A syntax-backed `definitionPosition` targets the callable rather than a receiver local; **Show in code** still uses the heading start. Structural webview positions are normalized into VS Code `Position` instances.

Key files: `src/vscodeextension/src/outlineproviders/{lspextendertypescript,providerregistrer}.ts`, `outlineproviderAPI/{lspextenderprovider,SymbolDefinition}.ts`, `outlineproviderAPI/utils/outlineutils.ts`, and `src/web_visualizer/src/vp/outline_object_functions.js`.

### Canvas geometry — R11/R15/R18

- Ctrl-only/Alt-only wheel zoom stays within **0.2–3**, preserving the world point under the cursor. Input already at a bound does not translate the canvas.
- Attached DOM measurement includes source, gutter, padding, title/declaration rows, and controls. Initial/explicit-fit body height is at most **400px**, not a manual resize limit. Current fit width is capped at 1200px; code remains unwrapped and scrollable.
- Flex layout gives each frame one shrinkable body viewport and a separate resize grip, including files, messages, empty implementations, and bodyless declarations. Outer overflow remains visible for exterior dockers.
- Grip resizing applies screen delta divided by scale without changing position; minimum width is 120px and minimum height retains chrome/grip. Pointer cancellation, lost capture, and deletion end resizing. Grip double-click auto-fits; source double-click does not.
- Collapse preserves manual width and expanded height. Fit while collapsed computes expanded fit geometry without adding source/body/status content to declarations.
- Source selection endpoints use the original block start for both ends; scrolling must not substitute the block end as the cursor-end origin.

Key files under `src/web_visualizer/src/`: `vgf/vgf_navigationarea.js`, `vgf/vgf_expandable_with_title.{js,css}`, `vgf/vgf_window_tiled.{js,css}`, `vgf/std.css`, `vpw/vpw_code_editor.{js,css}`, `vpw/vpw_outline_window.js`, and `vpw/vpw_world.js`. Later responsive-heading/scroll refinements are recorded in the interaction follow-up.

### Measured placement — R13

`vp/window_positioner.js` and `vp/controller.js` place only newly created frames. RIGHT/LEFT placement accounts for actual frame width; downward collision search maintains **24 world px clearance** and advances batches by measured height. Existing or reused nodes retain their sizes/positions. Message cards use normal foreground focus. Detached requestees receive no connection.

Minimal reveal preserves zoom and exposes an oversized node's beginning at a **20px inset**, rather than shrinking it. Outer measured frames stay at final geometry during entrance; later smooth reveal timing is documented in the interaction follow-up.

## Behavioral validation

### Automated

- Final full installed VS Code extension suite: **140 passing**, runner exit 0.
- Actual repository `vgf_window_tiled.js` extraction and declaration-lookup smoke: exact factory/constructor headings and complete constructor source.
- Permanent coverage in `src/vscodeextension/src/test/suite/outlineprovider_test/javascript_function_expression_boundaries.test.ts` covers source reconstruction, provider immutability, RHS-only/complete assignments, wrapper precedence, serialized positions, and explicit errors.

### Native Chromium, both themes

| Scenario | Observed result |
|---|---|
| Zoom bounds, offset viewport, reverse direction | Scale stayed 0.2–3; bound input preserved translation; cursor drift stayed below 0.03px. |
| 60px grip drag at scales 0.2/1/3 | Dimensions changed by 300/60/20 world px; position stayed fixed. |
| Long source with tabs, nested dictionaries, long arguments, final sentinel | Every row remained available; body fit height was 400px; native scrolling reached both ends. Original uncapped-width measurements are superseded by the later width cap. |
| Manual size/auto-fit | Both scroll axes worked after narrowing; manual height exceeded 400px; source double-click retained size; grip double-click restored fit. |
| Signature/implemented/empty/file/error windows | One grip each; bodyless declarations stayed bodyless, implementations retained source, empty bodies gained no fake text. |
| Collapse and capture cleanup | Expanded height/manual width restored; pointercancel, lost capture, and deletion stopped resizing. |
| Dockers/connections | Exterior dockers remained visible; endpoints tracked source scroll, resize, and collapse/expand. |
| Crowded LEFT/RIGHT placement, batches, errors, late replies | Clearance held at scales 0.2/3 after panning; existing geometry stayed unchanged; detached requestees got no connection; oversized last nodes revealed their beginning. |
| Scrolled source navigation | Native selection of `knownIdentifierAfterScroll` emitted exactly `97:1 → 97:27` in both themes. |

### Actual VS Code/provider surface

- **R04 Python:** opened `trino_ingestion_dag_factory.py` → `_build_dag` → nested `ingestion_dag`. Headings, compact decorator/full hover, complete operator arguments, and body text remained available after resizing/scrolling. All eight requested constants retained complete values without neighboring declarations. **Show in code** selected the actual nested DAG and `REQUIRED_KEYS` declarations.
- Existing Python boundary fixtures excluded adjacent `AFTER` statements while retaining `pass`, ellipsis, and docstring bodies.
- **R10 TypeScript:** `Reader.read` and `Base.run` remained signature-only and independently resizable; `Worker.read` retained implementation, `Worker.empty` stayed empty, and assignment values excluded neighboring statements. **Show in code** remained correct after resizing.
- **R19 JavaScript:** actual file → `VgfWindowTitled` → `self.constructor` navigation used declaration rows, omitted the redundant wrapper node, retained source gaps and callable rows, and reached the complete constructor end. **Show in code** selected the actual assignment declarations, including the constructor's expanded assignment range.

## Decisions and limits

- LEFT/downward placement preserves existing layout but can create a tall column. No graph rearrangement or edge-routing redesign was added.
- No Python extraction rewrite, second JavaScript parser, React support, or class-expression promotion was introduced. Strict invalid-range rejection remains.
- Browser fixtures establish geometry; live-provider checks separately establish extraction/navigation. An early request before Python provider initialization displayed ordinary text; no production readiness-retry mechanism was added.
- Analyzed external Python was inspected only, never executed or modified. The validation above is historical feature evidence, not a newly run suite for later display-only refinements.
