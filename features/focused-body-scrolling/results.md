# Focused body scrolling

## Request and delivered behavior

Clicking a source box body gives its visible scroll viewport a gold outline and locks ordinary wheel/trackpad scrolling to that body. It remains locked at top/bottom/horizontal limits and when the pointer moves outside the body. Primary-clicking outside releases the lock; clicking another source body transfers it. Ctrl/Alt-wheel retains the existing intentional canvas zoom shortcuts.

## Implementation

- `src/web_visualizer/src/vgf/vgf_navigationarea.js`: one navigation-owned click/scroll state. Document capture sees outside clicks before source-selection handlers stop propagation. Locked wheel events are consumed before canvas pan/default-prevention handlers and update only the selected viewport. Scroll units account for pixel/line/page wheel modes and Shift horizontal scrolling. Clicking the body overrides an existing canvas wheel gesture. Owner deletion clears the lock; hidden/disconnected bodies cannot trap scrolling. Navigation deletion removes its document and wheel listeners.
- `src/web_visualizer/src/vgf/vgf_window_tiled.css`: gold inset outline on the visible body viewport, rather than an outline that scrolls away with a long editor. The nested editor's native focus outline is suppressed only while the gold viewport lock is active.
- Existing hover-only scrolling and canvas zoom behavior remain when no clicked-body lock applies. No source-coordinate or Python extraction code changed.
- Updated `docs/architecture-and-development.md` to describe click ownership and boundary behavior.

## Verification

Built with `npm run build:ext`; observed successful stitcher, CSS, media-copy, and TypeScript stages.

Served the existing dark/light Python browser fixtures and injected throwaway long/short source-backed nodes. Used native mouse and wheel input; inspected actual screenshots and scroll/canvas state.

- Both themes: a body click applied one gold outline (`rgb(217, 154, 22)`). Long body had 180 rows and 2056px vertical scroll range.
- Native vertical scroll moved inside the body while canvas top/left remained unchanged. Overscrolling at top and bottom did not pan the canvas.
- Moving the pointer onto empty canvas without clicking still scrolled the locked body and did not pan.
- Horizontal and Shift-wheel scrolling stayed inside the body; horizontal limits did not transfer to canvas.
- Empty-canvas click cleared the gold lock; subsequent wheel changed canvas top from `0px` to `-96px`.
- Clicking a second short body transferred the lock. Wheel on that non-scrolling body did not move the canvas. Clicking its header released the lock and restored canvas scrolling.
- Clicking a body during a canvas wheel gesture transferred ownership immediately: following wheel increased body scrollTop from 0 to 160 while canvas top stayed `-40px`.
- Ctrl-wheel while locked changed canvas scale from 1 to 1.16 and preserved the body lock. This is the retained explicit zoom shortcut, not ordinary scrolling.
- Deleting the locked owner cleared the lock; subsequent wheel panned normally.
- Actual screenshots confirmed a persistent gold border around the visible viewport in both themes, including a body scrolled into its middle.

No permanent browser test framework or fixture file was added. No extension-host suite was rerun for this browser-only interaction change. No analyzed Python file was executed or modified.

## Local package and installation

- `npm --prefix src/vscodeextension run publish`: successful rebuild and VSIX packaging, 236 files, 9.41 MB, version `0.1.9`.
- Reinstalled `src/vscodeextension/release/code-visualizer-local.vsix` into regular VS Code with `--force`; CLI reported success.
- Installed visualizer JavaScript and CSS matched the rebuilt assets byte-for-byte using `cmp`.
- VSIX SHA-256: `9ba7e08cd69902fc396b7a0b55586e0279caa475f81f0116b454a05971ed164e`.
- Existing VS Code windows were not forcibly reloaded. Use **Developer: Reload Window** and reopen the diagram to load this replacement.
