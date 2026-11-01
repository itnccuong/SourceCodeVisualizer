## Context
Create `specs/mission.md` and `specs/tech.md` under the user-directed constitution rules in `specs/context.md`. The user wants to improve this existing VS Code extension: small Python-first improvements and local validation before planning Marketplace publication, then UML and AI-assisted source analysis, then other languages. Retain the existing stack; AI does not execute the analyzed code, and UML types and AI deployment/data policy are deliberately deferred. This task creates the two constitution documents, not application features or `specs/roadmap.md`.

## Grounded Findings
- `specs/context.md:26-32` protects constitution files and permits this explicit user-directed work. The on-disk version read during planning differs from the initial supplied snapshot: lines 38-43 and 72 now require saving an approved plan in `features/<feature-name>/plan.md` before implementation. Preserve these rules without editing the context file.
- `README.MD:1-71` describes a VS Code diagram extension, identifier navigation, Python support, other languages with caveats, and historical planned features. Do not promote that historical list to approved scope.
- `docs/architecture-and-development.md:5-98` documents the VS Code UI / extension-host / webview split, definition and document-symbol providers, language adapters, and asynchronous host/webview messages.
- `package.json:6-11` defines the root build, server, and extension-test commands. `src/vscodeextension/package.json:66-97` declares TypeScript, ESLint, Mocha, VS Code integration-test tools, and vsce packaging. `src/vscodeextension/tsconfig.json:2-11` enables strict TypeScript, CommonJS, ES6, and source maps.
- `src/web_visualizer/package.json:21-35` uses Python jsstitcher, concatenated CSS, and a Python development server. The architecture guide at lines 228-243 distinguishes editable sources, generated bundles, handwritten bridge files, and browser fixtures.
- The user selected: VS Code extension, Python first, retain current stack, AI source analysis without execution, UML broadly with diagram types selected later. The user explicitly deferred AI deployment and data-handling decisions.

## Approach
### 1. Persist the approved execution contract
After approval and restoration of repository write access, reread `specs/context.md` and inspect `specs/` and `features/`. Save this approved plan in full as `features/project-constitution/plan.md` before creating either constitution file, following the current workflow. This is a real task record, not an example directory. Use the canonical local plan as the content source; do not replace its substance with a summary or internal link.

### 2. Establish the mission
Create `specs/mission.md` with the exact Markdown below. Its phases describe user-approved direction, not a feature schedule or delivery promise. No specific Phase 1 features, UML diagram types, or Phase 3 languages have been selected.

```markdown
# Project Mission

## Purpose
Evolve the existing Source Code Visualizer VS Code extension with useful, incremental improvements that help developers explore and understand source code through interactive diagrams. Build on the current repository, prioritize Python, and prove improvements locally before preparing for wider distribution.

## Product Focus
- VS Code is the product environment; a standalone web application is not an approved product target.
- Python is the first-priority language. Existing adapters for other languages are not a promise of equal support or reliability.
- Improve the existing extension rather than replace it with an unrelated product or rewrite its stack.

## Development Direction
### Phase 1 — Incremental Improvements and Local Validation
Implement small, immediately actionable improvements to the current extension, with Python as the primary use case. Run and validate the changed behavior locally in VS Code. Use that evidence to prepare a plan for publication to the VS Code Extension Marketplace; publication itself is not an already-completed milestone or an automatic action.

Individual features and their acceptance criteria are selected through dedicated feature planning, not prescribed by this constitution.

### Phase 2 — UML and AI-Assisted Source Analysis
Introduce UML views and AI-assisted analysis of source code beyond the information currently supplied through VS Code language providers. This direction does not require executing the analyzed code or collecting runtime traces. AI-derived relationships and behavior are inferences, not observed execution evidence.

Select UML diagram types during dedicated feature planning. AI providers, local versus cloud deployment, and source-data handling require future planning; this mission approves no particular choice.

### Phase 3 — Additional Languages
Expand attention to languages beyond Python after the Python-first work. Select languages and their support expectations during later planning rather than promise parity across the existing adapters.

## Evidence of Progress
- A Phase 1 improvement delivers its agreed behavior in the locally running extension, with validation recorded before being described as complete.
- Marketplace preparation follows local validation; a successful local run is not evidence of a published release.
- UML and AI-assisted analysis remain future targets until their individual features are designed, implemented, and validated.
- Additional-language support is described according to demonstrated capability rather than adapter presence alone.

## Related Constitution
- [Project context and agent workflow](context.md)
- [Approved technology and constraints](tech.md)
```

### 3. Establish the retained technical baseline
Create `specs/tech.md` with the exact Markdown below. This follows the mission file, so all constitution links resolve once both are created. Reuse the architecture guide for procedural detail rather than duplicating it. No application symbols, signatures, dependencies, compiler settings, or package scripts change.

```markdown
# Technology and Constraints

## Approved Baseline
Retain the existing stack and architecture while improving the VS Code extension. This is approval to build on the current implementation, not a requirement to freeze historical dependency versions indefinitely or permission to replace the stack during ordinary feature work.

| Area | Retained baseline |
| --- | --- |
| Product host | VS Code extension and extension-host runtime |
| Extension implementation | TypeScript; current compiler configuration uses strict checking, CommonJS modules, an ES6 target, and source maps |
| Diagram UI | Existing plain JavaScript/CSS webview and visualizer components |
| Code information | VS Code definition and document-symbol providers, supplemented by language-specific adapters; Python first |
| Visualizer build | Existing Python jsstitcher pipeline and CSS concatenation |
| Development tooling | Existing npm scripts, TypeScript compiler, ESLint, Mocha, and VS Code integration-test tooling |
| Distribution tooling | Existing vsce-based VSIX packaging workflow; Marketplace publication is a separately planned activity |

Package manifests and compiler configuration are the source of truth for currently declared versions and settings. This document introduces no version upgrades or new minimum runtime versions.

## Architectural Boundaries
- VS Code owns editor commands and source navigation. The extension host obtains code information, prepares outline data, and manages webviews. The webview renders diagrams and handles diagram interaction.
- Preserve asynchronous message passing across the extension-host/webview boundary; these runtimes do not call each other's functions directly.
- Reuse VS Code language providers and the existing adapter approach. A language adapter is not itself a language server, and the current provider-based path is not runtime execution tracing.
- The standalone browser fixture supports visualizer development with emulated backend data; it does not establish a standalone product or prove live Python analysis.

## Source and Generated Assets
Edit original extension source in `src/vscodeextension/src/` and visualizer source in `src/web_visualizer/src/`.

Do not implement permanent fixes in generated extension output under `src/vscodeextension/out/`, visualizer build output under `src/web_visualizer/release/`, or copied `web_visualizer.js` / `web_visualizer.css` files under `src/vscodeextension/media/`. Rebuild them from source. Other files in `media/` can be handwritten, including `scriptsVscDependant.js`; do not classify the entire directory as generated.

## Development and Validation
The existing development toolchain uses Node.js/npm and Python 3. Live Python definition and symbol information depends on installed Python language tooling in VS Code.

Run these existing commands from the repository root as appropriate to the change:

| Command | Purpose and limit |
| --- | --- |
| `npm run build:ext` | Build visualizer assets, copy them into the extension, and compile extension TypeScript |
| `npm run build:web` | Build visualizer assets for canvas-only development |
| `npm run serve:web` | Serve the browser fixtures on port 8080; does not build first |
| `npm run test:ext` | Compile and lint, then invoke the existing VS Code integration-test launcher; requires its external tooling/environment |

Validate extension behavior in a local VS Code Extension Development Host, not only through compilation or browser fixtures. Use the documented save → stop debugging → F5 → visualize loop; saving alone does not hot-reload the full extension and webview.

The current integration-test runner targets VS Code 1.61.1 and installs Python tooling. That is an existing test-harness constraint, not a newly selected long-term compatibility policy. The visualizer build contains semicolon-separated commands that can mask earlier failures; inspect build output rather than trusting its final exit status alone.

See [Architecture and Development](../docs/architecture-and-development.md) for build prerequisites, debugging, message flow, and the detailed source/output map. Record actual validation and limitations under the [project workflow](context.md).

## Future Capability Boundaries
Phase 2 targets UML views and AI-assisted source analysis, not execution of the analyzed code or runtime-trace collection. Keep AI inference distinguishable from observed execution; do not describe predicted behavior as runtime evidence.

UML diagram types and AI providers, deployment model, and source-data handling are intentionally deferred to future user-directed planning. This document does not approve a cloud service, a local model requirement, transmission of source data, or a new AI dependency. These decisions are not prerequisites for the Phase 1 improvements.

Phase 3 broadens language support beyond Python. No additional language priority or support-parity promise is established here.

## Constitution Changes
Follow [Project Context](context.md) for ownership and approvals. If a proposed feature conflicts with this baseline, obtain user direction rather than silently changing the constitution or replacing the approved stack. Product purpose and phase direction are defined in [Project Mission](mission.md).
```

## Verification
This is documentation-only work; do not install dependencies, run a build, launch the extension, or claim runtime verification for this change.

1. Read both rendered/raw Markdown files and compare their content against the approved payloads above. Confirm the mission communicates all three phases, Python-first priority, local validation before publication planning, and the VS Code product boundary.
2. Confirm the technical document retains the existing stack, distinguishes static AI inference from runtime observation, and explicitly defers UML types and AI deployment/data policy. Neither file may invent selected features, vendors, language priorities beyond Python, dates, or claims of current UML/AI functionality.
3. Run this read-only documentation smoke check from the repository root, using the existing `python3` executable and no environment variables or fixtures:

```sh
python3 -c 'from pathlib import Path; import re; paths = [Path("specs/mission.md"), Path("specs/tech.md")]; required = {paths[0]: ["## Purpose", "### Phase 1", "### Phase 2", "### Phase 3"], paths[1]: ["## Approved Baseline", "## Architectural Boundaries", "## Future Capability Boundaries"]}; [(p.read_text(encoding="utf-8")) for p in paths]; missing = [f"{p}: {s}" for p, sections in required.items() for s in sections if s not in p.read_text(encoding="utf-8")]; broken = [f"{p}: {target}" for p in paths for target in re.findall(r"\]\(([^)]+)\)", p.read_text(encoding="utf-8")) if not (p.parent / target).exists()]; assert not missing, missing; assert not broken, broken; print("PASS: both constitution files exist, expected sections are present, and all relative links resolve")'
```

Input: the newly created constitution files. Expected observable output: the exact `PASS` line, exit status 0. This checks document delivery and navigation, not application behavior.
4. Confirm the approved repository plan is present and preserves this execution contract. Do not change `specs/context.md`, `AGENTS.md`, existing supporting documents, application source, package configuration, or create `specs/roadmap.md` as part of these constitution contents.

## Assumptions and Contingencies
- The user approved English-language technical planning through this conversation; use the exact English payloads above, without selecting additional product policy.
- UML diagram types and AI deployment/data-handling policy are deliberately undecided. Record that boundary as supplied; do not ask the implementer to choose or implement an integration.
- At discovery, `specs/` contained only `context.md` and `features/` was empty. If either target constitution file or `features/project-constitution/plan.md` exists at execution time, read it before writing: preserve unrelated user content and integrate only compatible approved content; if its decisions conflict with this plan, stop the conflicting edit and obtain user direction rather than overwrite it.
- Reread the current workflow before implementation. Preserve intervening user changes; if its record requirements change again, follow the current requirements unless they conflict with this explicitly approved scope, in which case seek direction before making the conflicting change.
