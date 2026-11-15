# Phase 1 Group B — Results

## Goal and completion

Implemented **R03, R14, R17, R16** from the [approved plan](plan.md). Python is the integration target. Existing declaration-row single-click navigation and non-code header dragging remain available. New source navigation uses double-click or F12; ambiguous definitions use VS Code Quick Pick. Analyzed source is never executed or modified.

## Delivered contracts

### Provider targets and request lifecycle

- Normalize `Location`/`LocationLink` entries independently, preserving target URI, declaration range, selection range, and optional origin range. Deduplicate identical URI/selection locations, not same-named declarations.
- One target opens directly. Multiple targets require one explicit selection before extraction. `DefinitionOutlineResult` is `Array<Outline.Symbol | Outline.File> | null`: `null` is cancellation, `[]` is unresolved, and rejection is a concrete lookup/open/extraction failure.
- Empty `(0,0)` selections open file roots, even when a declaration starts there. A whole-document range matching a declaration remains that declaration. Unmatched nonroot targets do not silently become whole files or enclosing methods.
- Use the existing adapter only for the supported target language. Preserve actual `.pyi` URIs with **Type stub — declaration only**; never guess an implementation file.
- `VisualizingTab` translates only the chosen target. Success, error, and cancellation settle exactly one navigation ticket. Disposed requesting panels receive no delayed reply or replacement canvas. **Show in code** is fire-and-forget and leaves no outline ticket.

Host files under `src/vscodeextension/src/`: `outlineproviderAPI/outlineprovider.ts`, `utils/outlineproviderwrapper.ts`, `utils/outlineutils.ts`, `outlineproviderAPI/extensionactivator.ts`, and `visualprogramming/visualizer.ts`.

### Python declaration identity

`Outline.Attribute.definitionRange` identifies the terminal callable in the original decorator syntax, including qualified/multiline decorators. Full decorator text/range remains intact; descriptive metadata such as `async` stays inert.

`VpLspExtenderPython.getDefinitionSymbol` reuses syntax-backed declaration/assignment recovery for exact provider-confirmed targets omitted by the document-symbol tree. It accepts proven assignment LHS targets and direct parameter declaration ownership; it does not substitute RHS/type/index references, unrelated same-name fields, or an enclosing method. Property navigation opens source without evaluating getters.

Key files: `outlineproviderAPI/{SymbolDefinition,lspextenderprovider}.ts` and `outlineproviders/lspextenderpython.ts`.

### Immutable source mapping and edge anchors

- `src/web_visualizer/src/utils/source_navigation.js` binds headings, individual decorator badges, and editable body rows to immutable source text/ranges. Offsets are UTF-16, preserving tabs, CRLF line mapping, surrogate pairs, and original source columns; gutters and synthetic ellipses are excluded.
- Highlighted DOM is split by original source lines. Re-highlighting/reparenting reconstructs cached DOM ranges without recapturing a later user selection. Local displayed-text edits that diverge from the model report **Source mapping unavailable** and send no stale coordinates.
- Double-click/F12 emits one request from the intended surface. Native source selection is preserved; declaration rows keep single-click opening and non-source header chrome remains draggable. Owning-window deletion cleans observers/bindings.
- Range anchors retain their original surface, URI, range, and offsets. Same source range + target reuses an edge; different token ranges keep distinct edges even when they share a target.
- Visible anchors use the trailing edge of the final token glyph. Nested scrollports/frame bounds clip the point; fully offscreen sources pin to the visible boundary, hidden/collapsed sources use a visible heading/frame, and compact decorators use their own badge edge. Tooltips retain original location and explain fallback.
- Native redocking/undocking synchronizes target identity. Source deletion removes docked and free edges. File reuse compares `CLASS_TYPE` + URI without symbol-only `totalRange`; **Show in code** uses file start.

Webview files under `src/web_visualizer/src/`: `vpw/vpw_code_editor.js`, `vpw/vpw_outline_window.js` and CSS, `vp/{controller,request_message,outline_object_functions}.js`, `vpw/{vpw_world,vpw_entity_connection}.js`, and `vgf/vgf_line.js`.

## Behavioral validation

### Extension-host regressions

The full installed VS Code compiled suite reported **163 passing**, runner/process exit 0. It covered normalized/file-root targets, exact candidate selection, nullable cancellation, assignment/parameter/decorator ranges, source reconstruction, and concrete failures. The passing run preceded the final browser-only Show-in-code/redocking corrections; those were subsequently exercised through their actual UI paths, with no later host-contract change.

Permanent coverage includes `definition_navigation.test.ts`, Python declaration-boundary tests, active JavaScript function-expression tests, and outline-partition tests. An incidental old EOF-whitespace assertion was removed while retaining full source-partition and file-gap invariants.

### Native browser interaction, dark/light themes

| Scenario | Observed result |
|---|---|
| Multiline `config: Config`, double-click and caret F12 | Exactly one request at the original type token; no window drag. |
| `left.config + right.config`; selection changes before reply | Distinct original ranges/endpoints; delayed edges retained the requested token. |
| Repeat same token/target | One node/edge for that range; different ranges retained separate edges. |
| Resize/reflow, header drag, pan/zoom at 0.2/1/3 | Endpoint followed the final visible fragment with error below 0.001 screen px. |
| Horizontal/vertical nested scrolling, 100-row body | Offscreen fallback pinned to the viewport boundary; visible tokens regained exact endpoints. |
| Tabs, CRLF, non-BMP text, three-digit gutter | Original UTF-16 line/column and offsets retained; gutter excluded. |
| Collapse, hidden comment row/token, identical re-highlighting | Original identity unchanged; declared hidden fallback returned to the token when visible. |
| Stacked/compact decorators | Each badge dispatched its own callable range; full hover retained; `async` emitted no request; compact fallback stayed on its own badge. |
| Local display edit | Visible mapping error, no stale host request. |
| Cancel/error/delete before reply | Tickets settled; cancellation created no node/edge; deleted source got no edge; errors used visible cards. |
| Reopen file, Show in code, redock/free connector | File/edge reuse stayed safe; stored target matched docking; source deletion removed free and docked edges. |

### Live Python/Pylance and real webview

- Parameter-name declaration-row click preserved its existing behavior. Heading `Config` double-click/F12 opened the local class; unresolved `MissingType` produced a settled **Definition not found** card.
- Original-form imported `operators` returned an empty `(0,0)` target and opened the module file; imported class opened separately, alias reused the module, and **Show in code** opened file start.
- Compact `decorators.dag` opened its actual function. `LocalJob.inspect` `config` opened the complete multiline assignment; `label` opened the unexecuted property source; `LocalJob.shared` did not select the remote same-name field.
- Pylance returned two `job.config` locations. The production picker distinguished paths/positions; choosing the second opened the remote assignment. Escape left node/edge counts and viewport unchanged and returned pending count to zero.
- In real `trino_ingestion_dag_factory.py` → `_build_dag` → `ingestion_dag`, headings, complete nested body, compact/full decorator metadata, and **Show in code** remained correct. The actual decorator picker offered three `dag` candidates and opened the selected implementation.
- Real imported `operators.py`, `OracleToIcebergIngestionOperator`, and `_pod_override` opened as file/class/function targets. Same-line `sql` and `_quoted_relation` retained distinct source anchors and target kinds.
- `self.oracle_columns_sql` in `_prepare` opened its exact `__init__` assignment, not the constructor. `SQL_TASK_TIMEOUT` and `CONFIG_DIR` retained complete values.
- Actual `Path` opened its provider-selected standard-library source; `bool` opened its real `builtins.pyi` declaration with the stub explanation. `str` extraction failed on `capitalize` and produced a settled **Source navigation failed** card rather than a fabricated implementation.
- A separately identified deterministic provider failure traversed the production request boundary and displayed its concrete settled error; this is error-boundary evidence, not Pylance evidence.

## Decisions and limits

- Navigation is static/provider-backed: no runtime receiver inference, property execution, guessed `.py` replacement, cross-language adapter routing, live source synchronization, or Group-B comment toggle.
- Existing extraction can reject real library declarations, as observed for `str`; these supported failures remain explicit and settled, not general stub-extraction success.
- Fixture and actual Airflow workspaces were isolated to avoid package shadowing. No production provider-readiness retries were added.
- Browser evidence proves geometry separately from live-provider extraction. Incomplete optional probes were not counted as passing evidence; final live error/stub/Show-in-code checks had no pending requests.
