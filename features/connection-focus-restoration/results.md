# Connection focus restoration

## Request

Keep the source box's reading surface clear while selected. Restore its connections immediately when another box or empty canvas is clicked, without requiring a click on each connection's target.

## Cause and change

Connection canvases belong to their target's stacking context. Focusing the source raised it above those targets, covering outgoing lines over its body. Focusing an unrelated box did not restore the targets' stacking order.

- `src/web_visualizer/src/vgf/vgf_window.js`: leaving a visually focused window emits `vp_windowUnfocused`. Refocusing the same window does not emit a false transition.
- `src/web_visualizer/src/vpw/vpw_entity_connection.js`: source-unfocus raises the current dock-owning target, or the connector itself when undocked. The next selected window is raised afterward and remains on top. The source listener is removed when its connection is deleted.
- `src/web_visualizer/src/vgf/vgf_navigationarea.js`: primary clicks on empty canvas clear visual focus and restore outgoing edges. Clicks inside windows retain existing focus/selection handling.
- No Python extraction, source-coordinate, edge identity, or node-position logic changed.

Decision: retain the existing target-owned connection canvases and restore their stacking on source blur. This also raises connected target windows above the old source; it does not move or refocus them. No overlay renderer or animation loop was introduced.

## Verification

- A source-backed three-node browser fixture used one range-anchored edge and native mouse clicks in dark and light themes.
- Source click covered its outgoing line across the reading surface; unrelated-node click immediately restored it. The unrelated selected box remained above the old source and restored target. Reselecting the source cleared its reading surface again; empty-canvas click restored the edge and cleared visual focus.
- Edge count remained one. Direct target clicking still worked without moving it.
- Dragging the connector onto empty canvas and then blurring the source raised the undocked connector. Source deletion removed it and its bindings.
- Docked restoration uses synchronized `_vp_domTarget`; `vp_getToplevelWidget()` identifies the connector rather than its dock owner.
- No extension-host test suite was rerun: the changed behavior is browser-only and was exercised on the actual rendered surface. No Python source was executed or modified.

