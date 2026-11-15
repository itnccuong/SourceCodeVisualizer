# Marketplace preparation results

Completed: 2026-11-15. Nothing was pushed or uploaded to the Marketplace. The installed local extension in the normal user profile was not replaced.

## Executed changes

- Changed the extension README GIFs to local relative paths. The package command supplies explicit monorepo image/content HTTPS bases for Marketplace rendering. Original GIFs were neither modified nor copied into the VSIX.
- Prepared extension identity `itnccuong.source-code-visualizer`, version `0.2.0`, display name `Source Code Visualizer (Fork)`, fork repository/homepage/issues links, and `SEE LICENSE IN LICENSE` metadata. Publisher ownership is not verified. The root private workspace version is aligned.
- Removed `(Local)` from all six contributed command titles. Migrated command IDs and registrations to `source-code-visualizer.*` and the integration harness activation ID to the new fork ID. No old-command aliases remain. Documentation retains the old display name only as an installation migration warning.
- Replaced the extension package script formerly named `publish` with `package`, migrated the parent packaging caller, and updated build/install documentation. Packaging never uploads.
- Added a dated fork modification notice, the complete GPLv3 text, source/rebuild instructions, and a release-preparation script. The script follows the installed production dependency closure, preserves author/license inputs, inventories dependency notices, and bundles the corresponding first-party source archive. Generated LICENSE copies are produced by the build, not hand-edited.
- Corrected the web visualizer manifest from `UNLICENSED` to `LGPL-3.0-only`, matching its actual original license.

## Validation actually performed

- `npm --prefix src/vscodeextension run package` compiled the webview and extension and created `src/vscodeextension/release/source-code-visualizer.vsix`. Initial source validation exposed macOS AppleDouble metadata entries. The archive command was corrected with `COPYFILE_DISABLE=1`, then packaging and archive validation succeeded.
- Final VSIX: **11,068,981 bytes**, 309 package files. Its manifest has the expected fork identity/version and no `(Local)` command titles.
- Both local README image paths resolve. All five packaged image links are HTTPS and normalize to the intended public `media_marketplace` paths. No GIF payload is included in the VSIX.
- In the actual VS Code extension-development window, the extension README rendered all five original GIFs at natural dimensions **1854 × 1080**. Captured and inspected a rendered README screenshot.
- In that host, the Command Palette showed the renamed commands. Running `Visual Programming: Visualize File` on `src/vscodeextension/src/test/testfiles/yaml/manifests.yaml` opened a rendered file diagram. Its webview identifies `itnccuong.source-code-visualizer`; the toolbar labels also have no `(Local)` suffix. Captured and inspected the diagram screenshot. The first canvas opens directly, so an initial automated wait for a destination picker timed out; inspection confirmed successful diagram creation, not a command failure.
- The VSIX includes full GPLv3/LGPLv3 text and upstream attribution. All **eight** runtime license/notice files across **six** packages match the installed originals byte-for-byte, including TypeScript third-party notices.
- The bundled source archive is **979,992 bytes**, with **432 entries**. Every archived regular file matched its current build input byte-for-byte. It includes original extension/browser/build-tool source, build scripts, lockfile, license inputs, and build instructions; no installed dependencies, compiled output/release directories, recursive source archives, or AppleDouble files.
- LSP code intelligence was attempted before changing registration consumers; no language server was available.
- Existing parser/rendering suites were not rerun: this change does not modify their implementation. Verification covered packaging and the changed command/README surfaces. Older advertised VS Code engine versions were not runtime-tested.

## License assessment

The original extension and web visualizer grant LGPLv3 redistribution/modification rights. That permits a modified fork and a separately branded Marketplace extension, subject to the actual license obligations. It does not grant upstream endorsement or guarantee Marketplace acceptance.

Preserve upstream author/copyright and license notices; identify modifications and dates; supply complete LGPLv3 and incorporated GPLv3 texts; make matching corresponding source and build/install instructions available; preserve applicable third-party notices and downstream rights. The first-party source archive and generated notices address concrete packaging gaps found during this review. A public matching source tag/release is also recommended.

| Component | Reviewed license | Distribution status |
| --- | --- | --- |
| Original extension and web visualizer | LGPLv3 | Original notices retained; full GPLv3 and matching first-party source added |
| highlight.js 11.0.1 | BSD-3-Clause | Notice retained in aggregate LICENSE and bundle copyright header |
| @lezer/common 1.5.5, @lezer/python 1.1.19, @lezer/lr 1.4.12, @lezer/highlight 1.2.5 | MIT | All four package-local licenses retained |
| yaml 1.10.3 | ISC | Original package-local license retained |
| TypeScript 3.9.10 | Apache-2.0 plus supplied third-party notices | LICENSE.txt, CopyrightNotice.txt, and ThirdPartyNoticeText.txt retained verbatim |

The original aggregate omitted npm dependency notices, but the old VSIX already retained those notices in package directories. This was not evidence of missing Lezer/YAML/TypeScript notices. The genuine separate gaps were the absent full GPLv3 text and absent corresponding original TypeScript/browser source. Source maps without embedded sources were not substitutes for that source.

### Initial inherited provenance questions (resolved in the follow-up below)

- `src/web_visualizer/src/utils/text_utils.js` attributes `TextUtils.count` to https://gist.github.com/victornpb/7736865 and a Stack Overflow answer, but the inspected gist has no explicit license. This is a permissions/attribution question, not a finding of infringement.
- `src/web_visualizer/src/highlightjs/styles/default.min.css` says its dark theme was partly copied from VS Code without identifying the upstream file/version. The precise original material and applicable notice need identification.

Those points prevent an unconditional claim that every inherited snippet is cleared. They were documented rather than silently relicensed or replaced during a README/packaging task. Resolve the relevant permissions/attribution, or replace the affected material with clearly licensed alternatives, before claiming complete publication compliance. This review is not legal advice.

Primary license references:
- https://www.gnu.org/licenses/lgpl-3.0.html
- https://www.gnu.org/licenses/gpl-3.0.html#section5
- https://www.gnu.org/licenses/gpl-3.0.html#section6
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension

## Before publication

1. Inherited provenance follow-up completed below: Microsoft MIT notice retained; copied utility removed.
2. Push the updated README, source/license files, and original GIFs to the public fork main branch. Existing remote GIF URLs returned 404 during investigation; no push was authorized or performed. Local preview is fixed, but public image availability cannot be established before that push.
3. Register/own publisher `itnccuong`, or change the proposed publisher and all current extension-ID consumers/documentation before rebuilding.
4. Publish a matching source tag/release and upload the generated VSIX through https://marketplace.visualstudio.com/manage. No authentication token is needed just to package.
5. Disable/uninstall the old `visualprogrammingx.sourcecodevisualizer-local` build before installing the new identity; it is a different extension, not an in-place update of the old ID.

Nonblocking tooling warnings observed: legacy vsce emitted a Node shell deprecation warning and recommended bundling the extension JavaScript. Packaging still succeeded; no unrelated bundling/toolchain migration was attempted.

## Follow-up: inherited attribution resolution

### Executed changes

- Traced Microsoft's Dark / Dark+ theme files to `microsoft/vscode` commit `e7d7e9a9348e6a8cc8c03f877d39cb72e5dfb1ff` (tag `1.60.0`). Its `extensions/theme-defaults/package.json` explicitly declares MIT; the repository `LICENSE.txt` supplies the full Microsoft copyright, permission, and disclaimer text.
- Added `src/web_visualizer/src/highlightjs/styles/LICENSE` with that full notice and pinned source references. Preserved DarkTrick's adaptation credit and existing CSS declarations. The originally copied revision remains unknown; the reference establishes licensing and matching upstream theme colors, not the exact copying history.
- Added that original license input to `scripts/prepare-release.js`. The existing webview license collector also includes it because its filename is `LICENSE`.
- The utility researcher checked all three gist revisions and five available comments. No independent permissive license grant was established. Stack Overflow answer 7924240 explicitly licenses revision 11 under CC BY-SA 3.0 and revision 12 under CC BY-SA 4.0; neither justifies silently treating the inherited adaptation as LGPL-only. The precise source is https://stackoverflow.com/a/7924240, by Victor (Vitim.us); the gist is https://gist.github.com/victornpb/7736865.
- Removed the copied `text_utils.js` helper and its import. Its only caller now scans for LF characters directly, without a general substring-counting implementation, extra allocation, or a new license dependency.
- Updated `NOTICE`, `SOURCE.md`, architecture/release guidance, and the changelog. The earlier unresolved findings above are historical, not current publication blockers for these two pieces.

### Validation actually performed

- LSP references attempted for `TextUtils.count`; no language server was available. Repository search identified one import and one call.
- Ran the maintained `SelectionUtils` source in a real headless browser against actual DOM selections: **156 boundary-position checks**, including **81 multiline positions**, across empty text, ordinary text, LF-only text, consecutive blank lines, CRLF, emoji/UTF-16 columns, and a trailing newline. Coordinates matched the browser-selected text, and the original selection was restored for every check.
- The first smoke expectation assumed native selection retained every raw trailing newline; the browser does not always do that. The corrected check uses the browser's actual selected text, which is the utility's existing contract. No selection-extraction behavior was changed to force that assumption.
- `npm --prefix src/vscodeextension run package` succeeded. Final VSIX: **11,075,201 bytes**.
- Inspected the actual VSIX: complete Microsoft MIT text and pinned references occur in both `extension/LICENSE.txt` and `extension/media/LICENSE`; the CSS includes Microsoft's copyright attribution. The copied helper is absent from both runtime output and the bundled source archive. Current notice/source inputs match their archived copies byte-for-byte.
- An initial archive assertion expected the direct newline scan in the runtime bundle. Inspection established that `SelectionUtils` itself is not reachable from the stitched runtime entry point; the maintained source utility is included in the corresponding source archive and was exercised directly in the browser. The assertion was corrected to verify the archive rather than claim runtime inclusion.

### Outcome and limits

These two concrete release issues are addressed: the identified Microsoft-derived styling carries its MIT notice, and the CC BY-SA-derived helper is no longer distributed. No claim of legal certification or an exhaustive audit of every inherited file is made. No GIFs, parser behavior, Python sources, or CSS color declarations were changed. Nothing was pushed or published.

Primary sources:
- https://github.com/microsoft/vscode/blob/e7d7e9a9348e6a8cc8c03f877d39cb72e5dfb1ff/extensions/theme-defaults/package.json
- https://github.com/microsoft/vscode/blob/e7d7e9a9348e6a8cc8c03f877d39cb72e5dfb1ff/LICENSE.txt
- https://api.stackexchange.com/2.3/posts/7924240/revisions?site=stackoverflow&filter=withbody
- https://creativecommons.org/compatible-licenses/

