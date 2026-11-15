# Heading navigation and smooth reveal repair

## Goal
Restore opening nodes from heading parameters and the existing slow camera reveal after new connected nodes arrive.

## Executed changes
- Header gesture exclusion now uses `[data-vp-source-surface]`, the marker assigned by `SourceNavigation.bind`, rather than an unassigned class. Source text keeps native selection and double-click navigation; non-source header chrome retains group dragging and component selection.
- Connection creation, redocking, request cancellation, and declaration-origin serialization resolve owning frames through `.closest('.Window_OuterFrame')`. Previously these paths called the instance-only `getTopLevelWindow` helper as a static method. Connection creation could throw before the response handler reached `WindowPositioner.revealWindow`.
- Retained the existing 450 ms eased reveal, cancellation rules, and reduced-motion behavior. No new camera animation was introduced.
- Added browser regressions for real connection registration/redocking and heading pointer input not being consumed by group dragging.

## Validation
- Chromium `tests/canvas_graph_interaction.html`: 16 passed, 0 failed.
- Native double-click on `param1` in a source-backed rendered heading retained the original URI and range `(10,53)`–`(10,59)`. A simulated host reply created two real node frames and one registered edge without browser errors.
- With reduced motion disabled, camera sampling observed intermediate positions over approximately 450 ms. With reduced motion enabled, reveal was immediate.

## Verification boundary
The interaction smoke exercised real browser event handling, graph creation, and camera animation with a simulated host response. It did not exercise Pylance or a live VS Code definition provider. No Python extraction code changed.
