# Phase 1 Group A — Trust LSP Ranges, Fix Our Extraction (R04 + R10)

## Goal
Fix our Python and TypeScript code when the LSP gives correct ranges. **LSP chooses the whole declaration. We only split its contents for display.** Python first; both languages must work.

## What is already proved
Correct fake LSP ranges still caused **7 failures; 3 simple cases passed** in the existing code. Python chose colons inside strings/values; TypeScript chose the wrong braces or invented a semicolon body.

These were Node probes with VS Code stand-ins, not a live LSP test. A small replacement prototype passed 6 Python and 9 TypeScript checks. Production code is unchanged. Full evidence: `local://trusted-lsp-range-evidence.json`.

## Main rule
```text
whole = symbol.range                    // keep the LSP range
text  = document.getText(whole)          // read this declaration
parts = split_by_language(text)         // heading + body/value

if parts leave whole, or start > end:
    report error                       // do not fix it by reading more code

display(whole, parts)
```

**No worker. No whole-file parsing. No replacement LSP endpoints.**
Use bundled syntax libraries, loaded on first use. They still cost CPU/RAM; they only split the LSP-selected text. A supplied parent declaration may provide context for an ambiguous property.

## Exact edits
Paths: `EXT/` = `src/vscodeextension/src/`; `WEB/` = `src/web_visualizer/`.

### 0. Save the approved plan and writing rule
Before implementation, save this file to `features/declaration-boundaries/plan.md`. Follow `specs/context.md` and `docs/architecture-and-development.md`; keep `specs/` read-only. Write `results.md` only after finished validation.

Append this requested rule to root `AGENTS.md`, keeping its existing instructions:
```markdown
## Shared Plan Readability
- Use simple terms and short sentences.
- Show decisions with code-like steps, small tables, and input → output examples.
- State what changes and why once; do not repeat the same explanation.
- Keep exact files, APIs, edge cases, and checks so another agent can implement the plan.
- Clearly separate proposed work from tested results.
```

### 1. Give “no body” a real value
In `EXT/outlineproviderAPI/lspextenderprovider.ts`, replace the `any[]` result:
```ts
export interface LanguageSpecificSymbolInformation {
  rangeHead: vscode.Range;
  rangeBody: vscode.Range | null;  // null = no body; empty range = empty body
  attributes: Outline.Attribute[];
  declarationOnly: boolean;
}
export interface SymbolExtractionContext {
  ancestors: readonly vscode.DocumentSymbol[]; // nearest parent first
}
// New provider method signature:
getLanguageSpecificSymbolInformation(
  document: vscode.TextDocument,
  docSymbol: vscode.DocumentSymbol,
  context?: SymbolExtractionContext
): LanguageSpecificSymbolInformation;
```

Migrate together: both current adapters, `OutlineUtils.documentSymbol2outlineSymbol`, and tuple reads in `EXT/test/suite/outlineprovider_test/generic_handling_tests.test.ts`. Exact reference search: `getLanguageSpecificSymbolInformation` under `EXT/`; use LSP references if available. No old tuple API remains.

The generic brace adapter keeps its existing algorithm for other languages and returns `declarationOnly: false`. The new result deliberately has **no `totalRange`**.

### 2. Shared parsing rules
Implement these inside the language adapters; no new service:
```text
if cached document version is current AND cached range contains this symbol:
    reuse its parsed tree
else:
    parse the supplied declaration; replace the cache entry

pick the declaration at selectionRange.start
    accept its name, constructor keyword, or declaration-start selection
    never match an unrelated reference just because its name is the same

documentOffset = fragmentStart + parserOffset - addedPrefixLength
check offsets BEFORE constructing vscode.Range   // Range swaps reversed ends
```

- One most-recent parsed declaration per document in a `WeakMap`; store version, language, start/end, text, tree, and prefix length. No growing tree list.
- Invalid positions, ambiguous selection, malformed selected syntax, or out-of-range output → `Error('Cannot determine declaration boundaries for "' + docSymbol.name + '".')`.
- Reject syntax errors in the selected declaration, including missing-token errors at its end. An error in a different declaration must not hide a valid selection.
- Preserve original text/indentation. Remove only blank edge lines/edge whitespace; keep inline source. Null and zero-width bodies stay distinct.

### 3. Python: use the real colon, not the next colon
Replace punctuation searches in `EXT/outlineproviders/lspextenderpython.ts`. Keep its registration and other methods.

```text
function or class:
    colon = parsed Body node's direct ":" child
    heading = name → colon
    body = after colon → LSP range.end
    if header has only whitespace after colon:
        body starts on the next line, but never past LSP range.end

assignment with a value:
    heading = target + type + assignment operator
    body = complete right-hand value             // keep { }, [ ], strings

annotation/type declaration without a value:
    heading = complete declaration
    body = null

declarationOnly = false                          // always for Python
```

Keep `pass`, `...`, docstrings, and abstract-method bodies as real source. Keep decorators/`async` as attributes only when their source is inside the LSP range.

Parser setup:
- Production packages in `src/vscodeextension/package.json`: `@lezer/python` **1.1.19**, `@lezer/common` **1.5.5**; lock `@lezer/lr` **1.4.12**, `@lezer/highlight` **1.2.5**. No Python process.
- Parse the fragment with Lezer. Inspect `node.type.isError`; a recovered parse is not automatically valid.
- Match function/class names directly. For assignments, match targets before the final direct `AssignOp`/`UpdateOp`, not type names or right-hand references. Support chained, destructured, and attribute targets; keep separate semicolon statements separate.
- Top-level fragment: parse unchanged. Indented fragment: restore only the whitespace before its first token, then prepend `if True:\n`. Do not change later lines or multiline strings. If the preceding text is code, not whitespace, do not copy it.
- Example parser-only input: `"if True:\n    " + decoratedMethodText`. Subtract that prefix when mapping positions. Added text is never displayed.

### 4. TypeScript: decide which thing owns the braces
Add `EXT/outlineproviders/lspextendertypescript.ts`: `VpLspExtenderTypeScript extends VpLspExtenderCurlyBraces`, constructor `(language: 'typescript' | 'typescriptreact')`. Override extraction; register it only for TS/TSX in `providerregistrer.ts`. No syntax-based TS extractor exists in the current code.

|Parsed thing|Heading|Body/value|`declarationOnly`|
|---|---|---|---|
|Function/method with `{ ... }`|Before its actual body `{`|Inside that body|false|
|Function/method signature with no body|Full signature, minus final `;`|null|true|
|Method with `{}`|Signature|Empty range|false|
|Variable/property/enum member with a value|Name/type/assignment prefix|Entire value, including its braces|false|
|Arrow/function stored in a variable|Before its block `{` or body expression|Block interior or expression|false|
|Class/interface/enum/namespace|Before its own opening `{`|Inside its own braces|false|
|Other declarations, e.g. type aliases or fields without values|Full declaration heading|null|false|

Return-type braces stay in the heading. For multiple variables, select only the chosen name/value; keep the LSP total range unchanged. Do not substitute another overload's body. Attributes come from real source modifiers, never added parser text.

Parser setup:
- Move existing TypeScript `^3.9.10` from devDependencies to dependencies; retain resolved **3.9.10**.
- Use `ts.createSourceFile` with `ScriptTarget.Latest`, parent pointers, and TS/TSX mode from `document.languageId`. Use its scanner to skip comments when checking leading keywords.
- Get syntax errors with `ts.createProgram`, `noResolve: true`, `noLib: true`, serving only this fragment. No project type checking, imports, emit, or execution.

Some fragments need temporary surrounding text **only so the parser can read them**:

|LSP fragment|Parser input|
|---|---|
|Complete top-level declaration|Unchanged|
|Variable missing `const`/`let`/`var`|`"const " + fragment`|
|Standalone method/constructor/accessor or known class/interface property|`"class __RangeScope {\n" + fragment + "\n}"`|
|Enum member|`"enum __RangeScope {\n" + fragment + "\n}"`|
|Ambiguous property, e.g. `name: value`|Use its nearest suitable **LSP-supplied parent range**; select the original property inside it|

For the last case, reuse a cached parent first; otherwise walk `context.ancestors` nearest-first. No suitable parent → extraction error, not a guess or whole-file parse. Added prefixes/suffixes never enter output ranges.

### 5. Keep children and navigation inside the right range
In `EXT/outlineproviderAPI/SymbolDefinition.ts`, add `declarationOnly = false` to `Outline.Symbol`.

In `EXT/outlineproviderAPI/utils/outlineutils.ts`:
```text
documentSymbol2outlineSymbol:
    totalRange = docSymbol.range                 // unchanged
    use named heading/body/attribute fields
    parts = [] if body is null or empty

_provideOutlineForRange:
    sort a COPY of children by their LSP ranges
    cursor = body.start
    for each child inside body:
        emit source between cursor and child.start
        build child once
        cursor = child.end
    emit remaining source through body.end
```

- Preserve existing ignored-kind/`") callback"` rules. Reuse `_shouldAddTextOutline` to skip blank gaps. Never read `lineAt(lineCount)`.
- Skip children wholly outside the body. A crossing/overlapping child → `Error('Overlapping or out-of-bounds declaration ranges cannot be displayed safely.')`.
- `_getFlatDocumentSymbols` and child traversal record parents in a private `WeakMap<DocumentSymbol, DocumentSymbol>`, without changing provider arrays. Pass that ancestor chain to extraction.
- `getDocumentSymbolAtPosition`: use real containment; choose the smallest containing selection range, else smallest full range. End-exclusive; original order breaks ties.
- `convert_LocationLinkArray_to_LocationArray`: use `targetSelectionRange ?? targetRange`, never `originSelectionRange` in the target file. Keep no-definition behavior.
- Strict new extraction checks apply to Python/TS, not a redesign of other language adapters.

### 6. Show status text, not fake code
In `WEB/src/vpw/vpw_outline_window.js`:
```text
DECLARATION_ONLY_STATUS = "Declaration only — no body"

_vp_fillClientarea:
    if CLASS_TYPE == "Symbol" and declarationOnly == true:
        show a plain status div; return
    otherwise use existing rendering

_vp_addDeclaration:
    keep signature and row navigation
    if declarationOnly: append a status span beside the signature
```

Remove the unused `require("process")` import: it survives the browser bundler. Do not create a code editor, fake source range, or editable element for status. The existing visualizer sends the new flag unchanged; no message format change.

In the matching CSS:
- Div: `.Window_Clientarea_DeclarationOnlyStatus`, padding `12px 14px`.
- Span: `.Window_DeclarationOnlyBadge`, font size `85%`, left margin `8px`.
- Both: existing `var(--primary-1-foreground)`, Arial/Helvetica/sans-serif, italic, normal wrapping; no hardcoded theme colors.

### 7. Test setup and order
1. Fix `EXT/test/suite/index.ts` extension ID to `visualprogrammingx.SourceCodeVisualizer`; guard `EXT/test/main.ts` with `if (require.main === module) { main(); }`.
2. Migrate the shared result and its existing tests together.
3. Implement Python, then TS, then shared range handling. Rendering depends only on the new flag.
4. Add `python_declaration_boundaries.test.ts`, `typescript_declaration_boundaries.test.ts`, and `outline_partition.test.ts` under `EXT/test/suite/outlineprovider_test/`.

Reuse MemoryFile/AssertX and real VS Code ranges. Use extensions `"py"`, `"ts"`, `"tsx"` without a leading dot; set the language explicitly. Keep malformed source in memory. Use an editable untitled document for cache-invalidating edits.

Move C++-specific scanner cases in `generic_handling_tests.test.ts` to the `'cpp'` adapter. Replace the count-only child-order test with exact source/order checks. New tests check behavior, not copied fields or source-code wording.

## Critical files
- `EXT/test/suite/memoryfile.ts`: `MemoryFile.createDocument` and `register_memoryFileProvider` provide the existing fake-document setup.
- `WEB/tests/shared_files/backendEmulation.js`: `BackendMock.postMessage` finds names from heading positions; browser fixture ranges must be real.
- `src/vscodeextension/.vscodeignore`: production parser JS must ship; TypeScript source files are excluded.

## Checks: input → output
For each row, give the fake LSP an exact declaration range and name selection. Append unrelated code after it. Assert those input slices **before** testing extraction.

Here `\n` means a newline. Compare outer-trimmed heading/body text; separate tests below check exact indentation.

|Input|Expected heading|Expected body/value|
|---|---|---|
|Python `limit = 42`|`limit =`|`42`|
|Python `def build(value=tuple(), label=":"):\n    return value`|`build(value=tuple(), label=":")`|`return value`|
|Python `config = {\n    "message": ":",\n    "values": [1, 2],\n}`|`config =`|Complete right-hand dictionary, unchanged|
|Python `def simple():\n    return 1`|`simple()`|`return 1`|
|Python `def placeholder():\n    pass`|`placeholder()`|`pass`|
|TS `const limit = 42`|`limit =`|`42`|
|TS `const config = { value: 42 };`|`config =`|`{ value: 42 }`|
|TS interface member `read(): void;`|`read(): void`|null; declaration-only true|
|TS class member `empty() {}`|`empty()`|Empty; declaration-only false|
|TS class member `read(): { value: number } { return { value: 1 }; }`|`read(): { value: number }`|`return { value: 1 };`|

Test construction:
- Python suffix: `\nprint("AFTER")\ndef later():\n    return 7\n`.
- TS suffix: `\nconsole.log("AFTER");\nfunction later() { return 7; }\n`.
- Put TS members inside an interface/class before adding that suffix. Use `Variable` for Python values, `Constant` for TS constants, `Function` for Python functions, `Method` for TS members.
- All total ranges must equal their fake LSP inputs; all output ranges stay inside them. Only the bodyless TS row has `declarationOnly: true`.

### Edge checks
|Cases|Required result|
|---|---|
|Python decorators/async, nested methods, tabs, multiline strings|Correct mapped positions; no changed string content or added parser text|
|Python chained/destructured/attribute assignments, semicolon statements, annotation-only declarations|Correct target/value split; no-value is not a bodyless method|
|Python `...`, docstrings, abstract bodies, `.pyi` source|Keep real body text|
|TS arrays/templates/JSX, bare declarators, multiple variables, enum/class/object properties|Whole selected value; no lost braces or synthetic attributes|
|TS object-shaped types, abstract/ambient/overload signatures, arrows, constructors|Correct body choice; no overload substitution|
|Children out of order, same-line declarations, EOF without newline|Sorted output; no lost/duplicated gaps or invalid line reads|
|Invalid selected syntax or bad output offsets|Explicit error; no range expansion|
|Valid selection next to malformed source|Outside error does not affect it|
|Repeat request, edit, CRLF, non-BMP character|Reuse safely; changed version gets fresh UTF-16 offsets|
|Target link with different origin coordinates; repeat lookup|Navigate to target; do not mutate provider arrays|

Use test-only URI schemes for fake providers; dispose them in `finally`. Do not test invented bad-LSP endpoint recovery.

### Browser and real-extension proof
In `WEB/tests/shared_files/exampleoutlineData.js`, add source/line-buffer/outline entries for `file:///usr/declaration_boundaries.ts`:
```ts
abstract class DeclarationExamples {
  abstract read(): void;
  run(): string { return "implemented"; }
  empty(): void {}
}
```
Keys: `DeclarationExamples`, `read`, `run`, `empty`; flags true only for `read`. Parent parts use those same method objects; ranges point to actual source.

Add that parent beside `MyClass2` in `showInitialWindows` in both existing `typescript_basic_show_class_dark_theme.html` and `_light_theme.html`.

Add manual files under `EXT/test/testfiles/`:
- `python/declaration_boundaries.py`: the Python cases above; decorated async `async_build`; class `Worker` with two methods; ABC/`abstractmethod` containing `pass`; `placeholder` with `...`; `doc_only` with a docstring. Define an identity decorator/import ABC helpers. Add unrelated sentinel statements between declarations; analyze, do not execute.
- `typescript/declaration_boundaries.ts`: `limit`, `config`, `Reader.read`, abstract `Base.run`, implemented `Worker.read`, `Worker.empty`, and `later`. `Worker implements Reader`. Add unrelated sentinel calls.

Run after implementation:
|Where|Command/check|
|---|---|
|`src/vscodeextension`|`npm install --package-lock-only --ignore-scripts` then `npm ci --ignore-scripts`; retain pinned parser versions|
|Repository root|`npm run test:ext`; inspect build output as well as exit status|
|`src/vscodeextension`|`./node_modules/.bin/vsce ls`; confirm TypeScript runtime and all four Lezer package runtimes are included|
|Repository root|`npm run serve:web`; open both fixture pages at `http://localhost:8080/tests/`; click read/run/empty; verify status/code/empty in both themes, capture screenshots, close tabs|
|VS Code Run Extension (F5)|Python fixture first, then TS. Use **Visual Programming: Visualize This** (`code-visualizerzer.visualize`), **Visualize File**, and **Show in code**|

Live checks: no sentinel leakage; correct text/status; parent-to-method navigation works; `totalRange` equals raw LSP range. Capture raw/extracted ranges at `OutlineUtils.documentSymbol2outlineSymbol` and record provider versions. Recheck `python/xx_manual_tests.py`: `aaa`, `Test`, `ChildA.foo2`, `breaking_parameters`. Relaunch after source changes.

For automated UI access, installed VS Code is `/Applications/Visual Studio Code.app/Contents/MacOS/Code`; use the extension/workspace paths below, an isolated temporary profile, and `--remote-debugging-port=9333`. Attach browser tooling there; if unavailable, use F5/manual observation.

If the old VS Code 1.61.1 runner cannot start, use installed current VS Code from the repository root:
```sh
code --new-window \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index" \
  "$PWD/src/vscodeextension/src/test/testfiles"
```
Require Python/Pylance. If neither host works, finish reachable checks and report the exact blocker; do not claim live validation.

## Approved follow-up — Hide declaration-only bodies

The user requested hiding the body instead of showing the declaration-only message. This supersedes section 6's status div/badge and the corresponding status-text checks above.

- Keep `declarationOnly` in the model and preserve signature/title navigation.
- Hide the declaration-only window's client area. Remove the status message, row badge, and their unused styles.
- Leave implemented and genuinely empty method bodies unchanged.
- Rebuild the browser bundle and extension assets. Click read/run/empty in both themes; verify hidden declaration-only bodies, retained source bodies, and signature navigation. Capture new screenshots.
- After validation, update the changelog, architecture guide, and this feature's results while preserving earlier evidence.


## Approved follow-up — Complete Python assignments and compact decorators

The user approved using the bundled Python parser beyond name-only variable ranges. This supersedes the original strict-range rule only for Python variables/constants/fields/properties whose LSP range contains just the selected name.

- Preserve provider symbols/ranges unchanged. Resolve the enclosing assignment or annotation by syntax at the selected name position. Reuse a valid cached/supplied parent fragment first; otherwise parse a local fragment starting on the name's line, extending only while the selected statement has an incomplete end.
- Use the syntax node's complete source range, not punctuation scanning or the next symbol's position. Keep malformed syntax and unrelated reference selections as explicit errors. Keep full LSP declaration ranges and other languages unchanged.
- Add optional `rangeDeclaration` to the extraction result for this resolved source range. Shared outline construction uses it as the displayed symbol's `totalRange`; raw provider ranges remain unchanged.
- Keep a single most-recent parsed fragment per document, invalidated on version/language changes. Grow incomplete local fragments geometrically rather than reparsing every physical line.
- Render multiline attributes as compact first-line labels with ellipsis; expose full original attributes on hover. Constrain metadata to one line within the window so decorators cannot overlap its heading/body.
- Add regressions for name-only scalar/multiline/annotation/semicolon/chained/reference/malformed/cache cases. Rebuild the extension and run the suite.
- Required live verification: open `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py`, all eight affected constants, and file → `_build_dag` → `ingestion_dag`. Inspect actual headings, values, decorator layout, source navigation, and absence of adjacent-statement leakage. Do not modify or execute the Airflow file.
- Update architecture/changelog and completed results only after verification. Preserve prior validation as historical evidence.

