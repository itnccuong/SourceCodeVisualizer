# Phase 1 — Stop Source Leakage and Explain Bodyless Methods (R04 + R10)

## Context
This plan covers the selected R04 + R10 work: stop a declaration's diagram node from displaying unrelated source, and clearly identify methods that have a signature but no implementation. A **range** is the start/end position used to copy text from the source file into a node. The changes below are proposed, not implemented.

Keep the VS Code language provider to answer **“Which declaration did the user select?”** Use TypeScript's source parser to answer **“Where does that declaration actually start and end, and does it have a body?”** That lets us correct a bad endpoint when the provider identifies the right declaration; it cannot correct a provider that points to a different declaration entirely.

## Planned changes and why
This section explains the decisions for review. The Implementation instructions below give the next agent the exact files, fields, and steps needed to carry them out.

| What will change | Why it is needed | What you will see or what it affects |
| --- | --- | --- |
| Replace punctuation-searching with a dedicated TypeScript/TSX source parser. | The current adapter can scan into the next function even when the provider gives it a correct range. Simply trusting or clipping to a bad provider endpoint would not solve that either. | A constant or method shows only its own source, including complete multiline initializers—not the statements after it. |
| Pass explicit heading, body, and corrected whole-declaration ranges through the shared outline builder; use target-file positions for navigation. | Fixing the parser alone is insufficient if the next stage still uses the original oversized range or mixes source-file and target-file coordinates. Named fields also make “no body” explicit instead of relying on array positions. | Nested methods remain separate and in source order; later methods are not swallowed into earlier ones. Source navigation still points to the selected declaration. |
| Add a separate “declaration only” flag and render it as ordinary status text. | A method without an implementation and an implemented but empty `{}` method can both have no displayed body text. An empty display is not enough to distinguish them. | `read(): void;` shows its signature and `Declaration only — no body`. `read() { return 1; }` shows its implementation. `read() {}` is not falsely labeled declaration-only. |
| Include the existing TypeScript parser in the installed extension, not just its development tools. | The new extraction runs while the extension is being used, so its parser must be present in the shipped package. | No compiler upgrade is planned: keep 3.9.10. Packaging the parser adds a runtime dependency; syntax that version cannot parse produces an explicit error rather than guessed source. |
| Repair the existing test-startup issues and remove an unused Node-only import from the browser renderer. | The test code refers to an obsolete extension ID and can restart its launcher when imported. The browser import would survive the custom bundler even though browsers cannot run it. | These are supporting fixes needed to run and verify this feature, not a replacement test framework or a UI redesign. |
| Add a plan-readability rule to the root `AGENTS.md` after approval. | Future agents need to discover this preference in their normal entry-point instructions, rather than rely on this conversation. | Future plans must explain what changes, why, and the expected result before presenting detailed implementation instructions. |

The implementation remains limited to TypeScript/TSX extraction and the shared rendering path, with Python regression checks. Other language parsers, zoom, and new-node placement are not being redesigned here.

## Evidence behind the decision
The existing adapter was exercised in a read-only, in-memory probe with correct input ranges:
- For `const limit = 42`, its heading included `console.log(limit)` and the next function; its body also included unrelated source.
- For the interface method `read(): void;`, it returned `;\n` as the body.

This establishes a defect in our extraction code, without needing to assume the LSP is wrong. The probe used lightweight VS Code object stand-ins; it was not a live Extension Host test, and the provider output for the user's original example has not been captured.

## Implementation context
- Follow `specs/context.md`, `specs/tech.md`, `specs/roadmap.md`, and `docs/architecture-and-development.md`. Keep `specs/` read-only. Save the approved plan to `features/declaration-boundaries/plan.md` before implementation; write that feature's `results.md` only after implementation and validation.
- The unbounded searches are in `src/vscodeextension/src/outlineproviders/lspextender_curlyBraces.ts:95-120` and `src/vscodeextension/src/utils.ts:238-263`. `outlineproviderAPI/utils/outlineutils.ts` selects symbols and assembles their children. `outlineproviders/providerregistrer.ts` shares the brace-based adapter across several languages, so replace only its TypeScript/TSX registrations.
- The installed TypeScript 3.9.10 parser successfully distinguished object initializers, method signatures, implemented methods with object return types, and empty `{}` bodies in the read-only probe. It is currently only a devDependency in `src/vscodeextension/package.json`.
- No LSP server was configured for the coding session. Recheck references with LSP if one is available during execution; otherwise use the exact callsite searches specified below.

## Implementation instructions

### 0. Record the shared-plan requirement for future agents
After saving the approved feature plan, append the following section to root `AGENTS.md`. This is the requested persistent agent note; preserve its existing context-file links and workflow rules, and do not change `specs/context.md`.

```markdown
## Shared Plan Readability

- Write plans for both the user reviewing the proposal and the agent implementing it.
- Start with a plain-language explanation of what will change, why it is needed, and the expected user-visible result. Define unfamiliar terms when first used.
- Make each planned change explicit: describe the current behavior, the proposed behavior, the affected files or components, and the reason for the change. Explain important tradeoffs and limits instead of hiding them in implementation detail.
- Put exact APIs, fields, algorithms, and commands after that explanation. Keep the implementation instructions self-contained and precise; readability is not permission to omit decisions.
- Distinguish proposed work from completed changes and verified findings from assumptions. Do not require the reader to remember an earlier conversation.
```

Check that this section is present and that the existing instructions to read `specs/context.md` and `docs/architecture-and-development.md` remain intact. This note is not written into the working tree until the plan is approved.

### 1. Establish the reproduction and typed extraction contract
Use the in-memory reproduction recorded under Evidence behind the decision as failing-before evidence; add its permanent regressions alongside the buildable adapter/shared-code changes. Correct the two test-bootstrap defects in step 5 before running the suite so startup failures are not confused with range behavior. No production edits were made during planning.

Replace the positional `any[]` return of `VpLspExtenderProvider.getLanguageSpecificSymbolInformation` in `src/vscodeextension/src/outlineproviderAPI/lspextenderprovider.ts` with exported `LanguageSpecificSymbolInformation`:

```ts
export interface LanguageSpecificSymbolInformation {
  totalRange: vscode.Range;
  rangeHead: vscode.Range;
  rangeBody: vscode.Range | null;
  attributes: Outline.Attribute[];
  declarationOnly: boolean;
}
```

Keep method arguments `(document: vscode.TextDocument, docSymbol: vscode.DocumentSymbol)` unchanged. Migrate both existing adapters, `OutlineUtils.documentSymbol2outlineSymbol`, and tests that index the old tuple in one buildable change; no tuple compatibility path. Python and non-TypeScript brace adapters return their existing ranges, `totalRange: docSymbol.range`, and `declarationOnly: false`. Their parsing algorithms are not replaced in this increment.
The return-contract implementations are exactly `lspextenderpython.ts` and `lspextender_curlyBraces.ts`; its runtime consumer is `OutlineUtils.documentSymbol2outlineSymbol`, and direct test invocations/tuple consumers are in `test/suite/outlineprovider_test/generic_handling_tests.test.ts`. Recheck references before editing (use LSP if available; otherwise search `getLanguageSpecificSymbolInformation` across `src/vscodeextension/src`). Wrapper/registration signatures remain unchanged.

### 2. Derive TypeScript ranges from syntax, not the provider's endpoint
Create `src/vscodeextension/src/outlineproviders/lspextendertypescript.ts` with `export class VpLspExtenderTypeScript extends VpLspExtenderCurlyBraces`, `constructor(languageString: 'typescript' | 'typescriptreact')`, and the same extraction method returning `LanguageSpecificSymbolInformation`. Reuse inherited language identification and existing unchanged adapter methods; override extraction completely and never call the brace scanner as a fallback. No TypeScript AST extractor exists in the inspected extension source.

Move TypeScript `^3.9.10` from devDependencies to dependencies in `src/vscodeextension/package.json`; regenerate its lockfile without upgrading the resolved 3.9.10 compiler. Register this adapter for only `typescript` and `typescriptreact` in `providerregistrer.ts`. Other language registrations remain as they are.

Parse `document.getText()` using `ts.createSourceFile` with `ScriptTarget.Latest`, parent pointers enabled, and TS/TSX script kind determined by `document.languageId`, not only a filename suffix. Use a source-only `ts.createProgram` with `noResolve: true`, `noLib: true`, and a `CompilerHost` serving only that in-memory source file to obtain public `getSyntacticDiagnostics(sourceFile)`; never read dependencies, emit, or execute analyzed code. Cache source file and diagnostics in a `WeakMap` keyed by `TextDocument` and invalidate on `document.version`. These compiler APIs were exercised successfully in a read-only planning probe, including rejection of malformed source.

Use `docSymbol.selectionRange.start` as the identity anchor, converted with `document.offsetAt`. Find a unique AST declaration whose name token contains that position; support constructor keywords and declaration-start positions when a provider selects a whole declaration. Normalize destructured binding names to their owning variable declaration. Do not locate a declaration merely by overlapping `docSymbol.range`, by provider name string, or by the next delimiter. Use AST positions converted with `document.positionAt` for corrected total/head/body ranges, even if the supplied total range is too long or too short.

Derive ranges by syntax category:
- Functions, methods, constructors and accessors with an implementation: heading starts at the name/constructor keyword and ends before the actual `body` opening brace; body is inside that body's own braces. A return type such as `{ value: string }` is part of the heading, not the implementation. An empty `{}` has an empty body range and `declarationOnly: false`.
- Function/method/constructor/accessor declarations or signatures without a body: heading contains the complete signature, excluding only its terminating semicolon; `rangeBody: null`, `declarationOnly: true`. This covers interface methods, abstract methods, ambient functions, and overload signatures. Do not substitute an overload implementation for the specific declaration the provider selected.
- Classes, interfaces, enums, and namespace/module blocks: use their own structural braces, not braces nested in type parameters, strings, comments, or members; body is the interior, `declarationOnly: false`. Walk nested module declarations to the module block.
- Variable/property/enum-member declarations with an initializer: heading is name/type/assignment prefix up to the initializer; body is the complete initializer expression, preserving object/array braces, strings, and multiline content. This uses existing Symbol/Text presentation, not a new constant card style. For a function/arrow initializer, split at its actual block body, or at its expression body; retain parameters and return type in the heading. No initializer means a complete declaration heading, null body, and no declaration-only status.
- Other matched named declarations, including type aliases and property signatures: show the complete declaration from its name as the heading, with null body and no declaration-only status. Never guess a block from punctuation in that text.

For one variable declarator, `totalRange` covers its complete variable statement (including declaration keyword and terminating semicolon when present); for a multi-declarator statement, cover only the selected declarator, never its siblings. Other declarations use their AST start/end. Keep existing attributes presentation; derive prefix attributes from syntax modifiers/declaration keyword, never from text containing a preceding declarator.

Before constructing a VS Code Range, require ordered offsets within the document, and require head/body inside the corrected total range. Trim only blank delimiter-adjacent lines as existing adapters do; keep inline indentation and all nonblank source, and preserve valid zero-width bodies. Reject unmatched/ambiguous anchors, malformed selected declarations, missing required delimiters, or invalid offsets with `Error('Cannot determine declaration boundaries for \"' + docSymbol.name + '\".')`. A syntax diagnostic intersecting the selected declaration (including an EOF diagnostic at its endpoint) makes extraction fail; an error elsewhere in the file does not hide an otherwise valid declaration. Use the existing error path, never the generic scanner or declaration-only status to conceal failure.

### 3. Preserve corrected boundaries through shared outline construction
Add `public declarationOnly: boolean = false` to `Outline.Symbol` in `src/vscodeextension/src/outlineproviderAPI/SymbolDefinition.ts`. In `OutlineUtils.documentSymbol2outlineSymbol`, consume named extraction fields, set `totalRange` from the adapter rather than `docSymbol.range`, set the new flag, and set `parts: []` for null or zero-width bodies. Never infer declaration-only status from an empty `parts` array. A declared-only result must have null body. Strict head/body-versus-total validation belongs in the new TypeScript adapter, not as a new rejection policy for the unchanged Python/other-language extraction algorithms.

Refactor `_provideOutlineForRange` to partition only its supplied body/file interval using monotonically increasing document offsets, rather than constructing ranges from potentially inverted line/column arithmetic:
1. Return `[]` immediately for an empty interval. Retain the existing ignored-kind and `") callback"` exclusions so ordinary fields/constants remain raw text in parent/file views.
2. Exclude provider children whose identity anchor is outside the interval (end-exclusive). For remaining nonignored children, build each corrected outline once; use its corrected `totalRange` for containment, ordering, and cursor advancement.
3. Sort by corrected start offset. Require contained, nonoverlapping child total ranges. If an anchored child still crosses the parent boundary or overlaps an already emitted child, throw `Error('Overlapping or out-of-bounds declaration ranges cannot be displayed safely.')` instead of reversing/clamping ranges or silently losing source.
4. Emit raw Text only for actual gaps and the final suffix within the parent interval. Reuse `_shouldAddTextOutline` to omit whitespace-only spans. Trim blank boundary lines without stepping past the gap's end or calling `lineAt(lineCount)`; preserve comments, inline content, and indentation on nonblank lines.

In `getDocumentSymbolAtPosition`, replace manual coordinate comparisons with proper VS Code range containment. Prefer the narrowest selection range containing the requested target position; otherwise choose the narrowest containing total range (position strictly before its end), returning null when no candidate contains it. Measure width with offsets in the opened target document and retain original traversal order for equal-width ties. Use a nonmutating flattened traversal instead of consuming provider-owned arrays with `splice`/`unshift`.

In `convert_LocationLinkArray_to_LocationArray`, use `targetSelectionRange`, falling back to `targetRange`; never use `originSelectionRange` as a target-file coordinate. Skip links lacking either target range. Keep existing empty/no-definition behavior. These changes make the new parser receive the intended identity anchor; they do not claim to repair a provider that resolves the wrong symbol.

### 4. Render explicit declaration-only status
`VisualizingTab._translate_outlineRanges2outlineEntities` mutates source objects in place and `_postOutlineEntities` sends them unchanged; the new boolean needs no serializer or protocol version. Leave these functions unchanged. There is no existing declaration-only status renderer to reuse.

In `src/web_visualizer/src/vpw/vpw_outline_window.js`:
- Remove the unused Node-only `const { title } = require("process");` import. The browser source never uses its binding, and jsstitcher recognizes only `require ("...");`, so this line would otherwise survive as an invalid browser runtime require.
- Define one local `DECLARATION_ONLY_STATUS` string with exact text `Declaration only — no body`.
- At the beginning of `_vp_fillClientarea`, when `CLASS_TYPE === "Symbol"` and `declarationOnly === true`, append a plain div with class `Window_Clientarea_DeclarationOnlyStatus` and `innerText` set to that string, then return. Do not create a `VpwCodeEditor`, Text model, fake source range, contentEditable element, or syntax highlighting for the status.
- In `_vp_addDeclaration`, after setting the signature text in the first cell, append a span with class `Window_DeclarationOnlyBadge` and that same text when the child flag is true. Keep the actual signature/model/range and existing row/button navigation unchanged. The badge participates in the existing declaration-row click only; it has no source-offset hit testing.
- False or absent flags preserve existing rendering. In particular, an implemented empty body stays an empty client area, without the status.

In `src/web_visualizer/src/vpw/vpw_outline_window.css`, add the two selectors using existing `var(--primary-1-foreground)`, Arial/Helvetica/sans-serif, italic text, and normal wrapping. Give the standalone status `padding: 12px 14px`; give the inline badge `font-size: 85%` and `margin-left: 8px`. Use no hardcoded theme colors or background and no fixed nonwrapping width; the exact status must remain readable in both existing themes.

Extend `src/web_visualizer/tests/shared_files/exampleoutlineData.js` with an independent `file:///usr/declaration_boundaries.ts` source/contentLineBuffer/outline entry. Its valid source is an abstract `DeclarationExamples` class containing `abstract read(): void;`, implemented `run(): string { return "implemented"; }`, and `empty(): void {}`. Register outline dictionary keys `DeclarationExamples`, `read`, `run`, and `empty`, with consistent real source positions, exact heading/body text, and flags true/false/false respectively. The parent parts reference those same method objects. This follows the existing fixture lookup by identifier; do not add dummy ranges that break row navigation.

In both existing `typescript_basic_show_class_dark_theme.html` and `typescript_basic_show_class_light_theme.html`, add the `DeclarationExamples` parent alongside `MyClass2` in `showInitialWindows`. Use these existing pages for browser proof; no new fixture framework. Click each new row to verify the standalone status, actual implementation, and empty implementation.

### 5. Make the existing regression harness usable for this change
In `src/vscodeextension/src/test/suite/index.ts`, replace the obsolete local extension ID with `visualprogrammingx.SourceCodeVisualizer`, matching the current manifest. In `src/vscodeextension/src/test/main.ts`, guard the entry point with `if (require.main === module) { main(); }`; importing `getTestDirPath` must not recursively start another VS Code test run. Keep the existing test runner and Mocha discovery rather than creating a second permanent harness.

Add `src/vscodeextension/src/test/suite/outlineprovider_test/range_boundary_and_declaration.test.ts`, using existing MemoryFile/AssertX and real VS Code Position/Range/DocumentSymbol objects with controlled provider ranges. Give documents explicit `typescript`/`typescriptreact`/`python` language IDs as appropriate. Keep malformed-source cases in memory, not in on-disk `.ts` fixtures that tsc compiles.

Update tuple accesses in `generic_handling_tests.test.ts` to named fields. Keep its scanner-specific and C++-syntax cases on `VpLspExtenderCurlyBraces('cpp')`; do not feed `public:`/`virtual aa() = 0;` or a contextless constructor fragment to the TypeScript parser. Cover actual valid TypeScript constructors/classes in the new suite. Delete the old child-order test that asserts only a part count; replace its coverage with source-order and exact-text assertions in the new suite, rather than pinning incidental counts. Avoid new tests that merely echo flags through serializers or compare source strings in implementation files.

The contract migration in step 1 must include these existing test edits. The syntax adapter and shared construction changes depend on that contract; the renderer depends only on the `declarationOnly` field, so it can be implemented independently after the field is defined.

## Critical files & anchors
- `src/vscodeextension/src/test/suite/memoryfile.ts` — `register_memoryFileProvider` and `MemoryFile.createDocument`: existing in-memory source pattern; supply synthetic symbols because language-provider behavior for this scheme is not established.
- `src/web_visualizer/tests/shared_files/backendEmulation.js` — `BackendMock.postMessage`, lines 88–96: resolves row clicks by reading an identifier at `displayTextRange` start, so added visual fixture ranges must match their source.
- `src/vscodeextension/.vscodeignore` — excludes TypeScript sources but not production JavaScript modules; moving the compiler into production dependencies must leave its runtime JS in the package.

## Verification

### Deterministic regression coverage
In the new suite, assert exact extracted source with `document.getText(range)`, corrected total ranges, source-order parts, and declaration-only behavior. Pair these with bound/containment assertions; part counts alone are not proof.

| Input/scenario | Required observable result |
| --- | --- |
| `const limit = 42` followed by `console.log(limit)` and `function later() { return 7; }` | Heading trimmed is `limit =`, body is `42`, total ends at the constant, and neither unrelated construct appears in either field. Run with correct, oversized-to-EOF, and name-only total ranges while keeping the correct identity anchor. |
| Multiline object/array initializer containing nested objects, strings such as `"{;}"`, comments, and a template literal | Complete initializer is preserved; no cutoff at punctuation within it and no following statement included. |
| `const a = 1, b = 2;` selecting `b` | Heading `b =`, body `2`, total excludes `a`. A destructured binding selects its owning declarator without including a subsequent statement. |
| Interface `read(value: { text: string }): { value: string };`, abstract method, and ambient/overload signatures | Complete signature retained, body null, outline parts empty, declaration-only true; the semicolon is not a code body. |
| Comparable implementation returning an object, plus `empty(): void {}` | Actual return statement shown for the first; empty implementation is declaration-only false, never mislabeled because its parts are empty. |
| Constructor with selectionRange equal to totalRange, valid class wrapper, plus arrow/function initializers | Correct declaration anchor and actual body; no dependence on an identifier-only selectionRange. |
| Parent with out-of-order children and an oversized method range extending into the next sibling | Child total is recovered from syntax, children remain in source order, and sibling/trailing raw text is neither duplicated nor swallowed. Include same-line methods, empty parents/files, and EOF without a trailing newline. |
| Anchor outside any declaration, malformed selected declaration, overlapping corrected child ranges | Existing extraction error path, not a misleading declaration-only result or a guessed next-function boundary. A valid selected declaration survives a syntax error elsewhere. |
| Multiline symbol selection and LocationLink with only targetRange plus a different originSelectionRange | Lookup uses target coordinates and correct containing symbol; provider symbol arrays remain intact for later use. Restore any replaced provider-command functions in `finally`; isolate synthetic-provider registrations by a dedicated URI scheme. |
| Same editable TextDocument after changing its initializer | Second extraction uses the new document.version/source rather than stale cached offsets. Use an untitled document for this case; discard its changes in teardown. |
| TSX source, CRLF source, and a non-ASCII character before the selected declaration | Correct syntax kind and UTF-16 document positions; no off-by-one slicing. |
| Python function, class with nested methods, multiline parameters, and `pass` implementation | Existing Python heading/body source remains intact through the named contract and shared partitioner; `pass` is shown, never declaration-only. |

Add a valid on-disk manual fixture at `src/vscodeextension/src/test/testfiles/typescript/declaration_boundaries.ts`. Use exported `limit`, multiline `config`, `Reader.read`, `Base.run`, `Worker.read`, `Worker.empty`, and `later` with the constructs above, separated by `console.log("UNRELATED_STATEMENT")` and `console.log("AFTER_CONFIG")` sentinels. Ensure `Worker implements Reader` and all implemented signatures type-check. Keep malformed/abstract instantiation cases out of this fixture.

### Commands and live proof
Run from the repository root unless a working directory is stated. Required tools found during planning: Node, npm, Python 3, and the `code` CLI. The local compiler is TypeScript 3.9.10. Builds/tests were not run in read-only planning.

1. When changing dependency classification, run `npm install --package-lock-only --ignore-scripts` in `src/vscodeextension`; if dependencies are absent, use `npm ci --ignore-scripts` there. Ignoring install scripts avoids invoking this package's release-oriented prepublish hook. Verify the lockfile still resolves TypeScript 3.9.10 and lists it as production.
2. After the implementation is integrated, run `npm run test:ext`. This already builds the canvas and extension and runs lint before the suite; inspect the full log because the canvas build uses semicolon-separated commands. Do not count compilation as the behavioral check.
3. In `src/vscodeextension`, run `./node_modules/.bin/vsce ls` and verify the packaged-file list contains `node_modules/typescript/lib/typescript.js`. No VSIX publication is part of this work.
4. Start `npm run serve:web`; open `http://localhost:8080/tests/typescript_basic_show_class_dark_theme.html` and `http://localhost:8080/tests/typescript_basic_show_class_light_theme.html`. Click the three `DeclarationExamples` rows, inspect the standalone status/implemented/empty states and DOM, capture a screenshot, and close the browser tabs. A status must not be inside a syntax-highlighted code block or have source-offset hit testing. This browser check supplements, not replaces, the next Extension Host check.
5. Start root **Run Extension** (F5; root launch config runs `build:ext`), or launch the installed VS Code using `code --new-window --extensionDevelopmentPath="$PWD/src/vscodeextension" "$PWD/src/vscodeextension/src/test/testfiles"`. Open `typescript/declaration_boundaries.ts`. Invoke **Visual Programming: Visualize This** (`code-visualizerzer.visualize`) on `limit`, `config`, `Reader.read`, `Base.run`, `Worker.read`, and `Worker.empty`; also use **Visual Programming: Visualize File**. Confirm exact declaration boundaries, no sentinel/later-function leakage, correct status, visible implemented body, and no status on the empty implementation. Open a method from its parent class/interface header to exercise connected navigation. Use **Show in code** on actual source text and verify the correct file/position; the status itself is not source.
6. At a breakpoint in `OutlineUtils.documentSymbol2outlineSymbol`, inspect the raw `docSymbol.range`/`selectionRange` and resulting adapter ranges for the fixture; record whether the installed provider is correct rather than blaming it from the rendered symptom. The deliberately corrupted-range regressions separately prove recovery when a correct identifier comes with a bad endpoint.
7. With Python/Pylance enabled in that Development Host, open `python/xx_manual_tests.py`; visualize `aaa`, class `Test`, `ChildA.foo2`, and `breaking_parameters`. Verify actual source, nested navigation, and Show in code, without a false declaration-only status. Save → stop debugging → relaunch when source changes; there is no full hot reload.

For automated visual access to the actual Development Host, launch the installed `/Applications/Visual Studio Code.app/Contents/MacOS/Code` with the same extension-development/workspace arguments and `--remote-debugging-port=9333` in an isolated temporary user-data directory, then attach the browser tool to `http://127.0.0.1:9333`. Discover the workbench/webview targets rather than guessing frame URLs, use the Command Palette/editor to run the same scenarios, and capture the actual canvas. If CDP access is unavailable, the F5/manual scenario remains required and must be reported as unverified until observed, not replaced by browser-only fixture evidence.

## Assumptions & contingencies
- Scope is the user-selected R04 + R10 increment, with targeted TypeScript/TSX extraction and Python regression validation. The user can request broader language parsing in a separate decision; do not apply TypeScript syntax rules to C++, Java, Dart, PHP, or JavaScript registrations in this increment.
- Retain the currently resolved TypeScript 3.9.10 parser/compiler rather than silently upgrading the stack. If a selected declaration uses unsupported newer syntax or is malformed, surface the specified extraction error; do not fall back to broad scanning or claim declaration-only.
- A correct provider identity anchor is required to recover a wrong endpoint. If the provider resolves a different valid declaration, the adapter cannot infer the intended target; capture the provider result and report the separate resolution defect rather than fabricate a correction.
- The legacy test launcher pins VS Code 1.61.1 and attempts Python/Pylance installation. If download/Marketplace/legacy-runtime compatibility prevents that launcher from starting the suite, use the already installed current VS Code with `code --new-window --extensionDevelopmentPath="$PWD/src/vscodeextension" --extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index" "$PWD/src/vscodeextension/src/test/testfiles"` after building. Ensure Python and Pylance are installed/enabled in the selected test host because existing suite activation requires them. Record which host ran and the legacy failure; do not modernize the whole runner or silently omit Python checks. If neither host can execute, finish reachable adapter/browser checks and report the exact live-validation prerequisite as a blocker, not a completed milestone.

