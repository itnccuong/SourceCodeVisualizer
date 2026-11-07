require ("../vgf/vgf_widget.js");
require ("../vgf/vgf_line.js");
require ("./vpw_button_movable_dockable.js");
require ("../utils/source_navigation.js");


/**
 * Object, that will create a visual connection
 *  between a source and a target
 *
 *                               Child of
 * Source                Button ----------->  Target
 *       ________________
 *       line from source
 *          to button
 *
 * Constraints:
 *    `domSource` and `domTarget` must already be inside
 *     the active DOM.
 **/
const VpwEntityConnection = (function (domSource, domTarget, sourceAnchor = null)
{
  let self = new VpwButtonMovableDockable ();
  const dock = self.vp_dock;
  self.vp_dock = function(target)
  {
    self._vp_domTarget = target.vp_isWorld() ? null : target;
    return dock(target);
  };
  self.addEventListener("vp_windowBeforeStartMoving", () => { self._vp_domTarget = null; });
  self.constructor = function()
  {
    self._vp_domSource = domSource;
    self._vp_domTarget = domTarget;
    self._vp_sourceAnchor = sourceAnchor;

    self._vp_line = new _VpwEntityConnectionSpecialLine(domSource, self, sourceAnchor);
    self.vp_widget_add (self._vp_line);


    // dock to target
    {
      self._vp_initPosition ();
      self.vp_dock (domTarget);
    }

    self._initEventListeners ();

    // Source is `Connectable`? =>  add connection
    //  or don't connect, if it's just a simple DOM object
    if (isObject (Connectable.getInterface (domSource))){
      Connectable.getInterface (domSource).addConnection (self);
    }


    return self;
  }



  self._initEventListeners = function()
  {
    let listener_source = self._vp_domSource.vp_getToplevelWidget();

    // Undocking clears dock-parent listeners. Source lifetime is independent.
    listener_source.addEventListener("vp_beforeDelete", self.vp_delete);
    self.addEventListener("vp_beforeDelete", () =>
      listener_source.removeEventListener("vp_beforeDelete", self.vp_delete));

    self.addEventListener ("mousedown", self.vp_update);
    self.addEventListener ("vp_beforeDelete", self._vp_removeSelfFromSource);
  }



  self._vp_initPosition = function()
  {
    // setup
      let source = self._vp_domSource;
      let world = source.vp_getWorld();

      let geom_source = getOffset (source);
      let geom_world  = getOffset (world);

    // run

      // add to world
      world.vp_widget_add (self);

      self.vp_setXY (-geom_world.left + geom_source.left,
                     -geom_world.top + geom_source.top);
  }



  self._vp_removeSelfFromSource = function(){
    Connectable.getInterface (self._vp_domSource). remove (self);
  }



  self.constructor();
  return self;
});




/**
 *  A VgfLine, that is tailored the the needs
 *   of a VpwEntityConnection
 **/
const _VpwEntityConnectionSpecialLine = (function (domSource, domTarget, sourceAnchor = null)
{
  let self = new VgfLine ();

  self.constructor = function()
  {
    // setup vars
    self.source_relX = -7;
    self.source_relY = -11;
    self.self_relX = 0;
    //self.self_relY = 0;//unused

    self._vp_source = domSource;
    self._vp_target = domTarget;

    self.vp_setColor ("rgb(221, 176, 27)");

    self._initEventListeners (domTarget, domSource);

    return self;
  }



  self._initEventListeners = function(domTarget, domSource)
  {
    let listener_target = domTarget;
    let listener_source = domSource.vp_getToplevelWidget();

    let reg = self.vp_addEventListenerForForeignObject;
    reg (new VpEventListener (listener_target, "vp_windowMoved",   self.vp_update));
    reg (new VpEventListener (listener_source, "vp_windowMoved",   self.vp_update));
    reg (new VpEventListener (listener_source, "vp_windowResizedByUser", self.vp_update));
  }



  self._vp_getLineStartPos = function()
  {
    let scale = self.vp_getWorld().vp_scale;
    let toplevel = self._vp_source.vp_getToplevelWidget();
    const endpoint = sourceAnchor ? SourceNavigation.endpoint(sourceAnchor) : null;
    const src = endpoint?.element ?? self._vp_getVisibleSource();
    const source_offset = endpoint?.rect ?? src.getBoundingClientRect();
    const target_offset = self._vp_target.getBoundingClientRect();
    const toplevel_offset = toplevel.getBoundingClientRect();

    // Legacy declaration buttons retain their geometry. Mapped source uses the
    // last code point, not a highlight span or the user's current selection.
    let x = source_offset.right;
    let y = source_offset.top + (endpoint ? source_offset.height / 2 : 0);
    if (!endpoint && src === self._vp_source)
    {
      x -= scale;
      y += src.offsetHeight / 5 * scale;
    }

    let bounds = {
      left: toplevel_offset.left,
      top: toplevel_offset.top,
      right: toplevel_offset.right,
      bottom: Math.max (toplevel_offset.top, toplevel_offset.bottom - 4 * scale)
    };
    if (src !== toplevel)
      _clipSourceBounds (src.parentElement, toplevel, bounds, scale);
    const preferredX = x, preferredY = y;
    x = Math.clamp (x, bounds.left, bounds.right);
    y = Math.clamp (y, bounds.top, bounds.bottom);
    if (sourceAnchor)
    {
      let reason = endpoint?.fallbackReason;
      if (!reason && (x !== preferredX || y !== preferredY))
        reason = sourceAnchor.fallbackElement ? "Compact decorator source" : "Source is outside the visible area";
      const position = sourceAnchor.range[0];
      self._vp_target.title = `${sourceAnchor.uri}:${position.line + 1}:${position.character + 1}`
        + (reason ? "\n" + reason : "");
    }

    if (sourceAnchor)
    {
      // The line's layout origin includes the docker's padding/content flow.
      const origin = self.getBoundingClientRect();
      x = (x - origin.left) / scale;
      y = (y - origin.top) / scale;
    }
    else
    {
      x = (x - target_offset.left) / scale;
      y = (y - target_offset.top) / scale - self._vp_target.offsetHeight;
    }

    return [x,y];
  }

  let _clipSourceBounds = function(ancestor, toplevel, bounds, scale)
  {
    if (!ancestor || ancestor === toplevel)
      return;

    // Outer-to-inner clipping also pins a wholly hidden nested viewport to
    // the nearest boundary of its visible parent.
    _clipSourceBounds (ancestor.parentElement, toplevel, bounds, scale);
    let style = window.getComputedStyle (ancestor);
    let clipX = style.overflowX !== "visible";
    let clipY = style.overflowY !== "visible";
    if (!clipX && !clipY)
      return;

    let rect = ancestor.getBoundingClientRect();
    if (clipX)
    {
      let left = rect.left + ancestor.clientLeft * scale;
      let min = bounds.left;
      let max = bounds.right;
      bounds.left = Math.clamp (left, min, max);
      bounds.right = Math.clamp (left + ancestor.clientWidth * scale, min, max);
    }
    if (clipY)
    {
      let top = rect.top + ancestor.clientTop * scale;
      let min = bounds.top;
      let max = bounds.bottom;
      bounds.top = Math.clamp (top, min, max);
      bounds.bottom = Math.clamp (top + ancestor.clientHeight * scale, min, max);
    }
  };



  self._vp_getVisibleSource = function()
  {
    // Display-hidden sources (for example a collapsed body) use a visible
    // ancestor; scroll-clipped sources retain their own anchor.
    let toplevel = self._vp_source.vp_getToplevelWidget();
    let src = self._vp_source;
    while (src !== toplevel && !isVisible (src))
      src = src.parentElement;
    return src;
  }



  self.vp_update = function()
  {
    // Convert the docking button's screen height back to world coordinates.
    let scale = self.vp_getWorld ().vp_scale;

    // from source
    let p1 = self._vp_getLineStartPos();

    // to itself
    let x2 = -self.self_relX;
    let y2 = -self._vp_target.getBoundingClientRect().height/scale;

    self.vp_setStart (p1[0],p1[1]);
    self.vp_setEnd (x2, y2);
  }



  self.constructor();
  return self;
});

