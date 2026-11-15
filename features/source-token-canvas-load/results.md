# Source-token canvas loading and palette entry

## Requested behavior
- Fix source-token canvas loading failing with `this._surfaces.entries is not a function or its return value is not iterable`.
- Provide a discoverable Load from Canvas command in Cmd+Shift+P that works without an existing canvas.

## Executed changes
- `src/web_visualizer/src/utils/source_navigation.js`: `SourceNavigation.restore` no longer attempts to iterate its WeakMap. It queries the restored owner frame's `[data-vp-source-surface]` descendants, retrieves their states from the weak registry, and retains owner/range/kind/hash/token consistency checks. This preserves weak-reference cleanup and does not create a global strong registry.
- `src/vscodeextension/package.json`: exposes the global **Visual Programming: Load from Canvas** command, currently `source-code-visualizer.loadCanvas`. Its manager-owned handler requires no existing canvas; toolbar loading remains available.
- `src/web_visualizer/tests/canvas_graph_interaction.html`: regression covers exact source-token rebinding scoped to one frame, hidden source, changed hashes, inconsistent offsets, ambiguous surfaces, and disposal of a matching surface.

## Observed validation
- Chromium browser fixture: **21 passed, 0 failed**.
- In a live installed VS Code development host with zero canvas tabs, the Command Palette Load from Canvas action appeared and opened the real file dialog.
- Loading the reported saved canvas opened a separate tab with eight nodes and eight connection lines, with no browser errors.
- Seven source outlines rendered; saved `activate` remained an explicit **Source unavailable** card reporting `Declaration "activate" could not be resolved at saved coordinates`. Its frame/relationships were retained; no alternate declaration was substituted. A successful graph load does not imply every source reference resolved.
- File dialog verification used `files.simpleDialog.enable=true`; macOS native sheets were not exercised.

## Decisions and limits
The earlier declaration-edge round trip did not exercise source-token edge restoration. This regression covers that separate path. Saved source identity checks remain strict, including explicit unavailable states. No Python extraction behavior or analyzed source file changed.
