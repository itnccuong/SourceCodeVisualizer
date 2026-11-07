require ("./vgf_widget.js");

/**
 *  A `NavigationArea` is like an extended
 *    `ScrollArea` in QT or GTK:
 *      - It enables moving around `world`
 *
 *
 *    VgfNavigationArea
 *         |
 *         ├- interactionArea
 *         |
 *         |     knows and moves
 *         |       ↓         ↓
 *         |       ↓         ↓
 *         └- scalingArea    ↓
 *                     └- world
 *
 **/
const VgfNavigationArea = (function(world)
{
  let self = new VgfWidget ("div");

  self.constructor = function()
  {
    self.classList.add ("VgfNavigationArea");

    // interaction area implements triggers to control `world`
    self._vp_interactionArea = self._vp_createInteractionArea();

    self.appendChild (self._vp_interactionArea);
    self.appendChild (world);
    self.addEventListener("mousedown", event => {
      if (event.button !== 0 || event.target.closest(".VgfWindow")) return;
      for (const window of world.querySelectorAll(".VgfWindow_focussed"))
        vgf_window_unfocus_visually(window);
    });

    _setup_bodyScrollLock(self, world);
    setup_mouse_dragElement (self._vp_interactionArea, world);
    _setup_mouseWheelScrolling (self, world);
    _setup_scaleViewpoint (self, world);
  }


  self._vp_createScalingArea = function()
  {
    let scalingArea = new VgfWidget ("div");
    let s = scalingArea.style;
    s.position = "absolute";
    s.top = "50%";
    s.left = "50%";
    s.border = "4px limegreen solid";
    return scalingArea;
  }


  self._vp_createInteractionArea = function()
  {
    let interactionArea = new VgfWidget ("div");
    interactionArea.classList.add ("VgfInteractionArea");
    return interactionArea;
  }


  self.constructor();
  return self;
});

function _setup_bodyScrollLock(navigationArea, world)
{
  let body = null;
  let owner = null;
  const clear = () => {
    body?.classList.remove("VgfBodyScrollLocked");
    owner?.removeEventListener("vp_beforeDelete", clear);
    body = null;
    owner = null;
  };
  const selectBody = event => {
    if (event.button !== 0) return;
    const candidate = event.target.closest(".VgfExpandableContent");
    if (candidate === body) return;
    clear();
    if (!candidate || !world.contains(candidate) || !candidate.querySelector(".VpwCodeEditor")) return;
    body = candidate;
    owner = body.closest(".Window_OuterFrame");
    body.classList.add("VgfBodyScrollLocked");
    owner.addEventListener("vp_beforeDelete", clear);
    // A click explicitly changes wheel ownership, even during touchpad momentum.
    world._vp_wheelGesture.panning = false;
  };
  const scrollBody = event => {
    if (!body || event.ctrlKey || event.altKey || event.metaKey) return;
    if (!body.isConnected || !body.getClientRects().length || body.clientHeight === 0)
    {
      clear();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? body.clientHeight : 1;
    body.scrollLeft += (event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX) * unit;
    if (!event.shiftKey) body.scrollTop += event.deltaY * unit;
  };
  // Capture outside clicks before source selection handlers stop propagation.
  document.addEventListener("mousedown", selectBody, true);
  navigationArea.addEventListener("wheel", scrollBody, {capture: true, passive: false});
  navigationArea.addEventListener("vp_beforeDelete", () => {
    clear();
    document.removeEventListener("mousedown", selectBody, true);
    navigationArea.removeEventListener("wheel", scrollBody, true);
  });
}


function _setup_mouseWheelScrolling(interactionArea,
                                    scrolledObject)
{
  // Keep a canvas-started touchpad gesture on the canvas when it crosses a box.
  const gesture = scrolledObject._vp_wheelGesture = {lastTime: -Infinity, panning: false};
  interactionArea.addEventListener("wheel", e =>
  {
    const now = performance.now();
    if (now - gesture.lastTime > 180 || e.ctrlKey || e.altKey || e.metaKey)
      gesture.panning = false;
    gesture.lastTime = now;
  }, {capture: true, passive: true});
  interactionArea.addEventListener ("wheel", e =>
  {
    // vertical scrolling
    if (!e.altKey  && !e.ctrlKey &&
        !e.metaKey && !e.shiftKey)
    {
      gesture.panning = true;
      scrolledObject.style.top = (parseFloat(scrolledObject.style.top) || 0) - e.deltaY + "px";
      scrolledObject.style.left = (parseFloat(scrolledObject.style.left) || 0) - e.deltaX + "px";
    }

    // horizontal scrolling
    if (!e.altKey  && !e.ctrlKey &&
        !e.metaKey &&  e.shiftKey)
    {
      gesture.panning = true;
      const delta = e.deltaX || e.deltaY;
      scrolledObject.style.left = (parseFloat(scrolledObject.style.left) || 0) - delta + "px";
    }
  });
}


/**
 * Setup scaling / zooming functionality
 *
 * Be aware, that you need to keep track of scale value, if you move
 *  something on screen according to mouse
 *
 * Param world: scale value will be stored here
 * Param scalingObject: scaling will be performed here
 **/
function _setup_scaleViewpoint(interactionArea, scalingObject)
{
  // store scale level on the object
  if (!scalingObject.vp_scale)
    console.debug ("PROGRAMMER WARNING: You tried to make an object scalable, that does not officially own a `vp_scale` property. However, you will need that property for correct translations of getBoundingClientRect()-coordinates. You should consider 'officially' adding the property (= adding it in object definition)");

  interactionArea.addEventListener ("wheel", e => {
    e.preventDefault();
    zoom (e, scalingObject);
  }, {passive: false});

}


function zoom (mouseevent, scalingObject)
{
  const e = mouseevent;
  if ((!e.altKey && e.ctrlKey && !e.metaKey && !e.shiftKey)
   || (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey))
  {
    if (!Number.isFinite(e.deltaY)) return;
    const MIN_SCALE = 0.2;
    const MAX_SCALE = 3;
    const oldScale = scalingObject.vp_scale;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, oldScale - e.deltaY * 0.001));
    if (newScale === oldScale) return;

    const oldRect = scalingObject.getBoundingClientRect();
    const worldX = (e.clientX - oldRect.left) / oldScale;
    const worldY = (e.clientY - oldRect.top) / oldScale;
    scalingObject.vp_scale = newScale;
    node_scale(scalingObject, newScale);

    const newRect = scalingObject.getBoundingClientRect();
    scalingObject.style.left = (parseFloat(scalingObject.style.left) || 0)
      + e.clientX - (newRect.left + worldX * newScale) + "px";
    scalingObject.style.top = (parseFloat(scalingObject.style.top) || 0)
      + e.clientY - (newRect.top + worldY * newScale) + "px";
  }
}