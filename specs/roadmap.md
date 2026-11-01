# Product Roadmap

## Direction and Status
Improve the existing Source Code Visualizer VS Code extension incrementally, retaining the current stack. Python is the primary use case and validation language; targeted TypeScript declaration and rendering defects are included without promising equal support across all language adapters.

This roadmap records approved direction and expected outcomes, not implemented capabilities, delivery dates, or publication commitments. IDs R01–R13 preserve the original feature numbering; delivery groups reflect correctness-first priority rather than numerical order. Each feature still requires dedicated implementation planning and local validation.

## Phase 1 — Correctness, Navigation, and Reusable Canvases
Prioritize Group A correctness work, then Group B navigation and graph interaction, then Group C persistence. Within a group, use feature planning to select the next small, independently verifiable improvement; this roadmap does not impose a strict item-by-item schedule.

### Group A — Correctness and Visibility

### R04 — Correct Declaration Headings and Body Boundaries
**Reported defect:** constant/declaration nodes can show an excessively broad source range in both heading and body, stopping only at the next function.

**Outcome:** extract the correct declaration, heading, and body ranges using the existing presentation rather than redesigning constant nodes. Content belonging to subsequent statements or declarations must not leak into the node.

**Acceptance:** a concrete reproduction containing a declaration followed by unrelated statements and another function displays only the intended heading and body. Include multiline initializers where applicable. Confirm the declaration ends at its actual boundary, not merely at the next function. Diagnose the cause during feature work rather than treating the screenshot as proof of a particular parser bug.

### R10 — Distinguish Bodyless Declarations from Missing Bodies
**Reported defect:** a method node can display only `;` as its body.

**Outcome:** a genuinely bodyless interface/abstract declaration shows its signature and the status `Declaration only — no body`, not a semicolon-only code block. If the source has an implementation body, display that body; do not conceal extraction defects behind the declaration-only status.

**Acceptance:** a bodyless TypeScript method declaration shows the explicit status, while a comparable method with an implementation displays its actual body. Coordinate extraction fixes with R04 without treating all semicolon-only displays as the same cause.

### R11 — Prevent Zoom Reversal
**Reported defect:** excessive zoom-out can reverse the canvas.

**Outcome:** clamp zoom to safe positive lower and upper bounds. Repeated zoom input must never invert, mirror, or collapse the canvas.

**Acceptance:** continued zoom-out at the lower bound leaves the canvas stable and correctly oriented; zoom-in still works afterward. Verify both bounds and interaction coordinates. Additional zoom buttons or percentage controls are not selected by this item.

### R13 — Keep Newly Opened Nodes Visible
**Reported defect:** newly opened nodes can appear behind existing boxes.

**Outcome:** place new nodes, including error cards, visibly rather than obscured by existing nodes, with appropriate foreground ordering.

**Acceptance:** opening a connected node in a crowded canvas leaves its header and content accessible rather than hidden beneath its source or neighboring node. This item addresses new-node visibility, not a general edge-routing redesign.

### Group B — Navigation and Graph Interaction

### R01 — Passive Minimap
**Outcome:** show a compact overview of canvas nodes and the current viewport so the user can understand their location.

**Acceptance:** moving nodes and panning or zooming the canvas updates the overview and viewport indicator. The minimap is display-only; clicking or dragging it does not navigate or select nodes.

### R02 — Function List for the Current Canvas
**Outcome:** list functions/methods already displayed on the canvas and jump to the selected node.

**Acceptance:** selecting a listed function brings its existing node into view without creating another copy. Added and closed function nodes are reflected in the list. This is not an active-file or workspace-wide symbol browser.

### R03 — Open Parameter Types on the Canvas
**Outcome:** clicking a type in a function parameter signature opens its declaration as a connected diagram node.

**Acceptance:** a resolvable user-defined parameter type opens the matching declaration on the canvas. Multiple resolution candidates are presented for selection rather than silently choosing one; an unresolved type is reported honestly. Interface implementation discovery is separate Phase 2 work under R07.

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

### Group C — Persistence

### R09 — Explicit JSON Canvas Save and Load
**Outcome:** explicitly save and load a reusable JSON canvas file containing node references, relationships, layout, and viewport state. Restore source content from the workspace rather than packaging a portable source snapshot.

**Acceptance:** saving a populated canvas and loading it restores its nodes, graph relationships, relative positions, and viewport. Missing files or symbols are visibly identified rather than silently substituted or presented as current source. Malformed or unsupported canvas data must be reported without destroying the current canvas. Specify the format and restoration contract during feature planning; automatic workspace-session restore is not part of this item.

### Local Validation and Marketplace Preparation
Deliver small Phase 1 improvements with their agreed behavior exercised in a local VS Code Extension Development Host. Use Python as the primary validation path and targeted TypeScript examples for the reported declaration defects. Compilation and browser-only fixtures do not by themselves prove extension/provider integration.

Record actual validation before marking an improvement complete. Use locally validated milestones to prepare a separate Marketplace publication plan; this roadmap neither publishes the extension nor declares a release ready. Define publication readiness in that later plan rather than assume every listed feature is an automatic release prerequisite.

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
Expand attention beyond Python after the Python-first work, using dedicated planning to select languages and support expectations. Targeted TypeScript defect fixes in Phase 1 do not establish general TypeScript parity or choose the subsequent language order. Demonstrated capability, not adapter presence, determines support claims.

## Related Constitution
- [Project mission](mission.md)
- [Technology and constraints](tech.md)
- [Project context and feature workflow](context.md)
