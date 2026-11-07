# Phase 1 Group B — Results

## Goal and completion

Implemented R03, R14, R17, and R16 from the [approved plan](plan.md). Python is the integration target. Existing declaration-row single-click navigation and non-code header dragging remain available. New source navigation uses double-click or F12; ambiguous definitions use VS Code Quick Pick.

`specs/` was not changed. Analyzed Python files were neither executed nor modified. Work used the existing `ft/phase-1/group-b` branch.

## Plan as executed

1. Persisted the approved plan before implementation. Launched the installed VS Code development host in isolated profiles. Captured actual Pylance targets and existing declaration/decorator/body behavior.
2. Cut over definition results to nullable Symbol/File arrays. Normalize and deduplicate provider entries independently; select before extraction; preserve file roots and explicit errors.
3. Added original decorator callable ranges and the Python syntax-backed assignment/parameter hook. Reused the declaration parser and assignment-boundary recovery.
4. Bound headings, metadata, and editable body rows through one source-coordinate utility. Completed success/error/cancel settlement and requesting-panel protection.
5. Added immutable range-based edges, source-aware deduplication, hidden/compact/clipped fallback, and safe file reuse.
6. Built generated assets, ran extension-host regressions, exercised actual browser geometry, and completed live fixture and actual Airflow navigation.

Integration smoke exposed additional in-scope fixes:

- Corrected line-local geometry for docker padding/content flow and exact subpixel canvas endpoints.
- Reconstruct cached DOM ranges when browser reparenting changes their boundary containers.
- Make **Show in code** fire-and-forget; it has no outline reply and must not leave a ticket.
- Keep connector target identity synchronized with native redocking/undocking. Source deletion remains effective after dock-parent listeners are cleared.

## Changes

| Area | Main source files | Delivered behavior |
| --- | --- | --- |
| Provider contract and resolution | `outlineproviderAPI/outlineprovider.ts`, `utils/outlineproviderwrapper.ts`, `utils/outlineutils.ts`, `extensionactivator.ts` | Location/LocationLink normalization, exact target selection, URI preservation, nullable cancellation, file-root navigation, language guard, concrete failures |
| Python source targets | `outlineproviderAPI/SymbolDefinition.ts`, `lspextenderprovider.ts`, `outlineproviders/lspextenderpython.ts` | Terminal decorator identifier ranges; proven assignment targets; direct parameter ownership; reject RHS/type/index/reference substitution |
| Host UI and lifecycle | `visualprogramming/visualizer.ts` | Real Quick Pick, selected-only translation, array-shaped errors, cancellation reply, disposed-panel guard, stub explanation |
| Source surfaces | `web_visualizer/src/utils/source_navigation.js`, `vpw/vpw_code_editor.js`, `vpw/vpw_outline_window.js` and CSS | Immutable UTF-16 indexing, native heading/decorator gestures, highlighted DOM line splitting, mapping-error card, observer cleanup |
| Requests and edges | `vp/controller.js`, `request_message.js`, `outline_object_functions.js`, `vpw/vpw_world.js`, `vpw_entity_connection.js`, `vgf/vgf_line.js` | Webview-only anchors, settled tickets, distinct-token edges, exact geometry, clipping/fallback tooltips, file identity, redocking identity |
| Regressions | `definition_navigation.test.ts`, Python declaration boundaries, active JavaScript function-expression tests, outline partition tests | Output-level host coverage; old copy-only normalization test removed; nullable union narrowed explicitly |

Generated visualizer bundles, CSS, copied extension media, and extension output were rebuilt, not hand-edited.

## Build and extension-host verification

Runtime directory: `/tmp/scv-group-b.475Qqy`. This contained isolated profiles, source-only temporary fixtures, host probes, and evidence. Temporary source/probe scaffolds were removed after inspection.

### Build

Ran from the repository root:

```sh
npm run build:ext
```

Observed the JS stitcher, CSS concatenation, license/version stages, media copy, and TypeScript compilation. Final integrated build completed with exit 0.

The first build found a missing non-null assertion in the new decorator-range test; corrected it. Later builds completed all stages successfully.

### Full installed VS Code suite

Ran the installed host, not Node/Mocha and not the legacy download launcher:

```sh
SCV_ROOT="$PWD" VSCODE_CLI=1 \
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window \
  --user-data-dir=/tmp/scv-group-b.475Qqy/test-profile-final \
  --extensions-dir="$HOME/.vscode/extensions" \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index" \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/vscodeextension/src/test/testfiles"
```

**163 passing; extension-host test runner exit 0; process exit 0.**

The preceding full run had 162 passing and one failure: an old JavaScript assertion expected EOF whitespace to be discarded. Removed that incidental assertion rather than re-pinning it; the existing full-partition invariant and new file-gap regression remain. The passing full run preceded the final browser-only Show-in-code/redocking fixes; those were rebuilt and exercised through their actual UI paths afterward. No additional host-contract change followed that passing run.

Focused source-transpiled tests were also run inside the installed extension host during the step-3 gate, with zero failures after initializing the throwaway runner's in-memory provider. This was not a substitute for the full compiled suite.

## Browser interaction and geometry

Served the existing dark/light Python fixtures with `npm run serve:web`. Injected temporary source-backed models exported by the real host and used the real controller/windows/connection implementation with a recording backend. No permanent UI framework was added.

| Scenario | Observed result |
| --- | --- |
| Multiline `config: Config` heading, native double-click and caret F12 | One request per action, original line 28 / UTF-16 columns 12–18 in the temporary fixture; no source-window drag |
| `left.config + right.config` in one text run | Distinct source ranges and endpoints; delayed replies retained the original token despite changed selection |
| Repeat token to same target | One target node and one edge for that range; two different ranges retained two edges |
| Resize/reflow and source/target header dragging | Endpoint followed the final visible token fragment; non-code chrome still dragged |
| Native pan and zoom at 0.2, 1, 3 | Visible endpoint error below 0.001 screen px; ordinary cases measured zero error |
| Nested horizontal scroll | Exact visible token endpoint; offscreen token pinned to the ancestor viewport boundary with location/fallback tooltip |
| 100-row vertical scroll | Before scroll: clipped fallback. After native scroll to row 100: exact token endpoint, zero error |
| Tabs, CRLF, non-BMP text, three-digit gutter | Correct UTF-16 line/column and original offsets; gutter excluded |
| Collapse/expand | Hidden source used heading right-edge fallback, then returned to the token without changing offsets |
| Hide/restore preceding comment row or token span | Original offsets and target identity unchanged; hidden token used the declared fallback |
| Identical re-highlighting | Cached token geometry reconstructed; original range and target preserved |
| Stacked decorators | Each navigable badge dispatched its own original callable range; full hover source retained; `async` double-click emitted no request |
| Compact/ellipsized decorator | Anchored to its own visible badge edge with `Compact decorator source`, not another decorator or argument |
| Local displayed-text edit | Visible `Source mapping unavailable`; no request with stale coordinates |
| Cancel/error/delete before reply | Tickets settled; cancellation created no node/edge; deleted source received no edge; errors used existing visible cards |
| Reopen file / Show in code | One file node and reused edge; zero-length start range; no `totalRange` exception |
| Connector drag to another node or empty canvas, then reopen | Stored target matched actual docking; reopen restored a correct edge; source deletion removed docked and undocked edges |

A first geometry probe found an approximately 4.6px source offset; fixed the line origin and canvas coordinate calculation, then measured zero error. A later smoke-harness reset accidentally deleted a reused target; corrected the throwaway fixture isolation before taking vertical-scroll results.

## Live Pylance and production host/webview

Used the installed Python 2026.10.0 and Pylance 2026.4.1 extensions, the existing external Airflow Python interpreter, and separate temporary workspace files for the fixture package and actual Airflow DAG root. Their `ingestion` packages were not combined on the analysis path. Actual provider symbols were checked before opening diagrams. No production readiness retries were added.

### Temporary source-only fixture

- Clicking a parameter name in the file's `run(...)` declaration row opened `run` by the existing single-click action.
- Double-clicking heading `Config`, then caret F12, opened/reused the local `Config` class with a type-token edge.
- `MissingType` produced a settled **Definition not found** card.
- Original-form imported `operators` returned an empty `(0,0)` target and opened the actual module file. The imported class opened separately; alias `ops` reused the module node.
- **Show in code** opened the module in the real editor at line 0, character 0.
- Compact `decorators.dag` opened `dag(**options)` in `decorators.py`.
- `LocalJob.inspect` field `config` opened its complete multiline assignment. `label` opened its property source containing the deliberately unexecuted getter.
- `LocalJob.shared` opened the local value, not the remote same-name field.
- Actual Pylance returned two `job.config` locations. The production Quick Pick displayed their paths and line/column values; choosing the second opened the remote bucket assignment. Escape preserved 11 nodes, 11 edges, viewport style, and returned pending count to zero.

### Required actual Airflow file

Opened `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py` → `_build_dag` → nested `ingestion_dag` in the real diagram.

- Inspected original headings and complete nested body through `execution_timeout=SQL_TASK_TIMEOUT` and the closing call.
- Compact `@dag` retained its full original hover text and callable range at zero-based line 102, columns 5–8.
- Metadata activation presented three actual Airflow `dag` candidates. Chose the implementation at zero-based line 1585 in the existing `.venv/.../airflow/sdk/definitions/dag.py`; inspected its real function source.
- **Show in code** opened the source file at `(0,0)`, `_build_dag` at `(95,4)`, and `ingestion_dag` at `(195,8)` in the real editor.
- Imported `ingestion.common.operators` opened as the actual `operators.py` file. Nested `OracleToIcebergIngestionOperator` opened its class; `_pod_override` opened its function.
- `_build_dag` `sql` and `_quoted_relation` used different original ranges on the same line and opened the file and function respectively.
- Opened `operators.py` → `OracleToIcebergIngestionOperator` → `_prepare`. `self.oracle_columns_sql` resolved to the exact `__init__` assignment at zero-based line 34, heading `self.oracle_columns_sql =`, body `oracle_columns_sql`; not the whole constructor.
- Inspected `SQL_TASK_TIMEOUT = timedelta(minutes=18)` and `CONFIG_DIR = Path(__file__).with_name("config_oracle2iceberg")` as complete assignment nodes.
- Actual `Path` resolved to `/Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/pathlib.py`, not a stub. Separately, actual `bool` from the configuration function's annotation opened the real installed `typeshed-fallback/stdlib/builtins.pyi` URI with **Type stub — declaration only** in metadata/hover.
- Actual `str` stub extraction failed on `capitalize`. It produced a settled **Source navigation failed** card rather than fabricating an implementation. This remains a supported-failure boundary, not a claim of general stub extraction.

A separate isolated temporary provider deliberately threw `Deterministic provider failure — smoke only`; a real diagram double-click traversed the production host boundary and displayed the concrete settled error. This is deterministic error-boundary evidence, not Pylance evidence.

## Review and limits

- Read-only host review found no actionable introduced issue.
- Browser review found stale target identity after connector redocking; fixed and verified the original native reproduction plus undocked source deletion. No outstanding review findings were reported.
- Navigation is static/provider-backed. No runtime receiver inference, property execution, guessed `.py` replacement, cross-language adapter routing, R08 comment toggle, or live source synchronization was added.
- The existing parser/extraction boundary can reject real library declarations, as observed for `str`. Such failures stay concrete and settled.
- One optional `Context` investigation remained pending in an automation-owned earlier host and was discarded when that host was closed. It is not counted as passing evidence. Final live host error/stub/Show-in-code checks ended with no pending requests.
- The assistant LSP tool reported no configured language server; callsite migration used repository inspection. Browser CDP target enumeration required the endpoint's `/json/list` because `browser.targets` rejected direct-CDP enumeration.
- Closing/restarting owned hosts and activating the Code Diagram tab were necessary when editor navigation or workbench visibility made the webview inactive. No unrelated user process was stopped.
