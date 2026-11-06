# Roadmap status

Scope and ordering come from [the approved roadmap](../specs/roadmap.md). This is a delivery summary, not a change to that roadmap. Checked means implemented and validated; partial or unverified acceptance stays unchecked.

**7 of 19 numbered requests complete. Phase 1 Group A is complete.** Python remains the primary validation target. Targeted TypeScript/JavaScript coverage does not establish full language parity.

## Foundations

- [x] Document the project mission, technical boundaries, runtime architecture, and feature-record workflow.
- [x] Give the local extension its own identity and commands, separate from the Marketplace extension.
- [x] Build a VSIX and install it into regular VS Code.
- [x] Establish Python-first live diagram validation and targeted TypeScript/JavaScript regression coverage.

Evidence: [constitution](../features/project-constitution/results.md), [local installation](../features/install-local-extension/results.md), [Group A](../features/phase-one-group-a/results.md).

## Phase 1 — Correctness, source navigation, reusable canvases

### Group A — Correctness, visibility, box sizing: complete

- [x] **R04 — Declaration boundaries.** Correct headings and bodies; complete Python assignment values; prevent neighboring declarations from leaking into the selected body.
- [x] **R19 — JavaScript factory/nested callable boundaries.** Safely split supported parenthesized factory functions and nested assignment callables, preserving source coordinates and navigation.
- [x] **R10 — Bodyless declarations.** Render interface and abstract signatures without fake bodies or status badges; preserve real implementation bodies.
- [x] **R11 — Safe zoom.** Bound zoom to 20–300% and keep the source point under the cursor stable.
- [x] **R13 — Visible new nodes.** Measure and place new nodes without overlap, bring them forward, and move the viewport only as needed; include error windows.
- [x] **R15 — Initial width.** Fit content up to a 1200px initial/auto-fit width, as subsequently requested; retain original code formatting, scrolling for longer lines, a bounded initial body height, and unrestricted manual enlargement.
- [x] **R18 — Resize all boxes.** Frame-owned resize grips, scale-aware resizing, collapse/restore, and double-click to fit; include file, bodyless, and error windows.

Evidence: [Group A implementation and validation](../features/phase-one-group-a/results.md), [declaration boundaries](../features/declaration-boundaries/results.md).

### Interaction regressions fixed after Group A

- [x] Restore animated new-box appearance without changing measured layout or detaching connections.
- [x] Clamp scrolled-out connection origins to visible boundaries, including nested and horizontal clipping.
- [x] Keep two-finger canvas panning continuous across boxes and scroll limits; preserve fractional touchpad deltas.
- [x] Make new-node camera movement visibly ease in and out over 450ms. Start timing on the first animation callback, preserve user-input cancellation, and honor reduced-motion preferences.
- [x] Reflow declaration headings with node width while preserving code-body line breaks, indentation, and scrolling.

Evidence: [recorded interaction fixes and installed-build validation](../features/canvas-interaction-followup/results.md).

### Group B — Source navigation and connection anchors

- [ ] **R03 — Parameter-type navigation.** Open the connected type declaration; handle multiple candidates and unresolved references honestly. Basic navigation exists, but the full acceptance criteria are not verified.
- [ ] **R14 — Imported module/file navigation.** Resolve and open the referenced source file as a connected node; distinguish file references from imported symbols and report missing or ambiguous results.
- [ ] **R17 — Decorator and attribute navigation.** Navigate decorators and class/instance attributes to source definitions or assignments without claiming runtime certainty. Compact decorator metadata is complete; the full navigation feature is not.
- [ ] **R16 — Clicked-expression connection anchors.** Start connections at the clicked token/expression, preferably its end, with stable behavior through movement, scrolling, comments, and compact decorator rendering. Offscreen clipping is fixed, but this full feature is not complete.

### Group C — Canvas navigation and graph interaction

- [ ] **R01 — Passive minimap.** Show nodes and the current viewport; no minimap interaction required.
- [ ] **R02 — On-canvas function/method list.** Jump to existing canvas nodes and update the list when nodes are added or removed; not a workspace browser.
- [ ] **R12 — Fit all.** Pan and zoom to all nodes with padding, safe zoom bounds, and valid empty-canvas behavior.
- [ ] **R05 — Selection and group movement.** Double-click a non-code header to select the entire connected component; rectangle-select enclosed nodes from empty canvas; drag the selection while preserving offsets; handle shared nodes and cycles once.
- [ ] **R06 — Recursive close.** Remove orphaned descendants and dangling edges while retaining nodes shared with surviving parents; handle cycles correctly.
- [ ] **R08 — Per-node comments toggle.** Default file comments visible and non-file comments hidden; preserve source coordinates and navigation. This is not AI classification.

### Group D — Persistence

- [ ] **R09 — Explicit JSON save/load.** Save node references, relationships, layout, and viewport. Reload source from the workspace, flag missing source, and reject malformed files without destroying the current canvas. Not a portable source snapshot or automatic session restore.

## Phase 1.5 — YAML visualization

- [ ] Visualize YAML configuration structure and navigate to its source.
- [ ] Plan node boundaries, mappings, sequences, multiline scalars, references, anchors, and aliases before implementation.

This is separate from canvas JSON persistence. Airflow/Kubernetes execution semantics are not implicitly included.

## Phase 2 — Independent workstreams

- [ ] **R07 — Potential concrete implementations.** Discover candidates beyond an interface through static/provider information; handle unique and multiple candidates without promising the actual runtime target.
- [ ] **UML views.** Plan diagram types, notation, and source semantics before implementation.
- [ ] **AI-assisted ambiguity research.** Evaluate ambiguous static calls against a provider-only baseline; expose evidence and uncertainty rather than presenting guesses as observed execution.
- [ ] Decide AI deployment, provider, and source-data handling before integration. Do not execute analyzed code or add runtime tracing as an implicit part of this work.

## Phase 3 — Additional languages

- [ ] Choose and validate additional language support after the Python-first baseline and YAML work.
- [ ] Define supported behavior per language and feature; an adapter alone does not establish parity.

## Release track

- [x] Local build, VSIX installation, and live validation milestones.
- [ ] Dedicated Marketplace readiness and publication plan. Local installation does not mean Marketplace readiness or publication.

## Verification record

The final Group A run recorded **140 passing extension-host tests**. That is historical evidence, not a claim that the full suite was rerun for the later camera-only revision. Runtime checks and build/install outcomes for that revision belong to the interaction follow-up record linked above.
