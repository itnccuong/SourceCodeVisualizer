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
