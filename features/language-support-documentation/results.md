# Language support documentation results

## Goal

Add matching `Language | Definition detection | Parser component | Status` tables to the repository README and extension README so users can distinguish supported, experimental, and inherited language adapters.

## Executed changes

- Replaced the existing three-column parser table in `README.MD` and `src/vscodeextension/README.md` with identical four-column support tables.
- Covered Python, YAML, JavaScript, TypeScript/TSX, C/C++, Java, PHP, and Dart in eight rows.
- Identified Python and YAML as supported, JavaScript/TypeScript/TSX as experimental, and the inherited generic brace-based adapters as legacy/best-effort.
- Separated language-provider definition lookup from syntax parsing. Clarified that YAML follows source structure/aliases rather than executing Helm or discovering Kubernetes dependencies.
- Documented the runtime TypeScript 3.9.10 parser and its newer-syntax limitation. Clarified that supported scenarios are not an unconditional parsing guarantee and that legacy adapters remain enabled.

## Validation actually performed

- Checked the shipped language registrations in `providerregistrer.ts` and the architecture's parser/source-mapping descriptions before editing.
- Parsed both README sections with the installed `marked` Markdown renderer. Their support sections are byte-identical, each table has the exact four requested headers, and each has eight data rows with four cells.
- Opened the rendered section in a real browser, checked all headers and eight body rows, and inspected a screenshot. The table had no horizontal page overflow at the preview viewport.
- Closed the temporary browser preview. No temporary files or permanent tests were added.

## Limits

Documentation only: no adapters were removed, runtime behavior changed, package version incremented, VSIX rebuilt, or Marketplace content uploaded. The live Marketplace README will acquire this table only after a new version is packaged and uploaded. This is a support-status clarification based on the existing implementation and validation history, not a new compatibility audit.

## Revision: group languages by support status

- Consolidated both tables into three identical rows: **Python/YAML — Supported**, **JavaScript/TypeScript/TSX — Experimental**, and **C/C++/Java/PHP/Dart — Legacy / best effort**.
- Kept Python and YAML's distinct definition-detection and parser components explicit with labeled line breaks inside their shared row. Preserved the YAML scope restriction, TypeScript parser-version limitation, and C/C++ parsing caveat.
- Ran the installed `marked` renderer against both sections: exact section equality, three rows, four cells per row, expected language groups, and two rendered Python/YAML line breaks all passed.
- Documentation only; no runtime, package, or Marketplace changes.


## Release build: 0.2.2

- At the user's request, bumped the extension manifest, lockfile root metadata, private workspace version, and release notice from the already-published 0.2.1 to **0.2.2**. Added the documentation change to the changelog.
- The initial package build failed because duplicate installed type directories (`mocha 2`, `node 2`, `vscode 2`) were being discovered as implicit type libraries. Inspected those directories, then restored dependencies with `npm --prefix src/vscodeextension ci --ignore-scripts`; no TypeScript errors were suppressed and no parser logic changed.
- `npm --prefix src/vscodeextension run package` then succeeded, including webview/extension compilation and notice/source generation.
- Inspected the actual VSIX: **11,066,341 bytes**, manifest version **0.2.2**, current three-row support table matching the extension README exactly, and the current stacked-file PNG icon. Exactly one corresponding source archive is included, for 0.2.2; archived READMEs, manifest, and lockfile match their current originals.
- Ready for manual Marketplace upload at `src/vscodeextension/release/source-code-visualizer.vsix`. Nothing uploaded or published by the assistant. No runtime tests were rerun for this documentation/version-only release.

