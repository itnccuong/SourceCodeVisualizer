# Phase 1 Groups C and D — Canvas interaction and JSON persistence

## Context
Implement all of Group C—R01 minimap, R02 current-canvas function list, R12 fit all, R05 group selection/movement, R06 orphan-aware close, and R08 per-node comments—and Group D R09 explicit JSON save/load from `specs/roadmap.md:86–125`. The user chose to hide Python docstrings with comments, load each saved canvas into a separate tab, and have Visualize This offer a new canvas or any existing imported/`New-x` canvas. Completion means a navigable exploration graph whose relationships, layout, view, and comment settings survive explicit save/load using current source, with explicit visualization destinations rather than implicit tab selection.

After approval, copy this complete plan to the new `features/phase-one-groups-c-d/plan.md` before implementation. Keep `specs/` read-only. Follow `specs/context.md` for the completed results record and `docs/architecture-and-development.md` for original/generated boundaries. Do not hand-edit extension `out/`, canvas `release/`, or copied `media/web_visualizer.*`.

## Approach

Implement steps 1–4 first, then integrate 5–9. Steps 5 and 6 can proceed independently after agreeing the model fields below. Step 7 depends on graph/frame/source-reference contracts; steps 8–9 integrate everything. Keep one owner for `controller.js`, outline-model changes, and final host/webview integration. Use the existing jsstitcher `require ("...");` directives for new browser dependencies; add no framework or package.

### 1. Give the displayed graph one owner

**Observed:** `Controller` owns request tickets but no graph registry. `VpwWorld` discovers nodes from DOM children. `Connectable` owns per-surface connections; `VpwEntityConnection` records its source surface, target, and immutable source anchor. `SViewEntity.x/y` are initialization data, not reliable current geometry.

Add new `src/web_visualizer/src/vp/canvas_graph.js`, required by `vp/controller.js`. No equivalent registry exists. `CanvasGraph` owns:

- `nodes: Map<string, {window, independentRoot: boolean}>`.
- `edges: Map<string, {connection, sourceId: string, targetId: string|null}>`.
- `selection: Set<string>`; focus remains separate.
- Methods `addNode(window, independentRoot, id?)`, `addEdge(connection, sourceId, targetId, id?)`, `setTarget(edgeId, targetId)`, `removeEdge(edgeId)`, `connectedComponent(nodeId)`, `closeSet(nodeId)`, and `removeNodes(ids)`. Traversals build adjacency once per operation and use visited sets. IDs are monotonic `n1…`/`e1…` within one canvas; restored IDs are retained and future allocation skips occupied IDs.

Expose `world.vp_graph` and a frame's `vp_canvasNodeId`. Register every top-level outline, diagnostic, and restored unavailable-source frame, not popups or connector widgets. Integrate registration in `VpwWorld.visualizeOutline/visualizeMessageBox` and the new unavailable-source constructor, with root classification supplied by `Controller._managedWindow_create/_visualizeOutline`. Register connections in `VpwWorld._connection_create` after their actual initial docking; preserve distinct source-range edges and existing deduplication.

Root rules:

1. Editor `Visualize This`/`Visualize File` messages have `requestedId:null`: create or promote the node to `independentRoot:true`.
2. A successful connected CALLEE request creates a non-root; finding an existing node never demotes its root state.
3. Open parent currently returns an unconnected CALLER result. Keep that behavior and mark that result an independent root; do not invent inheritance/exploration edges.
4. During restore use the saved root flag, never infer it from in-degree.

Resolve edge ownership using the source's owning registered outer frame, not the source DOM element as a graph node. In `VpwEntityConnection.vp_dock` and its `vp_windowBeforeStartMoving` listener, update the registered target on dock/re-dock/undock. A free connector has `targetId:null`. Connection deletion unregisters once through `vp_beforeDelete`. Edge removal or detachment alone does not close nodes.

Change `Controller._visualizeOutline` so a non-null reply ID without a live ticket is ignored; only null-ID messages mean an independent editor request. Before node deletion, remove tickets whose requestee's owning frame is in the close set. Cancellation/error/success continue to settle live tickets once. This prevents a late definition reply from recreating a just-closed branch.

Install `frame.vp_requestClose()` from the graph owner. `_create_btn_close` in `vgf_window_tiled.js` calls this hook when present, otherwise low-level `vp_delete()`. Do not put a `gController` dependency in generic Vgf frames. Low-level teardown must not recursively invoke the close command. Make the affected connection/frame deletion path idempotent, since connector parent/source listeners can both request teardown. Disconnect the frame ResizeObserver and remove graph/UI listeners on `vp_beforeDelete`; preserve existing source-binding and body-lock cleanup.

### 2. Close only recursively orphaned descendants — R06

`CanvasGraph.closeSet(K)` computes the complete set before mutating the DOM:

```text
C = forward-reachable nodes from K, including K, through docked edges
seeds = remaining independent roots in C
      + nodes in C\{K} with an incoming edge from outside C
protected = forward traversal from seeds within C, excluding K and its edges
delete = {K} union (C minus protected)
```

Nodes outside C always survive. Delete all incident edges once, invalidate affected request tickets, remove IDs from selection/registry, then call each frame's low-level deletion once. Publish one graph-change notification after the batch so list/minimap do not rebuild per node. The close button closes the clicked node's orphan set, not every selected node.

Required lifecycle cases:

|Graph before close|Action|Survivors|
|---|---|---|
|A(root) → B → C|Close B|A|
|A → B → C; X → C → D|Close B|A, X, C, D|
|A(root) → B → C → A|Close B|A|
|A(root) → B; B ↔ C|Close A|none|
|A → B; B ↔ C; X → C|Close A|X, B, C|
|A → B; B explicitly reopened from editor|Close A|B and its owned branch|
|K → K|Close K|none|

Multiple edges between the same pair do not cause duplicate movement/deletion. Disconnected non-roots left by manual connector removal are not globally garbage-collected. A root still closes when explicitly selected as K.

### 3. Separate graph selection from text selection — R05

Add new `vp/canvas_selection.js`, required by `controller.js`, to own group selection and pointer gestures; there is no existing group-selection controller. It receives the graph, world, and navigation area. Apply a distinct `VpwNode_selected` frame class using existing theme colors; do not reuse `VgfWindow_focussed` or the gold body-scroll-lock outline.

|Gesture|Result|
|---|---|
|Double-click non-code header chrome|Replace selection with the undirected connected component of that frame, including ancestors, siblings, and descendants|
|Primary drag on empty canvas|Draw a viewport-space rectangle; on release select only outer frames wholly enclosed, borders included|
|Primary click on empty canvas|Clear group selection; retain existing focus-clearing behavior|
|Drag a selected frame's non-code header|Move the selected group|
|Drag an unselected frame's header|Replace selection with that frame and move it|
|Space+primary drag or middle-button drag on empty canvas/header chrome|Pan the canvas|
|Escape during rectangle|Cancel rectangle and preserve previous selection|
|Escape outside source editing|Clear group selection|

Use pointer capture for rectangle/group/pan gestures, a 3-screen-pixel drag threshold, and snapshot starting positions. Group motion is `startWorldPosition + screenDelta / startScale`, applied through each frame's `vp_setXY`; do not accumulate rounded `offsetLeft` values. Scale remains fixed during a pointer drag. Release capture/listeners on pointer up/cancel/lost capture, blur, frame deletion, and controller disposal. Ending/cancelling a movement leaves its already-applied positions; only an unfinished rectangle is rolled back.

Append the marquee overlay to the unscaled navigation area with pointer-events:none. Recognize empty space from either the interaction-area element or the world background after excluding registered frames/widgets/UI; do not depend on one sibling always being the hit target. Capture the pointer on the stable navigation/header element, not the temporary rectangle.

Replace the unconditional `setup_mouse_dragElement(self._vp_interactionArea, world)` call in `vgf_navigationarea.js`; set world absolute positioning explicitly. Do not leave the old empty-canvas left-drag handler active. Route only registered outer-frame header drags through the new group mover; keep `_Mover` for connector widgets. In `vgf_window_tiled.js`, the registered header hook fully replaces the old call to `vp_startMoving_fromEvent` for that gesture: return after invoking it, and consume the compatibility mousedown so no delayed `_Mover.moving_start` competes with pointer-driven movement. Fall back to the old mover only for unhooked non-canvas widgets.

Source headings, bodies, decorator badges, declaration-row buttons, close/collapse/comment buttons, resize grips, connector widgets, toolbar/list/minimap are excluded from header/background gesture recognition. Respect `SourceNavigation`'s existing source-hit and event-propagation rules: native token double-click/F12 must not select a graph component. Space is a pan modifier only when focus is not in an input, textarea, contenteditable, or source surface. Plain wheel/Shift-wheel panning, clicked-body wheel ownership, Ctrl/Alt-wheel zoom, and touchpad momentum ownership stay unchanged.

Set a world gesture-active flag during pointer manipulations. `WindowPositioner`'s auto-reveal suppression must check it alongside `_Mover.currentlyManipulatedWindow` so async responses cannot fight a group drag or pan.

### 4. Share camera geometry across minimap, list, fit, and restore — R01/R02/R12

Add new `vp/canvas_camera.js` and `vp/canvas_controls.js` plus `vp/canvas_controls.css`. No existing toolbar/minimap/list exists. Keep controls as unscaled siblings of the world inside the navigation area.

`CanvasCamera` provides `frameBounds(frame)`, `viewportBounds()`, `getState()`, `setState({centerX, centerY, scale})`, `fitAll()`, and `notifyChanged()`. Reuse `node_scale` and the old/new DOM-rect translation technique from `zoom`; share `MIN_SCALE=0.2` and `MAX_SCALE=3` with wheel zoom rather than duplicating limits. Store camera center in world coordinates, not screen-dependent CSS offsets:

```text
viewportCenterScreenX = navigationAreaRect.left + navigationAreaRect.width / 2
viewportCenterScreenY = navigationAreaRect.top + navigationAreaRect.height / 2
centerX = (viewportCenterScreenX - worldRect.left) / scale
centerY = (viewportCenterScreenY - worldRect.top) / scale
```

`setState` clamps scale, applies it, reads the new world rect, then adjusts fractional CSS left/top so the requested world center is at the viewport center. Do not assume transform origin or subtract rounded offsets. Dispatch `vp_cameraChanged` from wheel pan/zoom, pointer pan, fit/restore, and every auto-reveal animation frame. Expose `WindowPositioner.cancelReveal(world)` for explicit fit/jump/restore actions. Coalesce geometry rendering to one requested animation frame; no polling or per-edge geometry scans.

Controls:

- Top-left toolbar: **Fit all**, **Functions (N)**, **Save canvas**, **Load canvas**, plus a compact non-modal status region. Use actual buttons, keyboard focus, `aria-expanded` for Functions, and existing theme variables from `main.css`.
- Functions opens a scrollable dropdown below the toolbar, maximum 280px wide and 40% of viewport height. List only registered top-level callable nodes. Labels are whitespace-collapsed headings with URI/line secondary text; sort by label, URI, source position, ID. Empty text: **No functions on this canvas**. Add/remove/load updates the entries. Activating one closes the dropdown, calls `vp_focus()` and `WindowPositioner.revealWindow()` on that existing frame, and neither creates/refits it nor changes group selection.
- Include `kind` function/method/constructor and syntax-proven callable assignments. Add optional `isCallable:boolean` to `LanguageSpecificSymbolInformation` and `Outline.Symbol`; `OutlineUtils.documentSymbol2outlineSymbol` fills it from ordinary callable symbol kinds or adapter information. In `VpLspExtenderTypeScript.getLanguageSpecificSymbolInformation`, reuse the existing `callable` result and callable declaration branches, not a new parser or heading-text guess. Existing provider kinds remain unchanged.
- Bottom-right passive SVG minimap: 180×120 CSS px, 12px inset; constrain width/height to 25% of the viewport on small views. Show outer-frame rectangles and the viewport rectangle only, using aspect-preserving scaling of the union of node bounds and viewport bounds, with 8px internal padding. Include diagnostics/unavailable nodes. Empty canvas shows only the viewport. Moving/resizing/collapsing/comment toggling, selection, creation/deletion, pan/zoom, restore, and viewport resize invalidate it. Its input shield stops pointer/wheel/double-click gestures without navigation or selection; do not use pointer-events:none that forwards a minimap drag into the canvas.

Fit all unions current registered outer-frame bounds, excluding dockers/popups/UI. Reserve the measured toolbar height at the top and minimap height plus its inset at the bottom, then apply 24 screen px padding. For positive available dimensions, `scale=clamp(min(availableWidth/boundsWidth, availableHeight/boundsHeight),0.2,3)` and center those bounds in the available rectangle. If already at the minimum and content still cannot all fit, retain 0.2, center it, and show **Content exceeds minimum zoom; some nodes remain outside the viewport.** Do not violate R11. Empty canvas/zero-size hidden viewport is a no-op. Fit is immediate, not a new animation.

Reuse the same usable-viewport rectangle for list reveal and new-node reveal/viewport-relative placement so toolbar/minimap do not cover the revealed header. Keep the existing 450ms reveal and reduced-motion/cancellation behavior. The saved viewport represents the full canvas viewport center and scale; controls themselves are not graph content.

### 5. Hide comments/docstrings without changing source coordinates — R08

**Observed:** `SourceNavigation._ensureIndex` deliberately indexes display-hidden text and requires the full normalized DOM text to equal immutable source. `VpwCodeEditor.vp_setContent` already highlights once, clones multiline spans into direct row divs, and preserves CRLF-aware source indexing. Reuse these mechanisms; do not delete comment text or rebuild a shortened model.

Add `Outline.CommentRange {range:vscode.Range; kind:'comment'|'docstring'}` and optional `commentRanges:CommentRange[]` on `OutlineRange`. Add optional `getCommentRanges(document:vscode.TextDocument): readonly Outline.CommentRange[]` to `VpLspExtenderProvider`. Implement it in Python and TypeScript adapters with a document-version cache; use lazy installed parsers, not regex stripping, code execution, or a background index. Have `OutlineUtils` attach intersected absolute comment ranges to each displayed Text/Symbol/Attribute range during construction, reusing one classification result per document version. An explicit empty array is authoritative; absence means the generic-highlight fallback below. `_translate_outlineRanges2outlineEntities` preserves this metadata.

Python classification:

- Reuse `parseDeclaration` over the full document on demand, which then supplies a reusable cached tree. Traverse `Comment` nodes for `#` comments, including trailing comments.
- A docstring is the first non-comment statement of `Script` or a real `FunctionDefinition`/`ClassDefinition` Body, and that statement is a pure string expression. Recognize parenthesized strings and implicit adjacent string concatenation (`ParenthesizedExpression`, `ContinuedString`); accept ordinary/raw/unicode strings, exclude byte and formatted strings, assignments, calls, and binary expressions. `if`/`try`/loop blocks are not docstring scopes. Never treat the parser's temporary `if True` wrapper as a real scope.
- For a first-statement `StatementGroup`, classify only its initial pure-string expression. Include its following semicolon in the hidden range when another statement follows on that line, leaving the other statement intact. Do not hide separators belonging to executable statements.
- Only classify syntax-proven ranges without error nodes. Uncertain docstring syntax remains visible, never guessed. AST inspection during planning confirmed Script/String, nested Body, ContinuedString/ParenthesizedExpression, FormatString, and StatementGroup shapes using the installed parser.

JS/TS/TSX classification:

- Reuse the adapter's TypeScript parser/validated source-file machinery in the correct JS/TS/TSX mode. Collect lexical comment trivia only, including JSDoc. Strings such as `"use strict"`, regex literals, template literal text, and JSX text are never docstrings/comments.
- Do not run a naive scanner across the whole file: regex/template/JSX scanning needs parser context. Walk parser token leaves, treating complete literal/regex/template/JSX text spans as opaque and skipping JSDoc AST subtrees as trivia. Merge token spans, then scan only the trivia gaps for SingleLineCommentTrivia/MultiLineCommentTrivia. Include EOF trivia. Reuse TypeScript comment-range/scanner APIs within these proven gaps.
- If classification cannot be proven for the selected source, retain the source and expose **Comment hiding unavailable** with the extraction reason; do not mark executable text as a comment. Keep declaration extraction's existing explicit failures.

Carry classification failures as optional `OutlineRange.commentHidingError:string`. `OutlineUtils` catches only comment-classification failures, copies the reason to affected display parts, and leaves their complete source intact; declaration-extraction failures still propagate normally. If any displayed part of a node has this error, show all its source and set the Comments control `aria-disabled=true` with the reason in its tooltip. Activating it reports **Comment hiding unavailable: <reason>** in the existing controls status region, not a fake body/status badge. Preserve the requested visibility boolean for re-save; the failed projection must not imply that comments were actually removed.

For the existing C/C++/Java/PHP/Dart curly-brace adapters, use only explicit-language highlight.js `hljs-comment` spans already produced by that grammar; never hide `hljs-string`. Do not use auto-detected-language output as evidence for hiding. Unknown/missing grammars keep source visible with **Comment hiding unavailable**. This retains their existing lexical-highlighter level of support, not new parser parity.

In `utils/misc_utils.js`, change `SyntaxHighlighter.run(text,language)` to return `{html:string, exactLanguage:boolean}`. Set exactLanguage only when the requested-language highlight call succeeds; auto-detection fallback returns false. Migrate its only source callers in `vpw_code_editor.js` and `vpw_outline_window.js` to use `.html`; the comment projector also reads `.exactLanguage`. This avoids running the highlighter twice or trusting its fallback language. Search `SyntaxHighlighter\.run` in `src/web_visualizer/src` before cutover to catch intervening callers.

Rendering:

1. Add `frame.vp_commentsVisible`, default `true` for File and `false` for Symbol; restored state overrides the default. Add a **Comments** titlebar button with `aria-pressed`, tooltip **Hide comments and docstrings**/**Show comments and docstrings**. The toggle belongs to the outer node, including bodyless nodes; separate opened nodes never share its state.
2. Add `vp_setCommentsVisible(visible)` to outline windows/code editors. Tag source-range intersections with dedicated hidden-source spans before binding. Use the existing DOM-range/splitting approach, not HTML substring replacement. Apply the same classification to source headings/declaration rows where multiline signatures contain comments. Decorator metadata remains metadata; hide only actual classified comment text, not decorators or descriptive attributes.
3. Hide comment/docstring-only rows with display:none, preserving every direct row and all original text nodes. Blank lines that were already blank remain. For mixed rows hide only classified text; keep executable text and its source positions. Where removing an inline block comment would join two visible code tokens, add a presentation-only separating space marked `data-vp-source-ignore`, never a source column.
4. Replace increment-only gutter counters with each row's original block-local ordinal in `data-vp-line-number`, rendered by CSS `attr(...)`; retain the existing gutter sizing. Hidden rows leave number gaps rather than renumbering surviving lines. No number text enters selection offsets.
5. While comments are hidden, keep bodies selectable/focusable but set contentEditable=false to avoid editing invisible source. Showing comments restores existing editing. If the visible body was already edited and no longer matches immutable source, refuse to apply stale classifications and show the existing **Source mapping unavailable** error without discarding the edits.
6. Toggle before initial auto-fit; later toggles preserve manual dimensions/positions and scrollability. Do not add a fake body, status badge, or placeholder to a genuinely bodyless declaration or a docstring-only implementation. A docstring-only implementation can have an empty visible body until comments are shown.
7. Reuse SourceNavigation visibility invalidation and `vp_windowMoved`. Hidden clicked tokens use its heading/frame fallback and return to their exact original token anchor when shown. Do not recapture anchors from current selection.

### 6. Mint persistent references and restore declarations without F12 lookup

Add new `src/vscodeextension/src/outlineproviderAPI/source_reference.ts` for the following shared host model. No persistent source-reference contract currently exists. Add optional `sourceReference` to File/Symbol outlines; do not serialize displayText/parts.

```ts
type SavedPosition = {line:number; character:number};
type SavedRange = [SavedPosition, SavedPosition];
type SymbolPathEntry = {name:string; kind:number}; // VS Code SymbolKind

type SourceReference = {
  type: 'file' | 'symbol';
  uri: string;                  // absolute VS Code URI
  language: string;
  documentHash: string;         // lowercase SHA-256 of exact document text as UTF-8
  symbol: null | {
    name: string;
    kind: number;
    path: SymbolPathEntry[] | null; // full root-to-leaf provider ancestry, when proven
    selection: SavedRange;
    declaration: SavedRange;    // actual adapted declaration, not name-only provider range
  };
};
```

Populate provider name/kind/path/selection while `OutlineUtils.documentSymbol2outlineSymbol` still has `docSymbol` and `symbolParents`; establish full ancestor links for all entry paths (file, selected definition, location definer, and projected children). A synthesized Python assignment not present in the provider tree has `path:null`, never a guessed semantic path. In `_translate_outlineRanges2outlineEntities`, stamp the document hash once per document/version batch when source text is filled. The reference describes the source actually displayed, not whatever happens to be on disk later at Save. Hashing never executes the source.

Extract the existing `_translate_outlineRanges2outlineEntities` implementation into new `visualprogramming/outline_entities.ts` as `translateOutlineRanges(outlines:Outline.OutlineRange[]):Promise<Outline.OutlineRange[]>`. Reuse it for ordinary visualization and staged loading; remove the private duplicate. Migrate all three existing calls in `VisualizingTab.visualizeDocument`, `_getOutlineAndSend`, and `_outline_getLocationDefiner` (the exact search `_translate_outlineRanges2outlineEntities` in `visualizer.ts` also returns the declaration). This extraction is needed so the manager can fill live displayText, stub metadata, and fresh references before creating a loaded panel.

Add `provideSavedOutline(document:vscode.TextDocument, reference:SourceReference):Promise<Outline.File|Outline.Symbol>` to `VpOutlineProvider`, implement it in `VpOutlineProviderWrapper` through new `OutlineUtils.provideSavedOutline`, and register **vp.executeSavedOutlineProvider** in `outlineproviderAPI/extensionactivator.ts` accepting one SourceReference. Resolve `_getProvider` errors by rejection, not the existing never-settling unsupported-provider branches. All in-repository VpOutlineProvider implementations are the wrapper; inspect references again before editing if a language server becomes available. A runtime third-party provider lacking this capability produces an explicit unavailable node, never a fallback definition lookup.

Restoration algorithm:

1. Open the exact URI with `workspace.openTextDocument`. Compare its language to the saved language; retain actual `.pyi` URIs/stub labeling. File references call the same provider's document-outline method.
2. Symbol references query the current document-symbol tree, not `vscode.executeDefinitionProvider`. If the full document hash is unchanged, match exact saved name/kind/selection and adapted declaration range. Use saved ancestry where present to resolve duplicate names. A Python syntax-backed assignment with no provider entry may use `getDefinitionSymbol` at the unchanged saved selection with current enclosing provider ancestors, followed by exact name/kind/declaration verification.
3. If the document hash changed, accept only one exact full provider ancestry path of name+kind. Extract its current source. Do not choose nearest lines, an arbitrary overload, a same-name symbol in another scope, or a new definition at the old cursor. If path is null, absent, or ambiguous, return an explicit unavailable-symbol reason. No cross-file filename guessing or implementation substitution.
4. If two saved references resolve to the same current declaration unexpectedly, mark the conflicting nodes **Source identity conflict** rather than merging IDs/relationships or selecting one arbitrarily.
5. Run `translateOutlineRanges` on every successful restored outline before building ResolvedCanvas; range-only outlines cannot render. Fresh successful outlines carry fresh references. Keep the document version stable across extraction/translation; a version change produces **Source changed during restore** for that node rather than binding ranges to different text. Unavailable nodes retain the original reference for a future save/load attempt. Use bounded per-load caches for documents, hashes, and provider trees; resolve in saved-node order, not one provider lookup for every edge.

Missing URI, missing/ambiguous declaration, unavailable provider, language change, and extraction failure are per-node restoration outcomes. Malformed reference structure is instead a whole-file validation error in step 7. No analyzed file is executed or modified.

### 7. Define the JSON and frame contracts — R09

Add new `visualprogramming/canvas_format.ts` for format types plus `parseCanvasFile(value:unknown):CanvasFileV1`; it validates and reconstructs allowlisted data rather than casting JSON to a model. Add new browser `vp/canvas_persistence.js` for serializing/restoring the registry. There is no existing serializer/file format to extend.

Use `.scv-canvas.json` as the Save dialog suggestion, UTF-8 JSON with 2-space indentation and trailing newline. Version 1 has exactly this shape:

```ts
type CanvasFileV1 = {
  format: 'source-code-visualizer-canvas';
  version: 1;
  viewport: {centerX:number; centerY:number; scale:number};
  nodes: Array<{
    id:string;
    independentRoot:boolean;
    content:
      | {type:'source'; reference:SourceReference}
      | {type:'diagnostic'; severity:'Error'|'Warning'|'Info'; title:string; message:string};
    frame: {x:number; y:number; width:number; height:number;
            collapsed:boolean; expandedHeight:number};
    commentsVisible:boolean|null; // boolean for source, null for diagnostics
  }>;
  edges: Array<{
    id:string;
    sourceId:string;
    targetId:string|null;
    origin:
      | {kind:'frame'}
      | {kind:'declaration'; uri:string; documentHash:string; range:SavedRange}
      | {kind:'source'; uri:string; documentHash:string;
         surface:{kind:'heading'|'body'|'attribute'; range:SavedRange};
         range:SavedRange; offsets:[number,number]};
    dock: {kind:'node'; y:number} | {kind:'free'; x:number; y:number};
  }>;
};
```

This stores all current registered frames, including ordinary diagnostics. Restored diagnostics show **Saved diagnostic** so their historical text is not presented as a new analysis result. A failed source restore remains `content.type:'source'` with its original reference when re-saved, not a diagnostic conversion. Source models, body/heading text, decorator text, HTML, tokens, local contenteditable edits, selection, focus, pending requests, minimap state, and code scroll offsets are not saved. Diagnostic title/message are plain text metadata, not executable HTML.

Save current geometry from the frame, not `SViewEntity.x/y`. Add `vp_getFrameState()` and `vp_restoreFrameState(state)` in `vgf_window_tiled.js`, including access to its private `_expandedHeight`. Restore width before height/collapse, retain the 120-world-pixel width minimum and measured chrome/resize minimum height. If changed source increases the minimum, clamp only the necessary dimension; keep x/y and saved expanded height as far as the minimum allows. These methods do not run auto-fit or animations.

Validate before reading any source URI or creating a tab:

- Exact format and supported version; required fields, tagged-union types, allowed keys, booleans/strings, unique non-empty IDs, and existing edge endpoints. Reject duplicate identical source references; cycles, self-loops, and distinct-origin parallel edges are valid.
- Finite geometry, positive frame dimensions/expandedHeight, viewport scale within 0.2–3, safe nonnegative integer positions/offsets, ordered ranges, non-empty source-token ranges, matching URI between edge origin and source-node reference. File reference has symbol:null; symbol reference has a valid symbol record. Hashes are 64 lowercase hex digits.
- Dock kind matches target nullability. A non-frame origin requires a source node, not a diagnostic. Do not read arbitrary paths from node IDs or merge JSON properties into DOM objects.
- Restore only persistent local `file:` and VS Code `vscode-remote:` source URIs. Reject command/http/data/untitled/custom content-provider URIs with **Unsupported source URI**. Untitled documents must first be saved to a persistent URI. Existing dirty file buffers may supply references, but Save canvas never saves their edits; append **Unsaved source edits are not stored in this canvas file** to the save result when referenced open documents are dirty. Load uses the workspace's current document text, including current dirty buffers; never substitutes saved source snapshots. Preserve the remote authority; never reinterpret it as a local file.
- Invalid data reports **Cannot load canvas: <reason>** with no new panel or mutation. Unsupported versions report **Unsupported canvas version: <value>**. Do not silently clamp malformed serialized numbers into valid data.

Use `textContent` for loaded labels, diagnostics, and errors. `VpwMessageWindow` currently uses innerHTML for messages: change that sink to textContent when routing loaded diagnostic/plain error text through it, and use CSS white-space:pre-wrap for multiline messages rather than saved markup.

### 8. Add explicit Save/Load and real tab ownership

In `visualprogramming/extensionactivator.ts`, replace `VpTabManager._visualizingTab` with live tab records and a most-recently-active order. Each record has a session-unique ID, a stable display name, its `VisualizingTab`, and an optional imported canvas URI. Use `WebviewPanel.onDidChangeViewState` to track activation and `onDidDispose` to remove only that tab. Closing the most recent tab updates the fallback for Save and Visualize File; it never retargets an already-running request.

**Visualize This destination picker (both palette and editor-context command IDs):**

1. Before opening Quick Pick, capture the active source document and copies of all editor selections. If there is no source editor, show the existing cannot-visualize error and return. The picker changing focus must not change the captured source.
2. Always call `showQuickPick` with placeholder **Select a canvas for Visualize This**, `canPickMany:false`, and **New canvas** as the first item, even when no canvases exist. Then list every live canvas, including imported ones and previously created `New-x` canvases, in creation order. Each item stores the actual tab ID, never an index or title lookup.
3. Choosing **New canvas** creates `New-1`, then `New-2`, etc., with a session-scoped increasing counter. Do not reuse numbers when tabs close, and do not consume a number on picker cancellation. Panel titles are `Code Diagram — New-1`, etc. Any fresh canvas created by another existing entry point uses this same counter.
4. Imported entries use the imported file basename as their display name. Show **Imported · <full canvas URI> · canvas <session ID>** as detail, so duplicate imports/basenames remain distinguishable. New entries show their `New-x` name and session ID. Save/Save As does not rename a canvas or silently change its destination identity.
5. Choosing an existing item reveals that canvas and adds/reuses the captured source outlines there; it does not create another canvas or clear its graph. If that tab was closed while the picker was open, show **Selected canvas was closed. Run Visualize This again.** and stop rather than choosing another tab.
6. Cancellation performs no provider lookup, creates no tab, and changes no graph. All captured selections in one invocation target the single chosen canvas. Source lookup/navigation replies remain bound to that panel even if focus changes; disposing it discards those replies without recreating it.

Replace `VisualizingTab.visualizeFromCursorPositions()` and its private selection dispatcher with `visualizeSelections(document:vscode.TextDocument, selections:readonly vscode.Selection[]):Promise<void>`. The manager captures editor state, awaits a new `chooseCanvasForVisualization():Promise<VisualizingTab|undefined>`, and calls that method once. Migrate both `code-visualizerzer-local.visualize` registrations to return the manager's async operation. The inspected callsites are those two registrations, `VpTabManager.visualize`, and `VisualizingTab.visualizeFromCursorPositions`; re-run the exact search `getVisualizer\(|visualizeFromCursorPositions\(|new VisualizingTab\(|\.visualize\s*\(` under `src/vscodeextension/src` before cutover.

Keep Visualize File's existing implicit targeting, now to the most-recently-active surviving canvas or a fresh `New-x` if none exist; the user requested the picker specifically for Visualize This. Replace the old single-tab `getVisualizer` with a clearly named `getOrCreateMostRecentCanvas()` used only by those file commands. Do not use it from Visualize This or from delayed message delivery.

Capture/create the owning panel at the start of each explicit visualization method, before any provider await. `_postOutlineMessage` must send only to that captured live panel, including null-ID editor responses; remove its null-ID lazy-create-at-delivery behavior. Once a tab is disposed it is terminal. The manager, not an old tab instance or a delayed reply, creates subsequent canvases.

Register and contribute in `src/vscodeextension/package.json`:

- `code-visualizerzer-local.saveCanvas` — **Visual Programming: Save Canvas (Local)**.
- `code-visualizerzer-local.loadCanvas` — **Visual Programming: Load Canvas (Local)**.

Toolbar Save always targets its own originating tab; command-palette Save targets the most-recently-active surviving canvas. With none, show **No canvas to save** and do not create one. Load always creates a new tab after validation/resolution; it never replaces or merges into the current canvas. Keep view type `codeVisualizer`; loaded panel title is `Code Diagram — <canvas basename>`, with the tab's session ID available in picker details for duplicates. `WebviewCreator.createWebview` takes an explicit title supplied by the manager for both `New-x` and imported canvases.

Add `VisualizingTab.exportCanvasState():Promise<{canvas:CanvasFileV1; pendingNavigation:boolean}>` and `restoreCanvas(state:ResolvedCanvas):Promise<void>`, and manager `saveCanvas(tab?)` / `loadCanvas(originatingTab?:VisualizingTab)`. Each tab owns its panel, initialization queue, request callbacks, and disposal promises. Add a webview-ready handshake in `main.js` after controller/listeners are initialized, then queue host messages until that panel is ready; this is required for reliable initial restore. Never broadcast to all tabs.

New messages (continue existing requestId outbound / requestedId reply convention):

|Direction|Type|Fields|
|---|---|---|
|Web → Host|`canvas_ready`|no data|
|Web → Host|`canvas_save` / `canvas_load`|requestId; no graph data|
|Host → Web|`canvas_export_request`|requestId|
|Web → Host|`canvas_export_response`|requestId; data:CanvasFileV1 and pendingNavigation:boolean, or error:string|
|Host → Web|`canvas_restore`|requestId; data:ResolvedCanvas|
|Web → Host|`canvas_restore_result`|requestId; error:string|null|
|Host → Web|`canvas_operation_result`|requestedId; data:{status:'saved'|'loaded'|'cancelled'|'error', message:string}|

Keep these operation tickets separate from outline navigation tickets so a save reply cannot create a window. Reject pending operation promises on panel disposal; ignore unknown/settled IDs and replies from a different panel. Disable duplicate Save/Load activation in the originating control while its operation is pending, without freezing exploration. Dialog cancellation settles silently with no panel/file/state change. A toolbar Load carries its originating tab's lifetime: if it closes during dialog/read/resolution, abandon the operation before creating a new panel. A palette Load is manager-owned and does not depend on a canvas remaining open. Recheck lifetime after each await; do not claim cancellation can undo an fs.writeFile already issued.

Save flow: request a synchronous registry snapshot after finishing entrance/reveal presentation at its current displayed state, validate it on the host, show `showSaveDialog`, then `workspace.fs.writeFile`. Saving while navigation is pending captures only nodes/edges already present; show **Saved current canvas; pending navigation was not included** when applicable. Write failures show **Cannot save canvas: <reason>** and leave the canvas untouched. Never refresh source or save source documents implicitly. Report that local edits to displayed text are not stored.

Load flow: `showOpenDialog({canSelectMany:false, filters:{'Canvas JSON':['json']}})` → `workspace.fs.readFile` → parse/validate → resolve source nodes and anchor validity in memory → create a separate VisualizingTab → wait for canvas_ready → restore once → await acknowledgement. Cancel before panel creation produces no panel. Unexpected reconstruction failure disposes only the new panel and reports the failure; the original canvas remains unchanged. Keep source/provider failures as explicit per-node unavailable cards rather than aborting an otherwise valid graph. No automatic workspace/session restoration or VS Code webview serializer is added.

`ResolvedCanvas` is an in-memory bridge payload `{canvas:CanvasFileV1, nodes:Array<{id, outline?:Outline.File|Outline.Symbol, unavailable?:string}>, edges:Array<{id, anchorStatus:'exact'|'changed'|'missing'}>}`. Diagnostic nodes need no outline. It is never written as the saved file because it contains current source outlines.

### 9. Reconstruct the saved graph with honest anchors

In the new tab, construct all node frames first, apply comment state and saved dimensions/position/collapse without `WindowPositioner.placeWindow`, entrance animations, auto-fit, auto-reveal, or focus-driven camera movement. Register saved IDs/roots. Render unavailable sources as an explicit source-reference card showing **Source unavailable**, the saved URI and symbol identity, and the concrete reason; provide no fake code or definition navigation. Keep its frame, edges, and close/resize/group behavior. It is excluded from the callable list unless a real outline is present.

Then restore edges, then viewport, then publish one graph/UI refresh and acknowledge success. Clear initial selection/focus; those are not part of the format. A valid empty canvas opens a valid empty new tab at its saved view.

Anchor binding:

- Add `SourceNavigation.describe(anchor)` and `SourceNavigation.restore(ownerWindow, savedOrigin)` to expose/copy immutable source metadata and find a fresh registered surface by kind+range, without serializing DOM nodes. A source origin is exact only when the loaded source document hash equals the origin hash, exactly one corresponding surface exists, and range/UTF-16 offsets pass the existing consistency checks.
- Record declaration-button origins in `BtnOpenDefinition` using its source model display range and the owning frame's source hash. Restore to the corresponding current button only when hash/range agree; preserve its Connectable state so row-toggle behavior still works. Frame origins attach to the owning frame.
- Changed document, missing source, ambiguous/missing surface, or inconsistent ranges keeps the graph edge but uses a visible heading/frame fallback with tooltip **Saved source location changed** or **Source unavailable**. Store the original origin/hash on that edge for re-save; do not relabel old offsets as current or choose a nearby token. A changed-file symbol may restore successfully while its old edge origins correctly use fallback.
- Keep Group B's dynamic hidden/clipped/compact fallback for exact rebound anchors. Comments, re-highlighting, collapse, movement, resize, and scrolling must not change source identity.

Restore connector docking without the existing 500ms docking animation. Extend `vgf_make_dockable_leftSide`'s `vp_dock(target, options={})` with `{animate?:boolean, y?:number}` and forward options through `VpwEntityConnection.vp_dock`; existing interactive callers retain defaults. A docked connector uses saved y clamped to current target bounds, including y=0. For a free connector call `connection.vp_dock(world,{animate:false})`, then `connection.vp_setXY(saved.x,saved.y)` in world coordinates. Graph target identity must match actual docking after every restore and native re-dock. Use graph-level deduplication on later navigation so an exact repeated origin/target reuses the restored edge.

## Critical files and anchors

These anchors identify non-obvious existing constraints; line numbers are hints, and source must be re-read before editing.

|File|Anchor|Why it matters|
|---|---|---|
|`src/web_visualizer/src/utils/source_navigation.js`|`_ensureIndex`, `_anchorMatches`, `_fallback`|Hidden DOM text remains part of source offsets; deleting it breaks navigation|
|`src/web_visualizer/src/vgf/vgf_widget.js`|`vp_delete`, `_vp_delete_triggerEvents`, delayed removal|Deletion notifications precede DOM removal; registry/tickets must change synchronously|
|`src/web_visualizer/src/vgf/vgf_window_tiled.js`|`_expandedHeight`, `_createResizeHandle`, `_create_title_area`|Collapse state is private; source/header/resize gesture boundaries must remain distinct|
|`src/vscodeextension/src/outlineproviderAPI/utils/outlineutils.ts`|`symbolParents`, `_getFlatDocumentSymbols`, `documentSymbol2outlineSymbol`|Persistent identity must be captured before provider ancestry is lost|
|`src/vscodeextension/src/visualprogramming/visualizer.ts`|`_postOutlineMessage`, `getWebviewPanel`, `_translate_outlineRanges2outlineEntities`|Null-ID requests currently lazily create panels; multi-tab and restore sends must retain owning-panel identity|

## Verification

No builds/UI changes were run during planning. Source inspection, a read-only installed-Lezer AST probe, and a separate check of the proposed close-set algorithm against its seven table cases informed the design. That algorithm check is not a test of production code. Implementation must supply observed runtime evidence, not claim the implementation checks below have already passed.

### Build and host regression execution

From repository root after integration:

```sh
npm run build:ext
```

Inspect every jsstitcher/CSS/license/media-copy/TypeScript stage because the web build uses semicolons that can mask an earlier failure. Do not edit generated output.

Keep permanent behavior regressions in the existing Mocha suite:

- New `src/vscodeextension/src/test/suite/canvas_format.test.ts`: tagged schema/versions, malformed numbers/ranges, duplicate/missing endpoints, unsafe URIs, valid cycles/multi-edges, diagnostics and unavailable-reference round trips.
- New `src/vscodeextension/src/test/suite/outlineprovider_test/canvas_restore.test.ts`: unchanged/changed source, exact ancestry, duplicate names/overloads, deleted symbol versus new symbol at old coordinates, omitted Python assignment, language/provider/extraction failures, and collision of restored identities. Reuse the isolated custom-scheme provider/MemoryFile pattern from `definition_navigation.test.ts` for resolver unit behavior; public file-format URI restrictions remain tested separately. Verify the definition provider is never called during restoration.
- New `src/vscodeextension/src/test/suite/outlineprovider_test/comment_visibility.test.ts`: exact comment/docstring spans and preserved executable strings/code. Include Python nested scopes, raw/concatenated/parenthesized docstrings, bytes/f-strings, semicolon statement groups, comment-looking assigned strings, inline comments, CRLF, Unicode; JS/TS regex/template/JSX literal text versus real comments and JSDoc.
- A new `src/web_visualizer/tests/canvas_graph_interaction.html` browser fixture loads the real bundle and uses deterministic assertions for the close-set table, connected components, rectangle enclosure (not intersection), group offsets, free/re-docked edges, comment-coordinate preservation, and serialization/restore identity. Follow existing standalone fixture imports; no new test framework. The graph cases can call the real CanvasGraph API with simple node handles; UI cases use actual windows, not a second implementation of the algorithm.

Run the full existing compiled extension suite in installed VS Code, as the completed Group B record did. The standard `npm run test:ext` launcher targets old VS Code 1.61.1, so use the installed host for the final integration gate:

```sh
RUN_DIR=$(mktemp -d /tmp/scv-groups-c-d.XXXXXX)
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

Planning confirmed installed Code, Python 2026.10.0, Pylance 2026.4.1, and the external Airflow `.venv/bin/python` paths exist. If the installed host cannot launch, use F5 with the existing Run Extension configuration and run the compiled suite there; do not substitute plain Node execution for vscode-dependent tests or downgrade Python tooling to satisfy the old launcher.

### Actual browser surface

Run `npm run serve:web` from root after building. Open `http://localhost:8080/tests/canvas_graph_interaction.html` and the existing Python dark/light and TypeScript fixtures in a real browser. Use actual mouse/keyboard/wheel gestures and screenshots; close owned browser tabs afterward.

|Requirement|Concrete scenario → expected observation|
|---|---|
|R01|Move/resize/collapse nodes, pan, zoom to 0.2 and 3, resize viewport → overview and viewport rectangle track geometry. Click/drag minimap → camera, selection, node positions unchanged.|
|R02|Open two functions, a class, a bodyless method, and a syntax-proven JS callable assignment → only existing callable frames listed. Pick off-screen entry → same node ID/count/size, header revealed. Close it → entry removed.|
|R12|Spread frames at negative/positive coordinates and pan away → Fit all shows their union with padding when feasible; empty canvas no-op; huge graph remains at 0.2 with explicit limit notice.|
|R05|A opens B/C, B opens D; separate X/Y → double-click B chrome selects A/B/C/D only. Rectangle encloses B/D but merely intersects C → B/D only. Drag at scales 0.2/1/3 → exact common world delta and connected endpoints; X/Y stationary.|
|Gestures|Token double-click/F12, decorator action, source selection, comments button, close/collapse, resize, declaration row, connector drag, clicked-body wheel lock, touchpad pan, Space/middle pan → only intended action fires. Blur/pointercancel leaves no stuck drag.|
|R06|Exercise every close-set table row, duplicate edges, independent-root promotion, and close-before-delayed-reply → correct survivors, no dangling edges, no late-created descendant, list/minimap agree.|
|R08|Same source opened as file/function → file comments visible, function comments/docstring hidden. Toggle either → other unchanged, assigned/triple-quoted data and executable same-line statements intact. Hidden rows retain source index and original number gaps.|
|R08/R16|Open a target from a token after multiline comments/docstrings; hide/show, resize, collapse, scroll, re-highlight → same original URI/range and edge identity; hidden origin uses declared fallback and restores exactly. Local visible edit → no stale navigation or stale classification.|
|R09 renderer|Round trip moved/resized/collapsed nodes, mixed comment states, shared/cyclic graph, two different token origins, redocked/free connector, diagnostic, and camera → same IDs/topology/positions/view and correct edge/source bindings.|

### Actual VS Code/Pylance end-to-end

Launch an isolated development host using the installed binary, `--extensionDevelopmentPath="$PWD/src/vscodeextension"`, a separate `$RUN_DIR/live-profile`, installed extensions directory, and `--remote-debugging-port=9333` if browser tooling needs to inspect the real webview. Use a temporary workspace containing the real Airflow project root and set its existing Python interpreter to `../../MAFC/Workspace/airflow-data/.venv/bin/python` resolved from the repository. Never execute or modify the Airflow file.

1. In the actual diagram open `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py` → `_build_dag` → nested `ingestion_dag`. Inspect headings, compact decorator/full metadata, body text, and Show in code at all levels. Open `SQL_TASK_TIMEOUT` and `CONFIG_DIR` to verify values are not mistaken for comments/docstrings. Exercise comments, function list, minimap, fit, group movement, and source navigation on these real nodes.
2. Save that populated graph using the real toolbar/native dialog. Inspect JSON: references/relationships/frame/view settings present; no source bodies, parts, HTML, or local displayed-text edits. Load it using the real native dialog: a second Code Diagram tab appears; current workspace source is displayed, original tab's graph/camera and outstanding request ownership are unchanged. Save each tab, close one, and verify Save/Visualize File fallback and disposal.
3. Use temporary source-only Python fixtures, not the external file, for changed/deleted-source cases: save function `Outer.run`, prepend lines/change its body, load → unique same ancestry shows current body at saved node position, old source-token edge uses explicit changed-location fallback. Remove `Outer.run` and place a different callable at the old line → unavailable source node, never the replacement declaration. Delete one file → visible unavailable card with retained edges. Restore the file and reload a re-saved unresolved canvas → source resolves again.
4. Cancel save/load, feed invalid JSON/unsupported version/unsafe URI/invalid graph, and cause file-write/provider errors → explicit settled outcomes; malformed input creates no tab, old canvases remain unchanged. Close an initiating panel while an operation or source request is pending → no resurrection and no update to another tab.
5. Save/load the restored shared/cyclic graph and repeat R06 closure → root flags and surviving-parent protection remain correct. Test an empty saved canvas and a saved missing-source graph as real tabs, not only parser cases.
6. Exercise both Visualize This command entries with no canvases → picker offers New canvas; cancel → no panel/provider lookup; choose New → `New-1`. Repeat New → `New-2`. Import a saved canvas → picker lists `New-1`, `New-2`, and the imported canvas; selecting each adds/reuses only in that chosen graph, never the most recently focused alternative. Multiple editor selections use one picker and one destination. Duplicate-import details identify each actual tab. Switch tabs while lookup runs → result stays in the chosen one; close the chosen tab during picker/lookup → explicit stale-choice handling or discarded reply, no replacement canvas. Close `New-1`, choose New again → `New-3`, not reused `New-1`.

A passing build or standalone browser fixture alone does not satisfy host/provider integration. Record actual commands, UI observations, and any unavailable environment prerequisite honestly; do not mark the seven items complete without these outcomes.

## Assumptions and contingencies

- User choices are fixed for this plan: Python docstrings hide with comments; every Load opens a separate tab; Visualize This explicitly chooses New canvas or any live imported/`New-x` canvas.
- JSON is for the same workspace/source URIs, including explicitly saved remote authorities; it is not a portable project bundle. Moving/renaming a workspace/file produces an honest unavailable reference, not a filename-search remap.
- Missing or changed source is an expected restored-node state, not permission to show stale code. Without unique semantic identity, preserve the reference/graph and display why it could not be resolved.
- Ordinary diagnostics are retained as historical diagnostics. Selection, text-edit scratch changes, code scroll offsets, and automatic session restore are deliberately not part of the saved state; the persisted source remains workspace-owned.
- On a viewport too small to honor both padding and the minimum zoom, preserve safe zoom and report the limit. Changed source/chrome may require a larger minimum frame; preserve positions and clamp only that minimum.
- Existing generic-language adapters retain their current highlight-based comment support; syntax-proven docstring handling is Python-specific. No AI comment importance, runtime receiver inference, source execution, new language support, or Marketplace publication is introduced.
