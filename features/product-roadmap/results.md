# Product Roadmap — Completed Results

**Current roadmap:** the R14–R18 / Phase 1.5 update extends the original payload and reorganizes Phase 1 into four groups. The later R19 update adds the reported JavaScript function-expression bug to Group A after R04. Original results are preserved as history.

## Goal and Acceptance Criteria
Create [the product roadmap](../../specs/roadmap.md) with the exact approved payload, preserving all R01–R13 entries, correctness-first delivery groups, separate Phase 2 interface discovery/UML/AI workstreams, Python-first validation, and deferred design decisions. Deliver documentation only, with no implementation or runtime-validation claims.

## Plan as Executed
1. Read the project workflow, mission, technical constraints, and relevant architecture guidance; inspected `specs/` and `features/`. The roadmap and product-roadmap feature records did not exist.
2. Saved the full [approved plan](plan.md) before creating the roadmap. Read the saved plan, including its payload and complete verification command.
3. Created `specs/roadmap.md` directly from the saved approved Markdown payload. Read the delivered document and reviewed its scope and semantics: future acceptance expectations rather than completed features, R07 assigned only to Phase 2, separate UML and AI workstreams, targeted TypeScript defect coverage without language parity, and deferred UML/AI deployment and data decisions.
4. Ran the approved read-only smoke command from the repository root successfully. Wrote this completion record only after delivery and verification finished.

No material deviations from the approved plan.

## Changes
- `features/product-roadmap/plan.md`: full approved execution contract, exact roadmap payload, and verification command.
- `specs/roadmap.md`: approved product roadmap and future feature acceptance expectations.
- `features/product-roadmap/results.md`: executed plan and observed validation outcomes.

The task's repository writes were limited to these three new Markdown files. No application implementation, packages, scripts, or generated assets were added or changed. Existing `specs/context.md`, `specs/mission.md`, `specs/tech.md`, supporting documents, and `features/project-constitution/` were left unchanged.

## Validation
Executed from the repository root:

```sh
python3 -c 'from pathlib import Path; import re; plan = Path("features/product-roadmap/plan.md").read_text(encoding="utf-8"); blocks = re.findall(r"```markdown\n(.*?)```", plan, re.S); assert len(blocks) == 1, "Expected one approved roadmap payload"; path = Path("specs/roadmap.md"); text = path.read_text(encoding="utf-8"); assert text == blocks[0], "Roadmap differs from approved payload"; ids = re.findall(r"^### (R\d{2}) —", text, re.M); assert sorted(ids) == [f"R{i:02d}" for i in range(1, 14)], ids; required = ["## Phase 1 —", "## Phase 2 —", "## Phase 3 —", "### UML —", "### AI —", "### Local Validation and Marketplace Preparation"]; assert all(s in text for s in required), "Missing phase or workstream"; broken = [target for target in re.findall(r"\]\(([^)]+)\)", text) if not (path.parent / target).exists()]; assert not broken, broken; print("PASS: roadmap matches approved payload, covers all 13 features and UML/AI, and all relative links resolve")'
```

Observed output (successful exit):

```text
PASS: roadmap matches approved payload, covers all 13 features and UML/AI, and all relative links resolve
```

The command verified exact equality with the saved approved payload, exactly one entry for each R01–R13 ID, all three phases and required workstreams, and resolution of every roadmap relative link. The document review additionally checked the approved priority, selection semantics, and capability boundaries.

## Limitations and Decisions
- Documentation delivery only: no roadmap feature was implemented, and none of its future acceptance scenarios was run or marked passed.
- No dependencies installed, builds/tests run, or extension launched. This check provides no runtime or provider-integration evidence.
- Reported defects remain reported symptoms, not established implementation causes.
- Dedicated feature plans must settle implementation details, UML diagram types, interface discovery strategy, and AI deployment/source-data authorization. No code execution, runtime-trace collection, source transmission, publication, or stack change was authorized or performed.

## Completed Update — R14–R18 and Phase 1.5 YAML

### Goal and decisions

Add the user's new ideas and place them in suitable delivery groups without implementing application behavior. The user explicitly authorized this roadmap/constitution update and clarified:
- R17 includes both decorator metadata and class/instance attributes.
- Phase 1.5 means YAML visualization in the extension, not a YAML-formatted roadmap.
- Existing basic parameter navigation should not be duplicated as a new feature. The full R03 parameter-type acceptance is retained for verification, not automatically marked complete.

### Plan as executed

1. Inspected both supplied screenshots, the current roadmap, and mission. R14's example clicks the imported `operators` module and gets an implementation error; R15's example has long source lines extending outside the visible box. Recorded these as reported symptoms, not established runtime causes.
2. Appended the approved update contract to `features/product-roadmap/plan.md` before editing specifications.
3. Added R14 imported-module/file navigation, R15 longest-line code-box sizing, R16 source-position connection anchors, R17 decorator/field navigation, and R18 bottom-right resize handles on every box.
4. Reorganized Phase 1 as follows:

| Group | Scope | IDs |
| --- | --- | --- |
| A | Correctness, Visibility, and Box Sizing | R04, R10, R11, R13, R15, R18 |
| B | Source Navigation and Connection Anchors | R03, R14, R17, R16 |
| C | Canvas Navigation and Graph Interaction | R01, R02, R12, R05, R06, R08 |
| D | Persistence | R09 |

5. Added Phase 1.5 YAML visualization between Phase 1 and Phase 2. YAML node structure, construct coverage, and reference semantics remain dedicated planning decisions. Kept R07/UML/AI in Phase 2 and other languages in Phase 3.
6. Aligned `specs/mission.md` and `specs/tech.md` with the YAML milestone. Corrected R10's old status-text requirement to the later approved signature-only presentation; R18 explicitly preserves resize handles without restoring a fake body.
7. Ran the read-only documentation smoke check, then appended this record after successful validation.

### Validation

Executed a Python documentation smoke script through Eval using `pathlib` and regular expressions. It checked:
- Exactly one entry for every ID R01–R18.
- Exact membership/order of all four Phase 1 groups against the approved plan.
- Phase order 1 → 1.5 → 2 → 3.
- Existing R01–R13 acceptance text retained, except the explicitly superseded R10 presentation.
- Presence of each new requirement, including both R17 targets, token-end anchors, body-independent resize handles, and YAML visualization rather than roadmap export.
- Phase 1.5 alignment and local Markdown links in roadmap, mission, and tech.

Observed successful output:

```text
PASS: R01–R18 unique; groups A/B/C/D match approved mapping; phases 1 → 1.5 → 2 → 3; original acceptance retained except approved R10 update; all six additions and local links checked.
```

### Boundaries

Documentation update only. No application code, dependencies, generated assets, installed extension, or runtime feature status was changed. No extension build or GUI scenario was exercised for this update. Detailed designs—including extreme line widths, off-screen edge anchors, attribute ambiguity, and YAML semantics—remain feature-planning gates rather than invented implementation decisions.

## Completed Update — R19 JavaScript Function-Expression Visualization Failure

The user requested adding this reported bug to Phase 1 Group A, not fixing application code in this update.

### Changes
- Appended the approved update contract to `features/product-roadmap/plan.md` before editing the roadmap.
- Added **R19 — Visualize JavaScript Function-Expression Window Constructors Safely** directly after R04 in `specs/roadmap.md`.
- Recorded the reproduction at `src/web_visualizer/src/vgf/vgf_window_tiled.js`: the parenthesized `VgfWindowTitled` function expression assigns a nested `self.constructor = function() { ... }`; the user reports `Overlapping or out-of-bounds declaration ranges cannot be displayed safely.` on visualization. The source is a function expression, not an immediately invoked function at its declaration.
- Specified future live acceptance for file → `VgfWindowTitled` → nested constructor, correct source partitioning/navigation, and continued rejection of genuinely invalid ranges. Do not suppress the guard, drop valid children, or return placeholders.
- Updated roadmap ID coverage to R01–R19. Group A is now R04, R19, R10, R11, R13, R15, R18; other groups and phases are unchanged.

### Validation

Ran a read-only Python documentation smoke script through Eval. It verified unique R01–R19 entries, exact group membership/order, unchanged R01–R18 feature sections against a pre-edit snapshot, the reproduction path and exact error, and local roadmap links.

```text
PASS: R01–R19 unique; R19 in Group A after R04; existing R01–R18 sections unchanged; other groups preserved; reproduction path/error and roadmap links verified.
```

Documentation only. The user-reported error was accepted as evidence; it was not rerun. No runtime cause was established, no application code changed, and no fix was claimed or tested.

