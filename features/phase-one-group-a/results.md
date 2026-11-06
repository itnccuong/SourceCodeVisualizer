# Phase 1 Group A — Completed Results

## Goal and acceptance

Complete **R04, R19, R10, R11, R13, R15, R18** under the [approved plan](plan.md). Preserve complete source and navigation; keep declaration-only methods bodyless; provide bounded zoom, intrinsic initial sizing, frame-owned resizing, and measured non-overlapping placement.

Implementation and validation finished before this record was written. `specs/` was not changed. The external Airflow file was opened as source only; it was not executed, imported, saved, or modified.

## Plan as executed

1. Persisted the approved plan before implementation.
2. Captured the installed JavaScript provider tree and existing extraction boundaries without rerunning the reported failed visualization. Captured the existing browser layout.
3. Implemented JavaScript callable parsing through the existing TypeScript compiler/cache. Added optional declaration classification and display-child projection. Preflight raw children, extract each included child once, then partition/validate effective ranges. Provider objects remain unchanged.
4. Verified extraction before layout changes: the full installed-host suite passed 136 tests, and the actual unchanged JavaScript file produced the correct factory and constructor headings/bodies.
5. Implemented bounded, cursor-anchored zoom; verified real native Ctrl/Alt wheel input before sizing work.
6. Replaced title/content tables with flex layout. Added intrinsic attached sizing, one body viewport, independent title scrolling, and a frame-owned resize grip. Verified native resize, scrolling, collapse/expand, cancellation, deletion during capture, and bodyless rendering.
7. Replaced fixed placement with measured collision avoidance and minimal viewport reveal. Existing windows retain their sizes/positions. Deleted requestees cannot receive response connections.
8. Built extension/media assets. Exercised both Chromium themes and the real VS Code development host. Fixed two acceptance failures discovered by those checks, described below.
9. Ran the final full installed-host suite and actual-source smoke, updated architecture/changelog, preserved evidence, removed owned throwaway verification scripts, and stopped temporary web/Chromium/development-host services. Browser workers closed their own tabs.

### Acceptance-driven corrections

- **Frame display specificity:** `.VgfWindow` initially overrode the new frame flex rule. `.VgfWindow.Window_OuterFrame` now owns display. The long body shrinks into its 400px viewport instead of overflowing the chosen frame.
- **Placement animation:** removed the entrance scale/translation, retaining opacity fade. Transient transformed bounds cannot distort measured placement/reveal.
- **Source-selection end:** native double-click after scrolling originally emitted `97:1 → 216:27` for a 122-line fixture. `VpwCodeEditor.vp_getOriginalCursorEnd()` used the block end as origin. Both endpoints now use the block start. Source spans/text and `SelectionUtils` are unchanged. Both themes confirmed `97:1 → 97:27` after rebuilding/reloading.
- **Actual JavaScript drill-down:** a heading beginning `self.constructor` initially resolved the receiver local. Assignment declarations now carry a syntax-backed callable `definitionPosition`; declaration rows use that position while **Show in code** still uses the heading start. Lookup checks exact declaration/syntax identity before reference resolution. The live webview sends structural positions, so definition requests normalize them into VS Code `Position` instances. Added consumer-visible regressions for RHS-only/complete assignments, enclosing wrapper precedence, and serialized positions. Final live file → factory → constructor navigation passed.

## Delivered behavior and files

| Area | Behavior | Key source files |
|---|---|---|
| R19 | Callable JavaScript assignments/initializers, certified wrapper projection, assignment headings, complete bodies, safe drill-down | `src/vscodeextension/src/outlineproviders/{lspextendertypescript,providerregistrer}.ts`; `outlineproviderAPI/{lspextenderprovider,SymbolDefinition}.ts`; `outlineproviderAPI/utils/outlineutils.ts`; `src/web_visualizer/src/vp/outline_object_functions.js` |
| R11 | Ctrl-only/Alt-only wheel; scale 0.2–3; exact cursor anchoring; no translation at limits | `src/web_visualizer/src/vgf/vgf_navigationarea.js` |
| R15/R18 | Full rendered line width; initial body ≤400px; independent grip; scroll isolation; collapse size restoration; errors/files/signatures share sizing | `vgf/vgf_expandable_with_title.{js,css}`, `vgf/vgf_window_tiled.{js,css}`, `vgf/std.css`, `vpw/vpw_code_editor.{js,css}`, `vpw/vpw_outline_window.js`, `vpw/vpw_world.js` under `src/web_visualizer/src/` |
| R13 | Measured RIGHT/LEFT placement, 24px clearance, batch advancement, minimal reveal, foreground messages, no detached-anchor connection | `src/web_visualizer/src/vp/{window_positioner,controller}.js`; `vpw/vpw_view_entity_window.css` |
| Regression coverage | JavaScript extraction, source reconstruction, immutability, errors, declaration navigation | `src/vscodeextension/src/test/suite/outlineprovider_test/javascript_function_expression_boundaries.test.ts` |

Generated JS/CSS and extension media were regenerated through package scripts, not edited directly. Final release/media JS hashes matched, as did CSS hashes.

## Automated verification

| Check | Observed outcome |
|---|---|
| `npm run build:ext` from root | Passed: inspected stitcher JS, CSS concatenation, license/version stages, dependency copy, and TypeScript compilation |
| `npm run build:web && npm run get_dependencies --prefix src/vscodeextension` after browser fixes | Passed; refreshed release and media assets |
| `./node_modules/.bin/tsc -p ./` in `src/vscodeextension` after final navigation fixes | Passed |
| `./node_modules/.bin/eslint src --ext ts` in `src/vscodeextension` | Passed |
| Full installed VS Code suite, final source | **140 passing**, runner exit 0 |
| Actual final `vgf_window_tiled.js` extraction and declaration lookup smoke | Passed after the full suite; exact factory/constructor headings and full constructor source |

Final log: [extension-suite.log](extension-suite.log).

Final installed-host command from repository root used a temporary runner that called the unchanged full-suite entry point, then the actual-file smoke:

```sh
SCV_ROOT="$PWD" VSCODE_CLI=1 \
  '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir=/tmp/scv-group-a-tests \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath=/tmp/scv-group-a-final.cjs \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/vscodeextension/src/test/testfiles"
```

The temporary runner and smoke scripts were removed afterward. Python/Pylance activated in this host; no legacy VS Code downloader was used.

### Failed checks and recovery

- Initial new JavaScript tests exposed anonymous-function expression wrapping and non-declaration classification failures. Fixed before the 136-pass extraction gate.
- Root-scoped ESLint invocation could not resolve `@typescript-eslint/eslint-plugin`. Running the existing binary from the extension package directory passed; no dependency changes were needed.
- An initial actual-source smoke selected a comment Text part containing the factory name. Corrected the throwaway harness to select Symbol parts; this was not a product extraction failure.
- Browser source-selection and live declaration-navigation failures were retained as failing-before evidence and fixed, not suppressed. The serialized-position navigation regression failed before normalization and passed afterward.
- Orca browser keydown state did not persist into a separate wheel command. Reported the tool inconsistency and used headed Chromium with native Playwright/CDP input instead. No synthetic wheel result was substituted for native zoom proof.
- After a live-host reload, an early Python file request arrived before Pylance supplied symbols and displayed ordinary file text. Reopened after provider initialization; the complete file → builder → nested DAG path then passed. No provider-availability retry mechanism was added to production.

## Chromium proof — both themes

Started `npm run serve:web` on 8080. Used real headed Chromium, native mouse drags, keyboard modifiers, wheels, context menus, and CDP pointer cancellation on:

- `tests/typescript_basic_show_class_dark_theme.html`
- `tests/typescript_basic_show_class_light_theme.html`
- `tests/basic_case_show_messageboxes_dark_theme.html`
- `tests/basic_case_show_messageboxes_light_theme.html`

PNG/JSON runtime artifacts were removed at the user's request. The observed results are retained below.

| Scenario | Observed result |
|---|---|
| Zoom bounds, offset viewport, reverse direction | Scale stayed 0.2–3. Additional bound input preserved translation. Maximum theme-matrix cursor drift: dark 0.0261px, light 0.022px. |
| Native 60px grip drag at 0.2/1/3 | Dimensions changed by 300/60/20 world px. Left/top unchanged. Native title drag directions and pointer context menus remained correct. |
| Source-backed 120-line fixture with tabs, nested dictionaries, long arguments, 2000-character string, sentinel | Initial dark width 12,740px, light 12,738px. Body viewport 400px. No width cap or source wrapping. Native scrolling reached both ends and `END_OF_SOURCE`; all source rows preserved. |
| Manual sizing/auto-fit | Narrowing enabled both axes. Ordinary/Shift-wheel did not pan the world; Ctrl/Alt bubbled to zoom. Grip double-click restored intrinsic width and initial-height policy. Manual body height exceeded 400px. Source double-click retained manual size. |
| read/run/empty/file/error | One accessible grip each. Read stayed bodyless, no editor/status; run retained `return "implemented";`; empty gained no synthetic source. Minimum width 120px retained controls. |
| Collapse/capture cleanup | Expanded height/manual width restored. Collapsed fit restored expanded fit height later. Pointercancel, lost capture, and deletion during capture stopped resizing. |
| Dockers/connections | Exterior dockers remained visible. Settled light-theme endpoint checks had zero geometry error after source scroll, resize, collapse/expand. Dark screenshots show connected canvas edges through those transitions. |
| Crowded placement and late responses | No new-node clearance overlaps at 0.2/3 after 400px panning; measured LEFT width, batches, and errors passed. Existing frame geometry unchanged; reused node size/position unchanged. Detached requestee produced no connection. Oversized last node revealed its beginning without shrinking. |
| Scrolled source navigation | Native selected `knownIdentifierAfterScroll`; final request exactly `97:1 → 97:27` in both themes. |


## Actual VS Code/provider proof

Used the installed development host with `--remote-debugging-port=9333`, local command IDs, and actual workbench/webview CDP inspection. The host opened the external Airflow DAG workspace. Used UI command-palette actions, actual declaration rows, native resize/wheel, and **Show in code** menus; no Airflow execution.

### R04 — real Python

Opened file → `_build_dag` → nested `ingestion_dag`. Inspected all headings and source. Nested metadata displayed compact `@dag(…` while its hover retained the complete decorator. Initial operator arguments fit the rendered width; after narrowing/scrolling, complete arguments through `execution_timeout=SQL_TASK_TIMEOUT` remained available.

Opened all eight values: `CONFIG_DIR`, `TRINO_CONN_ID`, `DAG_TIMEZONE`, `IDENTIFIER_KEYS`, `REQUIRED_KEYS`, `OPTIONAL_KEYS`, `ALLOWED_KEYS`, `SQL_TASK_TIMEOUT`. Each had its complete value without neighboring declarations. **Show in code** selected zero-based `(195,8)` for `ingestion_dag` and `(27,0)` for `REQUIRED_KEYS`.

Opened the repository's Python fixture: limit/config/build/later excluded adjacent `AFTER` statements. `empty(self)` preserved `pass`, `placeholder()` preserved `...`, and `doc_only()` preserved its docstring.


### R10 — real TypeScript

Opened `Reader.read` and `Base.run`: signature-only, no editor, independently resizable. `Worker.read` retained `console.log("implemented");`; `Worker.empty` remained empty and resizable. Limit/config excluded adjacent `AFTER` statements. Resized real signature/empty windows and used **Show in code** on `Worker.empty`: zero-based `(26,2)`.


### R19 — real JavaScript

Opened the final repository file → `VgfWindowTitled` → `self.constructor` through actual declaration rows. The redundant anonymous wrapper is not another displayed node. Factory source gaps and direct callable rows remain; constructor includes its nested block, expandable construction, listeners, and final `return self;`. Scrolling reached the complete constructor end. Connections remained visible.

Final **Show in code** selected zero-based `(8,6)` for factory and `(24,2)` for constructor, matching current source after sizing edits. The constructor's effective totalRange is `(24,2) → (73,3)` rather than its RHS-only provider start.


## Decisions and limits

- Group A originally shipped uncapped full-line initial width, including lines wider than the viewport. The user subsequently requested a 1200px creation/auto-fit cap; that later behavior and its validation are recorded in [the interaction follow-up](../canvas-interaction-followup/results.md). Earlier measurements above remain historical.
- 400px limits only initial/explicit-fit body height. Manual resizing is not capped. Zoom bounds, 24px placement clearance, and 20px reveal inset remain implementation constants, not new settings.
- LEFT/downward placement changes only new nodes. It can produce a tall column; no graph rearrangement or edge routing redesign was added.
- No Python extraction semantics, source-string rewriting, second JavaScript parser, React support, or class-expression promotion was introduced. Invalid overlap/crossing safety errors remain.
- Browser fixtures prove browser geometry; live-provider checks separately prove actual extraction/navigation. Screenshots show selected viewport states, while JSON records complete extracted source and geometry.
- Existing third-party extension warnings/Crashpad diagnostics appeared during some hosts. Final suite and smoke exited 0; those warnings were not hidden or presented as product failures.

## Follow-up — Install into regular VS Code

On explicit request, rebuilt, packaged, and installed the completed extension outside the development host:

```sh
npm --prefix src/vscodeextension run publish
'/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' \
  --install-extension "$PWD/src/vscodeextension/release/code-visualizer-local.vsix" --force
'/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' \
  --list-extensions --show-versions
```

- Packaging passed: `code-visualizer-local.vsix`, 234 files, 9.39MB. Inspected JS/CSS stages and TypeScript compilation.
- CLI reported successful installation and listed `visualprogrammingx.sourcecodevisualizer-local@0.1.9`.
- `cmp` confirmed installed JS/CSS media, parser adapter, and shared outline extraction output exactly match the rebuilt package inputs.
- Existing normal VS Code windows were not forcibly reloaded. Run **Developer: Reload Window** and reopen diagrams to replace any already-loaded extension/webview code.
