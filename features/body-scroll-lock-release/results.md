# Body scroll lock release

## Goal
Clicking outside a source body must release wheel ownership so ordinary wheel input pans the canvas again. Clicking another source body must transfer ownership.

## Executed change
Changed the document capture listener and its cleanup in `src/web_visualizer/src/vgf/vgf_navigationarea.js` from `mousedown` to `pointerdown`. Canvas selection and header pointer handlers call `preventDefault()`, which can suppress compatibility mouse events. Lock selection now runs before those handlers. Wheel routing itself is unchanged.

Added a regression to `src/web_visualizer/tests/canvas_graph_interaction.html` that locks a real frame body, verifies wheel input does not pan, sends outside pointer input without mousedown, and verifies wheel panning resumes.

## Validation
- Chromium `tests/canvas_graph_interaction.html`: **14 passed, 0 failed**.
- Native mouse/wheel input on `python_basic_show_function.html`: clicking a body applied one lock and wheel input left the camera stationary. Clicking outside removed the lock; subsequent wheel input panned the camera.
- Clicking between two source bodies retained exactly one lock, owned by the second body.

No Python extraction code changed. Runtime interaction verification used the browser surface, not a live VS Code extension host.
