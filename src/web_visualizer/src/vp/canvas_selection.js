/**
 * CanvasSelection manages group selection, rectangle marquee, group dragging,
 * canvas panning, and double-click connected-component selection.
 */
class CanvasSelection
{
  constructor(graph, world, navigationArea)
  {
    this._graph = graph;
    this._world = world;
    this._navArea = navigationArea;

    this._gesture = null;
    this._spacePressed = false;
    this._marqueeElement = null;

    this._initListeners();
  }

  _isEditingInput()
  {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName ? active.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea") return true;
    if (active.isContentEditable || active.getAttribute("contenteditable") === "true") return true;
    if (active.closest && active.closest(".VpwCodeEditor, [contenteditable='true']")) return true;
    return false;
  }

  _initListeners()
  {
    const onKeyDown = (e) => {
      if (e.code === "Space")
      {
        if (!this._isEditingInput())
        {
          this._spacePressed = true;
          // Prevent page scrolling on Space when canvas has focus
          if (e.target === document.body || this._navArea.contains(e.target))
            e.preventDefault();
        }
      }
      else if (e.key === "Escape")
      {
        if (this._gesture && this._gesture.type === "marquee")
        {
          this._cancelMarquee();
        }
        else if (!this._isEditingInput())
        {
          this._graph.clearSelection();
        }
      }
    };

    const onKeyUp = (e) => {
      if (e.code === "Space")
        this._spacePressed = false;
    };

    const onBlur = () => {
      this._spacePressed = false;
      this._endGesture();
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);

    // Empty canvas pointerdown
    this._navArea.addEventListener("pointerdown", (e) => {
      this._onNavAreaPointerDown(e);
    });

    this._cleanupWindowListeners = () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }

  dispose()
  {
    this._endGesture();
    if (this._cleanupWindowListeners)
      this._cleanupWindowListeners();
  }

  _onNavAreaPointerDown(event)
  {
    if (event.isPrimary === false) return;

    // Check if clicking empty canvas (not inside a window, connection, line, or control)
    const target = event.target;
    if (target.closest(".Window, .VgfLine, .VpwButtonMovableDockable, .VpwButtonMovable, .VgfControlsToolbar, .VgfMinimap, .VgfNodesDropdown, .VgfSelectionMarquee"))
      return;

    const isPan = (event.button === 1) || (event.button === 0 && this._spacePressed);
    const isPrimary = (event.button === 0 && !this._spacePressed);

    if (!isPan && !isPrimary) return;

    event.preventDefault();

    if (isPan)
    {
      this._startPanGesture(event, this._navArea);
    }
    else
    {
      this._startMarqueeGesture(event);
    }
  }

  onHeaderPointerDown(frame, event)
  {
    if (event.isPrimary === false) return false;

    // Check excluded elements inside header
    const target = event.target;
    if (target.closest("button, .Window_btn, [data-vp-source-surface], a, input, textarea, [contenteditable='true'], .VgfControlsToolbar"))
      return false;

    const isPan = (event.button === 1) || (event.button === 0 && this._spacePressed);
    const isPrimary = (event.button === 0 && !this._spacePressed);

    if (!isPan && !isPrimary) return false;

    event.preventDefault();

    const captureElement = event.currentTarget || frame;

    if (isPan)
    {
      this._startPanGesture(event, captureElement);
      return true;
    }

    this._startGroupDragGesture(frame, event, captureElement);
    return true;
  }

  selectConnectedComponent(nodeId)
  {
    const component = this._graph.connectedComponent(nodeId);
    this._graph.setSelection(component);
  }

  _startPanGesture(event, captureElement)
  {
    this._endGesture();
    this._world._vp_gestureActive = true;

    const startX = event.clientX;
    const startY = event.clientY;
    const initialLeft = parseFloat(this._world.style.left) || 0;
    const initialTop = parseFloat(this._world.style.top) || 0;
    const pointerId = event.pointerId;

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this._world.style.left = (initialLeft + dx) + "px";
      this._world.style.top = (initialTop + dy) + "px";
      this._world.dispatchEvent(new Event("vp_cameraChanged"));
    };

    const finish = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      captureElement.removeEventListener("pointermove", onPointerMove);
      captureElement.removeEventListener("pointerup", finish);
      captureElement.removeEventListener("pointercancel", finish);
      captureElement.removeEventListener("lostpointercapture", finish);
      if (captureElement.hasPointerCapture && captureElement.hasPointerCapture(pointerId))
      {
        try { captureElement.releasePointerCapture(pointerId); } catch (_) {}
      }
      this._world._vp_gestureActive = false;
      this._gesture = null;
    };

    captureElement.addEventListener("pointermove", onPointerMove);
    captureElement.addEventListener("pointerup", finish);
    captureElement.addEventListener("pointercancel", finish);
    captureElement.addEventListener("lostpointercapture", finish);
    if (captureElement.setPointerCapture)
    {
      try { captureElement.setPointerCapture(pointerId); } catch (_) {}
    }

    this._gesture = { type: "pan", finish };
  }

  _startGroupDragGesture(frame, event, captureElement)
  {
    this._endGesture();

    const nodeId = frame.vp_canvasNodeId;
    // If dragging an unselected frame's header: replace selection with that frame
    if (!this._graph.selection.has(nodeId))
    {
      this._graph.setSelection([nodeId]);
    }

    frame.vp_focus();

    const startX = event.clientX;
    const startY = event.clientY;
    const startScale = this._world.vp_scale || 1;
    const pointerId = event.pointerId;

    // Snapshot initial positions of all selected frames
    const snapshots = [];
    for (const selId of this._graph.selection)
    {
      const node = this._graph.nodes.get(selId);
      if (node && node.window && node.window.isConnected)
      {
        snapshots.push({
          frame: node.window,
          startX: node.window.offsetLeft,
          startY: node.window.offsetTop
        });
      }
    }

    let dragging = false;

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      const screenDx = e.clientX - startX;
      const screenDy = e.clientY - startY;

      if (!dragging)
      {
        if (Math.hypot(screenDx, screenDy) >= 3)
        {
          dragging = true;
          this._world._vp_gestureActive = true;
        }
        else
        {
          return;
        }
      }

      const worldDx = screenDx / startScale;
      const worldDy = screenDy / startScale;

      for (const item of snapshots)
      {
        item.frame.vp_setXY(item.startX + worldDx, item.startY + worldDy);
        item.frame.dispatchEvent(new Event("vp_windowMoved"));
      }
    };

    const finish = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      captureElement.removeEventListener("pointermove", onPointerMove);
      captureElement.removeEventListener("pointerup", finish);
      captureElement.removeEventListener("pointercancel", finish);
      captureElement.removeEventListener("lostpointercapture", finish);
      if (captureElement.hasPointerCapture && captureElement.hasPointerCapture(pointerId))
      {
        try { captureElement.releasePointerCapture(pointerId); } catch (_) {}
      }
      this._world._vp_gestureActive = false;
      this._gesture = null;
    };

    captureElement.addEventListener("pointermove", onPointerMove);
    captureElement.addEventListener("pointerup", finish);
    captureElement.addEventListener("pointercancel", finish);
    captureElement.addEventListener("lostpointercapture", finish);
    if (captureElement.setPointerCapture)
    {
      try { captureElement.setPointerCapture(pointerId); } catch (_) {}
    }

    this._gesture = { type: "groupDrag", finish };
  }

  _startMarqueeGesture(event)
  {
    this._endGesture();

    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const prevSelection = new Set(this._graph.selection);

    let marqueeEl = null;
    let isDrag = false;

    const onPointerMove = (e) => {
      if (e.pointerId !== pointerId) return;
      const screenDx = e.clientX - startX;
      const screenDy = e.clientY - startY;

      if (!isDrag)
      {
        if (Math.hypot(screenDx, screenDy) >= 3)
        {
          isDrag = true;
          this._world._vp_gestureActive = true;
          marqueeEl = document.createElement("div");
          marqueeEl.classList.add("VgfSelectionMarquee");
          this._navArea.appendChild(marqueeEl);
          this._marqueeElement = marqueeEl;
        }
        else
        {
          return;
        }
      }

      const navRect = this._navArea.getBoundingClientRect();
      const left = Math.min(startX, e.clientX) - navRect.left;
      const top = Math.min(startY, e.clientY) - navRect.top;
      const width = Math.abs(e.clientX - startX);
      const height = Math.abs(e.clientY - startY);

      marqueeEl.style.left = left + "px";
      marqueeEl.style.top = top + "px";
      marqueeEl.style.width = width + "px";
      marqueeEl.style.height = height + "px";
    };

    const finish = (e) => {
      if (e && e.pointerId !== undefined && e.pointerId !== pointerId) return;
      this._navArea.removeEventListener("pointermove", onPointerMove);
      this._navArea.removeEventListener("pointerup", finish);
      this._navArea.removeEventListener("pointercancel", finish);
      this._navArea.removeEventListener("lostpointercapture", finish);
      if (this._navArea.hasPointerCapture && this._navArea.hasPointerCapture(pointerId))
      {
        try { this._navArea.releasePointerCapture(pointerId); } catch (_) {}
      }

      if (marqueeEl && marqueeEl.parentNode)
      {
        marqueeEl.remove();
        this._marqueeElement = null;
      }
      this._world._vp_gestureActive = false;

      if (!isDrag)
      {
        // Primary click on empty canvas: clear group selection
        this._graph.clearSelection();
      }
      else
      {
        // Select wholly enclosed frames
        const endX = (e && e.clientX !== undefined) ? e.clientX : startX;
        const endY = (e && e.clientY !== undefined) ? e.clientY : startY;
        const selLeft = Math.min(startX, endX);
        const selRight = Math.max(startX, endX);
        const selTop = Math.min(startY, endY);
        const selBottom = Math.max(startY, endY);

        const enclosedIds = [];
        for (const [id, node] of this._graph.nodes)
        {
          if (node.window && node.window.isConnected)
          {
            const r = node.window.getBoundingClientRect();
            if (r.left >= selLeft && r.right <= selRight && r.top >= selTop && r.bottom <= selBottom)
            {
              enclosedIds.push(id);
            }
          }
        }
        this._graph.setSelection(enclosedIds);
      }

      this._gesture = null;
    };

    this._navArea.addEventListener("pointermove", onPointerMove);
    this._navArea.addEventListener("pointerup", finish);
    this._navArea.addEventListener("pointercancel", finish);
    this._navArea.addEventListener("lostpointercapture", finish);
    if (this._navArea.setPointerCapture)
    {
      try { this._navArea.setPointerCapture(pointerId); } catch (_) {}
    }

    this._gesture = {
      type: "marquee",
      prevSelection,
      cancel: () => {
        this._navArea.removeEventListener("pointermove", onPointerMove);
        this._navArea.removeEventListener("pointerup", finish);
        this._navArea.removeEventListener("pointercancel", finish);
        this._navArea.removeEventListener("lostpointercapture", finish);
        if (this._navArea.hasPointerCapture && this._navArea.hasPointerCapture(pointerId))
        {
          try { this._navArea.releasePointerCapture(pointerId); } catch (_) {}
        }
        if (marqueeEl && marqueeEl.parentNode)
        {
          marqueeEl.remove();
          this._marqueeElement = null;
        }
        this._world._vp_gestureActive = false;
        this._graph.setSelection(prevSelection);
        this._gesture = null;
      },
      finish
    };
  }

  _cancelMarquee()
  {
    if (this._gesture && this._gesture.type === "marquee" && this._gesture.cancel)
    {
      this._gesture.cancel();
    }
  }

  _endGesture()
  {
    if (this._gesture && this._gesture.finish)
    {
      this._gesture.finish();
    }
  }
}
