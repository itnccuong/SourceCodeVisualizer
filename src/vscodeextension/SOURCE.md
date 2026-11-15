# Source and redistribution

This is an independently maintained fork of
[DarkTrick/SourceCodeVisualizer](https://github.com/DarkTrick/SourceCodeVisualizer).
The upstream extension and web visualizer use LGPLv3. Third-party components
retain their respective licenses. See `LICENSE`, `COPYING`, `NOTICE`, and `AUTHOR`
in the source distribution. No upstream endorsement is implied.

## Obtain the source matching your package

Every package built with `npm run package` includes
`source/source-code-visualizer-<version>.tar.gz` inside the extension directory.
Extract that archive into an empty directory. It contains the corresponding
first-party source used for that build, including TypeScript, browser JavaScript
and CSS, the Python build tool, manifests, lockfile, and license inputs.

Installed extensions normally live under `~/.vscode/extensions/` (or the
corresponding remote extension directory). A `.vsix` is a ZIP archive; its
extension files are under `extension/`.

The public fork is https://github.com/itnccuong/SourceCodeVisualizer. Release
maintainers should also publish a matching version tag and source release.
A moving branch is not a substitute for matching released source.

## Build and install a modified version

Requirements: Node.js 24 LTS (or Node.js 22.13+), npm 10+, Python 3 available as
`python3`, a `tar` executable, and network access for the pinned npm dependencies.
The build does not execute the Python examples or deploy YAML.

From the extracted source root:

```sh
npm ci --prefix src/vscodeextension
npm --prefix src/vscodeextension run package
code --install-extension src/vscodeextension/release/source-code-visualizer.vsix --force
```

Disable or uninstall the previous local build before switching extension IDs.
You may install a modified VSIX without Marketplace publication. To redistribute
under your own Marketplace identity, update `publisher`, `name`, the documented
extension ID, and packaging URLs to identities and hosting you control.

Runtime npm dependencies are declared and pinned in the extension manifest and
lockfile. Their original license and notice files remain in their packaged
`node_modules` directories, including TypeScript's additional third-party notices.
Vendored highlight.js uses BSD-3-Clause; Lezer uses MIT; YAML uses ISC;
TypeScript uses Apache-2.0 with its supplied third-party notices.

The runtime TypeScript parser remains version 3.9.10, installed under the npm
alias `typescript-parser`. The separate development-only `typescript` package
compiles the extension and supports the current lint/test tooling; it is not
included in the VSIX. Alias directories retain the original dependency notices.

## Redistribution requirements and limits of this review

Retain upstream attribution and license notices, identify your modifications,
include complete GPLv3/LGPLv3 texts, provide matching corresponding source and
build/install instructions, and preserve third-party license obligations. Do not
use upstream names to imply endorsement. The license texts control; this note
is not legal advice or a certification of compliance.

The dark theme is a modified partial adaptation of Microsoft's MIT-licensed
VS Code Dark / Dark+ themes. The full Microsoft notice and pinned source
references are in the generated `LICENSE` and in
`src/web_visualizer/src/highlightjs/styles/LICENSE` in the source archive.
The exact copied revision is unknown; the reference does not claim otherwise.

The inherited `TextUtils.count` implementation was traced to Victor (Vitim.us)'s
Stack Overflow answer 7924240, with CC BY-SA licensing and no independent
permissive grant established. It is no longer included: its only caller now
counts newline characters directly, without the copied general-purpose helper.
