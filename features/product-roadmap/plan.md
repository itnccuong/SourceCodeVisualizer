## Context
Create `specs/roadmap.md` from the user's 13 extension improvements and two longer-term directions: UML integration and AI-assisted analysis of statically ambiguous calls. This is documentation-only constitution work, not implementation of the roadmap features. Seventeen initial questions and two follow-up questions resolved product scope, priorities, and selection semantics; the exact payload below captures those decisions.

## Grounded Findings
- Read `specs/context.md`, `specs/mission.md`, and `specs/tech.md` in this session. Constitution changes are permitted for this explicit user-directed task; approved execution plans must be saved under `features/<feature-name>/plan.md` before repository implementation, and completed results recorded afterward.
- The current `specs/` listing contains `context.md`, `mission.md`, and `tech.md`; `roadmap.md` is absent.
- The approved mission keeps VS Code as the product, prioritizes Python, puts local validation before Marketplace publication planning, and places UML/AI analysis before expanded language support.
- The approved technical baseline retains the existing stack. AI source analysis does not execute the analyzed code; UML types and AI deployment/data handling remain undecided.
- The user reports heading/body range leakage, bodyless methods rendering a semicolon, excessive zoom reversing the canvas, and newly opened nodes being obscured. These are reported symptoms, not established implementation causes.
- Item 4 clarification: both heading and body incorrectly contain a broad source range and stop only at the next function. The requested outcome is correct declaration/header/body boundaries, not a redesign of constant presentation.
- Inspected `features/`: it contains only `project-constitution/` with its existing plan and results; `features/product-roadmap/` is new.

## Approach
### 1. Persist the approved execution contract
Reread `specs/context.md`, `specs/mission.md`, and `specs/tech.md`, and inspect `specs/` and `features/` before writing. Save this full approved plan in `features/product-roadmap/plan.md` before creating the roadmap, following the existing workflow. Do not replace it with a summary or a session-local link. Verify the saved plan contains the exact roadmap payload and verification command before proceeding.

If a target file exists at execution time, read it first. If it already matches the approved content, leave it unchanged. Preserve compatible unrelated content; if existing roadmap or plan decisions conflict with this approved payload, stop the conflicting write and ask for direction rather than overwrite it. Leave `features/project-constitution/` and all existing constitution/supporting documents unchanged.

### 2. Establish the approved roadmap
Create `specs/roadmap.md` with the exact Markdown in **Roadmap Payload** below. Preserve IDs R01–R13 even though delivery groups reorder them; item R07 belongs only to Phase 2. UML and AI research are separate Phase 2 workstreams, not a single feature. Reuse links to `mission.md`, `tech.md`, and `context.md`; no new application implementation, packages, scripts, source files, or changes to those three existing documents.

Read the delivered Markdown and check coverage and meaning against the approved payload. It must distinguish roadmap acceptance expectations from completed functionality, keep Python first with targeted TypeScript defect coverage, and retain deferred UML/AI deployment/data decisions. No source-code diagnosis or runtime test is required to create this document.

### 3. Verify document delivery
Run the read-only smoke command in **Verification** from the repository root. It compares the roadmap to the approved payload, checks exactly one entry for every R01–R13 ID, checks phase/workstream coverage, and resolves its relative links. Once implementation and verification are complete, follow the existing feature-record workflow to record the executed plan and actual outcomes in `features/product-roadmap/results.md`. Include documentation-only limitations and link the roadmap and results in delivery.

## Confirmed Product Decisions
- 1: Minimap is a passive overview, not a navigation/selection control.
- 2: Function list contains functions already displayed on the canvas and jumps to the selected node.
- 3: Clicking a parameter type opens its declaration on the canvas.
- 4: Correct the leaking heading and body source ranges; do not prescribe a new constant rendering style.
- 5: Double-click a node's non-code header area to select the entire connected exploration component, traversing links in either direction. If A opens B and C, and B opens D, selecting B selects A/B/C/D. Left-drag on empty canvas draws a rectangle selecting enclosed node boxes. Dragging a selected node header moves the group while preserving relative positions.
- 6: Closing B in A → B → C closes B and orphaned descendants recursively; preserve A and descendants that still have another parent.
- 7: Interface implementation discovery belongs to Phase 2, not Phase 1.
- 8: Both file and non-file nodes have comment visibility toggles. Comments are hidden by default on non-file nodes and visible by default on file nodes.
- 9: Explicit JSON save/load of node references, relationships, layout, and viewport; reload source from the workspace and flag missing symbols.
- 10: Genuinely bodyless declarations show their signature and an explicit declaration-only status. Missing actual implementation bodies remain extraction defects.
- 11: Clamp zoom to positive safe limits; no additional zoom-control feature is selected.
- 12: Fit all current content into view with padding.
- 13: Newly opened nodes must not be obscured by existing boxes.
- UML: Separate Phase 2 workstream; defer specific diagram types.
- AI: Begin with a research milestone, not an implemented AI navigation promise; retain no-execution and deferred deployment/data-policy boundaries.
- Ordering: Correctness first, then navigation/group interaction, then persistence; deeper interface discovery remains in Phase 2.
- Languages: Python-first validation plus targeted TypeScript/interface defects; no broad language-parity commitment.

## Verification
No dependencies, environment variables, or fixtures are required beyond the existing `python3`. Do not install dependencies, run builds/tests, launch the extension, or claim runtime verification for this documentation task.

Read the saved plan and roadmap and compare the latter to the payload below. Check that no application implementation has been added, no existing constitution file has been rewritten, and the completion record is written only after verification.

Run from the repository root:

```sh
python3 -c 'from pathlib import Path; import re; plan = Path("features/product-roadmap/plan.md").read_text(encoding="utf-8"); blocks = re.findall(r"```markdown\n(.*?)```", plan, re.S); assert len(blocks) == 1, "Expected one approved roadmap payload"; path = Path("specs/roadmap.md"); text = path.read_text(encoding="utf-8"); assert text == blocks[0], "Roadmap differs from approved payload"; ids = re.findall(r"^### (R\d{2}) —", text, re.M); assert sorted(ids) == [f"R{i:02d}" for i in range(1, 14)], ids; required = ["## Phase 1 —", "## Phase 2 —", "## Phase 3 —", "### UML —", "### AI —", "### Local Validation and Marketplace Preparation"]; assert all(s in text for s in required), "Missing phase or workstream"; broken = [target for target in re.findall(r"\]\(([^)]+)\)", text) if not (path.parent / target).exists()]; assert not broken, broken; print("PASS: roadmap matches approved payload, covers all 13 features and UML/AI, and all relative links resolve")'
```

Expected observable output, exit status 0:

```text
PASS: roadmap matches approved payload, covers all 13 features and UML/AI, and all relative links resolve
```

The individual acceptance checks in the roadmap describe future feature verification. Do not run them or label them passed while delivering this document.

## Roadmap Payload
```markdown
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
```

## Assumptions and Contingencies
- Use English, consistent with the existing constitution. The user may revise roadmap priorities in a subsequent explicitly approved constitution change; no dates are assumed.
- Approval authorizes this roadmap and its task records only. Do not treat it as authorization to implement all listed features, publish, choose AI vendors, transmit source, or change the approved stack.
- Product acceptance expectations are intentionally finer-grained than a phase list, but application designs such as serialization schema, comment classification, pan gesture, exact zoom bounds, and Phase 2 discovery algorithms remain for dedicated feature plans. They are not implementation decisions needed to deliver this exact roadmap document.
- If the current workflow has changed, follow compatible record requirements. If it conflicts with the approved documentation scope, obtain direction before making a conflicting change.
