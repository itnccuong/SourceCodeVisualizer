# TypeScript anonymous callback extraction

## Goal and agreed scope

Fix `Cannot determine declaration boundaries for "<function>".` when exploring `VisualizingTab` in this repository. The user clarified that broader JavaScript/TypeScript support work should be reported, not implemented.

Acceptance: class and file exploration must succeed with real VS Code symbols; Promise callbacks must have correct headings and bodies; incomplete declarations must still fail. Keep the parser dependency and README language tiers unchanged.

## Plan as executed

1. Reproduce the error with VS Code's built-in TypeScript document symbols and the existing adapter.
2. Accept anonymous function/arrow AST candidates for TypeScript as well as JavaScript. Parse whole-expression function selections without inserting a synthetic variable declaration. Wrap anonymous function expressions only when source parsing identifies an unnamed function declaration.
3. Add callback regression cases, run the complete integration suite, exercise the actual extension commands, and inspect rendered outlines.

## Cause and changes

- `VisualizingTab` contains three Promise executors reported as `<function>`. Their selection ranges cover their complete expressions. Anonymous AST candidates were restricted to JavaScript; standalone TypeScript extraction could also insert an invalid `const` prefix.
- Updated `src/vscodeextension/src/outlineproviders/lspextendertypescript.ts`. Matching does not depend on `<function>` or another display name. Existing diagnostic, ambiguity, containment, and overlap checks remain enabled.
- Added `typescript_callbacks.test.ts`: nested block arrow, anonymous function expression, typed expression arrow, async typed arrow, and rejection of a truncated callback body. Valid cases check ancestor/cached and independent extraction, exact source bodies, and their inclusion in a parent outline.
- No parser upgrade, language registration changes, or Supported relabeling. Both READMEs intentionally remain unchanged.

## Validation

### Reproduction and correction

With VS Code's real TypeScript provider, both file and `VisualizingTab` extraction initially failed on the three Promise executors and other anonymous callbacks. The correction preserves named/exported function declarations and declaration-start selections; only anonymous function expressions receive a parser wrapper when needed.

### Automated suite

The actual VS Code extension-host suite passed **212 tests**, including the five new callback cases.

### Actual command smoke

Actual extension-host commands exercised:

- `vp.executeDocumentDefinitionProvider` on `visualizer.ts`.
- `vp.executeDefinitionProvider` on the `VisualizingTab` type reference in `CanvasTabManager`.
- Source-text translation of both results.
- Independent extraction of all three real `<function>` Promise callbacks, with exact `(resolve, reject) =>` headings and provider-bounded bodies.

Both commands returned translated file/class outlines. All three Promise callbacks were also extracted independently with exact headings and contained body ranges. A subsequent installed-extension smoke in Production mode confirmed the same behavior.

### Renderer inspection

Used real extracted/translated class and file outlines in the existing standalone browser renderer. Inspected `VisualizingTab`, `waitReady`, `exportCanvasState`, and both block/expression Promise callback bodies. Class, file, signatures, and callback bodies rendered; browser error collection was empty. This exercised the actual canvas renderer with real host output, not a driven native VS Code webview. No new UI code was needed.

## Broader JS/TS support: proposed work only

1. Upgrade the runtime TypeScript compiler API and adapt changed APIs, including modifier/decorator access. A direct syntax comparison showed that the current 3.9.10 parser rejects valid `satisfies`, class static blocks, and `const` type parameters; the installed development compiler 5.9.3 accepts those examples. The development compiler is not the shipped runtime parser.
2. Expand real-provider symbol mapping coverage for destructured/name-only bindings, callable fields/assignments, overloads, and declaration files. Diagnostic direct extraction on this real file also exposed name-only destructured bindings; that separate behavior was not changed here.
3. Define and verify same-family cross-language navigation. Shared definition lookup currently rejects differing language IDs, which needs attention for JS targets in `.d.ts` and TSX targets in `.ts`.
4. Extend live VS Code provider and rendered-navigation scenarios across functions, methods, callbacks, variables, types, comments, file exploration, Show in code, and saved-canvas restoration. Existing tests cover many synthetic declaration cases but are not a complete support guarantee.
5. State the supported syntax/file scope explicitly before changing both README tables. JSX currently has no `javascriptreact` adapter registration; do not imply JSX support from JavaScript support. Treat TSX as a separate validation scope.

Recommendation: retain the TypeScript compiler as the shared JS/TS syntax parser. Upgrade it and strengthen the LSP-to-AST mapping rather than introducing a second parser. These broader items remain unimplemented by design.

