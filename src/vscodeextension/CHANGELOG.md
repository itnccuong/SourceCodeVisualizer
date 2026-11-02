# Change Log

## Unreleased

- Split Python and TypeScript declarations with bundled syntax parsers without mutating LSP ranges.
- Preserve complete assigned values, return-type braces, Python indentation, and empty implementations.
- Hide the body area for declaration-only TypeScript signatures while retaining their signatures and navigation.
- Partition children in source order without mutating provider arrays; reject crossing/overlapping ranges.
- Use end-exclusive symbol containment and target-file definition-link coordinates for navigation.
- Resolve complete Python assignments when Pylance supplies only a variable's name range.
- Keep multiline decorators compact in diagram titles, with their full source available on hover.

## [v0.1.9]

- Fixed zoom on touchpads
- Fixed side scroll on touchpads

## [v0.1.8]

- Added dark color theme

## [v0.1.7]

- hotfix: Made text legible in dark mode.


## [v0.1.6]

- Initial release