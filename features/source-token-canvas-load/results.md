# Source-token canvas loading and palette entry

## Requested behavior
- Fix loading `/Users/nguyencaocuong/Downloads/canvas.scv-canvas.json`, which reported `this._surfaces.entries is not a function or its return value is not iterable`.
- Provide a discoverable Load from Canvas command in Cmd+Shift+P that works without an existing canvas.

## Executed changes
- `src/web_visualizer/src/utils/source_navigation.js`: `SourceNavigation.restore` no longer attempts to iterate its WeakMap. It queries the restored owner frame's `[data-vp-source-surface]` descendants, retrieves their states from the weak registry, and retains owner/range/kind/hash/token consistency checks. This preserves weak-reference cleanup and does not create a global strong registry.
- `src/vscodeextension/package.json`: renamed the global command title to **Visual Programming: Load from Canvas (Local)**. Existing command ID `code-visualizerzer-local.loadCanvas` and its manager-owned, no-canvas-required handler remain unchanged. Toolbar loading is still available.
- `src/web_visualizer/tests/canvas_graph_interaction.html`: regression covers exact source-token rebinding scoped to one frame, hidden source, changed hashes, inconsistent offsets, ambiguous surfaces, and disposal of a matching surface.

## Observed validation
- `npm run build:ext`: browser bundle/CSS generation, media copy, and TypeScript compile passed.
- Chromium browser fixture: **21 passed, 0 failed**.
- Started installed VS Code with an isolated fresh development profile, debugging port 9345, and the built extension. Before loading, tabs contained only Welcome and **zero canvas tabs**.
- Opened Command Palette and searched **Load from Canvas**. The matching **Visual Programming: Load from Canvas (Local)** entry appeared and opened the real VS Code file dialog.
- Selected the user's exact Downloads file without modifying it. A separate `Code Diagram — canvas.scv-canvas.json` tab opened, showing **Nodes (8)** and eight rendered connection lines, with no browser errors. Screenshot inspected.
- Seven source outlines rendered; the saved `activate` node remained an explicit Source unavailable card reporting `Declaration "activate" could not be resolved at saved coordinates`. Its frame/relationships were retained. No alternate declaration was substituted. The load itself completed; this run does not claim that every saved source reference resolved.
- File dialog verification used `files.simpleDialog.enable=true`; macOS native sheets were not exercised.
- `npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix`: passed all build hooks and produced a 248-file, 9.46 MB VSIX.
- `code --install-extension src/vscodeextension/release/code-visualizer-local.vsix --force`: installed successfully.

## Decisions and limits
The earlier declaration-edge round trip did not exercise source-token edge restoration. This regression explicitly covers that separate path. Saved source identity checks remain strict, including explicit unavailable states. No Python extraction behavior or analyzed source file was changed. Reload the regular VS Code window to activate the installed package and updated palette title.
