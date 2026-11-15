# Declaration Boundaries — Completed Results

## Goal and acceptance

Execute the [approved plan](plan.md): split Python and TypeScript declarations into accurate headings and bodies without confusing absent bodies with empty implementations. Preserve source text, child ordering, and navigation coordinates.

The LSP supplies declaration ranges. The only approved range expansion is for exact name-only Python variable symbols, described in the [assignment follow-up](#follow-up--complete-python-assignments-and-compact-decorators). Declaration-only windows now [hide their bodies](#follow-up--hide-declaration-only-bodies); the original status text and badges are obsolete.

## Plan as executed

- Replaced extraction tuples with named heading/body/attribute fields, nullable `rangeBody`, `declarationOnly`, and supplied ancestor context. Other languages retain the generic brace algorithm.
- Added lazy Python and TypeScript/TSX fragment parsing with one cached fragment per document, invalidated by version/language. Parser-only wrappers never become displayed source or attributes. No worker, Python process, whole-file parser, project-wide index, or replacement LSP endpoint was added.
- Validated offsets before constructing VS Code ranges. Invalid positions, ambiguous or unrelated-reference selections, malformed selected syntax, and out-of-range output remain explicit errors. Syntax errors in unrelated declarations do not invalidate a valid selection.
- Sorted a copy of provider children, retained exact source gaps, skipped children wholly outside the body, and rejected crossing/overlapping displayed ranges. Provider arrays remain unchanged.
- Definition lookup uses end-exclusive containment and stable smallest-range selection. Location links use target-file selection/range coordinates, not origin coordinates.

### Implementation decisions

- Python uses Lezer syntax to find the direct body colon or assignment operator, preserving complete values, indentation, and multiline strings. Decorator/async attributes come from original source. Both name selections and declaration-start selections at the first `@` are accepted; decorator-name references are not.
- TypeScript uses the runtime compiler **3.9.10** for TS/TSX fragment syntax diagnostics, without project type checking, imports, execution, or emit. Newer syntax is not promised.
- Temporary indentation/class/enum/variable wrappers exist only in parser input. Ambiguous properties require a suitable LSP-supplied ancestor; no ancestor means an extraction error, not a guess.
- A null body means absent source; a zero-width body means an actual empty implementation. Only bodyless TypeScript callable signatures set `declarationOnly`. Python `pass`, ellipsis, docstrings, and abstract bodies remain source.
- Fake-provider tests explicitly isolate language providers: a custom URI scheme alone does not prevent the built-in TypeScript provider from answering.

## Key changes

Paths are relative to `src/`.

| Area | Files |
|---|---|
| Extraction contract/model | `vscodeextension/src/outlineproviderAPI/lspextenderprovider.ts`, `SymbolDefinition.ts` |
| Language adapters | `vscodeextension/src/outlineproviders/lspextenderpython.ts`, `lspextendertypescript.ts`, `lspextender_curlyBraces.ts`, `providerregistrer.ts` |
| Partitioning/navigation/context | `vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts` |
| Regression coverage | `vscodeextension/src/test/suite/outlineprovider_test/{python_declaration_boundaries,typescript_declaration_boundaries,outline_partition,generic_handling_tests}.test.ts` |
| Source fixtures | `vscodeextension/src/test/testfiles/{python,typescript}/declaration_boundaries.*` |
| Rendering | `web_visualizer/src/vpw/vpw_outline_window.js` and matching CSS |

## Automated validation

The full extension-host suite after the Python assignment follow-up recorded **104 passing**: 41 Python boundary, 48 TypeScript/TSX boundary, 9 partition/navigation, and 6 generic cases.

Coverage includes complete values; default-value colons; object-shaped return types; modifiers/decorators; tabs/CRLF/non-BMP text; nested/multiline source; chained/destructured/attribute targets; semicolon separation; signatures/overloads/empty implementations; arrows/JSX; supplied property context; malformed selections and neighbors; cache invalidation; exact source gaps/order/EOF; overlap rejection; target links; and end-exclusive lookup.

## Live extension proof

Real VS Code development-host checks used Python/Pylance and built-in TypeScript providers, separately from browser fixtures:

- Python fixtures covered decorated async functions, classes/nested methods, abstract `pass`, ellipsis, and docstrings. Existing `xx_manual_tests.py` cases `aaa`, `Test`, `ChildA.foo2`, and `breaking_parameters` remained correct.
- TypeScript `limit`, `config`, `Reader.read`, `Base.run`, `Worker.read`, `Worker.empty`, and `later` retained complete values and distinct bodyless/implemented/empty states.
- Actual **Visualize This**, **Visualize File**, parent declaration rows, and **Show in code** produced correct windows and source selections in both languages. Captured full-declaration `totalRange` values matched raw provider ranges, with no adjacent sentinel leakage; file views retained sentinel statements as ordinary source.
- A declaration-start selection at the first decorator character produced the same heading/body as the real provider's name selection. This was a synthetic selection over a real declaration range, not a claim that Pylance emitted it.

Source fixtures were analyzed, not executed as Python or TypeScript programs.

## Follow-up — Hide declaration-only bodies

Declaration-only windows show their signature without a body area, status message, or badge. The `declarationOnly` model flag, source ranges, parent links, and title context menu remain unchanged. Implemented and genuinely empty methods retain their existing behavior.

In both browser themes, `read` kept its signature and **Show in code** menu while its body stayed hidden after collapse/re-expansion. `run` retained its source editor; `empty` retained a visible empty client area without an editor. Parent rows opened all three windows, and no browser errors occurred.

Evidence: [dark theme](hidden-body-dark.webp), [light theme](hidden-body-light.webp). This UI-only follow-up did not rerun extraction/provider scenarios.

## Follow-up — Complete Python assignments and compact decorators

### Goal and executed plan

Name-only Python constants could not be explored, and multiline `@dag(...)` metadata overflowed into a nested function's signature/body. The approved change:

1. Resolves assignments/annotations only for variable/constant/field/property symbols whose LSP range equals the selected name. Reuses a current cached or supplied ancestor fragment first; otherwise starts a local fragment on the name's line and grows geometrically only while the selected statement has incomplete syntax at its end. Syntax nodes—not punctuation or neighboring symbols—determine the complete range.
2. Adds optional `rangeDeclaration`, used as the displayed symbol's `totalRange` without mutating provider symbols. Full declaration ranges and other languages remain unchanged.
3. Preserves full decorator source in attributes/tooltips, but displays multiline attributes as a compact first-line label plus ellipsis, constrained to one metadata line.

### Automated validation

Eleven added regressions cover name-only scalar calls, nested multiline collections, annotation-only declarations, chained targets, semicolon separation, triple-quoted source, line continuation, cached nested targets, malformed statements, and unrelated reference/type selections. Cache coverage includes an unchanged name-only provider range whose initializer grows. Adjacent sentinel source is excluded. These cases are included in the 104-test full-suite result above.

### Required actual-file runtime verification

Opened an actual Airflow source file read-only and exercised file → `_build_dag` → nested `ingestion_dag` through declaration rows. All windows rendered real source. Compact `@dag(…` metadata stayed above the signature/body; the full decorator remained in its tooltip and did not leak into the body. The nested function retained its complete operator call and original indentation; its full declaration range still matched the provider.

Actual **Visualize This** commands opened all eight constants (`CONFIG_DIR`, `TRINO_CONN_ID`, `DAG_TIMEZONE`, `IDENTIFIER_KEYS`, `REQUIRED_KEYS`, `OPTIONAL_KEYS`, `ALLOWED_KEYS`, `SQL_TASK_TIMEOUT`) with correct `NAME =` headings and complete values, excluding adjacent declarations. **Show in code** selected the nested function and `REQUIRED_KEYS` headings. No page errors were reported; the source file was neither modified nor executed.

Evidence: [file → outer → inner function](python-two-level.webp), [complete variable values](python-assignment-values.webp).

### Scope and remaining constraints

- Exact name-only Python variables are the deliberate exception to strict provider-range preservation. Their earlier rejection is no longer intended behavior.
- Other malformed/partial ranges, malformed selected assignments, and unrelated reference selections still fail instead of being guessed.
- Decorator layout was checked in a real dark-theme development host; the earlier two-theme proof applies to declaration-only rendering, not this later decorator change.
