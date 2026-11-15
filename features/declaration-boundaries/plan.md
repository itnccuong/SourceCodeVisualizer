# Phase 1 Group A — Trust LSP Ranges, Fix Our Extraction (R04 + R10)

## Goal
Fix our Python and TypeScript code when the LSP gives correct ranges. **LSP chooses the whole declaration. We only split its contents for display.** Python first; both languages must work.

## Planning evidence
Before implementation, fake-provider probes reproduced wrong Python colons and TypeScript braces despite correct declaration ranges. These were stand-in probes, not live LSP validation; prototype checks did not establish production behavior.

## Main rule
```text
whole = symbol.range                    // keep the LSP range
text  = document.getText(whole)          // read this declaration
parts = split_by_language(text)         // heading + body/value

if parts leave whole, or start > end:
    report error                       // do not fix it by reading more code

display(whole, parts)
```

**No worker, whole-file parsing, project-wide index, or replacement LSP endpoints.**
Use bundled syntax libraries, loaded on first use, to split the supplied declaration. A parent declaration may provide context for an ambiguous property. The approved Python name-only assignment exception is specified in the follow-up below.

## Exact edits
Paths: `EXT/` = `src/vscodeextension/src/`; `WEB/` = `src/web_visualizer/`.

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

### 6. Hide declaration-only bodies
As amended by the approved follow-up, keep the `declarationOnly` flag and signature/title navigation, but hide the window's client area. Do not show a status message, row badge, fake source, or editable placeholder. Implemented methods and genuinely empty implementations retain their existing behavior. The existing visualizer sends the flag unchanged; no message format change is needed.

Remove the unused `require("process")` import from `WEB/src/vpw/vpw_outline_window.js`, along with superseded status/badge rendering and styles.

### 7. Test setup and order
1. Ensure `EXT/test/suite/index.ts` activates the development extension; guard `EXT/test/main.ts` with `if (require.main === module) { main(); }`.
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
In `WEB/tests/shared_files/exampleoutlineData.js`, add source/line-buffer/outline entries for the `declaration_boundaries.ts` fixture:
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

Run the full extension suite with Python/Pylance available. Verify that the packaged runtime contains TypeScript and all four Lezer packages.

In both TypeScript class browser fixture themes, click `read`, `run`, and `empty`: declaration-only bodies stay hidden, implemented source remains visible, and genuine empty implementations keep their existing client area. Parent rows and title **Show in code** navigation must remain usable.

In a real VS Code development host, exercise Python first, then TypeScript through **Visualize This**, **Visualize File**, and **Show in code**. Check no sentinel leakage; correct source; parent-to-method navigation; and equality between raw LSP ranges and displayed `totalRange` for full declarations. Capture raw/extracted ranges rather than treating browser backend emulation as provider proof. Recheck `python/xx_manual_tests.py`: `aaa`, `Test`, `ChildA.foo2`, `breaking_parameters`.

## Approved follow-up — Hide declaration-only bodies

The approved UI amendment is incorporated in section 6. It replaces the original declaration-only status text/badge with a hidden body, without changing the model or navigation contract. Verify read/run/empty and collapse/re-expansion in both themes.


## Approved follow-up — Complete Python assignments and compact decorators

The user approved using the bundled Python parser beyond name-only variable ranges. This supersedes the original strict-range rule only for Python variables/constants/fields/properties whose LSP range contains just the selected name.

- Preserve provider symbols/ranges unchanged. Resolve the enclosing assignment or annotation by syntax at the selected name position. Reuse a valid cached/supplied parent fragment first; otherwise parse a local fragment starting on the name's line, extending only while the selected statement has an incomplete end.
- Use the syntax node's complete source range, not punctuation scanning or the next symbol's position. Keep malformed syntax and unrelated reference selections as explicit errors. Keep full LSP declaration ranges and other languages unchanged.
- Add optional `rangeDeclaration` to the extraction result for this resolved source range. Shared outline construction uses it as the displayed symbol's `totalRange`; raw provider ranges remain unchanged.
- Keep a single most-recent parsed fragment per document, invalidated on version/language changes. Grow incomplete local fragments geometrically rather than reparsing every physical line.
- Render multiline attributes as compact first-line labels with ellipsis; expose full original attributes on hover. Constrain metadata to one line within the window so decorators cannot overlap its heading/body.
- Add regressions for name-only scalar/multiline/annotation/semicolon/chained/reference/malformed/cache cases and run the full extension suite.
- Required live verification: open the actual Airflow source file `trino_ingestion_dag_factory.py`, all eight affected constants, and file → `_build_dag` → `ingestion_dag`. Inspect headings, complete values, decorator layout, source navigation, and absence of adjacent-statement leakage. Do not modify or execute the file.

