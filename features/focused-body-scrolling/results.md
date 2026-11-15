# Focused body scrolling

## Request and delivered behavior

Clicking a source box body gives its visible scroll viewport a gold outline and locks ordinary wheel/trackpad scrolling to that body. It remains locked at top/bottom/horizontal limits and when the pointer moves outside the body. Primary-clicking outside releases the lock; clicking another source body transfers it. Ctrl/Alt-wheel retains the existing intentional canvas zoom shortcuts.

## Implementation

- `src/web_visualizer/src/vgf/vgf_navigationarea.js`: one navigation-owned click/scroll state. Document capture sees outside clicks before source-selection handlers stop propagation. Locked wheel events are consumed before canvas pan/default-prevention handlers and update only the selected viewport. Scroll units account for pixel/line/page wheel modes and Shift horizontal scrolling. Clicking the body overrides an existing canvas wheel gesture. Owner deletion clears the lock; hidden/disconnected bodies cannot trap scrolling. Navigation deletion removes its document and wheel listeners.
- `src/web_visualizer/src/vgf/vgf_window_tiled.css`: gold inset outline on the visible body viewport, rather than an outline that scrolls away with a long editor. The nested editor's native focus outline is suppressed only while the gold viewport lock is active.
- Existing hover-only scrolling and canvas zoom behavior remain when no clicked-body lock applies. No source-coordinate or Python extraction code changed.
- Updated `docs/architecture-and-development.md` to describe click ownership and boundary behavior.

## Verification

Native mouse/wheel scenarios in the existing dark/light Python browser fixtures used long and short source-backed nodes:

- Both themes: a body click applied one persistent gold viewport outline.
- Native vertical scroll moved inside the body while canvas top/left remained unchanged. Overscrolling at top and bottom did not pan the canvas.
- Moving the pointer onto empty canvas without clicking still scrolled the locked body and did not pan.
- Horizontal and Shift-wheel scrolling stayed inside the body; horizontal limits did not transfer to canvas.
- Empty-canvas click cleared the lock; subsequent wheel input panned the canvas.
- Clicking a second short body transferred the lock. Wheel on that non-scrolling body did not move the canvas. Clicking its header released the lock and restored canvas scrolling.
- Clicking a body during a canvas wheel gesture transferred ownership immediately: subsequent input scrolled the body without moving the canvas.
- Ctrl-wheel while locked changed canvas scale and preserved the body lock. This is the retained explicit zoom shortcut, not ordinary scrolling.
- Deleting the locked owner cleared the lock; subsequent wheel panned normally.

No permanent browser test framework or fixture file was added. No extension-host suite was rerun for this browser-only interaction change. No analyzed Python file was executed or modified.

