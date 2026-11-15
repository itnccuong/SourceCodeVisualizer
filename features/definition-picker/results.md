# Meaningful multiple-definition picker

## Goal and scope

Make the definition chooser understandable without guessing between repeated names and long absolute URIs. The reported example was the built-in TypeScript `Promise` declarations. Improve presentation and source inspection, not the JS/TS parser or language-support tiers.

## Plan as executed

1. Replace identifier-only labels and raw URI details with declaration source lines, short locations, origin, declaration-only metadata, and document-symbol member summaries.
2. Keep provider order and original target objects. Add an explicit preview action without selecting a target or guessing an implementation.
3. Exercise the actual VS Code picker, including source preview, exact selection, cancellation, identical filenames, unavailable source, file roots, and cancellation during metadata loading.

## Changes

- Added `src/vscodeextension/src/visualprogramming/definition_picker.ts` and passed its chooser directly from `visualizer.ts`; removed the old private chooser rather than retaining a forwarding wrapper.
- Each row shows the target's declaration line, not merely the provider-selected identifier. Empty `(0,0)` file targets retain a filename label.
- Locations are workspace-relative or relative to the candidates' common parent. Same-named files in different directories remain distinguishable without repeating a long common prefix.
- `.d.ts`, `.d.mts`, and `.d.cts` are labeled `Type declaration — no implementation`; existing `.pyi` declaration-only metadata is retained. No runtime implementation is inferred from a declaration file.
- Origins distinguish VS Code bundled libraries, dependency package names, workspace files, external files, and non-file URI schemes/authorities.
- Available document-symbol children provide a deduplicated member/contained-symbol preview, limited to six names plus an overflow count. This summary appears first so useful differences remain visible when native UI elides a long detail line.
- Documents and symbol requests are shared per URI within one invocation. Missing optional symbol context is labeled; unreadable files remain explicitly unavailable candidates rather than being dropped or replaced.
- The native Quick Pick appears busy while metadata loads. The title-bar file button previews the highlighted candidate's exact selection in an editor while keeping the picker open. Only acceptance returns a target; Escape returns `undefined`.
- Closing disposes handlers and ignores late metadata results. Provider order, target identity, and downstream navigation/error behavior are unchanged.

## Validation

### Actual VS Code UI

Used a real VS Code Extension Development Host with the built-in TypeScript language provider and inspected the native picker.

The real expression `new Promise<number>((resolve) => resolve(1))` returned **six distinct locations**, including:

- An empty `Promise<T>` declaration in `lib.es2015.iterable.d.ts`.
- A constructor signature and the `PromiseConstructor` variable declaration in `lib.es2015.promise.d.ts`.
- `[Symbol.toStringTag]`, `finally`, and `catch, then` member contributions from their respective standard-library files.

These were shown as actual declaration locations, not labeled as different runtime versions or ranked by an invented recommendation.

Verified in the native UI:

1. Filtering by `finally` matches member context.
2. The file button opens `lib.es2018.promise.d.ts` at the target selection while the picker remains open.
3. Enter returns the exact original target object; the extension-host probe confirms the previewed editor URI matches that selected URI.
4. Escape cancels a second picker with `undefined`.
5. Candidates with identical filenames and declaration text in different directories remain distinguishable by path; accepting one returns that exact target. A file-root choice and an unavailable file remain visible in the same picker.
6. Escape also cancels while two document-content requests are deliberately held pending. The content is subsequently released; no disposed picker is reopened or assigned late results.

## Limits

Labels use the declaration's physical source line, not a newly parsed multiline signature. Document-symbol member metadata depends on the language provider. The preview action exposes the full original source when the native picker elides long text. This work does not make previously unsupported syntax parseable or change language support status. No permanent picker tests were added; the full extraction suite was not rerun for this UI-only change.

