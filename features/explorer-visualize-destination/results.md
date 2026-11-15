# Explorer Visualize This with canvas selection

## Goal
Expose Visualize This in the Explorer file context menu and offer the same New/existing canvas destination picker used by editor visualization.

## Executed changes
- `src/vscodeextension/package.json`: file-only Explorer command `source-code-visualizer.visualize.fromExplorer`, titled **Visualize This**, is the sole Explorer visualization action. It is hidden from the Command Palette because it requires a file URI. The unrelated palette Visualize File command remains unchanged.
- `src/vscodeextension/src/visualprogramming/extensionactivator.ts`: registered the Explorer handler and added `VpTabManager.visualizeFileWithDestination(uri)`. It reuses `chooseCanvasForVisualization`, then opens the captured Explorer URI and visualizes the full file in the chosen tab. It never substitutes the active editor's document. Picker cancellation returns before opening the document. File-open/visualization errors report their reason.

## Validation
- Real installed VS Code development host with two temporary TypeScript files:
  - Opened `active.ts` in the editor and opened the Explorer context menu on `chosen.ts`.
  - The final file context menu contained exactly one visualization action.
  - Visualize This opened **Select a canvas for Visualize This** with New canvas.
  - Chose New: `Code Diagram — New-1` rendered only `chosen.ts`, including its distinct `CHOSEN_EXPLORER_FILE` body, not the active editor's file.
  - Invoked the Explorer action for `active.ts` and selected existing New-1: the single existing canvas then contained both file nodes, Nodes (2). No second canvas was created.
  - Cancelled another Explorer picker: only New-1 remained and the picker closed.

## Behavior boundary
Explorer supplies a file, not an editor text selection; this action visualizes the entire clicked file and asks for its canvas destination. Editor Visualize This continues to use captured text selections. The obsolete Explorer Visualize File contribution, command registration, manager handler, and unused `visualizeDocumentFromUri` wrapper were removed; there are not two competing Explorer actions.
