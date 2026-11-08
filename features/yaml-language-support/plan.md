# Phase 1.5 — YAML language support

## Context
Add plain YAML manifest exploration to the existing VS Code canvas. The user selected same-document YAML aliases, container windows with scalar settings retained as source, and plain `.yaml`/`.yml` inputs including multi-document files. Retain existing canvas navigation and interactions; do not infer cross-file/domain relationships or render Helm/Jinja templates.

## Approach

### 1. Add a source-preserving YAML provider

After approval, persist this complete plan to `features/yaml-language-support/plan.md` before implementation. Leave `specs/` unchanged.

Add production dependency `"yaml": "1.10.3"` to `src/vscodeextension/package.json` and update its lockfile with `npm install --save-exact yaml@1.10.3 --ignore-scripts` from that package directory. Retain the existing compiler and VS Code engine range. This parser exposes AST plus CST source locations. Do not depend on the installed dev-transitive `js-yaml` value loader/listener or require a Red Hat YAML extension.

Create `src/vscodeextension/src/outlineproviders/outlineprovideryaml.ts`, exporting `class VpOutlineProviderYaml implements VpOutlineProvider`. No equivalent source-backed YAML provider exists. Implement the existing interface without changing it:

```ts
provideDocumentOutline(document: vscode.TextDocument): Promise<Outline.File>
provideDefinitionOutline(
  document: vscode.TextDocument,
  position: vscode.Position,
  chooseTarget?: DefinitionTargetChooser
): Promise<DefinitionOutlineResult>
provideLocationDefiner(
  document: vscode.TextDocument,
  position: vscode.Position
): Promise<Outline.OutlineRange[]>
provideSavedOutline(
  document: vscode.TextDocument,
  reference: SourceReference
): Promise<Outline.File | Outline.Symbol>
provideRangeOutline(
  document: vscode.TextDocument,
  range: vscode.Range | null
): Promise<Array<Outline.OutlineRange | Outline.Text>>
```

Keep YAML parsing/indexing/projection/restoration helpers private in this file. Cache one syntax/index snapshot per `TextDocument` in a `WeakMap`, keyed by document version and language ID. Build fresh outline objects because `translateOutlineRanges` mutates them. No workspace index or background parser.

Parse the complete stream once:

```ts
const cst = YAML.parseCST(document.getText());
cst.setOrigRanges();
const documents = cst.map(node =>
  new YAML.Document({
    keepCstNodes: true,
    keepNodeTypes: true,
    version: '1.2',
    merge: false
  }).parse(node)
);
```

Use public exports from `yaml` and `yaml/types`, not hashed `dist/` files. Traverse AST mapping pairs and sequence items, never `Alias.source`. Record CST-backed spans, ordinary parent/child relationships, keys, anchor tokens, alias tokens, and alias target node identities. Identify `YAMLMap`, `YAMLSeq`, `Scalar`, and `Alias`, not deserialized JS values. Never call `toJSON`, stringify, or expand aliases.

Support block/flow mappings and sequences; scalar/null/empty values; quoted and multiline scalar keys; literal/folded/multiline scalar values; comments; empty containers/files/documents; `---`/`...` streams; anchors and aliases. Honor parser-supported `%YAML 1.1`/`1.2` directives while displaying original lexemes. Treat `<<` as ordinary source with navigable aliases, not expanded inherited keys.

Reject the entire stream before projection if any document has parser errors or warnings. Report the first source-ordered problem as:

- `YAML parse error at line <L>, column <C>: <parser message>` for errors.
- `Unsupported YAML at line <L>, column <C>: <parser message>` for warnings.

Use one-based original-source positions from the diagnostic CST source, or document start when the parser provides no narrower source. This rejects malformed YAML, duplicate keys, undefined/forward/cross-document aliases, and unresolved custom tags instead of displaying a recovered tree. Reject non-scalar mapping keys, including alias keys, with `Unsupported YAML at line <L>, column <C>: mapping keys must be scalars.` Null/empty keys remain supported. Template-shaped text receives normal YAML validation; never evaluate it or guess rendered output.

### 2. Project containers into existing canvas nodes

Reuse `Outline.File`, `Outline.Symbol`, `Outline.Text`, `Outline.CommentRange`, and source translation. Do not change the outline schema, shared `OutlineUtils`, Python/TypeScript adapters, webview protocol, or canvas rendering.

**File view:** one `Outline.File` per URI, `language = 'yaml'`, `displayTextRange = new vscode.Range(0, 0, 0, 0)`, no `totalRange`. Project each document's root mapping entries or root sequence items directly into the file's parts in source order. No synthetic document-wrapper windows. Preserve separators, directives, root scalar values, comments, and every gap through EOF as `Text`. A comment-only file stays readable; an empty file is a valid empty file window.

|YAML syntax|Parent view|Opened window|
|---|---|---|
|Mapping entry with map/sequence value|Clickable row|Original key/colon heading; child containers as rows and scalar settings as source|
|Sequence item with map/sequence value|Clickable row|Source-backed first-line preview; metadata identifies its zero-based index|
|Scalar/null/alias field or sequence item|Original YAML text|No ordinary declaration row|
|Empty `{}` / `[]` container value|Clickable row|Literal delimiters retained in the body; no placeholder|

Display kinds: `"YAML mapping"`, `"YAML sequence"`, `"YAML mapping item [<index>]"`, and `"YAML sequence item [<index>]"`. Persistence uses `vscode.SymbolKind.Object` / `vscode.SymbolKind.Array`.

**Range construction:**

1. Convert CST ranges using `origStart ?? start` and `origEnd ?? end`, then `document.positionAt(offset)`. Flow punctuation uses `origOffset ?? offset`. AST `.range` stays LF-normalized and must not become a VS Code range. Do not normalize, dedent, or regenerate displayed YAML.
2. Pairs have no CST node. Derive their boundaries from key/value CST plus enclosing map separator tokens. Empty keys use the key/value separator; explicit scalar keys retain their `?` marker. Do not infer structural colons/dashes with indentation regexes.
3. A mapping container's total range starts at its key/explicit-key marker and ends at the value CST end. Heading: key through separating colon, plus any same-prefix anchor/tag tokens before collection content; exclude trailing whitespace/comments. Body: heading end through declaration end, retaining whitespace, property lines, comments, and flow delimiters.
4. A block collection item starts at its CST `SEQ_ITEM` dash; a flow collection item starts at its node. Its total range ends at that item's CST end, excluding the parent's comma/closing delimiter. Heading: first physical source line, capped at item end, excluding trailing whitespace/comment. Body: the complete collection value, excluding only the outer dash/spacing. The preview deliberately also appears in the body so `- name: build` does not lose its first scalar setting.
5. Set `definitionPosition` to the mapping key/explicit-key marker, block-item dash, or flow-item start. Declaration buttons must open the represented container even when its preview includes a nested key/alias.
6. Partition each body/file interval around direct displayed children. Emit exact `Text` gaps before/between/after children, retaining punctuation, comments, whitespace, and EOF. Children must be ordered, contained, and non-overlapping. Missing/out-of-bounds/crossing spans throw `YAML source mapping failed: <reason>`; do not clamp or invent ranges.
7. Distinct displayed symbols must have distinct total-range starts: canvas equality uses URI plus that start. A sequence item owns its dash, not its first child's key.

Extract comments from CST `COMMENT` nodes and property ranges whose actual source begins with `#`. Traverse CST children once, without following context parent/root links; deduplicate ranges. Attach intersecting `commentRanges` to every `Text`, including `[]` when none exist, and to containing outlines. This prevents highlighter guesses from hiding `#` inside block/quoted values. Reuse current comment-toggle/blank-row behavior and source bindings; YAML highlighting is already bundled.

### 3. Navigate containers and aliases

Use the cached syntax/index and end-exclusive containment. Reject out-of-document positions instead of relying on `offsetAt` clamping.

`provideDefinitionOutline` precedence:

1. At an indexed declaration's exact `definitionPosition`, open that container. This preserves row/button navigation.
2. On an alias token, including `*` or its name, follow its AST `Alias.source` within that YAML document.
3. On an anchor token, open its declaration target.
4. Otherwise open the narrowest ordinary displayed container containing the position, or the file if none. Ordinary strings, paths, resource names, and comments never become inferred links.

Use parser target identity, not the final name-to-anchor map. Reused anchor names bind aliases to the preceding declaration at that location. Keep aliases as source, never recursively expand them. Self-references open/reuse one target window without recursive outline construction.

**Alias targets:**

- If the anchored value has a container symbol, reuse it.
- An anchored scalar gets a source-backed symbol only on explicit anchor/alias navigation, never an ordinary parent row. Kind `"YAML scalar anchor"`; heading exactly `&<name>`; body from heading end through the anchored scalar's CST end, retaining remaining source/properties/comments; total range covers anchor and value. Set `definitionPosition` to the anchor token. For a scalar key anchor whose start collides with an existing container declaration, reuse that declaration, whose heading contains the anchored key, rather than create a second identity.
- An anchored document-root collection gets an analogous on-demand mapping/sequence symbol headed by `&<name>`; its body projects that root's entries/items. Root scalar anchors use the scalar rule.
- Anchored empty/null values have an empty body; never invent `null` text.

`provideLocationDefiner` identifies the current symbol at its heading start without following aliases, then returns its ordinary displayed parent or the file. Scalar-anchor targets return their nearest displayed containing container; root-anchor targets return the file. Prefer exact heading-start identity over nested containment for item previews. For a file request at `(0,0)`, returning the file is idempotent; top-level symbols also have the file as parent.

`provideRangeOutline(document, null)` returns `[await provideDocumentOutline(document)]`. Non-null ranges reject with `Range visualization is not yet implemented`; do not activate the unreleased range command.

After the provider and restoration below are complete, import it in `outlineproviders/providerregistrer.ts` and add `registerProvider(vscode, "yaml", new VpOutlineProviderYaml())` to the full-provider block. Existing Visualize File, Explorer visualization, Visualize This, double-click/F12, Open parent, and Show in code route through existing commands. Do not register global VS Code symbol/definition providers.

### 4. Preserve honest canvas save/load identity

Reuse `computeDocumentHash` and `SourceReference`; no new canvas format/version and no embedded YAML source.

- Every file/symbol gets a source reference. Files use `type: 'file'`, `symbol: null`. Symbol selection is the heading range; declaration is the total range. Translation refreshes the document hash.
- Identity names: mapping entries use `key:` plus `JSON.stringify(original scalar-key lexeme)`; empty keys use `key:""`; items use `item:[<index>]`; on-demand targets use `anchor:<original name>`. These are identity names, not replacement display text. Scalar anchor kinds use `vscode.SymbolKind.Variable`.
- Set an ancestry path only for ordinary mapping-entry symbols reached exclusively through mappings in a single-document stream. Include all ancestor entries with Object/Array kinds and end with the current symbol. Sequence items/descendants, multi-document symbols, and on-demand anchor targets use `path: null`: ordinals and rebound anchor names are unsafe after edits.
- Unchanged hash: require exact name/kind/heading/declaration match in the current index and matching ancestry when provided. Include on-demand anchor targets in the index. Restoration must not call alias-definition lookup.
- Changed hash: require a non-null path with exactly one ordinary match in a current single-document stream. Reject when the current source became multi-document. Reject changed references with `path: null`. Never substitute nearest coordinates, same-name siblings, or sequence ordinals.
- Validate URI/language. Reuse existing error wording where applicable: `Language changed from <old> to <new>`, `Missing symbol reference`, `Declaration "<name>" could not be resolved at saved coordinates`, `Cannot locate declaration "<name>": document modified and symbol has no ancestry path`, `Symbol "<name>" not found in modified document`, and `Ambiguous symbol: multiple declarations match ancestry path for "<name>"`. Use `Saved outline URI does not match document` for a direct-provider URI mismatch. Existing restoration handles failed references as unavailable-source nodes.

### 5. Settle malformed-source failures through the existing host

The provider must reject bad YAML, so its normal command paths need reliable error delivery. `VisualizingTab.visualizeDocument` currently passes an Error object to `showErrorMessage`, then emits a second generic failure; `_outline_requestLocationDefinerAndSend` has no rejection handler. Fix these narrow boundaries in `src/vscodeextension/src/visualprogramming/visualizer.ts`, without changing method signatures or commands:

- In `visualizeDocument`, capture the requesting panel before awaiting. Put provider lookup, missing-result validation, translation, and posting inside one try/catch. A missing provider result throws `The document outline provider did not return a result.` On failure, post one existing array-shaped `messageBox` with `requestedId: null`, severity `Error`, title `Source navigation failed`, and the actual error message. Use `_postOutlineMessage` with the captured panel so disposal/replacement cannot deliver into another panel. Remove the old Error-object notification and duplicate `Could not visualize` notification.
- Add rejection handling to the existing parent-navigation promise, covering provider and translation failures. Post the same error-card shape with the original `requestId`/`requestPanel`. In `_processFoundOutlineEntities`, route its returned-Error branch through that same reply shape instead of a notification that leaves the ticket pending.
- Copy the error-to-string handling already used by `_getOutlineAndSend`; preserve the existing empty-result `Definition not found` behavior and successful routes. No retries, parser fallback, or broader host refactor.

Steps 1–4 are dependent; step 5 can be implemented independently after its error contract is fixed here. Enable YAML registration only when all five are present. Fixtures/tests can be prepared independently. No changes are expected in `outlineutils.ts`, `outline_entities.ts`, `canvas_format.ts`, or webview sources. Language-server tooling reported no configured server during planning; use scoped source searches unless one becomes available. No existing exported API changes are required.

## Critical files & anchors

- `src/vscodeextension/src/outlineproviderAPI/outlineprovider.ts`, `VpOutlineProvider`: complete provider contract, including saved outlines; do not add an LSP-only adapter.
- `src/vscodeextension/src/visualprogramming/outline_entities.ts`, `translateOutlineRanges`: normalizes serialized ranges and replaces display text from source; synthetic headings would be overwritten.
- `src/web_visualizer/src/vp/outline_object_functions.js`, `equals` / `getPosStart`: URI/start-based node reuse and `definitionPosition` dispatch.
- `src/web_visualizer/src/vpw/vpw_code_editor.js`, `vp_setContent`: explicit empty comment ranges disable highlighter-derived comment detection.
- `src/vscodeextension/src/test/suite/outlineprovider_test/canvas_restore.test.ts`, `RestoreFixture`: isolated document lifetime and exact-versus-changed-source restoration patterns.

## Verification

### Behavior tests

Add `src/vscodeextension/src/test/suite/outlineprovider_test/yaml_outline.test.ts`. Reuse `MemoryFile`/isolated URI content providers and `vscode.languages.setTextDocumentLanguage(..., 'yaml')`. Do not register mock YAML symbol/definition providers. Use the real provider, with command dispatch and translation for consumer-facing checks. Dispose fixture registrations. The existing suite discovers `*.test.js` automatically.

Cover distinct consumer-visible boundaries:

1. Block/flow nesting: scalar settings remain source; collection rows open the correct container; empty `{}`/`[]` and original gaps/delimiters remain visible.
2. Collection items beginning with a scalar or nested collection: item and child identities stay distinct, correct parent navigation, first scalar retained in body.
3. Literal/folded/multiline quoted values, comments, literal `#`, CRLF, and non-BMP text before an alias: exact original text/UTF-16 positions survive translation; only true comments are marked.
4. Multi-document, root scalar/sequence, empty/comment-only input: separators/scalars retained, same keys in different documents have different starts. Include empty and explicit multiline scalar keys.
5. Container reuse, scalar/root/empty anchors, scalar-key anchor collision, rebinding, and cyclic aliases: exact target identity, finite parts, correct parent. Alias-like text inside strings/comments does not navigate to an anchor.
6. Malformed indentation/unclosed flow syntax, duplicate keys, forward/missing/cross-document aliases, complex/alias keys, and unresolved custom tags: actionable line/column error, no partial outline.
7. Exact save/load for ordinary and on-demand nodes; unique mapping ancestry survives prepended comments. Changed sequence/multi-document/anchor identities reject instead of selecting replacements. Single-document → multi-document edits cannot reuse the old path.
8. A document edit between requests invalidates syntax/range/alias caches; earlier translated outlines do not contaminate new output.

Do not add source-text/wiring/mock-echo tests or merely assert non-empty output.

### Real manifest fixture

Add `src/vscodeextension/src/test/testfiles/yaml/manifests.yaml`:

```yaml
# Shared defaults
image: &image alpine:3.20
defaults: &base
  retries: 3
  script: |
    echo "# literal"
    echo "hello"
jobs:
  - name: build
    config: *base
    image: *image
    env: { FLAGS: [fast, safe] }
  - name: test
    config: *base
---
service:
  metadata:
    name: demo
  ports: [8080, 9090]
```

Expected navigation: file → `jobs:` → `- name: build` → `env:` → `FLAGS:` opens distinct connected windows. `name: build`, `config: *base`, and `image: *image` remain source in the item. `FLAGS:` shows `[fast, safe]`. Either `*base` opens/reuses `defaults: &base`; `*image` opens the scalar-anchor window showing `alpine:3.20`. File retains `---` before `service:`; `service:` → `metadata:` shows `name: demo`. This fixture is source data, not a deployment to execute.

### Commands and live acceptance

From the repository root, after dependency installation:

```sh
npm run build:ext
RUN_DIR=$(mktemp -d /tmp/scv-yaml.XXXXXX)
VSCODE_CLI=1 '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir="$RUN_DIR/test-profile" \
  --extensions-dir="$HOME/.vscode/extensions" \
  --disable-extension=vscodevim.vim \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --extensionTestsPath="$PWD/src/vscodeextension/out/test/suite/index" \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/vscodeextension/src/test/testfiles"
```

The installed VS Code executable was found during planning. The complete suite requires `ms-python.python` and `ms-python.vscode-pylance`, although YAML does not. Use the installed-current-VS-Code route: the historical `npm run test:ext` launcher pins VS Code 1.61.1 and prior results report Python-extension setup failure. Do not claim that legacy launcher passes.

Launch a separate development host without third-party YAML extensions for visual proof:

```sh
VSCODE_CLI=1 '/Applications/Visual Studio Code.app/Contents/MacOS/Code' \
  --new-window --user-data-dir="$RUN_DIR/live-profile" \
  --extensions-dir="$RUN_DIR/yaml-only-extensions" \
  --extensionDevelopmentPath="$PWD/src/vscodeextension" \
  --remote-debugging-port=9345 \
  --skip-welcome --skip-release-notes --disable-workspace-trust \
  "$PWD/src/vscodeextension/src/test/testfiles/yaml"
```

Inspect actual commands, rendered webview screenshots, and source selections. Browser backend emulation alone is not YAML runtime proof.

1. Open the fixture using **Visual Programming: Visualize File (Local)** and Explorer **Visualize This (Local)**. Follow the chain/aliases above through rows and double-click/F12. Repeated aliases reuse the target; different source tokens retain distinct edges.
2. Inspect headings, multiline indentation, flow delimiters, comments, line numbers, and metadata. Toggle comments: `# Shared defaults` hides/shows; `echo "# literal"` stays. Resize/scroll/zoom, then follow an alias; its edge remains anchored to the source token.
3. Use **Open parent** from a sequence item, nested mapping, and scalar-anchor target. **Show in code** selects the mapping heading, sequence dash, or anchor start.
4. Before step 5, reproduce the two host error boundaries with existing commands: visualize an ordinary YAML file while YAML is still unregistered; then visualize a valid temporary TypeScript function, change that temporary document's language mode to YAML, and invoke **Open parent** from its existing node. These exercise concrete provider rejection without changing analyzed code or shipping provisional registration. After YAML and step 5 are enabled, use a temporary `.yml` copy with CRLF/Unicode before an alias and repeat navigation. Open malformed/unsupported-tag sources through file and selected-position commands: one actionable diagnostic, not a fabricated diagram or duplicate generic failure. Then open valid YAML, introduce a syntax error in the temporary source, and invoke **Open parent** from its existing window: one error card settles the ticket. Repair it and repeat successfully. Provider-only assertions do not prove host settlement.
5. Save a canvas containing file, nested containers, two alias edges, and scalar-anchor node. Change geometry/collapse/comment state first. Load into a separate tab: same state, current YAML source, correct targets, no duplicate nodes. Re-save and compare graph/reference content. Reorder a sequence in a temporary fixture and reload: uncertain targets become unavailable rather than a different item. Use a separate single-document copy to demonstrate comment insertion preserving a mapping-path target.
6. From `src/vscodeextension`, run `npx --no-install vsce package --no-yarn -o ./release/code-visualizer-local.vsix` and inspect its archive for the runtime `yaml` package. This checks production dependency packaging without overwriting the user's installed extension.
7. Because step 5 changes shared host error routing, run the required Python regression in another isolated development host with installed Python/Pylance. Reuse the live-host launch with `--user-data-dir="$RUN_DIR/python-profile"`, `--extensions-dir="$HOME/.vscode/extensions"`, and an unused debugging port. Open `../../MAFC/Workspace/airflow-data/dags/ingestion/table_level/trino_ingestion_dag_factory.py` read-only: file → `_build_dag` → nested `ingestion_dag`. Inspect rendered headings, decorator metadata, body text, and navigation; open `CONFIG_DIR` and `SQL_TASK_TIMEOUT` too. Do not execute or modify the Airflow file.

### Planning evidence, not implementation results

Read-only in-memory probes of `yaml@1.10.3` confirmed original CRLF ranges, block/flow/multi-document parsing, preceding-anchor rebinding, cyclic and empty anchors, empty/explicit multiline keys, and duplicate-key/forward-alias errors. Its four declaration files passed installed TypeScript 3.9.10 with strict checking, CommonJS, ES2015, and noEmit: zero diagnostics. No repository implementation/build or application runtime verification has happened yet.

Parser references: [v1 API/CST documentation](https://eemeli.org/yaml/v1/), [1.10.3 metadata](https://registry.npmjs.org/yaml/1.10.3), [CST types](https://unpkg.com/yaml@1.10.3/parse-cst.d.ts), [AST types](https://unpkg.com/yaml@1.10.3/types.d.ts).

## Assumptions & contingencies

- User-selected scope is plain YAML structure plus same-document aliases, not field-specific file links, Kubernetes/CI inference, or template execution.
- Common scalar-key manifests are supported, not every YAML extension. Unsupported tags/complex keys fail visibly. Existing comment-hidden blank-row compaction remains unchanged.
- Restoration prioritizes correct identity over speculative recovery: sequence/document-indexed and on-demand anchor nodes restore exactly only when the source hash is unchanged; reopen them after edits.
- If dependency installation hits the previously documented iCloud filesystem conflict, do not delete/rename user directories. Build and validate an isolated temporary copy with the updated manifest/lockfile; record the limitation and do not claim original-checkout validation.
- If full-suite Python prerequisites are unavailable, run the new compiled YAML test file using a temporary VS Code test entry that activates the local extension, registers the memory provider, and loads that file with Mocha. Still complete YAML-only live acceptance; report the full-suite prerequisite failure. Do not alter the permanent launcher to bypass unrelated requirements.
- If port 9345 is occupied, use an unused local debugging port; do not stop the user's editor/services.
- YAML extraction remains isolated from Python/TypeScript. Shared host error-path changes require the explicit Airflow regression in verification step 7; unavailable Python tooling is a reported validation blocker, not permission to claim that check passed.
