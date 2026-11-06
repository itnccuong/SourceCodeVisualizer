# Product Roadmap

## Direction and Status
Improve the existing Source Code Visualizer VS Code extension incrementally, retaining the current stack. Python is the primary use case and validation language; targeted TypeScript declaration/rendering defects and the reported JavaScript function-expression visualization defect are included without promising equal support across all language adapters.

This roadmap records approved direction and expected outcomes, not implemented capabilities, delivery dates, or publication commitments. IDs R01–R19 preserve feature numbering; delivery groups reflect correctness-first priority rather than numerical order. Each feature still requires dedicated implementation planning and local validation.

## Phase 1 — Correctness, Source Navigation, and Reusable Canvases
Prioritize Group A correctness/visibility/sizing, then Group B source navigation, then Group C canvas interaction, then Group D persistence. Within a group, use feature planning to select the next small, independently verifiable improvement; this roadmap does not impose a strict item-by-item schedule.

### Group A — Correctness, Visibility, and Box Sizing

### R04 — Correct Declaration Headings and Body Boundaries
**Reported defect:** constant/declaration nodes can show an excessively broad source range in both heading and body, stopping only at the next function.

**Outcome:** extract the correct declaration, heading, and body ranges using the existing presentation rather than redesigning constant nodes. Content belonging to subsequent statements or declarations must not leak into the node.

**Acceptance:** a concrete reproduction containing a declaration followed by unrelated statements and another function displays only the intended heading and body. Include multiline initializers where applicable. Confirm the declaration ends at its actual boundary, not merely at the next function. Diagnose the cause during feature work rather than treating the screenshot as proof of a particular parser bug.

### R19 — Visualize JavaScript Function-Expression Window Constructors Safely
**Reported defect:** visualizing `VgfWindowTitled` in `src/web_visualizer/src/vgf/vgf_window_tiled.js` fails with `Overlapping or out-of-bounds declaration ranges cannot be displayed safely.` The declaration uses `const VgfWindowTitled = (function() { ... });`, creates `self`, and assigns a nested `self.constructor = function() { ... }` containing additional local variables and blocks.

**Outcome:** display this valid JavaScript declaration and its nested constructor with correct source boundaries and child partitioning. Investigate the actual provider ranges and our extraction/partitioning during feature work; the reported error alone does not establish the cause. This is a targeted correctness fix alongside R04, not general JavaScript support parity.

**Acceptance:** in the live VS Code extension, visualize the actual file, open `VgfWindowTitled`, and open its nested `self.constructor` declaration. The intended headings, body text, nested declarations, and intervening source remain accessible without duplicated content, out-of-bounds output, or leakage from neighboring declarations. Source navigation remains correct. Keep rejection of genuinely invalid overlapping ranges; do not fix this by suppressing the safety error, dropping valid children, or showing a partial placeholder.

### R10 — Distinguish Bodyless Declarations from Missing Bodies
**Reported defect:** a method node can display only `;` as its body.

**Outcome:** a genuinely bodyless interface/abstract declaration shows its signature without a body area, semicolon-only code block, status message, or badge. If the source has an implementation body, display that body; do not conceal extraction defects by hiding it. This reflects the user's later approved signature-only presentation.

**Acceptance:** a bodyless TypeScript method remains signature-only while a comparable implemented method displays its actual body. Coordinate extraction fixes with R04, and retain resize controls under R18 independently of a code body.

### R11 — Prevent Zoom Reversal
**Reported defect:** excessive zoom-out can reverse the canvas.

**Outcome:** clamp zoom to safe positive lower and upper bounds. Repeated zoom input must never invert, mirror, or collapse the canvas.

**Acceptance:** continued zoom-out at the lower bound leaves the canvas stable and correctly oriented; zoom-in still works afterward. Verify both bounds and interaction coordinates. Additional zoom buttons or percentage controls are not selected by this item.

### R13 — Keep Newly Opened Nodes Visible
**Reported defect:** newly opened nodes can appear behind existing boxes.

**Outcome:** place new nodes, including error cards, visibly rather than obscured by existing nodes, with appropriate foreground ordering.

**Acceptance:** opening a connected node in a crowded canvas leaves its header and content accessible rather than hidden beneath its source or neighboring node. This item addresses new-node visibility, not a general edge-routing redesign.

### R15 — Fit Code Boxes to Full Source Lines
**Reported defect:** source lines extend beyond the visible box width, as in the long Airflow operator arguments screenshot.

**Outcome:** use the longest rendered source line to determine the initial/auto-fit box width, including line-number gutter and padding. Do not silently truncate source or force it into a narrow fixed default. Distinguish a sizing/scrolling defect from missing extracted source.

**Acceptance:** a node containing long arguments, strings, or nested dictionaries displays its complete longest source line at its initial/auto-fit width. All source remains accessible after manual narrowing via horizontal scrolling. Preserve source navigation coordinates and user resizing under R18. Decide handling of exceptionally wide lines during feature planning rather than silently imposing a clipping limit.

### R18 — Resize Handles on Every Box
**Outcome:** every box has an accessible bottom-right handle to change its width and height, including bodyless declarations, empty implementations, file nodes, and error cards. The resize surface must not depend on a code body being present.

**Acceptance:** drag the bottom-right handle on both a signature-only declaration and a code-containing node to change width/height without moving the box. Bodyless declarations remain signature-only, with no fake body or status text added to obtain a handle. Content remains accessible and connections stay attached while resizing.

### Group B — Source Navigation and Connection Anchors

### R03 — Open Parameter Types on the Canvas
**Outcome:** clicking a type in a function parameter signature opens its declaration as a connected diagram node.

**Acceptance:** a resolvable user-defined parameter type opens the matching declaration on the canvas. Multiple resolution candidates are presented for selection rather than silently choosing one; an unresolved type is reported honestly. Interface implementation discovery is separate Phase 2 work under R07.

The user reports that basic parameter-to-declaration navigation already works. Preserve that behavior; do not add duplicate generic parameter-navigation work under R17. Verify the full type-specific acceptance above before declaring R03 complete.

### R14 — Open Imported Modules and Files
**Reported defect:** clicking `operators` in `from ingestion.yearly_append.operators import OracleMonthlyAppendOperator` opens an “Implementation not found” card instead of the module's source file.

**Outcome:** resolve a clicked imported module/file reference to its source file and open that file as a connected file node. Keep imported-symbol navigation separate from module/file navigation.

**Acceptance:** clicking the resolvable `operators` module reference opens the correct file node with its actual source, not a misleading implementation error. Present ambiguous candidates for selection; missing or non-source targets remain explicit rather than opening an unrelated file. Verify source navigation and coordinate the connection origin with R16.

### R17 — Navigate Decorators and Class/Instance Attributes
**Outcome:** make both decorator metadata such as `@dag(...)` and class/instance fields or properties such as `self.config` navigable to their corresponding definitions, declarations, or assignments as connected nodes. This is attribute navigation, not a duplicate of already-working parameter navigation.

**Acceptance:** clicking a resolvable decorator identifier in compact metadata opens its definition using the original source coordinates, not the shortened display label. Clicking a resolvable class/instance attribute opens the corresponding declaration/assignment without choosing an unrelated same-name symbol. Present ambiguous candidates and unresolved cases honestly. Do not infer the actual runtime receiver or execute descriptors/properties; runtime-uncertain discovery remains separate Phase 2 work.

### R16 — Anchor Connections at the Clicked Source
**Outcome:** draw the connection from the source location the user explored to the resulting box, preferably at the end of the clicked token/expression rather than an unrelated point on the source box. This includes imported-module and attribute navigation.

**Acceptance:** opening two targets from different source locations produces distinguishable source anchors at those locations and connections to the correct target boxes. Moving/resizing boxes, panning/zooming, scrolling code, or toggling comments must not detach anchors or make them refer to different source. Define the visible fallback for off-screen/hidden source and compact decorator metadata during feature planning; do not silently display an incorrect source anchor.

### Group C — Canvas Navigation and Graph Interaction

### R01 — Passive Minimap
**Outcome:** show a compact overview of canvas nodes and the current viewport so the user can understand their location.

**Acceptance:** moving nodes and panning or zooming the canvas updates the overview and viewport indicator. The minimap is display-only; clicking or dragging it does not navigate or select nodes.

### R02 — Function List for the Current Canvas
**Outcome:** list functions/methods already displayed on the canvas and jump to the selected node.

**Acceptance:** selecting a listed function brings its existing node into view without creating another copy. Added and closed function nodes are reflected in the list. This is not an active-file or workspace-wide symbol browser.

### R12 — Fit All Content
**Outcome:** provide a button that pans and adjusts zoom to bring all current canvas nodes into view with padding.

**Acceptance:** after panning away from a populated canvas, the action returns to a view of the content; it does not merely reset the canvas to an arbitrary origin. Coordinate fitting with R11 so it never bypasses safe zoom bounds. An empty canvas remains valid and does not produce an error.

### R05 — Connected-Tree and Rectangle Group Selection
**Outcome:** double-click a node's non-code header area to select its entire connected exploration tree, including ancestors, descendants, and sibling branches reached through those links. Selection traverses connections in either direction; it is not limited to a directed subtree.

Left-drag on empty canvas draws a selection rectangle that selects node boxes enclosed by it. Rectangle selection selects those boxes only; it does not automatically expand to their connected trees. Dragging a selected node's header moves the selected group while preserving relative positions.

**Acceptance:** if A opens B and C, and B opens D, double-clicking B's header selects A, B, C, and D but not a disconnected tree. A rectangle enclosing B and D selects only those boxes. Moving either group preserves every selected node's relative offset, keeps connections attached, and leaves unselected nodes stationary. Shared nodes are selected/moved once, and cycles do not cause unbounded traversal. Preserve source-text clicking and provide a usable panning gesture when specifying the detailed interaction design.

### R06 — Close Orphaned Descendants
**Outcome:** closing a node also removes its recursively orphaned descendants. Descendants that still have another remaining parent are preserved. Parent/child here describes canvas exploration links, not class inheritance.

**Acceptance:** for A → B → C, closing B removes B and C but preserves A. If another remaining node also points to C, closing B preserves C and its still-owned branch. Remove connections belonging to closed nodes without leaving dangling edges. Shared relationships and cycles require explicit graph-lifecycle cases in dedicated feature planning; do not implement unconditional subtree deletion.

### R08 — Per-Node Comment Visibility
**Outcome:** both file and non-file nodes provide a comment visibility toggle. Comments are visible by default in file nodes and hidden by default in non-file nodes.

**Acceptance:** toggling a node hides or restores its comments without modifying the source file, hiding executable code, or changing another node's visibility setting. Verify both default states and source navigation after comments are hidden. This does not approve an AI judgment of which comments are “important”; language-specific comment/docstring classification belongs in feature planning.

### Group D — Persistence

### R09 — Explicit JSON Canvas Save and Load
**Outcome:** explicitly save and load a reusable JSON canvas file containing node references, relationships, layout, and viewport state. Restore source content from the workspace rather than packaging a portable source snapshot.

**Acceptance:** saving a populated canvas and loading it restores its nodes, graph relationships, relative positions, and viewport. Missing files or symbols are visibly identified rather than silently substituted or presented as current source. Malformed or unsupported canvas data must be reported without destroying the current canvas. Specify the format and restoration contract during feature planning; automatic workspace-session restore is not part of this item.

### Local Validation and Marketplace Preparation
Deliver small Phase 1 improvements with their agreed behavior exercised in a local VS Code Extension Development Host. Use Python as the primary validation path and targeted TypeScript examples for the reported declaration defects. Compilation and browser-only fixtures do not by themselves prove extension/provider integration.

Record actual validation before marking an improvement complete. Use locally validated milestones to prepare a separate Marketplace publication plan; this roadmap neither publishes the extension nor declares a release ready. Define publication readiness in that later plan rather than assume every listed feature is an automatic release prerequisite.

## Phase 1.5 — YAML Visualization
Add YAML-file exploration to the existing VS Code diagram environment after the Phase 1 milestone and before the Phase 2 workstreams. This is YAML visualization support, not a YAML export of this roadmap or a replacement for the JSON canvas format in R09.

**Outcome:** users can open YAML source in the diagram and explore its configuration structure with source navigation, while retaining the same canvas interaction principles.

**Planning gate:** choose the node model and supported YAML constructs, source-range mapping, and navigation/reference semantics in a dedicated feature plan. Define concrete mapping/sequence/nested-configuration examples and any anchor/alias or cross-file behavior before promising support. Domain-specific Airflow/Kubernetes interpretation, templating, execution, and external integrations are not implicitly included.

**Validation direction:** exercise real YAML files in the local VS Code extension, including nested and multiline content and honest handling of malformed/unsupported input. No runtime YAML capability is claimed by this roadmap update.

## Phase 2 — Interface Discovery, UML, and AI Research
Treat these as separate workstreams requiring their own planning and evidence, not one combined development feature. R07 is intentionally deferred from Phase 1. Neither UML nor static implementation discovery is automatically dependent on adopting AI.

### R07 — Discover Implementations Beyond Interfaces
**Outcome:** address exploration that currently stops at an interface rather than identifying potential concrete implementations.

**Acceptance direction:** investigate available language-provider and static source/call-site information, define how implementation candidates will be presented, and validate examples with both unique and ambiguous candidates. Distinguish a possible implementation from the object actually selected at runtime. Where the target cannot be established, retain an explicit unresolved state instead of asserting certainty.

The exact discovery strategy and candidate-selection interaction require dedicated Phase 2 planning; this roadmap does not promise runtime receiver identification.

### UML — Plan Integrated UML Views
**Outcome:** develop UML integration as its own multi-feature workstream after selecting useful diagram types and their relationship to existing source-exploration views.

**Planning gate:** choose diagram types, notation, source-to-diagram semantics, navigation behavior, and acceptance examples before implementation. No class, sequence, or other UML diagram type is selected by this roadmap, and UML integration is not described as already available.

### AI — Research Statically Ambiguous Calls First
**Outcome:** investigate whether AI-assisted source analysis can usefully explain or narrow calls that cannot be resolved confidently from static information.

**Research gate:** evaluate concrete ambiguous-call examples, source evidence supporting proposed targets, uncertainty and failure cases, and usefulness relative to the existing provider/static path. Record findings before proposing an AI-assisted navigation feature. Research is not a promise that AI can determine the actual runtime target.

AI analysis must not execute the analyzed code or collect runtime traces. Predicted relationships and behavior remain explicitly labeled inferences, not observations. Providers, local versus cloud deployment, source-data handling, and authorization for any source transmission remain undecided; settle those choices before any experiment requiring an external service or new AI integration.

## Phase 3 — Additional Languages
Expand attention to other languages beyond the Python-first work and the explicit Phase 1.5 YAML milestone, using dedicated planning to select languages and support expectations. Targeted TypeScript defect fixes in Phase 1 do not establish general TypeScript parity or choose the subsequent language order. Demonstrated capability, not adapter presence, determines support claims.

## Related Constitution
- [Project mission](mission.md)
- [Technology and constraints](tech.md)
- [Project context and feature workflow](context.md)
