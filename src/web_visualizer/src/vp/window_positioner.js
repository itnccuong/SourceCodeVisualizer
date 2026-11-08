class Direction
{
  static LEFT = "W";
  static RIGHT = "O";
}

// Geometry stays in world pixels until the final viewport reveal.
const WindowPositioner = (function()
{
  const activeReveals = new WeakMap();
  const cancelReveal = function(world)
  {
    const cancel = activeReveals.get(world);
    if (cancel) cancel();
  };

  const animateReveal = function(world, managedWindow, dx, dy)
  {
    const navigationArea = world.parentElement;
    const wheelGesture = world._vp_wheelGesture;
    if (_Mover.currentlyManipulatedWindow || world._vp_gestureActive
      || (wheelGesture && performance.now() - wheelGesture.lastTime <= 180))
      return;
    const startX = parseFloat(world.style.left) || 0;
    const startY = parseFloat(world.style.top) || 0;
    const motion = window.matchMedia ("(prefers-reduced-motion: reduce)");
    if (motion.matches)
    {
      world.style.left = startX + dx + "px";
      world.style.top = startY + dy + "px";
      return;
    }

    const startScale = world.vp_scale;
    const startTransform = world.style.transform;
    let expectedLeft = world.style.left;
    let expectedTop = world.style.top;
    let frame = null;
    let startedAt = null;
    const inputEvents = ["pointerdown", "mousedown", "touchstart", "wheel", "keydown"];
    const cancel = function()
    {
      if (frame !== null) cancelAnimationFrame (frame);
      frame = null;
      inputEvents.forEach (type => navigationArea.removeEventListener (type, cancel, true));
      window.removeEventListener ("blur", cancel);
      document.removeEventListener ("pointermove", interruptDrag, true);
      window.removeEventListener ("resize", cancel);
      document.removeEventListener ("visibilitychange", cancel);
      motion.removeEventListener ("change", cancel);
      managedWindow.removeEventListener ("vp_beforeDelete", cancel);
      activeReveals.delete(world);
    };
    const interruptDrag = function(event)
    {
      if (event.buttons !== 0) cancel();
    };
    activeReveals.set(world, cancel);
    // Capture runs before native pan/zoom/drag, without consuming any input.
    inputEvents.forEach (type =>
      navigationArea.addEventListener (type, cancel, {capture: true, passive: true}));
    window.addEventListener ("blur", cancel);
    window.addEventListener ("resize", cancel);
    document.addEventListener ("pointermove", interruptDrag, {capture: true, passive: true});
    document.addEventListener ("visibilitychange", cancel);
    motion.addEventListener ("change", cancel);
    managedWindow.addEventListener ("vp_beforeDelete", cancel);

    const step = function()
    {
      // Also yield to programmatic movement, scale changes and detached targets.
      if (!world.isConnected || !world.contains(managedWindow)
        || _Mover.currentlyManipulatedWindow || world._vp_gestureActive
        || world.vp_scale !== startScale || world.style.transform !== startTransform
        || world.style.left !== expectedLeft || world.style.top !== expectedTop)
      {
        cancel();
        return;
      }
      // Start on the first rendered frame, not while the response is still
      // doing layout. A delayed first frame must not consume the transition.
      const now = performance.now();
      if (startedAt === null) startedAt = now;
      const progress = Math.min(1, Math.max(0, (now - startedAt) / 450));
      const eased = progress * progress * (3 - 2 * progress);
      world.style.left = startX + dx * eased + "px";
      world.style.top = startY + dy * eased + "px";
      expectedLeft = world.style.left;
      expectedTop = world.style.top;
      world.dispatchEvent(new Event("vp_cameraChanged"));
      // Nodes and their connections share this translation; no local geometry changes.
      if (progress === 1) cancel();
      else frame = requestAnimationFrame (step);
    };
    frame = requestAnimationFrame (step);
  };

  const bounds = function(element, world)
  {
    const rect = element.getBoundingClientRect();
    const origin = world.getBoundingClientRect();
    return {
      x: (rect.left - origin.left) / world.vp_scale,
      y: (rect.top - origin.top) / world.vp_scale,
      width: element.offsetWidth,
      height: element.offsetHeight
    };
  };

  return class WindowPositioner
  {
    static cancelReveal(world)
    {
      cancelReveal(world);
    }
    constructor(parentOfTarget, domAnchor_nullable, anchorOffsetLocation = Direction.RIGHT)
    {
      // A newer response supersedes the old reveal at its current subpixel position.
      cancelReveal(parentOfTarget);
      this.world = parentOfTarget;
      this.anchor = domAnchor_nullable;
      this.direction = anchorOffsetLocation;
      this.nextBatchY = null;
      const sourceFrame = this.anchor && this.anchor.closest(".Window_OuterFrame");
      if (sourceFrame && sourceFrame.vp_finishEntrance)
        sourceFrame.vp_finishEntrance();
    }

    placeWindow(managedWindow)
    {
      const world = this.world;
      const width = managedWindow.offsetWidth;
      const height = managedWindow.offsetHeight;
      let x;
      let y;
      if (this.anchor && world.contains(this.anchor))
      {
        const source = bounds(this.anchor.closest(".Window_OuterFrame") || this.anchor, world);
        const anchor = bounds(this.anchor, world);
        x = this.direction === Direction.LEFT
          ? source.x - 50 - width : source.x + source.width + 50;
        y = Math.max(source.y, Math.min(source.y + source.height, anchor.y));
      } else
      {
        const viewport = world.parentElement.getBoundingClientRect();
        const origin = world.getBoundingClientRect();
        x = (viewport.left - origin.left) / world.vp_scale + 50;
        y = (viewport.top - origin.top) / world.vp_scale + 100;
      }
      if (this.nextBatchY !== null) y = Math.max(y, this.nextBatchY);

      const existing = Array.from(world.children)
        .filter(element => element !== managedWindow
          && element.classList.contains("Window_OuterFrame")
          && element.getClientRects().length > 0
          && getComputedStyle(element).visibility !== "hidden")
        .map(element => bounds(element, world));
      // Every collision advances below at least one frame; existing nodes never move.
      while (true)
      {
        let nextY = y;
        for (const frame of existing)
        {
          if (x < frame.x + frame.width + 24 && x + width + 24 > frame.x
            && y < frame.y + frame.height + 24 && y + height + 24 > frame.y)
            nextY = Math.max(nextY, frame.y + frame.height + 24);
        }
        if (nextY === y) break;
        y = nextY;
      }
      this.nextBatchY = y + height + 24;
      return {x, y};
    }

    revealWindow(managedWindow)
    {
      cancelReveal(this.world);
      if (!this.world.contains(managedWindow)) return;
      const viewport = this.world.parentElement.getBoundingClientRect();
      const rect = managedWindow.getBoundingClientRect();
      const delta = function(start, end, availableStart, availableEnd)
      {
        if (end - start > availableEnd - availableStart || start < availableStart)
          return availableStart - start;
        return end > availableEnd ? availableEnd - end : 0;
      };
      const dx = delta(rect.left, rect.right, viewport.left + 20, viewport.right - 20);
      const dy = delta(rect.top, rect.bottom, viewport.top + 20, viewport.bottom - 20);
      if (dx !== 0 || dy !== 0)
        animateReveal(this.world, managedWindow, dx, dy);
    }
  };
})();
