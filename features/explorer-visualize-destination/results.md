# Explorer Visualize This with canvas selection

## Goal
Expose Visualize This in the Explorer file context menu and offer the same New/existing canvas destination picker used by editor visualization.

## Executed changes
- `src/vscodeextension/package.json`: added file-only Explorer command `code-visualizerzer-local.visualize.fromExplorer`, titled **Visualize This (Local)**. This context-specific command is hidden from the Command Palette so it is not offered without a file URI. Existing Visualize File remains unchanged.
- `src/vscodeextension/src/visualprogramming/extensionactivator.ts`: registered the Explorer handler and added `VpTabManager.visualizeFileWithDestination(uri)`. It reuses `chooseCanvasForVisualization`, then opens the captured Explorer URI and visualizes the full file in the chosen tab. It never substitutes the active editor's document. Picker cancellation returns before opening the document. File-open/visualization errors report their reason.

## Validation
- Requested LSP references before changing the exported manager API; no language server was available.
- `npm run build:ext`: browser build/media copy/TypeScript compilation passed.
- Real installed VS Code development host with two temporary TypeScript files:
  - Opened `active.ts` in the editor and opened the Explorer context menu on `chosen.ts`.
  - Observed both Visualize File (Local) and Visualize This (Local); screenshot inspected. Used custom menu rendering in the isolated verification profile.
  - Visualize This opened **Select a canvas for Visualize This** with New canvas.
  - Chose New: `Code Diagram — New-1` rendered only `chosen.ts`, including its distinct `CHOSEN_EXPLORER_FILE` body, not the active editor's file.
  - Invoked the Explorer action for `active.ts` and selected existing New-1: the single existing canvas then contained both file nodes, Nodes (2). No second canvas was created.
  - Cancelled another Explorer picker: only New-1 remained and the picker closed.
- Temporary source fixtures were removed after shutting down the verification host. No repository source fixtures were added.
- `npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix`: build hooks and packaging passed (248 files, 9.46 MB).
- `code --install-extension src/vscodeextension/release/code-visualizer-local.vsix --force`: installed successfully.

## Behavior boundary
Explorer supplies a file, not an editor text selection; this action visualizes that entire file and asks for its canvas destination. The editor's existing Visualize This continues to use its captured text selections. Reload the regular VS Code window to activate the installed menu contribution.

## Correction: one Explorer action
The user requested a single button, not two. Removed the obsolete Explorer Visualize File menu contribution, command registration, manager handler, and now-unused `visualizeDocumentFromUri` wrapper. The retained **Visualize This (Local)** action still opens the New/existing canvas picker for the clicked file. The unrelated palette Visualize File command is unchanged.

Verified the actual file context menu in a fresh development host: exactly one visualization action, **Visualize This (Local)**. Invoking it opened **Select a canvas for Visualize This** with New canvas; cancellation closed the picker. Screenshot inspected. VSIX packaging/build hooks passed and the rebuilt package installed successfully. Earlier two-entry observations above describe the superseded implementation.
