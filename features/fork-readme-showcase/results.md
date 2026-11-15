# Fork README and recorded feature showcase

## Goal and acceptance

Replace the legacy README with a clear presentation of this fork, explicitly credit the original project, prominently explain parser replacement, and showcase the user's recordings in four feature groups: exploration, comments, canvas management/persistence, and YAML. Update both repository and packaged-extension presentations without claiming the fork is already published.

## Plan as executed

1. Read existing READMEs, extension commands/dependencies, language registrations, package boundaries, and the fork remote.
2. Located five GIF exports in Downloads and inspected sampled frames. Two recordings cover complementary exploration actions; combined them into one exploration asset, keeping four final demo groups.
3. Generated web copies at 1280×746, 10 fps, with 128-color palettes. Original Downloads recordings and the old upstream `quick_example.gif` were not overwritten or removed.
4. Replaced both existing READMEs with matching copy, changing only repository-versus-Marketplace link bases. Added prominent upstream attribution and syntax-aware parser details, four illustrated feature sections, honest local-VSIX installation instructions, current controls, limitations, development commands, and credits/license links.
5. Checked links, previewed actual Markdown, and packaged/inspected the extension README.

## Files

- `README.MD`: repository presentation with local GIF/documentation links.
- `src/vscodeextension/README.md`: packaged presentation with absolute fork-hosted image/documentation/license URLs.
- `media_marketplace/explore-code.gif`
- `media_marketplace/comments.gif`
- `media_marketplace/canvas-workspace.gif`
- `media_marketplace/yaml.gif`

## Recording provenance

| README asset | Original Downloads exports |
| --- | --- |
| explore-code.gif | `11_14_2026, 05_12 PM.gif`, followed by `11_14_2026, 05_16 PM.gif` |
| comments.gif | `11_14_2026, 10_38 PM.gif` |
| canvas-workspace.gif | `11_14_2026, 05_21 PM.gif` |
| yaml.gif | `11_14_2026, 10_51 PM.gif` |

## Observed validation

- Compared repository and extension README content after normalizing their expected URL differences: matched.
- Checked all local repository Markdown link targets exist, all four image targets have GIF signatures, and both READMEs reference exactly four demos.
- Inspected sampled final GIF frames for framing/text. Final sizes: exploration 23,761,557 bytes; comments 2,156,321; canvas 6,514,131; YAML 6,745,021. The exploration animation has 524 frames; the others have 97, 400, and 336 frames respectively.
- Actual VS Code Markdown preview: title, fork attribution, parser table, and demo image inspected in screenshots. All four images reported complete with natural dimensions 1280×746; both tables rendered.
- During prerequisite checking, found no web_visualizer package lock, so removed an unsupported `npm ci --prefix src/web_visualizer` instruction. The documented build installs the extension's locked dependencies; its existing packaging hook builds the webview using system Python 3.
- `cd src/vscodeextension && npx --no-install vsce package --no-yarn -o /tmp/scv-readme-media.9EBDG8/readme-final.vsix`: package/build hooks passed; 306 files, 9.6 MB.
- Inspected that archive: `extension/README.md` contains fork attribution, the parser-replacement section, and four absolute image URLs under `itnccuong/SourceCodeVisualizer/main/media_marketplace/`. GIF/video files are not bundled into the VSIX.

## Decisions and limits

- The parser rewrite is described precisely: Python uses Lezer, JS/TS/TSX use the TypeScript compiler, YAML has its own AST/CST provider. VS Code/Pylance symbol and definition discovery is not claimed to have been replaced. Inherited adapters are not presented as equally validated.
- Marketplace image URLs refer to the fork's `main` branch. The new media must be pushed there before publishing; remote availability was not claimed or substituted with upstream recordings. The repository preview uses existing local media and works before that push.
- Publisher, package identity, repository metadata, and issue metadata were not changed. They still require a separate publishing-readiness pass to avoid using upstream identity. No publish, push, or extension installation was performed.
- The complete recorded workflows were preserved rather than arbitrarily sped up or cut. Exploration combines two takes and remains a comparatively large GIF; original-resolution files remain available in Downloads for later editing.
- This was a documentation/media change. Packaging and actual Markdown rendering were verified; no runtime regression suite was rerun.

## Quality correction — original GIFs restored

The user reported blurry README GIFs. The web-copy conversion above had reduced the original 1854×1080 recordings to 1280×746, approximately 30 fps to 10 fps, and a 128-color palette. That conversion was not an exact copy and reduced presentation quality. This section supersedes the converted-asset details above.

- Replaced the four converted files with exact original exports. Added `media_marketplace/explore-details.gif` so the two exploration takes remain separate, without recompression. The README still has four feature sections, with two GIFs in the exploration section.
- Updated both READMEs to reference all five originals. No resolution, frame timing, or palette conversion is applied.
- `cmp` succeeded for every source/destination pair: all five repository GIFs are byte-for-byte identical to the corresponding Downloads exports.
- Checked GIF headers: every file is 1854×1080. Checked that repository/packaged README copy remains identical after link-base normalization and references all five existing files.

| Asset | Current source in Downloads | Bytes |
| --- | --- | ---: |
| explore-code.gif | `11_14_2026_05_12 PM.gif` | 62,783,547 |
| explore-details.gif | `11_14_2026_05_16 PM.gif` | 75,128,650 |
| comments.gif | `11_14_2026, 10_38 PM.gif` | 31,675,095 |
| canvas-workspace.gif | `11_14_2026_05_21 PM.gif` | 32,483,562 |
| yaml.gif | `11_14_2026, 10_51 PM.gif` | 86,611,878 |

The original-resolution media is much larger. Preserving the recorded quality takes precedence over README payload reduction. The user's Downloads files remain untouched. The temporary VSIX from the initial rewrite is historical; it was not repackaged or installed for this media-only correction.
