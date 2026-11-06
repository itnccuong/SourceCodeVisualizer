
/**
 * What is self?
 *   A VpwOutlineWindow can be understood as a Window
 *    with a ViewEntity
 *
 * Runs Window.New() and enhances the resulting object:
 *  - adds member `viewEntity`
 *   - fill title      (of window)
 *  - fill clientarea (of window)
 *  - function vp_setXY()
 *
 *   - Set style and position according to viewEntity
 *
 **/
const VpwViewEntityWindow = (function(viewEntity)
{
  let self = new VgfWindowTitled ();
  const innerFrame = self.querySelector (".Window_InnerFrame");
  const entranceInterrupts = ["pointerdown", "mousedown", "wheel",
    "vp_windowBeforeStartMoving", "vp_beforeDelete"];
  let entranceStarted = false;
  let entranceFrame = null;

  self.vp_finishEntrance = function()
  {
    if (entranceFrame !== null)
      cancelAnimationFrame (entranceFrame);
    entranceFrame = null;
    const wasOpening = self.classList.contains ("VpwViewEntityWindow_opening");
    self.classList.remove ("VpwViewEntityWindow_opening");
    entranceInterrupts.forEach (type =>
      self.removeEventListener (type, self.vp_finishEntrance, true));
    self.removeEventListener ("animationend", finishAnimation);
    self.removeEventListener ("animationcancel", finishAnimation);
    if (wasOpening && self.isConnected)
      self.dispatchEvent (new Event ("vp_windowMoved"));
  };

  const finishAnimation = function(event)
  {
    if (event.target === innerFrame
      && event.animationName === "VpwViewEntityWindowContentOpen")
      self.vp_finishEntrance();
  };

  self.vp_animateEntrance = function()
  {
    if (entranceStarted || !self.isConnected) return;
    entranceStarted = true;
    if (window.matchMedia ("(prefers-reduced-motion: reduce)").matches) return;

    self.classList.add ("VpwViewEntityWindow_opening");
    entranceInterrupts.forEach (type =>
      self.addEventListener (type, self.vp_finishEntrance, {capture: true, passive: true}));
    self.addEventListener ("animationend", finishAnimation);
    self.addEventListener ("animationcancel", finishAnimation);
    const updateConnections = function()
    {
      if (!self.isConnected)
      {
        self.vp_finishEntrance();
        return;
      }
      // Source rows move with the inner frame; dockers remain on the outer one.
      self.dispatchEvent (new Event ("vp_windowMoved"));
      if (self.classList.contains ("VpwViewEntityWindow_opening"))
        entranceFrame = requestAnimationFrame (updateConnections);
    };
    entranceFrame = requestAnimationFrame (updateConnections);
  };

  /**
   *  @brief: Creates a new viewEntityRepresentation with
   *             .vp_title
   *             .vp_window_clientarea
   **/
  let _constructor = function() {
    self.classList.add ("VpwViewEntityWindow");
    self.viewEntity = viewEntity;

    // set position
    self.vp_setXY(viewEntity.x, viewEntity.y);

    // set roll-up status
    if (viewEntity.rolledUp == true)
      Window.btnRollup_onClick(self);

    return self;
  }

  _constructor ();
  return self;
});
