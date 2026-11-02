# Declaration Boundaries — Completed Results

**Current behavior:** the [hide-body follow-up](#follow-up--hide-declaration-only-bodies) replaces status text/badges. The [Python assignment/decorator follow-up](#follow-up--complete-python-assignments-and-compact-decorators) supersedes the original name-only-variable limitation and strict-range policy for those variables. Earlier validation below is historical evidence.

## Goal and acceptance

Execute [Phase 1 Group A (R04 + R10)](plan.md): trust correct LSP declaration ranges and fix Python/TypeScript extraction inside them. Preserve `DocumentSymbol.range` as `Outline.Symbol.totalRange`. Distinguish absent bodies from empty implementations. Keep source, child ordering, and navigation coordinates correct.

No worker, whole-file parser, replacement LSP endpoint, or bad-range expansion was added. `specs/` was not changed.

## Plan as executed

1. Saved the approved plan before implementation; appended its shared readability rule to root `AGENTS.md`.
2. Migrated all extraction-result consumers from tuple positions to named fields. Added nullable `rangeBody`, `declarationOnly`, and supplied ancestor context. Other languages retain the generic brace algorithm.
3. Implemented Python fragment parsing first, then TypeScript/TSX fragment parsing. Parsers load lazily and cache one fragment per document. Validated positions before constructing VS Code ranges; rejected selected syntax errors and unrelated reference selections.
4. Reworked shared source partitioning and definition lookup. Children are sorted without mutating provider arrays. Crossing/overlapping displayed children fail explicitly. Target links use target-file coordinates.
5. Added declaration-only status rendering and source-backed browser fixtures for both themes. Added manual Python/TypeScript files with sentinels between declarations.
6. Ran automated checks, packaging enumeration, both browser themes, and a real installed VS Code development host with Python/Pylance and built-in TypeScript providers.
7. Found and fixed one additional acceptance edge during final verification: Python's traversal pruned a decorated declaration when selection began at its first `@`. The new regression failed before the guard change and passed afterward; decorator-name references still fail. Relaunched the extension host after that source change.
8. Updated the architecture guide and extension changelog. Removed temporary smoke runners and stopped verification servers/hosts.

### Implementation decisions

- Python uses `@lezer/python` **1.1.19**, `@lezer/common` **1.5.5**, locked `@lezer/lr` **1.4.12**, and `@lezer/highlight` **1.2.5**. It finds the direct body colon or assignment operator, preserving full values and original indentation/multiline strings.
- TypeScript moved from development to production dependencies; resolved compiler remains **3.9.10**. TS/TSX syntax diagnostics are fragment-only, with no project type checking, imports, execution, or emit.
- Temporary indentation/class/enum/variable wrappers exist only in parser input. Ambiguous properties require an LSP-supplied suitable ancestor. Wrapper text never becomes source or attributes.
- A null body means absent source; a zero-width body means a real empty implementation. Only bodyless TypeScript callable signatures set `declarationOnly`. Python `pass`, ellipsis, docstrings, and abstract bodies remain source.
- Fake-provider integration documents use explicit plaintext language with an explicit TypeScript adapter. The built-in TypeScript provider also answered custom URI schemes, so a custom scheme alone did not isolate those tests.

## Key changes

Paths below are relative to `src/`.

| Area | Files |
|---|---|
| Extraction contract/model | `vscodeextension/src/outlineproviderAPI/lspextenderprovider.ts`, `SymbolDefinition.ts` |
| Language adapters | `vscodeextension/src/outlineproviders/lspextenderpython.ts`, new `lspextendertypescript.ts`, `lspextender_curlyBraces.ts`, `providerregistrer.ts` |
| Partitioning/navigation/context | `vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts` |
| Test entry points | `vscodeextension/src/test/main.ts`, `suite/index.ts` |
| Regression coverage | `vscodeextension/src/test/suite/outlineprovider_test/{python_declaration_boundaries,typescript_declaration_boundaries,outline_partition,generic_handling_tests}.test.ts` |
| Manual sources | `vscodeextension/src/test/testfiles/{python,typescript}/declaration_boundaries.*` |
| Browser rendering | `web_visualizer/src/vpw/vpw_outline_window.js` and matching CSS |
| Browser fixtures | `web_visualizer/tests/shared_files/exampleoutlineData.js`, both existing TypeScript class theme pages |
| Runtime packaging | `vscodeextension/package.json`, `package-lock.json`; `.vscodeignore` required no change |

Generated extension/browser outputs were produced through existing build commands, not hand-edited.

## Automated validation

### Final checks

| Check | Observed result |
|---|---|
| `./node_modules/.bin/tsc -p ./` in `src/vscodeextension` | Passed |
| `./node_modules/.bin/eslint src --ext ts` in `src/vscodeextension` | Passed |
| Full extension suite in installed VS Code | **93 passing**, runner exit code 0 |
| Python boundary suite | 30 passing |
| TypeScript/TSX boundary suite | 48 passing |
| Partition/navigation suite | 9 passing |
| Migrated generic suite | 6 passing |
| `./node_modules/.bin/vsce ls` in `src/vscodeextension` | Passed, including prepublish build; TypeScript runtime and all four Lezer package runtimes listed |

Coverage includes complete scalar/collection values; default-value colons; object-shaped return types; modifiers/decorators; tabs/CRLF/non-BMP text; nested/multiline source; chained/destructured/attribute targets; semicolon declarations; signatures/overloads/empty implementations; arrows/JSX; supplied property context; invalid syntax/positions; malformed neighbors; cache invalidation; source gaps/order/EOF; overlaps; target links; stable end-exclusive lookup.

The final compiled suite was run through a temporary extension-test runner that first invoked the repository's unchanged full-suite entry point, then performed the live extraction smoke below. The runner was removed afterward. Exact launch from `src/vscodeextension`:

```sh
./node_modules/.bin/tsc -p ./ &&
./node_modules/.bin/eslint src --ext ts &&
env VSCODE_CLI=1 '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir=/tmp/scv-decoration-regression \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD" \
  --extensionTestsPath=/tmp/scv-final-validation.cjs \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/test/testfiles"
```

A direct full-suite launch with `--extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index"` from the repository root had previously passed all 92 tests before the final decorated-start regression was added.

### Failed infrastructure checks and recovery

- `npm install --package-lock-only --ignore-scripts` passed.
- Repository-local `npm ci --ignore-scripts` failed with `ENOTEMPTY` on an iCloud-conflicted `node_modules/get-intrinsic 2`; attempts to move/install also encountered `Resource deadlock avoided`. This was not a successful repository-local clean install.
- An identical package manifest/lockfile installed successfully with `npm ci --ignore-scripts` in `/var/folders/02/npv55w9j4s314dy8d1_j5_nc0000gn/T/scv-declaration-deps-YwZEM1` (**417 packages**). Those dependencies were copied back for validation. The conflicted directory was not deleted.
- Root `npm run test:ext` completed the web build, extension compilation, and lint, but its VS Code **1.61.1** host failed because `ms-python.python` could not be obtained. Used the plan's installed-current-VS-Code fallback, with Python/Pylance available, rather than claiming the legacy runner passed.
- Language-server references tooling was unavailable for this repository; scoped references search was used for the API migration.

## Browser proof

Ran `npm run serve:web`, opened both existing TypeScript class fixture pages under `http://localhost:8080/tests/`, and clicked `read`, `run`, and `empty` in real Chromium.

- `read`: plain `Declaration only — no body` status, no editor or editable element.
- `run`: actual `return "implemented";` source and editor, no status.
- `empty`: no source body/editor/status.
- Both themes: no page errors. Fixture heading/body ranges were checked against the actual source string, and parent parts reference the same child objects.

Evidence: [dark theme](dark-theme.webp), [light theme](light-theme.webp). Both browser tabs were closed after verification.

## Live extension proof

Launched the actual extension development host through the installed VS Code executable with an isolated `/tmp/scv-live-profile`, the `src/test/testfiles` workspace, and `--remote-debugging-port=9333`. This is the development-host equivalent of Run Extension, not a claim that the F5 key was pressed. A temporary harness captured actual provider/extractor output and actual webview messages; no instrumentation remains in production source.

| Component | Observed version |
|---|---|
| VS Code | 1.144.0, arm64 |
| Python extension | 2026.10.0 |
| Pylance | 2026.4.1 |
| Built-in TypeScript language features | 10.0.0 |
| Source Code Visualizer | 0.1.9 |

Python was exercised before TypeScript:

- Python `build`, `simple`, decorated `async_build`, classes and nested methods, abstract `pass`, ellipsis, docstring, and `later`: correct source boundaries/attributes. Rechecked `python/xx_manual_tests.py` symbols `aaa`, `Test`, `ChildA.foo2`, and `breaking_parameters`.
- TypeScript `limit`, `config`, `Reader.read`, `Base.run`, `Worker.read`, `Worker.empty`, and `later`: complete values; bodyless signatures flagged; implementation and empty body not flagged.
- Used real `code-visualizerzer.visualize` and `code-visualizerzer.visualizeFile` commands in both languages. Clicked parent declaration rows to open methods. Observed declaration-only, implemented, and empty TypeScript windows together.
- Used actual **Show in code** menus. Python returned to `declaration_boundaries.py` at zero-based `(45, 8)`; TypeScript returned to `declaration_boundaries.ts` at `(26, 2)`. Captured the actual webview navigation messages and active editor selections.
- Captured **68 extractions/outlines** at `documentSymbol2outlineSymbol`. Each `totalRange` equaled its raw LSP range. No captured declaration body contained an `AFTER` sentinel. Whole-file windows correctly retained sentinel statements as ordinary file source.

Evidence: [raw ranges, extractions, messages, and provider versions](live-ranges.json), [Python source navigation](live-python-navigation.webp), [TypeScript body states](live-typescript.webp).

### Final relaunched live smoke

After the decorated-start guard fix, relaunched the installed extension host, ran the full 93-test suite, then opened the real Python fixture and queried Pylance again. Selected `async_build` using both its actual name range and a zero-width selection at the first decorator character. The latter is a synthetic selection over the real provider's unchanged declaration range, not a claim that Pylance emits that selection.

Observed output (zero-based positions):

```text
raw range / totalRange: (36, 0) → (38, 16)
real name selection:   (37, 10) → (37, 21)
declaration start:     (36, 0) → (36, 0)
heading: async_build(value=tuple(), label=":")
body:    "    return value"
attributes: ["@identity", "async"]
```

Both selections produced equal heading/body ranges. The live smoke and extension host exited successfully. Browser/UI code was unchanged by this final traversal fix; the earlier visual checks remain the UI evidence.

## Limitations and decisions

- **Correct LSP ranges are still required.** Pylance 2026.4.1 supplied name-only ranges for the manual Python `limit` and `config` assignments. Their live extraction explicitly failed with `Cannot determine declaration boundaries for "limit".` / `"config".` The adapter deliberately did not read beyond those ranges. Correct full-range fixtures pass both assignment cases. The full-file view preserves them as ordinary source under existing ignored-kind behavior.
- The bundled TypeScript parser intentionally remains 3.9.10, as approved; newer TypeScript syntax is not promised by this change.
- The old VS Code test host and repository-local iCloud clean-install failures remain environment limitations, not hidden passing checks.
- Browser fixtures prove rendering; real-provider captures separately prove live extraction. No manual source fixture was executed as Python or TypeScript program code.

## Follow-up — Hide declaration-only bodies

At the user's request, declaration-only windows now show their signature without a body area, status message, or badge. The `declarationOnly` model flag, source ranges, parent declaration links, and title context menu remain unchanged. Implemented methods and genuinely empty implementations retain their existing behavior.

Changes:
- `vpw_outline_window.js`: hide the client area for declaration-only symbols; remove the status constant and parent-row badge.
- `vpw_outline_window.css`: delete unused status/badge styles.
- Update the approved plan with the UI follow-up, architecture guide, and changelog.

Validation completed:
- Root `npm run build:ext` passed: browser JS/CSS generation, copy to extension `media/`, and TypeScript compilation.
- Ran `npm run serve:web`; clicked `read`, `run`, and `empty` in both existing theme fixture pages.
- `read`: signature remained visible; body computed `display: none`, zero height, no editable element. Collapsing/re-expanding did not reveal a body. Its title context menu still contained **Show in code**.
- `run`: retained `return "implemented";` and one editor. `empty`: retained its visible, empty client area without an editor.
- Parent row clicks opened all three method windows. No declaration-only text remained in either page; no browser errors occurred.
- Captured [dark-theme proof](hidden-body-dark.webp) and [light-theme proof](hidden-body-light.webp); closed both tabs and stopped the server.

This follow-up changes only browser rendering/styles and documentation. Extraction tests and real-provider scenarios were not rerun; their earlier evidence above is unchanged. Current UI proof is the two new screenshots, not the earlier status-label screenshots.

## Follow-up — Complete Python assignments and compact decorators

### Goal and executed plan

The user reported `Cannot determine declaration boundaries for "REQUIRED_KEYS".` and the same errors for other constants in the real Airflow file. A second screenshot showed the inner `ingestion_dag` window's multiline `@dag(...)` metadata overflowing into its signature/body. The user approved using the bundled parser outside name-only variable ranges and required real-file two-level diagram verification for Python changes.

1. Recorded that verification rule in root `AGENTS.md` and appended the approved range/rendering amendment to `plan.md`.
2. Added Python assignment/annotation resolution only for variable/constant/field/property symbols whose LSP range equals the selected name. Reuse current cached or supplied ancestor syntax; otherwise parse a local fragment from the name's line. Grow by powers of two only while the selected statement has missing syntax tokens at the fragment end. Complete syntax determines the range; punctuation and neighboring symbols do not.
3. Added optional `rangeDeclaration` to the extraction result. Shared construction uses that resolved source range for `Outline.Symbol.totalRange`, while the provider's `DocumentSymbol` remains unchanged. Existing full declaration ranges and other language behavior remain unchanged.
4. Kept full decorator source in attributes and hover text. Rendered multiline attributes as first-line metadata plus ellipsis; constrained metadata to a single line within its window.
5. Added 11 regression cases and updated cache invalidation coverage to exercise a name-only range that remains unchanged as the initializer grows.
6. Built, linted, ran the full suite, and opened the actual file/variables/nested function in a fresh development host. Removed the temporary smoke harness and shut down the verification host afterward.

### Automated validation

- Root `npm run build:ext` passed, including browser JS/CSS generation, copying assets into extension `media/`, and TypeScript compilation.
- `./node_modules/.bin/eslint src --ext ts` in `src/vscodeextension` passed. An initial attempt to invoke that binary from the repository root could not resolve the TypeScript ESLint plugin; the package-context invocation succeeded.
- Full extension suite: **104 passing (2s)** in installed VS Code 1.144.0. Python now has 41 boundary cases; TypeScript/TSX 48, shared partition/navigation 9, generic 6.
- New checks cover name-only scalar calls, nested multiline `frozenset`/dictionary/tuple values, annotation-only declarations, chained targets, semicolon separation, triple-quoted source, explicit line continuation, cached nested targets, malformed statements, and unrelated reference/type selections. Adjacent sentinel source is excluded.
- A temporary extension-test runner invoked `out/test/suite/index.run()` before starting an HTTP smoke harness. Launch from the repository root:

```sh
env VSCODE_CLI=1 '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir=/tmp/scv-python-complete-profile \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath=/tmp/scv-python-full-assignment.cjs \
  --remote-debugging-port=9333 \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  '/Users/nguyencaocuong/Library/Mobile Documents/com~apple~CloudDocs/MAFC/Workspace/airflow-data/dags'
```

### Required actual-file runtime verification

Opened the real `trino_ingestion_dag_factory.py` as source only; did not modify it or execute its Python code. Used Python 2026.10.0 / Pylance 2026.4.1 and this repository's development extension.

- Invoked **Visualize File**, clicked its `_build_dag` declaration row, then clicked the nested `ingestion_dag` row. All three windows rendered actual source.
- Nested metadata was compact `@dag(…`; full decorator text remained in the tooltip, including `description_md` and `schema_evolution`. DOM geometry confirmed the metadata ended above both signature and body. No decorator source appeared in the function body.
- Nested body retained the `operators.OracleToIcebergIngestionOperator(...)` call and its original arguments/indentation. Function `totalRange` still equaled the raw LSP range.
- Opened all eight constants with actual **Visualize This** commands. Each rendered one value editor and the correct `NAME =` heading. Displayed source content matched the extracted value, excluding adjacent declarations.

| Constant | Complete source extent, 1-based lines |
|---|---|
| `CONFIG_DIR` | 17 |
| `TRINO_CONN_ID` | 18 |
| `DAG_TIMEZONE` | 19 |
| `IDENTIFIER_KEYS` | 20–27 |
| `REQUIRED_KEYS` | 28–30 |
| `OPTIONAL_KEYS` | 31–39 |
| `ALLOWED_KEYS` | 40 |
| `SQL_TASK_TIMEOUT` | 41 |

- Actual **Show in code** menus navigated `ingestion_dag` to zero-based `(195, 8)` and `REQUIRED_KEYS` to `(27, 0)` in the same Airflow source file. Captured webview requests and editor selections confirmed those targets.
- No page errors were reported by the attached workbench/browser tooling.

Evidence: [actual ranges, values, rendered states, provider versions, and navigation](python-actual-file.json), [file → outer → inner function](python-two-level.webp), [complete variable values](python-assignment-values.webp).

### Scope and remaining constraints

- This deliberately changes the old strict-range policy for exact name-only Python variables. The earlier documented `limit`/`config` failure is no longer the intended behavior for that case.
- Other malformed/partial LSP ranges still fail rather than being guessed. Syntax errors inside the selected assignment remain explicit failures.
- No new runtime dependency, Python process, worker, or project-wide parser index was added. Users receive the parser with the packaged extension; their existing installed extension is not replaced by a development build.
- Decorator UI was exercised in the actual dark-theme development host. Earlier theme screenshots remain historical checks; the new real-file screenshots are the evidence for this follow-up.

