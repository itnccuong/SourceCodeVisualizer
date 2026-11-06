# Install Source Code Visualizer locally

## Context
The user wants to use this repository as an installed extension in ordinary VS Code, not in an Extension Development Host. Package the existing extension as a VSIX and install it locally; do not publish to the Marketplace or change extension source, identity, or version.

## Findings
- `src/vscodeextension/package.json` declares `visualprogrammingx.SourceCodeVisualizer`, version `0.1.9`, display name `Source Code Visualizer`, and entry point `./out/extension_main.js`.
- Its `publish` npm script runs `vsce package -o ./release/code-visualizer.vsix`; despite the script name it does not upload anything. `prepublish` builds the webview and extension and generates/copies license files; `postpublish` writes the release version file. `vscode:prepublish` also invokes compilation during packaging.
- Build dependencies and the local `vsce` executable are already present under `src/vscodeextension/node_modules/.bin`. The current shell exposes Node `v26.10.0`, npm `11.19.1`, Python `3.9.13`, and `/usr/local/bin/code`.
- `README.MD` documents installing a release file through Extensions → Install from VSIX and using the editor-context command `Visualize This`.
- No build, package creation, or extension installation has been run during planning.

## Approach
1. After approval, persist this approved plan to `features/install-local-extension/plan.md` before running commands, as required by `specs/context.md`. Retain the same scope: local packaging and installation only.
2. From the repository root, run `npm --prefix src/vscodeextension run publish`. Reuse the existing packaging pipeline; do not use `npm publish` or `vsce publish`. The expected artifact is `src/vscodeextension/release/code-visualizer.vsix`. Inspect the build output for Python bundler errors even if the overall command exits successfully: the canvas build uses semicolons that can mask earlier failures. If compilation or packaging reports an error, stop installation and report the exact error rather than installing stale output or silently modifying source/dependencies.
3. Install the artifact into normal VS Code with `code --install-extension ./src/vscodeextension/release/code-visualizer.vsix --force`. This deliberately replaces the installed copy of the same extension ID in the CLI's default VS Code profile. If the CLI cannot connect to the intended desktop installation, use that VS Code window's Extensions panel → … → Install from VSIX… and select the same artifact instead; do not copy directories into VS Code's extensions folder.
4. In ordinary VS Code, reload the window if requested. Open a source workspace, place the caret on a function/class name, and run `Visual Programming: Visualize This` from the Command Palette or right-click → `Visualize This`. Python workspaces need Python/Pylance language providers; the visualizer is not itself a Python language server. Do not use F5 or launch an Extension Development Host.
5. Future source edits require running the same package and install commands again, followed by reloading VS Code. Installed copies do not follow source changes automatically. Do not change the publisher, extension ID, or version just for this local installation.

## Verification
- Working directory for all commands: repository root. No special environment variables are required.
- Packaging: observe the webview build, TypeScript compilation, and VSIX creation succeed, with no masked bundler errors. The artifact must exist at the exact path from step 2.
- Installation: observe a successful VS Code CLI installation result; run `code --list-extensions --show-versions` and confirm an entry matching `visualprogrammingx.sourcecodevisualizer@0.1.9` case-insensitively. CLI success alone does not prove the diagram works.
- Runtime smoke: in a normal, non-debug VS Code window, use `Visualize This` on a supported function/class and observe the diagram render; close and reopen VS Code and confirm the extension remains installed. If UI control is unavailable, report this runtime smoke as not exercised and give the exact manual action; never claim it passed from CLI output alone.
- No source changes are planned, so no new tests are needed. Record executed commands and observed results in `features/install-local-extension/results.md` only after packaging and installation work and available verification finish; distinguish manual checks not exercised.

## Assumptions & contingencies
- Use the CLI's default VS Code profile. If the user instead wants another profile or a VS Code-compatible editor, use that editor/profile's Install from VSIX action with the same artifact, without changing package contents.
- A previously installed Marketplace copy with the same ID will be replaced by the local VSIX. To preserve this local build against Marketplace updates, disable auto-update for this extension if that control is available in the user's VS Code version.
- Existing dependencies are reused; do not install or upgrade tools speculatively. If packaging fails, expose the actual blocker rather than broadening this task into dependency repair without user direction.
