# Heading navigation and smooth reveal repair

## Goal
Restore opening nodes from heading parameters and the existing slow camera reveal after new connected nodes arrive.

## Executed changes
- Header gesture exclusion now uses `[data-vp-source-surface]`, the marker assigned by `SourceNavigation.bind`, rather than an unassigned class. Source text keeps native selection and double-click navigation; non-source header chrome retains group dragging and component selection.
- Connection creation, redocking, request cancellation, and declaration-origin serialization resolve owning frames through `.closest('.Window_OuterFrame')`. Previously these paths called the instance-only `getTopLevelWindow` helper as a static method. Connection creation could throw before the response handler reached `WindowPositioner.revealWindow`.
- Retained the existing 450 ms eased reveal, cancellation rules, and reduced-motion behavior. No new camera animation was introduced.
- Added browser regressions for real connection registration/redocking and heading pointer input not being consumed by group dragging.

## Validation
- `npm run build:web`: passed.
- Chromium `tests/canvas_graph_interaction.html`: 16 passed, 0 failed.
- Temporary standalone fixture used the real bundle, native double-click on `param1` in a rendered heading, and a simulated host reply with an existing fixture outline. The request retained URI `file:///usr/myfile.py` and range `(10,53)`–`(10,59)`. Two real node frames and one registered edge rendered without browser errors.
- With reduced motion disabled through Chromium media emulation, sampled 29 camera-change frames over 452 ms. Camera left progressed from -119.5 px through -516.536 px to -885 px. With reduced motion enabled, the target was revealed immediately. The target screenshot was inspected. Temporary fixture removed afterward.
- `npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix` from `src/vscodeextension`: browser build, media copy, TypeScript compile, and VSIX packaging passed.

## Verification boundary
The interaction smoke exercised real browser event handling, graph creation, and camera animation with a simulated host response. It did not exercise Pylance or a live VS Code definition provider. No Python extraction code changed.
