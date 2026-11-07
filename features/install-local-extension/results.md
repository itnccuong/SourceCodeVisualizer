# Results: Install Source Code Visualizer locally

## Summary
The Source Code Visualizer extension was packaged from source into a standalone VSIX archive and installed into the local VS Code environment. Following initial packaging under the upstream identity, the extension identity, display name, and commands were subsequently customized with distinct `(Local)` identifiers so that the locally built extension can be distinguished unambiguously from the original Marketplace extension and run without command ID collisions.

## Initial Packaging and Installation (Upstream Identity)

1. **Persist Approved Plan**
   - Wrote approved plan to `features/install-local-extension/plan.md`.

2. **Package Extension**
   - Command: `npm --prefix src/vscodeextension run publish`
   - Output: `src/vscodeextension/release/code-visualizer.vsix` (9.4 MB, 231 files).

3. **Install Extension**
   - Command: `code --install-extension ./src/vscodeextension/release/code-visualizer.vsix --force`
   - Result: `Extension 'code-visualizer.vsix' was successfully installed.`
   - Verification: `visualprogrammingx.sourcecodevisualizer@0.1.9` in `code --list-extensions --show-versions`.

---

## Subsequent Customization: Distinct Local Identity

Per user request to distinguish the local build from the upstream/old extension, the extension was renamed and packaged with isolated identifiers:

1. **Manifest and Code Updates**
   - `src/vscodeextension/package.json`:
     - `name`: `"SourceCodeVisualizer-Local"`
     - `displayName`: `"Source Code Visualizer (Local)"`
     - Command IDs: `code-visualizerzer-local.visualize`, `code-visualizerzer-local.visualize.fromContextMenu`, `code-visualizerzer-local.visualizeFile`, `code-visualizerzer-local.visualizeFile.fromContextMenu`
     - Command titles:
       - `Visual Programming: Visualize This (Local)`
       - `Visualize This (Local)`
       - `Visual Programming: Visualize File (Local)`
       - `Visualize File (Local)`
     - Packaging output target: `./release/code-visualizer-local.vsix`
   - `src/vscodeextension/src/visualprogramming/extensionactivator.ts`:
     - Registered commands updated to match `code-visualizerzer-local.*` to prevent command registration collisions if both extensions coexist.
   - `src/vscodeextension/src/test/suite/index.ts`:
     - Updated extension activation ID to `visualprogrammingx.SourceCodeVisualizer-Local`.

2. **Packaging**
   - Command: `npm --prefix src/vscodeextension run publish`
   - Output: `src/vscodeextension/release/code-visualizer-local.vsix` (9.4 MB, 232 files). Clean build without bundler or compiler errors.

3. **Replacement & Installation**
   - Uninstalled previous upstream-named installation:
     `code --uninstall-extension visualprogrammingx.sourcecodevisualizer`
   - Installed new local build:
     `code --install-extension ./src/vscodeextension/release/code-visualizer-local.vsix --force`
   - Result: `Extension 'code-visualizer-local.vsix' was successfully installed.`

4. **CLI Verification**
   - Command: `code --list-extensions --show-versions | grep -i visualprogrammingx`
   - Output: `visualprogrammingx.sourcecodevisualizer-local@0.1.9`

## Runtime Smoke Verification
- **Status**: Not exercised automatically via CLI (requires manual GUI interaction in desktop VS Code).
- **Manual Verification Steps**:
  1. In standard VS Code, reload the window (`Cmd+Shift+P` → `Developer: Reload Window`).
  2. Open the Extensions view (`Cmd+Shift+X`) and verify **Source Code Visualizer (Local)** is listed with identifier `visualprogrammingx.sourcecodevisualizer-local`.
  3. Open a source file (e.g., Python with Pylance active).
  4. Right-click on a function/class or open Command Palette (`Cmd+Shift+P`).
  5. Select **Visual Programming: Visualize This (Local)** or **Visualize This (Local)**.
  6. Confirm the diagram view opens and renders.

## Group B rebuild and local replacement — 2026-11-08

- Rebuilt the current source with `npm --prefix src/vscodeextension run publish`. Inspected successful stitcher, CSS, media-copy, TypeScript, and VSIX stages.
- Recreated `src/vscodeextension/release/code-visualizer-local.vsix`: 236 files, 9.41 MB, version `0.1.9`.
- Installed into regular VS Code with:
  ```sh
  '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' \
    --install-extension ./src/vscodeextension/release/code-visualizer-local.vsix --force
  ```
  CLI reported successful installation.
- `code --locate-extension visualprogrammingx.sourcecodevisualizer-local` resolved to `/Users/nguyencaocuong/.vscode/extensions/visualprogrammingx.sourcecodevisualizer-local-0.1.9`.
- Verified the installed manifest identity and Local commands. Compared the complete installed `out/` tree and visualizer JS/CSS against rebuilt outputs; all matched.
- `unzip -t` reported no archive errors. Loaded the installed Python parser dependency and parsed a synthetic function successfully.
- VSIX SHA-256: `1015d3dfdc71f56fd3db5378a4a608c93432635e2fdcd35f1980e922ca53b947`.
- Existing VS Code windows were not forcibly reloaded. Use **Developer: Reload Window**, then **Visual Programming: Visualize File (Local)** or **Visual Programming: Visualize This (Local)**. This installation check did not repeat the [Group B live diagram acceptance](../phase-one-group-b/results.md).
