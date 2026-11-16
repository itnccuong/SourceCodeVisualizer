# JS/TS parser upgrade — results

## Goal and scope

Modern JavaScript and TypeScript declarations, values and cross-file definitions must produce source-backed diagrams without relaxing containment, overlap or diagnostic validation. Supported inputs are JavaScript `.js/.mjs/.cjs`, TypeScript `.ts/.mts/.cts` and declaration files `.d.ts/.d.mts/.d.cts`, on VS Code 1.146+. TSX remains experimental; JSX is not registered or advertised. `specs/` is unchanged.

## Executed plan

1. Pinned production `typescript-parser` to exact `npm:typescript@6.0.3`; retained development compiler `~5.9.3` and lazy loading. Raised the VS Code engine to `^1.146.0`.
2. Replaced synthetic declaration fragments and the separate comment parse/cache with one on-demand document snapshot: actual filename, explicit registered parse mode, parented SourceFile, public syntactic diagnostics, indexed declaration/binding/callable starts and cached comment ranges. Each new version uses one in-memory noResolve/noLib/noEmit program; the program is not retained.
3. Unified syntax identity and callable ownership for JS/TS/TSX. Added modern declaration forms, parameters/destructuring, actual container braces, ordered decorators/modifiers, diagnostic isolation, source-preserving transparent wrappers and syntax-backed definition symbols/children. Provider symbols remain immutable. Exact name-only or owned-RHS expansion uses a complete syntax owner; an already complete provider range remains unchanged.
4. Added `TargetAdapterResolver` to the existing wrapper/registry path. Resolved JS/TS-family targets use the target adapter; Python cross-language requests remain rejected. Exact name selection wins over a nested RHS range, preserving real CommonJS provider identity. Target document symbols are requested once per resolved lookup, avoiding duplicate object identities and manufactured ancestry.
5. Added exact extraction, navigation, restore and real built-in-provider contracts plus the `js_ts_parser` language-service fixtures. Modern fixture files are excluded from extension compilation, without weakening compiler checks. Fake semantic fixtures intercept only their own custom-scheme command requests because VS Code's built-in provider also serves virtual JS/TS documents; file-backed integration tests use real providers without interception.
6. Updated architecture documentation and both READMEs after the automated and live support gate passed.

## Automated validation

- `npm install --package-lock-only --ignore-scripts`, then `npm ci --ignore-scripts`: runtime 6.0.3, compiler 5.9.3.
- Exact test host obtained with `downloadAndUnzipVSCode('1.146.0')`. Metadata confirmed VS Code **1.146.0** and bundled language-service TypeScript **6.0.3**. The installed app's executable is `Contents/MacOS/Code`, not the proposed `Electron` path.
- Extension directory: `VSCODE_EXECUTABLE_PATH="$PWD/.vscode-test/vscode-darwin-arm64-1.146.0/Visual Studio Code.app/Contents/MacOS/Code" npm test`: **332 passing**, including temporary profiling. Pretest built the real webview/extension and passed lint. The profiling scenario was then removed; 331 permanent tests remain.
- Earlier combined runs exposed test typing errors, provider-identity/range priority bugs, missing rest-parameter punctuation, assignment-owner semicolon loss, virtual-provider contamination and obsolete ignored-callback assertions. These were corrected before the passing run; no boundary assertions were disabled.
- `npm audit --omit=dev` and `npm audit`: **0 vulnerabilities** each. This is an advisory result, not application-security certification.
- `npm --prefix src/vscodeextension run package`: packaged 234 files, approximately 5.54 MB. The first package attempt hit iCloud-created duplicate `@types/* 2` folders; another `npm ci --ignore-scripts` removed them, and the same package path passed. No tsconfig workaround was introduced.
- Inspected `release/source-code-visualizer.vsix`: aliased runtime package version 6.0.3, CommonJS `lib/typescript.js`, Apache `LICENSE.txt`, TypeScript third-party notices and corresponding updated parser source/manifest/lockfile included. No native TypeScript 7 artifacts found.

## Real diagram proof

Used the repository's **Run Extension** F5 launch, not installation into the normal profile. Drove the actual development workbench and nested production webview over its local debug endpoint. Fixture and Airflow code was neither executed nor modified.

- Actual `visualizer.ts`: file → `VisualizingTab` → `waitReady`, `exportCanvasState`, `restoreCanvas` → their Promise callbacks. Inspected complete headings, exact callback bodies and surrounding source partitions. Direct exploration of the real `line` and `character` bindings displayed `{line, character} =` with value `position`.
- Actual `modern.ts`: file → decorated `Cache` → const-generic method and callable arrow field; file → `build` → Promise executor → nested callback. Inspected `@tracked`/`export` attributes, private field/static block retained as source, full expression/block bodies and comments on/off. **Show in code** on the arrow field landed at line 31, column 3.
- `consumer.js` `keep` opened `modern.ts` with heading `keep<const T>(value: T)` and body `return value;`. `consumer.ts` opened the actual ESM arrow and CommonJS assigned function with receiver-bearing heading. Declaration-file overloads opened their own signatures with hidden bodies. The real two-location import chooser showed both overload source lines; Escape kept the node count at 11, then selecting the number overload opened only that signature.
- Saved a real mixed canvas and loaded it in a separate tab: **13 nodes, 6 edges**, including JS/TS targets and the external Python file. Re-export comparison preserved nodes, exact target references, frames, comment visibility, edges and viewport. Reopening the same declaration row twice reused the same 13 nodes and 6 edges. Restored `keep` **Show in code** landed in `modern.ts`, line 9, column 17. Restored overload bodies remained hidden.
- Actual external Airflow file: file → `_build_dag(config_path: Path) -> DAG` → `ingestion_dag() -> None`, plus `config =` / `_load_config(config_path)`. Inspected the full 3,837-character `@dag(...)` metadata, nested operator body and source navigation to line 196, column 9. Initial Pylance activation returned no symbols; after opening real workspace roots and restarting the language server, actual provider symbols and diagrams worked.
- Actual `dashboard.yaml`: Deployment `spec` → `template` → `spec` → `containers` → `- name: dashboard`; inspected first-item fields, ConfigMap `data` / `index.html: |` original HTML and document separators. No YAML source-mapping error.
- Captured and inspected actual webview diagrams in light and dark themes. Existing webviews retain some theme styling until recreated; newly loaded canvases rendered in the selected theme. No theme implementation changes were made.

## Document cache performance

Temporary extension-host instrumentation counted public `createProgram` calls for an in-memory document with 2,000 functions and a 20,000-line body. The scenario used the actual adapter and shared outline extraction, with deterministic symbol-request isolation. It asserted exact middle/last declaration text, not hardware-dependent timing thresholds.

| Operation | Observed milliseconds |
| --- | ---: |
| Cold file extraction | 580.06 |
| 50 repeated declaration openings | 6.26 |
| 50 cached comment requests | 0.07 |
| Extraction after one edit | 124.16 |

Unchanged operations used **one** program/syntax snapshot; one edit produced **one** replacement (two total). No quadratic repeated child matching was observed. In the actual development webview, a separately generated in-memory document with the same dimensions rendered `item1000()` / `return 1000;` and `item1999()` / `return 1999;` correctly. Temporary profiling source/generated artifacts were deleted and the generated document was discarded without saving or execution.

## Decisions and limits

- Built-in definition providers remain the semantic authority. AST lookup proves source declarations, not module resolution or evaluated values.
- Arrow reopening uses the indexed `=>` token position, avoiding collision with a single-parameter binding at the RHS start.
- TSX remains experimental; JSX is unchanged and unregistered. No older VS Code compatibility claim was made.
- Python's fragment parser, canvas messages and source-reference schema were not changed.
- Built and inspected the VSIX only. The extension was **not installed or published**.
