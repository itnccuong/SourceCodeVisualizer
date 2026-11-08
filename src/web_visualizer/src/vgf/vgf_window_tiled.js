require ("./vgf_window.js");

// ========================================================================

/**
 * Offers a collection of functions to create a VgfWindowTitled.
 * This class should remain technical and have no domain knowledge
 **/
const VgfWindowTitled = (function()
{
  let self = new VgfWindow ();
  let _expandedHeight = null;
  const RESIZE_HANDLE_SIZE = 14;
  const MAX_FIT_WIDTH = 1200;
  /**
   *  Create basic empty window with following specific properties:
   *    .vp_title:  DOM-element: contains the title
   *    .vp_window_clientarea:  div containing window content
   *
   *    event emit "rolledUpChanged" on rollup-button clicked
   *    event emit "vp_beforeDelete" when close-button clicked
   *    .rolledUp: bool, informs if windows is rolled up or not
   *
   *     class: Window
   **/
  self.constructor = function()
  {
    self.classList.add ("Window_OuterFrame");
    self.classList.add ("Window");

    self.vp_title = null; // DOM-element

    {
      let container = document.createElement ("div");
      self.appendChild (container);
      container.classList.add ("Window_InnerFrame");
      {
        let expandible = new VgfExpandableWithTitle();
        self._vp_expandable = expandible;
        expandible.vp_setTitleFullWidth();
        expandible.vp_expand();
        {
          // ---- title ----
          _createTitle(expandible);


          // ---- content ----
          self.vp_window_clientarea = _create_content_area();
          expandible.vp_appendContent (self.vp_window_clientarea);
        }
        container.appendChild (expandible);
        expandible.vp_content.addEventListener ("wheel", _isolateScrolling, {passive: true});
        expandible._vp_button_expand.addEventListener ("vp_toggled", function()
        {
          if (expandible._vp_button_expand.vp_getState() === 0)
          {
            _expandedHeight = self.offsetHeight;
            self.style.height = _minimumHeight() + "px";
          } else if (_expandedHeight !== null)
          {
            self.style.height = _expandedHeight + "px";
          }
        });
      }

    }
    self.appendChild (_createResizeHandle());
    self.addEventListener ("scroll", function(event)
    {
      if (event.target !== self)
        self.dispatchEvent (new Event ("vp_windowMoved"));
    }, true);

    return self;
  }

  let _minimumHeight = function()
  {
    let titleRow = self._vp_expandable.querySelector (".VgfExpandableTitleRow");
    let borders = self.offsetHeight - self.clientHeight;
    return Math.ceil (titleRow.offsetHeight + borders + RESIZE_HANDLE_SIZE);
  };

  let _isolateScrolling = function(event)
  {
    if (event.ctrlKey || event.altKey || event.metaKey)
      return;
    if (self.vp_getWorld()._vp_wheelGesture?.panning)
      return;

    const surface = event.currentTarget;
    const dx = event.shiftKey && event.deltaX === 0 ? event.deltaY : event.deltaX;
    const dy = event.shiftKey ? 0 : event.deltaY;
    const horizontal = Math.abs(dx) > Math.abs(dy);
    const delta = horizontal ? dx : dy;
    const position = horizontal ? surface.scrollLeft : surface.scrollTop;
    const limit = horizontal ? surface.scrollWidth - surface.clientWidth
      : surface.scrollHeight - surface.clientHeight;
    // At an exhausted content edge, continue panning the canvas.
    if (delta < 0 && position > 0.5 || delta > 0 && position < limit - 0.5)
      event.stopPropagation();
  };

  self.vp_fitToContent = function()
  {
    if (!self.isConnected || !self.closest (".VgfWorld"))
      return;

    let expandable = self._vp_expandable;
    let body = expandable.vp_content;
    let collapsed = expandable._vp_button_expand.vp_getState() === 0;
    let oldDisplay = body.style.display;
    let oldMaxHeight = body.style.maxHeight;
    if (collapsed)
    {
      body.style.display = "";
      expandable.vp_title.classList.replace ("expandable_title_collapsed", "expandable_title_extended");
    }

    self.style.width = "max-content";
    self.style.height = "";
    body.style.maxHeight = "400px";
    let width = Math.min (MAX_FIT_WIDTH, Math.ceil (self.offsetWidth));
    self.style.width = width + "px";
    // Measure height after the heading has reflowed at the bounded width.
    let height = Math.ceil (self.offsetHeight);
    self.style.height = height + "px";
    body.style.maxHeight = oldMaxHeight;

    if (collapsed)
    {
      _expandedHeight = height;
      body.style.display = oldDisplay;
      expandable.vp_title.classList.replace ("expandable_title_extended", "expandable_title_collapsed");
      self.style.height = _minimumHeight() + "px";
    }
  };

  self.vp_getFrameState = function()
  {
    const collapsed = self._vp_expandable?._vp_button_expand?.vp_getState() === 0;
    return {
      x: self.offsetLeft,
      y: self.offsetTop,
      width: Math.max(120, self.offsetWidth),
      height: Math.max(_minimumHeight(), self.offsetHeight),
      collapsed: collapsed,
      expandedHeight: _expandedHeight !== null ? _expandedHeight : Math.max(_minimumHeight(), self.offsetHeight)
    };
  };

  self.vp_restoreFrameState = function(state)
  {
    if (!state) return;
    self.vp_setXY(state.x, state.y);
    const minW = 120;
    const width = Math.max(minW, state.width);
    self.style.width = width + "px";

    const expandedHeight = Math.max(_minimumHeight(), state.expandedHeight);
    const toggle = self._vp_expandable._vp_button_expand;
    const desiredState = state.collapsed ? 0 : 1;
    if (toggle.vp_getState() !== desiredState)
      toggle.vp_onClick();
    // The normal collapse listener captures the current height. Restore the
    // persisted expanded height afterward so the next expand uses saved geometry.
    _expandedHeight = expandedHeight;
    self.style.height = (state.collapsed
      ? _minimumHeight()
      : Math.max(_minimumHeight(), state.height)) + "px";
    self.dispatchEvent(new Event("vp_windowMoved"));
  };

  let _createResizeHandle = function()
  {
    let handle = document.createElement ("div");
    handle.classList.add ("Window_ResizeHandle");
    handle.title = "Drag to resize; double-click to fit content";
    let drag = null;

    let finishResize = function(event)
    {
      if (drag === null ||
          (event.pointerId !== undefined && event.pointerId !== drag.pointerId))
        return;

      let pointerId = drag.pointerId;
      drag = null;
      if (handle.hasPointerCapture (pointerId))
        handle.releasePointerCapture (pointerId);
    };

    handle.addEventListener ("pointerdown", function(event)
    {
      if (event.button !== 0 || !event.isPrimary || drag !== null)
        return;

      event.preventDefault();
      event.stopPropagation();
      let scale = self.vp_getWorld().vp_scale;
      if (!Number.isFinite (scale) || scale <= 0)
        return;

      self.vp_focus();
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        width: self.offsetWidth,
        height: self.offsetHeight,
        scale: scale
      };
      handle.setPointerCapture (event.pointerId);
    });

    handle.addEventListener ("pointermove", function(event)
    {
      if (drag === null || event.pointerId !== drag.pointerId)
        return;

      self.style.width = Math.max (120, drag.width + (event.clientX - drag.x) / drag.scale) + "px";
      self.style.height = Math.max (_minimumHeight(),
          drag.height + (event.clientY - drag.y) / drag.scale) + "px";
    });

    handle.addEventListener ("pointerup", finishResize);
    handle.addEventListener ("pointercancel", finishResize);
    handle.addEventListener ("lostpointercapture", finishResize);
    self.addEventListener ("vp_beforeDelete", finishResize);
    handle.addEventListener ("mousedown", function(event)
    {
      event.stopPropagation();
    });
    handle.addEventListener ("dblclick", function(event)
    {
      event.preventDefault();
      event.stopPropagation();
      self.vp_focus();
      self.vp_fitToContent();
    });
    return handle;
  };




  _create_title_area = function ()
  {
    let node = document.createElement ("div");
    node.classList.add ("Window_Titlearea");

    node.addEventListener ("pointerdown", function(event) {
      const world = self.vp_getWorld ? self.vp_getWorld() : null;
      if (world && world.vp_selection && self.vp_canvasNodeId)
      {
        if (world.vp_selection.onHeaderPointerDown(self, event))
          event.stopPropagation();
      }
    });

    node.addEventListener ("mousedown", function (event) {
      if (event.button != 0)
        return;
      const world = self.vp_getWorld ? self.vp_getWorld() : null;
      if (world && world.vp_selection && self.vp_canvasNodeId)
      {
        event.stopPropagation();
        return;
      }
      self.vp_startMoving_fromEvent (event);
    });

    node.addEventListener ("dblclick", function(event) {
      const world = self.vp_getWorld ? self.vp_getWorld() : null;
      if (world && world.vp_selection && self.vp_canvasNodeId)
      {
        if (!event.target.closest("button, .Window_btn, [data-vp-source-surface], a, input, textarea, [contenteditable='true']"))
        {
          world.vp_selection.selectConnectedComponent(self.vp_canvasNodeId);
          event.stopPropagation();
          event.preventDefault();
        }
      }
    });

    return node;
  }



  _createTitle = function(expandible)
  {
    self.vp_title = document.createElement ("span");

    let topRow = _create_title_area();

    topRow.append (self.vp_title);
    self._vp_btn_comments = _create_btn_comments (self);
    topRow.append (self._vp_btn_comments);
    topRow.append (_create_btn_close (self));

    expandible.vp_appendTitle (topRow);
  }



  _create_content_area = function()
  {
    let node = document.createElement ("div");
    node.classList.add ("Window_Clientarea");

    return node;
  }



  _create_btn_close = function (self)
  {
    let node = document.createElement("div");
    node.classList.add("Window_Titlebarelement");
    node.classList.add("Window_btn");
    node.classList.add("Window_btnClose");
    node.innerHTML = "×";


    // prevent window moving to activate
    node.addEventListener ("mousedown",e => {
      e.stopPropagation ();
    });

    node.addEventListener ("click",e => {
      if (typeof self.vp_requestClose === "function") {
        self.vp_requestClose();
      } else {
        self.vp_delete();
      }
    });
    return node;
  }

  _create_btn_comments = function (self)
  {
    let node = document.createElement("div");
    node.classList.add("Window_Titlebarelement");
    node.classList.add("Window_btn");
    node.classList.add("Window_btnComments");
    node.textContent = "//";
    node.setAttribute("role", "button");
    node.setAttribute("aria-pressed", "false");
    node.title = "Show comments and docstrings";

    node.addEventListener ("mousedown", e => {
      e.stopPropagation();
    });

    node.addEventListener ("click", e => {
      e.stopPropagation();
      if (node.getAttribute("aria-disabled") === "true")
      {
        const world = self.vp_getWorld ? self.vp_getWorld() : null;
        if (world && world.vp_controls && self._vp_commentHidingError)
          world.vp_controls.setStatus("Comment hiding unavailable: " + self._vp_commentHidingError);
        return;
      }
      if (typeof self.vp_setCommentsVisible === "function")
      {
        self.vp_setCommentsVisible(!self.vp_commentsVisible);
      }
    });
    return node;
  };

  // --------------------------------------------------------------------------

  /**
   *  @return: Owning top level Window of `domElem`, if available;
   *           `domElem`, if it's a TopLevel window
   *           null, if there is none
   **/
  self.getTopLevelWindow = function(domElem){
    let parent = domElem;
    for (let i = 0; i<50; ++i){ // infinity loop with emergency-stop
      if (null == parent) {
        console.error ("getTopLevelWindow: This should never happen. Maybe windows are being created without a `Window` class");
        break;
      } else if (parent.classList.contains ("Window")){
        return parent;
      }
      parent = parent.parentNode;
    }
    return parent;
  }


  // --------------------------------------------------------------------------

  self.constructor();
  return self;
});


// ============================================================================

