# Results: Phase 1.5 — YAML Language Support

## Goal and scope

Add plain `.yaml`/`.yml` exploration to the existing canvas, including multi-document streams and same-document anchors/aliases. Containers become navigable windows; scalar settings remain original source. This does not infer cross-file or domain-specific relationships, expand merge keys, or execute Helm/Jinja templates.

The [approved plan](plan.md) defines the provider, identity, and rejection contracts.

## Summary of executed work

### Source-preserving provider

- Added production dependency `yaml@1.10.3` and `VpOutlineProviderYaml` in `src/vscodeextension/src/outlineproviders/outlineprovideryaml.ts`, registered for `yaml` in `providerregistrer.ts`. It implements the full outline-provider interface, not an LSP-only adapter or a global VS Code symbol/definition provider.
- Uses AST node identity and CST original offsets (`origStart ?? start`, `origEnd ?? end`) rather than deserialized values or regenerated YAML. CRLF/UTF-16 coordinates, literal delimiters, comments, separators, and source gaps remain source-backed.
- Projects mappings, sequences, collection items, and empty collections into existing outline types, with distinct declaration starts and strict containment/non-overlap checks. Scalar fields and the first scalar setting of a collection item remain visible source. Later container endpoint correction uses semantic CST `valueRange` ends so dedented trivia stays in enclosing gaps.
- Rejects parser errors, warnings, and non-scalar keys before displaying a partial outline. Errors include original line/column positions; complex keys report `Unsupported YAML at line <L>, column <C>: mapping keys must be scalars.` Unsupported tags and invalid aliases are not silently recovered.
- Comments come from source-backed CST ranges, not highlighter guesses, preserving literal `#` in scalar content. Cached syntax/index snapshots are invalidated on document edits; fresh outlines prevent translation from mutating subsequent results.

### Navigation and saved identity

- Declaration controls open their represented containers. Aliases follow same-document `Alias.source` identity, including preceding-anchor rebinding; scalar and document-root anchors get source-backed on-demand windows. Scalar-key collisions reuse the existing declaration. Cycles do not recursively expand outlines.
- Ordinary scalar strings, paths, names, and comments do not become inferred links. Parent navigation follows displayed containment; scalar/root anchor parents remain honest.
- Saved references use exact source identity when the document hash is unchanged. Changed-source recovery is restricted to a unique ordinary mapping ancestry path in a single-document stream. Sequence, multi-document, and on-demand anchor references reject uncertain recovery instead of substituting by ordinal, coordinates, or name.
- Existing canvas types, source translation, and command routes are reused. Non-null range visualization remains unimplemented.

### Host error settlement

`visualizer.ts` captures the requesting panel and catches provider/translation failures in file visualization and parent navigation. A single `messageBox` with title `Source navigation failed` and severity `Error` settles the original request without duplicate notifications or pending tickets. Existing successful and no-definition routes remain unchanged; no retry or parser fallback was added.

## Automated validation

The actual VS Code extension-host suite recorded **203 passing**, including existing Python, TypeScript, JavaScript, partition, comment, and canvas-restoration suites.

`src/vscodeextension/src/test/suite/outlineprovider_test/yaml_outline.test.ts` covers block/flow nesting; collection-item identity and parent navigation; literal/folded/multiline scalars; comments versus literal hashes; CRLF and non-BMP positions; empty/root/multi-document inputs; anchors, collisions, rebinding and cycles; malformed/unsupported source; exact restoration and safe changed-source rejection; cache invalidation; and a real StatefulSet manifest.

## Live acceptance

### YAML manifests

In a real VS Code host, `manifests.yaml` rendered a source-backed file containing scalar settings, anchors, separators, and container rows. Navigation file → `jobs:` → `- name: build` → `env:` → `FLAGS:` opened distinct connected windows, retained the item's first scalar setting, and displayed `[fast, safe]` with flow delimiters.

Double-clicking `*base` opened the anchored defaults mapping with its literal multiline block and preserved `echo "# literal"`; `*image` opened the scalar anchor showing `alpine:3.20`. Parent navigation returned from `env:` to its item and from the scalar anchor to the file. The serialized graph contained the expected hierarchy and alias edges.

A separate real StatefulSet source was explored through `spec` → `template` → pod `spec` → `containers` → mapping item. Scalar settings, the first `name` field, the image, and nested container buttons remained present. This was structural navigation, not Kubernetes-specific interpretation.

### Python compatibility

The shared host changes were checked against an actual Airflow source file, read-only: file → `_build_dag` → nested `ingestion_dag`, plus `CONFIG_DIR` and `SQL_TASK_TIMEOUT`. Decorator metadata, headings, bodies, and parent navigation remained correct. The file was not modified or executed.

## Follow-up — YAML sibling alignment

YAML windows use a common body indentation and shared gutter so scalar source rows and clickable container rows at the same level align. Relative indentation remains visible. Changes are in `vpw_outline_window.js`, `vpw_code_editor.js`, and `vpw_code_editor.css`; other languages do not enter this layout branch. Source text and ranges are unchanged.

A source-backed browser scenario confirmed scalar/container alignment and unchanged source-navigation coordinates; the existing browser suite recorded **22 checks passed, zero failed**. This follow-up used the actual renderer, not a fresh VS Code development-host session.

## Follow-up — Frozen Show in code context menu

Real mouse input reproduced a popup entry press becoming an empty-canvas selection gesture: pointer capture redirected the final click away from the menu, leaving it open without a source request. `CanvasSelection._onNavAreaPointerDown` now excludes `.VgfPopupWindow` as well as `.Window`. Popup primary, middle-button, and Space+primary presses do not start canvas selection/panning.

The browser suite recorded **23 passed, zero failed**. A real mouse click closed the menu, left no active gesture, and sent one `vp_host_openRawSource` request with the original YAML heading range. This checked renderer interaction, not a fresh end-to-end VS Code editor reveal. No YAML parser or source-coordinate behavior changed.
