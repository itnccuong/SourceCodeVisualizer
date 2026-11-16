# JS/TS parser upgrade

## Context

Upgrade the extension's JavaScript/TypeScript parsing so ordinary modern declarations, variables and cross-file definition navigation produce correct diagrams. The user selected JS/TS first: .js/.mjs/.cjs, .ts/.mts/.cts and TypeScript declaration files; preserve existing TSX behavior as experimental and do not advertise or register JSX in this update. This is a proposed plan, not an implemented change.

After approval, copy the approved plan to `features/js-ts-parser-upgrade/plan.md` before implementation. Keep `specs/` unchanged. Record only completed feature behavior and validation in that feature's results, not routine installation/build diaries. Do not install or publish the resulting extension unless separately requested.

## Findings recorded during investigation

- `src/vscodeextension/src/outlineproviders/lspextendertypescript.ts` already uses a TypeScript syntax tree, not brace scanning. `parseDeclaration()` parses local/ancestor fragments through synthetic wrappers and builds a noResolve/noLib program for syntactic diagnostics. One fragment per document is retained in a WeakMap.
- `selectDeclaration()` and `callable()` contain JavaScript-only matching, initializer unwrapping and range-expansion branches. `isDeclarationSymbol()` currently recognizes promoted callable declarations only in JavaScript.
- `docs/architecture-and-development.md` documents strict containment/overlap checks, immutable provider symbols, declaration-only bodies, comment offsets, cancellation and source navigation. These are existing feature contracts to preserve.
- Runtime parser currently resolves to TypeScript 3.9.10; the separate development compiler is 5.9.3. Upgrade the runtime alias to exact `npm:typescript@6.0.3`. Its npm metadata exposes the existing CommonJS compiler API (`lib/typescript.js`), Apache-2.0 license and Node >=14.17 requirement. Do not use an unbounded latest tag: the observed latest is 7.0.2 with different unstable/native APIs and platform dependencies.
- Sources for version choice: https://registry.npmjs.org/typescript/6.0.3 and https://registry.npmjs.org/typescript/latest.
- LSP tooling reports no configured language server in this repository; inspection must use source reads/search until implementation tooling changes.

- Installed VS Code is 1.146.0 and its bundled TypeScript is 6.0.3 (read from application package metadata). The user selected VS Code 1.146+ as this release's minimum instead of expanding older-version compatibility work.
- `outline_test_typescript.test.ts` has its real-provider tests commented out. Current boundary/callback suites mostly construct DocumentSymbols themselves; this is insufficient for a supported-language claim.
- `outlineproviderAPI/utils/outlineutils.ts::_getDefinitionRanges()` hard-codes a same-language-ID check and JavaScript-only direct callable navigation. `VpOutlineProviderWrapper` owns the adapter; the existing `outlineProviderRegistry` is the single registry to reuse.
- Existing TypeScript comment classification already parses the entire document separately from declaration parsing. Consolidating this into an on-demand document syntax cache removes repeated parsing and fake parser scopes.

## Approach

### 1. Pin the runtime and define supported input

- Change `src/vscodeextension/package.json` production dependency to `"typescript-parser": "npm:typescript@6.0.3"` and regenerate its existing lockfile. Keep the alias/import name and lazy runtime loading. Keep development `typescript: "~5.9.3"`: it builds the extension and is not the syntax engine shipped to users.
- Set `"engines": {"vscode": "^1.146.0"}`. The user approved this minimum; do not retain the unverified 1.44 claim.
- JS means `javascript` documents (.js/.mjs/.cjs); TS means `typescript` documents (.ts/.mts/.cts/.d.ts/.d.mts/.d.cts). The adapter determines parse mode from its registered language, uses the actual filename for module/declaration context, and keeps `typescriptreact` in TSX mode. Do not register `javascriptreact`.
- The acceptance scope includes ordinary and modern functions, arrows/callbacks, classes and members, class expressions, static blocks, parameters, variables/destructuring, interfaces/types/enums/namespaces and ambient/overload declarations. Modern syntax must include `satisfies`, const type parameters, private fields, optional chaining/nullish coalescing, import attributes, decorators and `using`/`await using`. Preserve TSX's existing behavior/tests, without certifying it as supported.

### 2. Parse the actual document once, not fake declaration scopes

In `src/vscodeextension/src/outlineproviders/lspextendertypescript.ts`, replace `ParsedTypeScriptDeclaration`, `parseDeclaration()`, the fragment WeakMap and the separate comment cache with a single on-demand parsed-document WeakMap. This JS/TS-specific design supersedes the fragment-only restriction in the older `features/declaration-boundaries/plan.md`; Python's fragment parser is unchanged.

Use a private `ParsedTypeScriptDocument` containing `version`, `language`, `fileName`, `tree: TypeScript.SourceFile`, `diagnostics: readonly TypeScript.Diagnostic[]`, `declarationsByStart: Map<number, Declaration[]>`, and optional cached `commentRanges`. Add private `parseDocument(document: vscode.TextDocument, ts: typeof TypeScript): ParsedTypeScriptDocument`.

- Cache validity requires document object, version, language and filename to match. Parse only on an extraction/comment request; replace the cache entry after edits. No background index, project program, imported-file loading, analysis worker, emit, execution or filesystem writes.
- Call `createSourceFile(document.fileName, document.getText(), ScriptTarget.Latest, true, ScriptKind.JS/TS/TSX)`. Parent pointers provide the real grammar context.
- Reuse the existing in-memory CompilerHost pattern, but serve this actual source file. Build one `createProgram` per new document version with `noResolve: true`, `noLib: true`, `noEmit: true`, `allowJs` for JS, `target: ESNext`, `module: ESNext`, and `jsx: Preserve` for TSX. Call `getSyntacticDiagnostics(tree)` once; retain its diagnostics, not the Program. Do not use internal/private compiler diagnostic fields.
- Index declaration starts, binding-name starts, constructor/static-block starts and owned callable-expression starts during one AST walk. Keep candidate lists because several declarations may share a start; do not index arbitrary reference tokens. Selection/range matching in step 3 disambiguates them.
- Reuse `getCommentRanges()`'s existing token-gap scanner against the cached SourceFile. It already protects strings, regex, templates and JSX text. Cache the resulting ranges in the same entry. Remove synthetic prefix/suffix creation, wrapper-offset subtraction and raw-JavaScript-versus-wrapped parsing retries.
- Retain the existing public adapter interface and generic superclass methods for unrelated capabilities. No new standalone parser service exists or is needed.

### 3. Match declarations by syntax identity in both JS and TS

Retain `selectDeclaration()`, `getLanguageSpecificSymbolInformation()` and `isDeclarationSymbol()` as the adapter entry points. Replace their JS-only matching branches with one syntax-based algorithm for JS/TS/experimental TSX.

Matching order:
1. Validate provider range/selection positions using offset round-trips before constructing output ranges.
2. Obtain candidates by selection/start offsets from the document index. Accept a declaration name or bound name, an actual constructor/static keyword, the declaration start, or an exact anonymous callable-expression selection. A reference inside a type, initializer or destructuring default is not a declaration.
3. Prefer an exact provider declaration range; otherwise require the unique candidate whose full declaration is contained by the provider range. Preserve complete provider ranges, including semicolons/comments. Do not select another overload merely because its name matches.
   For a provider range that omits leading decorators/modifiers, match the mandatory name/signature/body span instead of extending backward; omit those out-of-range attributes. This exception never permits a missing/truncated executable body.
4. Permit range expansion only for two syntax-certified shapes: an exact name-only binding/member/parameter selection, or an exact owned callable initializer/assignment-RHS range. The AST must prove the owner and the selected name. Return `rangeDeclaration` for that complete owner; do not mutate provider symbols. A truncated body, unrelated external selection or ambiguous owner still fails.
5. Reject syntactic diagnostics intersecting the selected declaration, including zero-width missing-token errors at its end. Errors wholly in other declarations must not reject a valid selection. A containing class/file may still fail when its requested child is invalid; do not hide/drop that child.

Concrete output behavior:
- Reuse current heading/body splitting and whitespace preservation. Function/method block bodies exclude only their own braces; object/type braces in signatures are not body delimiters. Expression-bodied arrows retain the complete expression.
- Extend `Declaration`/candidate recognition for class expressions, class static blocks, parameter declarations and call/construct/index signatures. Containers use their actual AST brace tokens; a dotted namespace follows its nested ModuleDeclaration body to the ModuleBlock while keeping the full source heading. Do not infer bodies from the next punctuation mark.
- Use `canHaveModifiers/getModifiers` and `canHaveDecorators/getDecorators`, merge by source offset and retain only real attributes inside the displayed declaration. Keep the current source-range attribute model; do not invent decorator evaluation or runtime metadata.
- Unwrap parentheses, `as`, angle-bracket type assertions, `satisfies` and non-null expression wrappers only to identify an owned callable; preserve original source ranges/text. Calls/IIFEs, classes-as-values, compound assignments and assignments nested inside other expressions are not promoted to callable declaration rows.
- Callable owners and standalone callbacks are distinct: exact owner/RHS selections open the assigned callable; a nested callback opens itself. Project only an immediate provider child whose range exactly matches the owned callable or a transparent expression wrapper. Retain all other children. Duplicate certified wrappers still fail.
- For direct exploration of a destructured binding, display its complete enclosing variable declaration/pattern and initializer, not an invented evaluated value. For multiple declarators, use only the selected declarator. A parameter uses its complete parameter declaration, with a default expression as its value if present.
- `isDeclarationSymbol()` promotes only callable variable/constant/field/property declarations for all three adapter modes. Ordinary values remain inline in file/class source, but can be directly explored. Static blocks can be opened when supplied as symbols; no new synthesized file rows are required for blocks omitted by the provider.
- Preserve `rangeBody: null` versus an empty body. Bodyless function/method/call/construct/index signatures are `declarationOnly`; never attach another overload's implementation. Existing type/property headings keep their current no-value presentation.
- Reuse `LanguageSpecificSymbolInformation` (`rangeDeclaration`, `children`, `definitionPosition`, `isCallable`), `OutlineUtils.documentSymbol2outlineSymbol()` and its raw/effective overlap checks. No canvas-message or saved-file schema changes.

Implement the existing optional adapter hook:
`getDefinitionSymbol(document: vscode.TextDocument, position: vscode.Position, context?: SymbolExtractionContext): vscode.DocumentSymbol | undefined`.
It returns a source-backed symbol only at a proven binding/declaration selection or callable navigation offset. Reuse existing provider symbols when the shared navigation code has an exact target. If a target is absent from the provider tree, construct a DocumentSymbol from AST name/kind/full range and exact selection; recursively attach syntactic declaration children within its body using the same inclusion rules so nested navigation still works. Synthetic symbols retain `path: null` through existing source-reference creation. Never return an enclosing method for an unmapped reference.

Synthetic symbol identity is deterministic: reuse exact provider name/kind/selection whenever present; otherwise named declarations use their source name, anonymous functions/arrows use `<function>`, anonymous classes use `<class>`, constructors use `constructor`, static blocks use `static`, and call/construct/index signatures use `<call>`, `<construct>`, `<index>`. Kinds are Function for free functions/arrows, Method for methods/accessors/call/construct/index signatures, Constructor for constructors, Namespace for static blocks/namespaces, Class for classes/type aliases, Interface/Enum/EnumMember for those declarations, Field for class properties, Property for object properties, Constant for const/using bindings, and Variable for other bindings/parameters. A destructured leaf uses the bound identifier, not its renamed property key, for name/selection. Children stop at each immediate emitted declaration and recurse inside it; do not emit the same nested declaration at two levels.

Keep the existing `Cannot determine declaration boundaries for \"<name>\".` prefix, followed by target URI, 1-based line/column and one concrete reason (invalid provider range, no matching declaration, ambiguous declaration, truncated declaration, or flattened TypeScript syntax diagnostic). Do not replace errors with plain-text nodes or brace heuristics.

### 4. Route resolved targets through the target adapter

Reuse `outlineProviderRegistry` in `outlineproviderAPI/extensionactivator.ts`; do not add a second adapter registry or import the activator into OutlineUtils.

- Add `export type TargetAdapterResolver = (language: string) => VpLspExtenderProvider | undefined` to `outlineproviderAPI/lspextenderprovider.ts`.
- In `VpOutlineProviderWrapper`, make its adapter a `public readonly lspExtender` and accept an optional private readonly `resolveTargetAdapter: TargetAdapterResolver` constructor dependency. Pass it to the shared outline utility. Optionality is for existing standalone same-language utility callers; cross-language requests without a resolver must reject, never use the origin adapter.
- `registerLspExtenderProvider()` injects a resolver closure that reads the current `outlineProviderRegistry` entry and returns `.lspExtender` only if it is a `VpOutlineProviderWrapper`. This preserves registry replacement behavior and avoids exposing a new command.
- Add `resolveTargetAdapter?: TargetAdapterResolver` after `chooseTarget?` in `OutlineUtils.provideDefinitionOutline()` and private `_getDefinitionRanges()`. Existing direct same-language test calls remain valid. The production wrapper always supplies the resolver.
- Keep definition lookup, target deduplication, chooser order, cancellation (`null`) and unresolved (`[]`) semantics. After opening the selected target, same-language navigation uses the supplied adapter; differing languages may route only within `javascript`, `typescript`, `typescriptreact`, and must resolve an installed adapter. Other combinations retain `The resolved target uses an unsupported language for this navigation: <language>.`.
- Use the resolved adapter for file-root outlines, target-symbol extraction, syntax-backed target lookup and comment classification. Preserve the chosen target URI/selection exactly. Do not invoke the definition provider again on the target.
- Replace the JavaScript-only exact-callable navigation branch with the adapter's `getDefinitionSymbol()` capability for JS/TS-family adapters. Match exact navigation offsets rather than traversing/extracting enclosing declarations opportunistically. Preserve direct assigned-callable reopening instead of jumping to the receiver local. If a syntax candidate matches an existing provider declaration/name selection or certified RHS selection, convert that existing DocumentSymbol so its original children and ancestry survive; use the synthetic symbol only when no exact provider match exists.
- Generalize the existing Python syntax-target hook block by capability: invoke targetAdapter.getDefinitionSymbol for missing/nonexact targets or variable-like targets. Keep exact provider symbols when available and extract their name-only ranges through the new adapter, so normal ancestry/saved references remain intact. A nonexact enclosing symbol is not a fallback target for JS/TS when syntax lookup cannot prove the selected declaration. For Python keep its existing eligibility/selection behavior; do not broaden cross-language Python routing.
- `executeSavedOutlineProvider()` already routes by the saved target document. Keep that path and `SourceReference` version unchanged. Synthetic JS/TS definitions restore by exact source coordinates when hashes match; changed documents without ancestry still report unavailable rather than guessing.

Implementation order is 1 -> 2/3 together -> 4 -> integrated verification. Parser and navigation changes share `lspextenderprovider.ts`/OutlineUtils contracts; one integration owner controls those files. Do not run build/lint/test suites between unfinished dependency steps.

### 5. Replace missing real-provider coverage with executable contracts

Reuse the existing tests and helpers rather than building another harness. `MemoryFile.createDocument()` takes extensions without a leading dot; use it for adapter-only cases and malformed input. Use file-backed fixtures and VS Code's built-in provider for navigation integration.

- In `test/suite/outlineprovider_test/typescript_declaration_boundaries.test.ts`, add modern syntax, exact name-only bindings (including renamed/nested/rest/default destructuring), direct parameters, class expressions/static blocks, decorators, overload/signature and declaration-file cases. Keep exact text/range assertions, not just “does not throw.”
- Update fixtures that exist only to feed synthetic parser scopes: put `Ready = 1` in a real enum, bare declarators in real variable declarations, and the declaration-start constructor case inside a class. The selected declaration slice and expected display remain unchanged. A standalone `value: other` is still a label, not a property, and must fail property extraction.
- In `javascript_function_expression_boundaries.test.ts`, run the applicable callable ownership/projection/receiver-navigation cases for JS and TS. Move the standalone anonymous `function() { ... }` fixture into an actual call expression. Replace the old “RHS requires supplied ancestor” rejection with successful AST-proven owner extraction plus separate unrelated-selection/truncated-RHS rejection cases. Keep duplicate/crossing/overlap safety cases. Remove tests that assert only which internal context helper was invoked; retain assertions on exact displayed source and immutable provider input.
- `outline_partition.test.ts` currently drops functions by the provider display-name suffix `") callback"`. For JS/TS-family adapters only, remove that name-based skip in `_provideOutlineForRange()`; valid callbacks must be syntax-checked and become declaration rows regardless of display name. Retain the legacy rule for other adapters. Update the existing ignored-callback test to require one callback row plus exact surrounding source, and retain the outside-child skip check.
- Keep `typescript_callbacks.test.ts`'s nested `<function>` and truncated-body cases. Add a regression using the real `VisualizingTab` source's provider tree instead of replacing those tests with a copied minimal fixture alone.
- Extend `comment_visibility.test.ts` for JS as well as TS, CRLF/non-BMP text, modern syntax surrounding comments, and a changed document version. Preserve existing TSX comment-versus-text cases.
- Add cross-family target tests in `definition_navigation.test.ts`: JS -> TS implementation, JS -> .d.ts overload, TS -> JS callable assignment, experimental TSX -> TS, module/file-root target, and unsupported/missing target adapter. Exercise cancellation before target reads, duplicate target choices and selected-source errors through existing fixture patterns. Keep Python -> JS rejection.
- Extend `canvas_restore.test.ts`: save/restore a real cross-family target with the target language/URI; unchanged syntax-only bindings restore without invoking the definition provider; changed pathless bindings and ambiguous ancestry remain unavailable.

Replace the commented-out contents of `test/suite/outline_test_typescript.test.ts` with real JS/TS integration tests. Activate `vscode.typescript-language-features` and fail explicitly if unavailable. Use `getTestDirPath()`, open actual `file:` documents, obtain `vscode.executeDocumentSymbolProvider` / `vscode.executeDefinitionProvider` results and feed the real exported `executeDefinitionProviderForPositionOnDocument()` / `executeDocumentDefinitionProvider()` paths. No fake provider registration for these file-backed tests.

Create `src/vscodeextension/src/test/testfiles/js_ts_parser/` (new fixtures, not a second demo repository):
- `modern.ts`: exports `keep<const T>(value: T)`, `config = {port: 8080} satisfies Settings`, `Cache` with a static block/private field/accessor/method/arrow field, `build()` with a Promise executor and nested callback, and destructuring with renamed/default/rest bindings. Include a harmless declared decorator with real source annotations; none of this code is executed.
- `consumer.js`: imports from `./modern.js` (TypeScript resolves the sibling .ts source), calls `keep`, accesses `config`, and imports the ESM/CJS helpers. This proves JS -> TS and helper-file navigation.
- `helpers.mjs` and `legacy.cjs`: a named exported arrow and `module.exports.run = function...` respectively.
- `consumer.ts`: imports the helpers and declarations and calls their exported functions. This proves TS -> JS and declaration-only navigation.
- `module.mts` and `module.cts`: named functions/variables using their real module extensions, including import-attribute and resource-management syntax in syntactically valid contexts.
- `api.d.ts`, `esm-api.d.mts`, `cjs-api.d.cts`: bodyless exported overloads/interfaces/types, including `export =` for the CJS declaration fixture.
- `tsconfig.json`: `allowJs: true`, `checkJs: false`, `noEmit: true`, `target: "ESNext"`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `types: []`, include only this fixture directory. This is a language-service test project, not an executable application.

Exclude this fixture directory from the extension's build `src/vscodeextension/tsconfig.json`, alongside existing node_modules/.vscode-test excludes, so modern source inputs and intentional unresolved semantic names are analyzed as fixtures rather than compiled into the extension. Do not relax the extension's own type checking.

## Critical files and caller inventory

Paths in the Approach without a root prefix are under `src/vscodeextension/src/`.

- `src/vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts`, `_getDefinitionRanges` and `documentSymbol2outlineSymbol`: preserve chosen-target identity, provider ancestry, strict raw/effective range checks and source-reference creation while changing adapter routing.
- `src/vscodeextension/src/outlineproviderAPI/utils/outlineproviderwrapper.ts`, constructor and `provideDefinitionOutline`: the wrapper is the only production caller of the shared definition utility and must pass the registry resolver.
- `src/vscodeextension/src/outlineproviderAPI/extensionactivator.ts`, `registerLspExtenderProvider`: the sole production `new VpOutlineProviderWrapper(...)` callsite; inject the registry lookup here, not in a parser or webview.
- `src/vscodeextension/src/test/suite/index.ts`, `run`: discovers all `**/*.test.js`; there is no existing grep/environment filter. Use the full extension-host run once after the combined implementation, not an invented filtered command.
- `src/vscodeextension/scripts/prepare-release.js`: already follows npm aliases and production dependency notices. Reuse it for package validation; no separate dependency-copying convention.

Before changing exported interfaces, use LSP references if now available. With the current no-LSP setup, the exact fallback inventory is:
`rg -n 'OutlineUtils\.provideDefinitionOutline|new VpOutlineProviderWrapper|TargetAdapterResolver|getDefinitionSymbol' src/vscodeextension/src`.
Existing direct utility calls are in the wrapper, `definition_navigation.test.ts` and `javascript_function_expression_boundaries.test.ts`; existing `getDefinitionSymbol` callers also include Python extraction and saved-outline restoration. Do not leave duplicate routing APIs or obsolete fragment helpers.

## Verification

### Behavioral assertions

| Input / action | Required observable result |
| --- | --- |
| `function keep<const T>(value: T) { return value; }` | Heading `keep<const T>(value: T)`; body `return value;`; no boundary error. |
| `const config = {port: 8080} satisfies Settings;` | Heading `config =`; complete value `{port: 8080} satisfies Settings`; no loss of the type suffix. |
| Name-only provider selection of `port` in `const {port = 8080, host: server} = settings;` | Complete destructuring declaration/value, correct selected binding source coordinates; selecting the reference `settings` must not pretend it declares a variable there. |
| Same JS and TS `holder.run = (() => { return 3; });` | Callable row with receiver in its heading; opening the row returns that callable, not `holder`; exact source partition has no duplicate child or missing gap. |
| Class with static block, private field, accessor and arrow field | File/class exploration works; static block body and member bodies use their own syntax; ordinary value fields remain source; callable field becomes a row. |
| Modern syntax: decorators, `using`, `await using`, import attributes, optional chains | Relevant declaration/file renders original source without treating type/object/string punctuation as its body boundary. No analyzed code executes. |
| `.d.ts/.d.mts/.d.cts` overload selected | Correct selected signature and actual URI; body hidden; no implementation borrowed from a different declaration. |
| JS -> TS, TS -> JS, TSX -> TS target | Target language/URI and parse mode are correct; root targets open files, declaration targets open declarations. |
| Nested callback or Promise executor in `VisualizingTab` | Exact callback source appears under the right method; no `<function>` boundary failure and no parent closing brace borrowed. |
| Malformed selected declaration or truncated provider range | Contextual error; no fallback node or range stretching. A valid neighboring declaration can still be opened directly. |
| Comments toggle with strings/regex/templates, CRLF and emoji | Only actual comments disappear; unchanged identifiers still navigate to exact original UTF-16 positions. |
| Change a declaration, then revisit it | Fresh heading/body/comment locations; no stale cached tree or saved coordinate silently used. |
| Save/load cross-language and syntax-backed nodes | Correct target restored in a separate canvas; layout/source identity preserved or an explicit unavailable-source result under the existing changed/ambiguous rules. |

Use real declaration/binding positions, not copied output strings as expected coordinates. Verify exact URI, ranges, displayed source and graph reuse. Keep parser/diagnostic isolation deterministic; dispose fake provider registrations and revert in-memory edits in `finally`.

### Commands and prerequisites

Run only after approval and combined implementation:

1. Working directory `src/vscodeextension`: update dependencies with `npm install --package-lock-only --ignore-scripts`, then `npm ci --ignore-scripts`. This regenerates the existing lockfile and avoids dependency lifecycle scripts. If the synced node_modules contains duplicate `@types/* 2` folders, the clean install is the fix; do not hide type errors in tsconfig.
2. From that directory: `VSCODE_EXECUTABLE_PATH="/Applications/Visual Studio Code.app/Contents/MacOS/Electron" npm test`. The existing pretest builds the webview/extension and runs lint; the runner uses an isolated profile and installs Python/Pylance into its test extension directory. Network access is required for those existing test prerequisites. Confirm the host is 1.146.0 and TS language service is 6.0.3. If the installed app has changed, use the test-electron API to download exactly 1.146.0 and set VSCODE_EXECUTABLE_PATH to that returned executable; do not silently certify a different minimum.
3. Run `npm audit --omit=dev` and `npm audit` in the extension directory after the clean install. Review findings against the package contents; do not equate a clean audit with application security certification or expand unrelated dependency changes.
4. Root directory: `npm --prefix src/vscodeextension run package`. Inspect the produced `src/vscodeextension/release/source-code-visualizer.vsix`: runtime `extension/node_modules/typescript-parser/package.json` must say 6.0.3; compiler JS, Apache license/notices and corresponding updated source/lockfile must be included. It must not accidentally ship a native TypeScript 7 package or rely on VS Code's private compiler path.

No checks have run for this proposed implementation. Do not record the prior 0.2.5 canvas tests as parser-upgrade evidence.

### Real diagram proof

Use the repository's existing **Run Extension** F5 launch (development host, not installation into the user's normal profile). Open the fixture project and repository source. Do not execute fixture/source files.

1. Visualize the actual `src/vscodeextension/src/visualprogramming/visualizer.ts` file -> `VisualizingTab` -> `waitReady`, `exportCanvasState`, and `restoreCanvas` -> their Promise callbacks. Open the destructured `line` and `character` in `_normalizeNavigationPosition` directly.
2. In `js_ts_parser/modern.ts`, open file -> `Cache` -> method/arrow field, then `build` -> nested callback. Inspect signatures, attributes, complete bodies, source gaps, comments on/off and **Show in code**.
3. In `consumer.js`, follow `keep` to `modern.ts`; in `consumer.ts`, follow the `.mjs`/`.cjs` helper and a selected declaration-only overload. Use the real chooser where there are multiple targets; Escape must add no node. Reopen the same target to verify node/edge reuse.
4. Save and load this mixed JS/TS canvas; inspect restored headings, body visibility, geometry and source navigation.
5. Shared navigation changed: verify the actual external Python file `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py` -> `_build_dag` -> nested `ingestion_dag`, plus a variable. Inspect headings, decorators, body text and navigation without modifying/executing the Airflow file. Open `src/vscodeextension/src/test/testfiles/yaml/dashboard.yaml` -> Deployment `spec` -> `template` -> `spec` -> `containers` -> first item; verify the ConfigMap `index.html` block scalar and document separators also remain intact, without a YAML source-mapping error.
6. Capture/inspect the actual webview in both light and dark themes. Model-only extraction results or standalone backend-emulation pages are not sufficient proof of these parser/navigation changes.

For document-cache performance, use a temporary in-memory generated document with 2,000 functions and a 20,000-line body. Measure cold file extraction, 50 repeated declaration openings, comment toggling and extraction after one edit; inspect the displayed last/middle declaration for correctness. Repeated operations on the unchanged document must reuse one syntax snapshot, not create a compiler Program for every child. Use temporary instrumentation/profiling, not a permanent cache-wiring test or an arbitrary hardware-dependent timing assertion. If repeated matching is quadratic, fix candidate-index lookup before completion; do not disable validation or revert to punctuation heuristics.

The support gate is all applicable behavior assertions plus real-provider/runtime proof. Only after it passes may `README.MD` and `src/vscodeextension/README.md` label JS/TS **Supported** with parser 6.0.3 and VS Code 1.146+ as the stated scope. Keep a separate **Experimental** TSX row; JSX stays unadvertised. Failed gates block that status change rather than lowering assertions.

## Assumptions and contingencies

- User-selected scope is JS/TS first; current VS Code 1.146+ is the approved compatibility baseline. A later request for older VS Code or certified JSX/TSX requires a separate scope change.
- Keep the built-in VS Code definition/document-symbol provider as the semantic authority. Missing/ambiguous semantic targets remain unresolved/chooser/error outcomes; an AST does not guess import resolution or runtime values.
- Keep development compiler 5.9.3. TypeScript 6.0.3's public API declarations were inspected for the required APIs; if a genuine type-compatibility failure appears, update the development compiler to exact 6.0.3 and explicitly migrate compiler-option deprecations, not `skipLibCheck`/type casts that hide an incompatible runtime API.
- If the external Airflow fixture or live VS Code surface cannot be reached, finish reachable tests and report the missing validation. Do not claim runtime proof or promote support solely from mocked providers.
- Do not install or publish during implementation. Build/package proof is separate from overwriting the normal same-ID installed extension.


