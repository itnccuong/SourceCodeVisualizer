# Change Log

## Unreleased

- Split Python and TypeScript declarations with bundled syntax parsers without mutating LSP ranges.
- Preserve complete assigned values, return-type braces, Python indentation, and empty implementations.
- Hide the body area for declaration-only TypeScript signatures while retaining their signatures and navigation.
- Partition children in source order without mutating provider arrays; reject crossing/overlapping ranges.
- Use end-exclusive symbol containment and target-file definition-link coordinates for navigation.
- Resolve complete Python assignments when Pylance supplies only a variable's name range.
- Keep multiline decorators compact in diagram titles, with their full source available on hover.
- Extract JavaScript callable assignments with the bundled compiler, flatten only syntax-certified initializer wrappers, and preserve strict overlap checks.
- Open assignment declaration rows at their callable syntax rather than the receiver; normalize webview source positions before lookup.
- Bound cursor-anchored wheel zoom to 20–300% without translation drift at either limit.
- Fit rendered content up to 1200px initial/auto-fit width and 400px body height; resize every window through a frame-owned grip, without an upper limit on manual resizing.
- Preserve manual sizes across focus, zoom, and collapse; scroll code inside the frame while keeping dockers and edges attached.
- Place measured outline/error batches without overlap and pan minimally to reveal new windows.
- Correct multiline source-selection end coordinates after scrolling.
- Restore smooth new-window appearance and eased viewport reveal without changing measured placement; yield immediately to user interaction.
- Pin scrolled-out connection origins to visible scroll boundaries, including nested and horizontal clipping.
- Preserve continuous two-finger canvas panning across boxes and at scroll limits, including fractional touchpad deltas.
- Make camera reveal a visible 450ms ease-in/out transition, starting its clock on the first rendered frame so delayed layout cannot skip the motion.
- Reflow declaration headings and rows with node width: join multiline signatures when wide and wrap when narrow, without changing source text or navigation.
- Separate line numbers into a shared, right-aligned gutter with a 12px code gap; keep code aligned across digit boundaries and preserve source selection.
- Cap every newly created node's fitted width, including long-signature functions and classes; remeasure height after heading wrapping while leaving code bodies source-formatted and scrollable.

## [v0.1.9]

- Fixed zoom on touchpads
- Fixed side scroll on touchpads

## [v0.1.8]

- Added dark color theme

## [v0.1.7]

- hotfix: Made text legible in dark mode.


## [v0.1.6]

- Initial release