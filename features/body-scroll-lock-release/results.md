# Body scroll lock release

## Goal
Clicking outside a source body must release wheel ownership so ordinary wheel input pans the canvas again. Clicking another source body must transfer ownership.

## Executed change
Changed the document capture listener and its cleanup in `src/web_visualizer/src/vgf/vgf_navigationarea.js` from `mousedown` to `pointerdown`. Canvas selection and header pointer handlers call `preventDefault()`, which can suppress compatibility mouse events. Lock selection now runs before those handlers. Wheel routing itself is unchanged.

Added a regression to `src/web_visualizer/tests/canvas_graph_interaction.html` that locks a real frame body, verifies wheel input does not pan, sends outside pointer input without mousedown, and verifies wheel panning resumes.

## Validation
- `npm run build:web`: passed.
- Chromium fixture `http://127.0.0.1:8091/tests/canvas_graph_interaction.html`: 14 passed, 0 failed.
- Actual mouse/wheel input on `python_basic_show_function.html`: body click produced one lock; wheel outside retained camera top at -193px while locked; outside click removed the lock; subsequent wheel moved camera top to -249px. Screenshot inspected.
- Mouse clicks between the original body and a second DOM-cloned body: exactly one lock remained, owned by the second body.
- `npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix` from `src/vscodeextension`: browser build, media copy, TypeScript compile, and packaging passed.
- `code --install-extension src/vscodeextension/release/code-visualizer-local.vsix --force`: installed successfully.

No Python extraction code changed. Runtime interaction verification used the browser surface; the installed VS Code window still needs reloading to run the updated bundle.
