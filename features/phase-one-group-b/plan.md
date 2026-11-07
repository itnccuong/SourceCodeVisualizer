# Phase 1 Group B — Source navigation and connection anchors

## Context
Implement R03, R14, R17, and R16 from the approved roadmap. Existing clicks on parameter names in function headings must remain working; R03 separately covers clicking parameter type annotations. Preserve compact decorator presentation and offscreen connection clipping; neither alone completes decorator navigation or clicked-expression anchoring. Python is the primary integration target; do not execute or modify analyzed source.

## Grounded findings
- `specs/roadmap.md:60-84` defines all four items, including explicit candidate selection and honest unresolved outcomes.
- `docs/roadmap-status.md:40-45` records all four as incomplete. Basic parameter clicking, compact metadata, and clipping are existing work to preserve.
- The host resolves definitions through VS Code providers and adapts document symbols; the webview exchanges `outline_requestByFilePosition` / `visualizeOutline` with request IDs (`docs/architecture-and-development.md:55-120`).
- Original source lives in `src/vscodeextension/src/` and `src/web_visualizer/src/`; generated `out/`, `release/`, and copied visualizer assets must be rebuilt, not hand-edited.
- No language server is configured for this assistant session (`xd://lsp` status). Read-only code inspection must establish callsites; implementation must retry references if a server becomes available.

- `VpwOutlineWindow._vp_createClientTitle` currently emits highlighted signature HTML and concatenates attributes into one metadata string. Declaration-row single-click opens its declaration through `BtnOpenDefinition`; leave that gesture intact.
- `VpwCodeEditor.vp_request_outline_for_selection` uses rendered selection text and a surrounding highlight DOM node. This is insufficient for collapsed multiline headings and two identifiers sharing one text/highlight node.
- `_VpwEntityConnectionSpecialLine._vp_getLineStartPos` already clips against nested scrollports; retain that clipping and replace only its preferred source point with a source-range endpoint.
- `OutlineUtils._getDefinitionRanges` drops provider targets with no enclosing document symbol. This is a code-backed explanation for losing file-root targets, not a measured claim about the current Pylance response for the reported import.
- `OutlineUtils.vscode_executeDefinitionProvider` already prefers `targetSelectionRange` over `targetRange`, but discards the other link fields. It needs per-entry normalization rather than assuming all entries share the first entry's shape.
- `VpOutlineProvider` and its wrapper/command return `Outline.Symbol[]`; Group B must admit file targets and distinguish cancellation. `VisualizingTab` currently conflates no result with unresolved and does not reliably settle thrown request failures.

## Confirmed interaction decisions
- New source-text navigation uses double-click or F12, including headings and compact decorators. Preserve declaration-row/button single-click and non-code header dragging.
- Several distinct provider targets use VS Code Quick Pick. One target opens directly. Deduplicate identical locations. Escape/cancellation must not create a node, edge, or error.
- Parameter-name clicking is existing behavior to preserve, not evidence that parameter-type navigation is complete.

## Approach

Implement the following steps in order. Steps 2 and 3 share the host contract; step 4 consumes their metadata and settles requests. Step 5 adds range-based geometry to the working navigation path. Keep existing declaration-row single-click behavior; new type navigation is in an opened node's heading, not a second gesture competing with that row's click.

### 1. Establish the approved execution contract and baseline
- After approval, persist this complete plan to `features/phase-one-group-b/plan.md` before implementation, per `specs/context.md`. Use the existing `ft/phase-1/group-b` branch; do not discard or reset user work. `specs/` remains read-only.
- In the installed development host, observe the current parameter-name/declaration opening behavior and record its exact gesture/target. The user reports it works; do not treat static absence of a title handler as evidence against that observation or redesign it.
- Accept the reported R14 defect as established; collect the actual file-root provider response to diagnose it, not another failed visualization merely to reconfirm it. Capture compact-decorator activation and two same-line body lookups as the remaining before-change evidence. Inspect provider results without executing analyzed Python. Do not run the external Airflow file.

### 2. Resolve and select provider targets before extracting them — R03/R14/R17

**Contract cutover.** Add these exported types to `src/vscodeextension/src/outlineproviderAPI/outlineprovider.ts`:

```ts
export interface DefinitionTarget {
  uri: vscode.Uri;
  range: vscode.Range;
  selectionRange: vscode.Range;
  originSelectionRange?: vscode.Range;
}
export type DefinitionTargetChooser =
  (targets: readonly DefinitionTarget[]) => Promise<DefinitionTarget | undefined>;
export type DefinitionOutlineResult = Array<Outline.Symbol | Outline.File> | null;
```

Change `provideDefinitionOutline(document, position, chooseTarget?)` on `VpOutlineProvider`, `VpOutlineProviderWrapper`, and `OutlineUtils` (the latter retains its leading adapter argument) to return `Promise<DefinitionOutlineResult>`. Change `executeDefinitionProviderForPosition` / `executeDefinitionProviderForPositionOnDocument` to accept the same optional chooser and return that type. `null` means user cancellation, `[]` means no provider target, and a rejection means lookup/open/extraction failed. No `Error` objects returned as successful values and no never-settling promises on this definition path.

**Normalization and selection.**
- In `OutlineUtils.vscode_executeDefinitionProvider`, return `Promise<DefinitionTarget[]>`. Normalize each entry independently: `Location` uses its range for both fields; `LocationLink` retains `targetRange` as `range`, uses `targetSelectionRange ?? targetRange` as `selectionRange`, and retains `originSelectionRange`. Preserve URI schemes; do not reconstruct paths from names.
- Remove `convert_LocationLinkArray_to_LocationArray`; it loses required information. Preserve null/undefined-provider → empty-array behavior and serialized-position normalization.
- Deduplicate by URI plus `selectionRange` coordinates, preserving provider order. An empty `(0,0)` selection is a file-root identity, so duplicate file roots merge. Do not merge different declaration locations with the same name.
- Preserve the JavaScript exact-declaration / syntax-backed `definitionPosition` fast path in `_getDefinitionRanges` before ordinary provider lookup. Refactor the rest of that method into normalized-target selection and selected-target outlining; remove its symbol-only filtering loop.
- One distinct target opens directly, without calling the chooser. For more than one target call the supplied chooser exactly once; cancellation returns `null` before opening/extracting a target. If a non-UI caller omits the chooser with multiple targets, reject with `Multiple definition targets require selection.` rather than silently choosing or opening all.
- `VisualizingTab` supplies an async chooser through the in-host `vp.executeDefinitionProvider` command arguments; no function crosses the webview boundary. Use `vscode.window.showQuickPick` with `placeHolder: "Select a definition to open"`, `matchOnDescription: true`, `matchOnDetail: true`, single selection. Each item retains its exact `DefinitionTarget`.
- Label file-root candidates with the filename; label other candidates with the first trimmed line of `document.getText(selectionRange)` when readable, otherwise the filename. Description is workspace-relative path plus one-based line and column. Detail contains the full URI and, for `.pyi`, `Type stub — declaration only`. An unreadable candidate remains selectable with `Source unavailable` detail; choosing it reports the real open failure, not a different target. Cancel does not fall through to unresolved.

**File versus declaration.**
- Treat an empty provider selection at `(0,0)` as a file-root target before looking for an enclosing declaration. A zero-length root must open the file even if its first class/function starts at `(0,0)`.
- A nonempty full-document `range` with no narrower `selectionRange` may also represent a file, but first compare it with document-symbol declaration ranges. If a declaration has exactly that range, preserve the declaration target (a one-function file is still a function); only the full-file range without a matching declaration is a file target. A nonroot unmatched location is never a blanket “no symbol → entire file” fallback.
- Open the selected URI through `workspace.openTextDocument`. Reuse `provideDocumentOutline` for file targets, including empty files and files with no document symbols. Keep all source gaps and EOF text.
- Use the current adapter only when target and origin documents have the same `languageId`; otherwise reject with `The resolved target uses an unsupported language for this navigation: <languageId>.` This prevents parsing a foreign target with the source adapter without expanding Group B into cross-language adapter routing.
- Existing supported source text and `.pyi` declarations may open. `.pyi` is not an implementation: add `Type stub — declaration only` to its node hover metadata and candidate detail. Do not replace `.pyi` with guessed `.py`, execute library code, or probe the filesystem for alternate module names. Non-text/native or unsupported targets stay explicit failures.
- For nonroot targets, retain smallest selection / end-exclusive document-symbol lookup. An exact selection hit or a provider range matching a declaration range can open that symbol. Before accepting a merely enclosing Python method/class, use step 3's syntax-backed target hook. It may return a proven assignment or the owning function for a proven parameter declaration; otherwise report `No source declaration could be mapped at the resolved location.` Do not open an unrelated same-name symbol, enclosing method, or file as a substitute for an unmapped attribute.

**Affected callers.** Read/recheck before editing. No LSP server was configured during planning; use references if one becomes available, otherwise this exact search gives the migration set:

```text
grep pattern:
provideDefinitionOutline|vscode_executeDefinitionProvider|executeDefinitionProviderForPosition|convert_LocationLinkArray
path: src/vscodeextension/src
```

The live contract spans `outlineprovider.ts`, `utils/outlineproviderwrapper.ts`, `utils/outlineutils.ts`, `outlineproviderAPI/extensionactivator.ts`, and `visualprogramming/visualizer.ts`. Active tests affected are `outline_partition.test.ts` and `javascript_function_expression_boundaries.test.ts` under `test/suite/outlineprovider_test/`. `outline_test_python.test.ts` and `outline_test_typescript.test.ts` contain commented callers; `generic_handling_tests.test.ts` has an unused import/name string rather than a definition-query call. Do not resurrect commented test paths. Narrow returned `Symbol | File` values explicitly in active symbol-specific tests.

### 3. Preserve original decorator positions and open attribute assignments — R17

- Add `definitionRange?: vscode.Range` to `Outline.Attribute` in `SymbolDefinition.ts`. Only navigable decorator metadata sets it; `async` and other descriptive metadata remain inert.
- In `VpLspExtenderPython.getLanguageSpecificSymbolInformation` / `addAttribute`, reuse the parsed `Decorator` node. The installed grammar is `Decorator { At dottedName ArgList? newline }`; a read-only parser probe confirmed direct `VariableName` children for `@pkg.decorators.dag()`. Set `definitionRange` to the last direct `VariableName` before `ArgList` (the callable identifier `dag`), translated with the existing `range` helper. Do not assume start-column + 1: qualified decorators must navigate the final member, not the module.
- Keep `attribute.kind` and `displayTextRange` as the full original decorator source. Do not shorten host source or alter heading/body partitioning.
- Add the optional adapter hook `getDefinitionSymbol?(document: vscode.TextDocument, position: vscode.Position, context?: SymbolExtractionContext): vscode.DocumentSymbol | undefined` to `VpLspExtenderProvider`. Implement it only for Python; no equivalent currently maps a provider-confirmed assignment location omitted by document symbols.
- When the selected target has no exact declaration selection (only an enclosing method/class or no symbol), call this hook with the provider's target position and enclosing symbol/ancestors. Reuse `parseDeclaration`, `resolveVariableRange`, and the assignment-target rules currently local to `getLanguageSpecificSymbolInformation` (factor those rules into a private shared helper, not a second parser).
- Accept only a `VariableName`/`PropertyName` on the left side of `AssignStatement`, `UpdateStatement`, or an annotated assignment. Validate against the exact provider target. Build a name-only `DocumentSymbol` seed (`Field` for member targets, `Variable` for simple assignments) and let existing syntax-backed range recovery produce the full assignment, including receiver and multiline value.
- RHS references, type annotations, index expressions, strings/comments, and unrelated same-name assignments are not definitions. Return `undefined` for structurally unrecognized target locations; throw the existing explicit boundary error for a selected malformed/incomplete assignment rather than suppressing it. To preserve parameter-name navigation, the same hook returns the enclosing function only when syntax proves the provider target is a direct parameter declaration name in its `ParamList`—not an annotation or default-value reference.
- This is static source navigation only: never evaluate a property/descriptor or infer a runtime receiver. If the provider gives several attribute declarations, step 2's chooser decides.

### 4. Bind source surfaces and complete request lifecycle — R03/R17

**Source-coordinate utility.** Add `src/web_visualizer/src/utils/source_navigation.js`, required by the editor and outline window through jsstitcher. No existing helper maps both collapsed headings and persistent connection ranges; `SelectionUtils._getStringUntilCurrent` depends on rendered selection text and is not suitable for this path.

Use one `SourceNavigation` utility with:
- `bind(surface, model, ownerWindow, {rows: boolean})`: retain immutable `model.displayText`, `displayTextRange`, URI, and a text-node/source-offset index for that surface. Make a plain surface a widget once with `VgfWidget_createFrom`, then call `Connectable.makeConnectable`. Bind after the model/content are assigned. Decorator bindings use `attribute.kind` as immutable source text and its original `displayTextRange`, not a nonexistent translated attribute `displayText`.
- `capture(surface)`: return `{uri, range: [start, end], offsets: [startOffset, endOffset]}` for a nonempty identifier selection or the identifier at a collapsed caret; return `null` when the selection is outside that surface or on whitespace/punctuation.
- `request(surface)`: capture, create a source-anchor descriptor, and call the existing world/controller request route.
- `endpoint(anchor)`: return the current endpoint rectangle/containing element or the explicit hidden/compact fallback consumed by step 5.

Count UTF-16 source offsets, not visual columns or `Selection.toString()`. Headings retain original text nodes/newlines; CSS alone collapses whitespace. Body mapping uses the existing direct code rows, joins them with source newlines, and treats `<br>` as row structure rather than extra source characters. Normalize CRLF to LF for the display index while deriving VS Code line/character pairs from source line starts. Preserve tabs and surrogate pairs. Exclude CSS line numbers and synthetic ellipsis text. Verify text runs against the corresponding immutable source before accepting a mapping.

If browser repair of the existing highlighted-HTML/newline replacement makes row text diverge, replace `vp_setContent`'s string-based row wrapping with DOM-range splitting of the highlighted source at original line boundaries. Clone each line's highlighted fragment into its row and preserve highlight classes; do not switch to rendered-text offsets or drop multiline content to make mapping pass.

For a collapsed caret, expand within the same source line to a Unicode identifier (`ID_Start`/`ID_Continue`, underscore, and JavaScript `$`); a caret exactly at an identifier end uses the preceding identifier only when the right character is not another identifier character. For double-click selections, retain the selected token/expression's exact start/end. Do not replace `self.config`'s selected `config` with the receiver's position.

Build the text index once per render, cache DOM ranges per anchor, and invalidate on actual child/text changes, not every mouse move. Reindex unchanged text after re-highlighting. If local content edits no longer match the source model, refuse navigation and display a source-mapping error; never send stale coordinates. Keep existing editor behavior rather than silently making it read-only.

**Opened headings and metadata.**
- In `VpwOutlineWindow._vp_createClientTitle`, bind `.Window_Titlebar_Title` for `Symbol` nodes with source ranges. Keep file-name titles non-source text. Add `tabIndex=0`, `user-select:text`, double-click, and F12 support. Stop mousedown propagation on source text without preventing native selection; focus the window explicitly. Existing header padding/chrome remains draggable. Keep wrapping, 1200px fitting, close/collapse controls, and context menus.
- Do not add competing double-click behavior to `.Window_Clientarea_OpenDeclarationBlock`: preserve its current single-click declaration-open button behavior. Users open a declaration then navigate its parameter types in that heading.
- Render each attribute separately in `.Window_Titlebar_MetatypeDiv` while preserving the current first-line/ellipsis appearance and full-source hover. For an attribute with `definitionRange`, make its badge focusable; double-click or F12 sends that exact range. Index the displayed first-line prefix against `attribute.kind` and exclude the synthetic ellipsis; source positions beyond that prefix have no displayed text run. Each badge invokes only its decorator, including when shortened. `async` and other attributes without a definition range do not emit requests.
- In `VpwCodeEditor`, migrate the definition action to `SourceNavigation` and remove the superseded source-coordinate / highlight-parent anchoring path. Reuse `VsCode.position_sum` where converting line-relative positions is still useful. Do not remove general `SelectionUtils` methods without checking their remaining references.
- F12 in `Controller.onKeyDown_openDeclaration` finds the nearest bound source surface from the active element or current selection and dispatches once; metadata focus dispatches its stored range without requiring a text selection. Selection belonging to a different surface never reuses an earlier token.
- Reuse the existing editor MutationObserver/change path for invalidation and movement notification; do not maintain duplicate observers. Bind headings/metadata with the same cleanup discipline. Disconnect observers on the owning window's `vp_beforeDelete` event because raw descendant DOM nodes do not reliably receive widget deletion events.

**Request/reply contract.**
- Keep request `type: "outline_requestByFilePosition"` and data `{uri, cursorStart, cursorEnd}`. Validate/normalize structural positions in the host; provider lookup uses `cursorStart`. Keep success `visualizeOutline` with an array and original `requestedId`.
- Pass an optional `sourceAnchor` argument through `VpwWorld.vp_outline_openSymbolAt`, `Controller.outline_requestByFilePosition`, `RequestInformation`, and connection creation. It is webview-only state and is never serialized to the host.
- Make `VisualizingTab._getOutlineAndSend` await the command/chooser/extraction in one try/catch. Translate only the selected outline. A cancel posts `{type:"outline_cancelled", requestedId}`; `Controller._message_receive` consumes the pending ticket without placing/focusing any node or edge. Add matching classification to `RequestMessage`.
- Empty results produce the existing array-shaped `messageBox` response with `type:"Error"`, title `Definition not found`, message `No source definition was returned for this location.` Replace the obsolete implementation wording/method on this path.
- Rejections produce `messageBox` title `Source navigation failed`, retaining the concrete provider/open/extraction message. Handle them at this boundary rather than both returning `Error` and showing duplicate host notifications. Every success/error/cancel settles exactly one request ticket.
- Add `Controller.outline_reportError(requestee, title, message)` for local source-map failure: use the same request memorization and `_visualizeOutline(new RequestMessage(...))` pipeline with an array-shaped `messageBox`, title `Source mapping unavailable`, message `The displayed text no longer matches its source. Reopen the node before navigating.` No failed coordinate request reaches the host.
- Keep the existing late-response check: a deleted source may not receive an edge. For a non-null webview request ID, capture the requesting panel and discard its eventual reply if that panel was disposed/replaced; do not recreate it through `getWebviewPanel()`. Editor-origin requests with null ID retain their normal ability to create a new diagram.

### 5. Anchor edges to source ranges and reuse files correctly — R16/R14

- A source anchor is `{surface, uri, range, offsets, fallbackElement}`; `surface` is the stable connectable source element, `range` is its immutable original file range, `offsets` locate it in the original surface text, and `fallbackElement` is the decorator badge when compact presentation hides the full source. Do not insert marker nodes into source text or rely on highlight spans as token identity.
- Extend `Controller._connection_createIfNotExisting`, `VpwWorld.connection_createIfNotExisting` / `_connection_create`, `VpwEntityConnection`, and `_VpwEntityConnectionSpecialLine` with an optional `sourceAnchor = null`. Existing row/button connections without source ranges retain their current geometry. Store the actual target window on the connection for deduplication.
- In `VpwWorld.connection_createIfNotExisting`, scan the source surface's existing `Connectable` connections. Same source surface + same URI/range + same target window reuses one edge. Different source ranges to the same target keep separate edges. For legacy button anchors, use source-element + target identity.
- In `_vp_getLineStartPos`, for mapped source use the trailing edge and vertical midpoint of the last nonempty client rect for the token's final code point. A wrapped heading follows its final visual fragment. Reconstruct the DOM range from cached source offsets if the surface re-renders; never recapture the user's later selection.
- Keep `_clipSourceBounds` and world/screen conversions. Clip the preferred point against its actual ancestor scrollports and window bounds. Fully offscreen tokens pin to the nearest visible boundary. Collapsed/hidden source falls back to the owning visible heading's right edge; if that heading is hidden, use the frame edge.
- Compact decorators anchor to their callable identifier when that identifier is rendered and measurable. If shortened/ellipsized away, anchor to that badge's visible clipped edge, not another decorator or argument. Give the connection docker a tooltip with original `URI:line:column` and either `Source is outside the visible area`, `Source is hidden`, or `Compact decorator source` for a fallback; ordinary exact anchors identify the original source location.
- Reuse owner `vp_windowMoved`, `vp_windowResizedByUser`, scroll, and entrance events. Source visibility/re-highlighting emits owner movement through the binding observer; no animation loop or reparse on every frame. Window deletion removes edges and bindings through existing lifecycle hooks.
- In `OutlineEntityFunctions.equals`, compare `File` nodes by `CLASS_TYPE` + URI without accessing `totalRange`; compare `Symbol` nodes by URI and the existing declaration start identity with null guards. Message/error objects are not reusable source identities. This is required to open/reuse an imported file without crashing or duplicating it.
- Set `Outline.File.displayTextRange` to a zero-length `(0,0)` range in `provideDocumentOutline`, retaining filename display and complete `parts`. **Show in code** then opens the file at its start; no symbol `totalRange` is invented for a file.
- R08's comment toggle is not implemented here. Prove R16's mapping/hidden fallback with DOM visibility changes in a throwaway browser smoke; changing visibility must not renumber stored source offsets or retarget the edge.

## Verification

Planning inspected source and ran only a read-only Lezer parse of synthetic text. It did not build, run the extension suite, or claim live provider/UI behavior. The following are execution gates after approval.

### 1. Deterministic host regressions

Add `src/vscodeextension/src/test/suite/outlineprovider_test/definition_navigation.test.ts`. Reuse `MemoryFile`, `AssertX`, and the isolated custom-scheme/plaintext provider pattern in `outline_partition.test.ts`; dispose every registration in `finally`. Keep Python syntax in memory and instantiate the real Python adapter. Assert resulting source URI, node kind, original ranges, heading, and full body—not command forwarding or field-copy echoes.

Cases:
- Empty `(0,0)` provider target → `Outline.File`, even when the first declaration starts at file start. A separate symbol target in that same file → `Outline.Symbol`, not its file.
- Empty file and no-symbol text file → correct file node; preserve the final character without a trailing newline. A one-function file's nonempty whole-declaration location → function node.
- `LocationLink` whose origin and target coordinates differ → the correct declaration in the target file. Cover missing `targetSelectionRange`, mixed normalized entry shapes, and zero results. Replace the old field-copy-only normalization test at the end of `outline_partition.test.ts` with these output-level assertions; do not merely re-pin the new transport shape.
- Two same-named definitions in different classes/files → choosing the second produces only its complete node. Duplicate identical targets → a single result without a chooser. Cancellation → `null`, not unresolved. Multiple distinct targets without a chooser → the explicit selection-required rejection.
- Provider-confirmed `self.config` assignment with only the enclosing constructor in the symbol tree → `self.config =` heading and complete multiline value, excluding neighboring assignments. Same-name field in another class must never replace the selected target. RHS/type/index locations must not be promoted to assignment definitions.
- Missing target URI, unsupported target language, and malformed selected declaration → concrete rejection, not a guessed file/symbol. `.pyi` text remains a declaration with its actual URI/source.
- Extend `python_declaration_boundaries.test.ts` with stacked and qualified multiline decorators. Assert the callable name read from `definitionRange` is the correct terminal identifier and its coordinates remain in the original document. Preserve `async` as nonnavigable and existing full decorator/source boundaries.
- Migrate the existing JavaScript function-expression navigation assertions to the nullable Symbol/File result. Keep the actual receiver-versus-callable regression coverage.

### 2. Build and run in the installed VS Code host

From repository root after implementation:

```sh
npm run build:ext
```

Inspect the stitcher, CSS, copy, and TypeScript stages; the script uses semicolon-separated subprocesses and its final exit alone is insufficient. This builds generated assets—never edit them directly.

Use a fresh temporary `RUN_DIR` (for example `mktemp -d /tmp/scv-group-b.XXXXXX`) and retain its actual path for all commands. Run the full suite once after integration; it includes the new focused cases:

```sh
SCV_ROOT="$PWD" VSCODE_CLI=1 \
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir="$RUN_DIR/test-profile" \
  --extensions-dir="$HOME/.vscode/extensions" \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index" \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/vscodeextension/src/test/testfiles"
```

The executable and installed Python 2026.10.0/Pylance 2026.4.1 directories were found during planning. This command reuses the installed host; do not use plain Node/Mocha for suites importing `vscode`, and do not invoke the legacy test launcher's VS Code 1.61.1 download/install path. Success requires test output and exit status, not the historical 140-pass record.

### 3. Real webview interaction and anchor geometry

Start `npm run serve:web` as a named service and open the existing `tests/python_basic_show_class_dark_theme.html` and light-theme counterpart through `browser.open`. Use a throwaway injected source-backed fixture with the real visualizer and a recording backend; no permanent UI framework is added. Use native double-click, keyboard, drag, wheel, and resize input. Inspect actual screenshots plus DOM ranges/endpoints.

| Input/action | Required visible/state result |
|---|---|
| Open a function with multiline `config: Config` heading; double-click `Config`, then repeat with caret + F12 | Exactly one request per action at the original type token; no window drag and no parameter-name substitution. Source line/column unchanged after heading reflow. |
| Body has `left.config + right.config` within one highlight/text run | Two distinguishable token-end anchors; opening both may reuse a target node but must not merge their source locations. |
| Repeat the same token → same target | Same node and edge; no duplicate edge. |
| Change selection while a reply is pending | Edge stays on the originally requested token, not the new selection. |
| Stacked `@dag` / `@decorators.dag(...)` metadata | Each action sends its own original callable range; full hover source remains; synthetic ellipsis never contributes coordinates. |
| Resize/reflow; move either node; pan/zoom at 0.2, 1, 3; scroll nested code vertically/horizontally | Endpoint tracks the final token glyph within 1 screen pixel when visible, otherwise pins to the appropriate visible boundary; correct target remains attached. |
| Collapse/expand source, hide/restore a comment span or earlier comment row using the smoke harness, then re-highlight identical text | Original source offsets and target identity remain unchanged. Hidden source uses the declared heading fallback and tooltip, then returns to its token when visible. Do not add an R08 toggle. |
| Tabs, CRLF, non-BMP text before a token, line-number gutter, 99→100 rows | Requests retain exact UTF-16 line/column and endpoints; gutter never counts as source. |
| Edit local displayed text so it differs from the model, then navigate | Visible source-mapping error; no request using incorrect source coordinates. |
| Cancel a request / deliver an error / delete source before reply | No stuck pending ticket; cancel creates no node/edge; errors use the existing visible card; deleted source gets no edge. |
| Reopen the same imported file and use **Show in code** | One file node, no `totalRange` exception, correct file at its start. |
| Source text selection versus non-code header padding, declaration rows, close/collapse/resize | New source interaction works without losing the existing gestures. |

Browser fixture success is geometry evidence only; it is not Python/provider integration. Close automation-owned tabs after inspection.

### 4. Live Python/provider and Quick Pick proof

Create source-only temporary fixtures under `$RUN_DIR/navigation`, never inside the external Airflow project. Use empty `__init__.py` files for `ingestion/` and `ingestion/yearly_append/`, and:

`ingestion/yearly_append/operators.py`:

```python
"""Module navigation target."""
class OracleMonthlyAppendOperator:
    pass
```

`decorators.py`:

```python
def dag(**options):
    def wrap(function):
        return function
    return wrap
```

`navigation.py`:

```python
import decorators
from ingestion.yearly_append.operators import OracleMonthlyAppendOperator
from ingestion.yearly_append import operators as ops

class Config:
    pass

class LocalJob:
    shared = "local"
    def __init__(self):
        self.config = {
            "directory": "/tmp/data",
        }
    @property
    def label(self):
        raise RuntimeError("Do not execute this property")
    def inspect(self):
        return self.config, self.label

class RemoteJob:
    shared = "remote"
    def __init__(self):
        self.config = {"bucket": "production-data"}

@decorators.dag(
    schedule="daily",
)
def run(
    config: Config,
    job: LocalJob | RemoteJob,
):
    print(job.config)
    print(LocalJob.shared)
    print(ops.OracleMonthlyAppendOperator)

def unresolved(value: MissingType):
    return value
```

Do not execute/import these fixtures; the property exists to check static definition navigation. Create two isolated temporary workspace files: `$RUN_DIR/group-b-fixtures.code-workspace` containing only the fixture folder, and `$RUN_DIR/group-b-airflow.code-workspace` containing only the actual external `airflow-data/dags` folder. In each, set `python.defaultInterpreterPath` to the discovered external `.venv/bin/python` and `python.analysis.extraPaths` to that workspace's single source root. Do not combine the two `ingestion` packages in one analysis path: the temporary regression package must not shadow the real Airflow package.

Planning confirmed these existing paths:
- `../../MAFC/Workspace/airflow-data/.venv/bin/python`
- `../../MAFC/Workspace/airflow-data/.venv/lib/python3.12/site-packages/airflow/sdk/definitions/dag.py` (`DAG` near line 305, `dag` near line 1586)
- `../../MAFC/Workspace/airflow-data/dags/ingestion/common/operators.py`

Launch a separate live host:

```sh
SCV_ROOT="$PWD" VSCODE_CLI=1 \
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir="$RUN_DIR/live-profile" \
  --extensions-dir="$HOME/.vscode/extensions" \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --remote-debugging-port=9333 \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$RUN_DIR/group-b-fixtures.code-workspace"
```

Attach browser inspection to the actual workbench target at `http://127.0.0.1:9333`: list targets first, then `browser.open` with that CDP endpoint and target. Inspect the webview iframe and use the existing **Visual Programming: Visualize File (Local)** / **Visual Programming: Visualize This (Local)** commands. Wait for actual Pylance symbols before opening the diagram; do not add production retries for test-harness readiness.

Run acceptance checks 1–4 in the fixture workspace. For checks 5–8, close only this automation-owned host and relaunch the command with `--user-data-dir="$RUN_DIR/airflow-profile"` and `$RUN_DIR/group-b-airflow.code-workspace`. Reattach to the newly enumerated workbench/webview targets; never reuse stale frame handles.

Acceptance:
1. **R03:** Open fixture `run`; double-click `Config` in its wrapped/multiline heading → the local `Config` class and a type-token edge. F12 repeats the same target. Preserve the baseline parameter-name/declaration behavior. An unresolved annotation produces an honest unresolved card, not another same-name declaration.
2. **R14:** In the original-form import, double-click `operators` → the temporary module file; double-click `OracleMonthlyAppendOperator` → its class. Alias `ops` also reaches the provider-resolved file. Reopen the file without duplication and use **Show in code**. The historical external `ingestion/yearly_append` path no longer exists in the inspected workspace; this fixture preserves that exact regression form without modifying external source.
3. **R17:** Double-click compact `decorators.dag` metadata → the `dag` function in `decorators.py`. In `LocalJob.inspect`, navigate `config` to its actual multiline assignment and `label` to the property declaration without evaluating its getter. `LocalJob.shared` must not select `RemoteJob.shared`.
4. **Ambiguity:** Inspect real provider output for `job.config`. If it supplies both classes, use the actual Quick Pick: label/path/line distinguish them; choose `RemoteJob.config` and inspect its bucket assignment. Repeat and press Escape: node count, edges, viewport, and pending-request state remain unchanged. If this installed provider returns only one target, record that limitation and exercise the picker in the same real UI using a temporary extension-host smoke runner with an isolated custom-scheme/plaintext definition+symbol provider and the Python adapter registered for that isolated language in that host. The fixture provider returns two real in-memory assignment locations; the production `VisualizingTab` and picker must still run. Clearly label this deterministic picker proof separately from Pylance evidence; do not claim the provider returned two when it did not.
5. **Required actual Airflow scenario:** Open `trino_ingestion_dag_factory.py` → `_build_dag` → `ingestion_dag`. Inspect headings, full body text through `execution_timeout=SQL_TASK_TIMEOUT`, compact `@dag` and full hover, then activate its metadata and inspect the provider-selected `dag` definition. Use **Show in code** at each level. Do not execute/import/modify any Airflow file.
6. From the real DAG import `from ingestion.common import configuration, operators, sql`, open `operators` as a file; from the nested body open `OracleToIcebergIngestionOperator` as a class and `_pod_override` as a function. In `_build_dag`, opening `sql` and `_quoted_relation` gives different source anchors and file/symbol targets.
7. Open `operators.py` → `OracleToIcebergIngestionOperator._prepare`; `self.oracle_columns_sql` must navigate to its assignment in `__init__`, and not the entire constructor or a same-name field elsewhere. Open `SQL_TASK_TIMEOUT` and `CONFIG_DIR`; inspect their complete values and source navigation as regression checks. Source line numbers are hints: derive current positions from the current documents.
8. For standard-library `Path` or another actual stub-only target, retain the real `.pyi` URI and declaration-only explanation. Missing/unsupported targets and thrown provider errors must create a settled honest error, never a fabricated implementation.

Completion requires observed evidence for all four numbered items and preserved existing interaction. A build or extraction suite alone cannot mark Group B complete.

## Critical files and anchors

| File | Anchor and reason |
|---|---|
| `src/vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts` | `_getDefinitionRanges` JavaScript fast path and `getDocumentSymbolAtPosition` end-exclusive containment must survive the target-selection refactor. |
| `src/vscodeextension/src/outlineproviders/lspextenderpython.ts` | `resolveVariableRange`, declaration cache, and assignment target matching are the existing syntax-backed machinery; reuse rather than add regex extraction. |
| `src/web_visualizer/src/vp/outline_object_functions.js` | `equals` currently dereferences symbol-only `totalRange`; imported-file reuse depends on fixing this. |
| `src/web_visualizer/src/vgf/vgf_window_tiled.js` | `_create_title_area` begins drag on every bubbled left mousedown; source-surface handlers must stop it without blocking non-code header drag. |
| `src/web_visualizer/src/vgf/vgf_widget.js` | Deletion traverses only widget-marked direct children; explicitly clean source observers via the owner window. |

## Assumptions and contingencies

- Double-click/F12 and VS Code Quick Pick are user-confirmed choices. Single-target navigation stays direct; no automatic opening of all candidates.
- Python is the acceptance language. Preserve existing targeted TypeScript/JavaScript behavior and Group A declaration safeguards; do not claim general cross-language parity.
- An unavailable real Python provider is a verification blocker, not permission to substitute a mock completion claim. First use the confirmed installed extensions directory and existing Airflow virtual environment in the isolated host. Do not install/upgrade project dependencies or alter external workspace configuration merely to make a smoke pass.
- If 8080 or 9333 is occupied, choose a free port and substitute it consistently in service and browser commands; never stop another process. If the discovered interpreter/source paths have moved, locate their replacements read-only and use only the isolated workspace configuration.
- If Pylance omits field document symbols, step 3's syntax-backed target hook is the decided implementation, not a reason to open an enclosing method. If it returns no target at all, retain unresolved status; no workspace-wide name search or runtime inference.
- For temporarily edited display text, source mapping fails explicitly until the node is reopened. Group B does not add live source synchronization.

