# Restore plain canvas drag panning

## Goal and acceptance

Restore dragging on empty canvas to move the view, rather than requiring Space or a middle mouse button. Preserve rectangle selection, node movement, and popup handling.

## Plan as executed

1. Empty-canvas left/right/middle drag pans; Shift+left drag performs rectangle selection. Space+left remains a pan override.
2. Panning preserves selected nodes. A plain primary click without a drag clears group selection; cancellation does not clear it.
3. Gestures reuse pointer capture, movement, cancellation, and background context-menu suppression. Node/header/control exclusions remain unchanged.
4. Regression coverage includes gesture deltas, selection retention/clearing, cancellation, and node/popup exclusions.

## Changes

- `src/web_visualizer/src/vp/canvas_selection.js`: button/modifier dispatch and click-versus-drag selection clearing.
- `src/web_visualizer/tests/canvas_graph_interaction.html`: left/right/middle drag deltas, selection retention, empty click clearing, Shift marquee, cancellation, node exclusion, and right-button popup exclusion.
- `README.MD`, `docs/architecture-and-development.md`, `src/vscodeextension/CHANGELOG.md`: controls and contract.

## Observed validation

- Chromium `tests/canvas_graph_interaction.html`: **25 passed, zero failed**.
- Native mouse/keyboard input on the actual browser renderer, `tests/python_basic_show_function.html`: left/right drags moved the camera by their screen deltas without a marquee. Shift+left drag selected the enclosed source window, left the camera unchanged, and removed the marquee on release.

## Decisions and limits

Node context menus already suppress the browser-native menu through `VgfWorld`; gesture tests assert node/popup exclusion rather than adding duplicate suppression. No Python extraction, source coordinates, or node-header dragging implementation changed. Native interaction was verified in the browser renderer, not a fresh VS Code development host.
