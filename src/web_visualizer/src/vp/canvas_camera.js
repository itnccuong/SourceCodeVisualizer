/**
 * CanvasCamera manages camera state, coordinates between screen and world,
 * fitAll calculations, and camera change notifications.
 */
class CanvasCamera
{
  static MIN_SCALE = 0.2;
  static MAX_SCALE = 3.0;

  constructor(world, navigationArea, graph)
  {
    this._world = world;
    this._navArea = navigationArea;
    this._graph = graph;
  }

  frameBounds(frame)
  {
    const scale = this._world.vp_scale || 1;
    const worldRect = this._world.getBoundingClientRect();
    const r = frame.getBoundingClientRect();
    const x = (r.left - worldRect.left) / scale;
    const y = (r.top - worldRect.top) / scale;
    const width = r.width / scale;
    const height = r.height / scale;
    return {
      x, y, width, height,
      right: x + width,
      bottom: y + height
    };
  }

  viewportBounds()
  {
    const scale = this._world.vp_scale || 1;
    const worldRect = this._world.getBoundingClientRect();
    const navRect = this._navArea.getBoundingClientRect();
    const x = (navRect.left - worldRect.left) / scale;
    const y = (navRect.top - worldRect.top) / scale;
    const width = navRect.width / scale;
    const height = navRect.height / scale;
    return {
      x, y, width, height,
      right: x + width,
      bottom: y + height
    };
  }

  getState()
  {
    const scale = this._world.vp_scale || 1;
    const navRect = this._navArea.getBoundingClientRect();
    const worldRect = this._world.getBoundingClientRect();
    const viewportCenterScreenX = navRect.left + navRect.width / 2;
    const viewportCenterScreenY = navRect.top + navRect.height / 2;
    const centerX = (viewportCenterScreenX - worldRect.left) / scale;
    const centerY = (viewportCenterScreenY - worldRect.top) / scale;
    return { centerX, centerY, scale };
  }

  setState({centerX, centerY, scale})
  {
    scale = Math.max(CanvasCamera.MIN_SCALE, Math.min(CanvasCamera.MAX_SCALE, scale));
    this._world.vp_scale = scale;
    node_scale(this._world, scale);

    const newWorldRect = this._world.getBoundingClientRect();
    const navRect = this._navArea.getBoundingClientRect();
    const targetCenterScreenX = navRect.left + navRect.width / 2;
    const targetCenterScreenY = navRect.top + navRect.height / 2;
    const currentCenterScreenX = newWorldRect.left + centerX * scale;
    const currentCenterScreenY = newWorldRect.top + centerY * scale;
    const currentLeft = parseFloat(this._world.style.left) || 0;
    const currentTop = parseFloat(this._world.style.top) || 0;
    this._world.style.left = (currentLeft + targetCenterScreenX - currentCenterScreenX) + "px";
    this._world.style.top = (currentTop + targetCenterScreenY - currentCenterScreenY) + "px";

    this.notifyChanged();
  }

  fitAll(insets = {top: 48, bottom: 144, left: 24, right: 24})
  {
    if (!this._graph || this._graph.nodes.size === 0)
      return { status: "empty" };

    const navRect = this._navArea.getBoundingClientRect();
    if (navRect.width <= 0 || navRect.height <= 0)
      return { status: "empty" };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;

    for (const [id, node] of this._graph.nodes)
    {
      if (node.window && node.window.isConnected)
      {
        const b = this.frameBounds(node.window);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.right);
        maxY = Math.max(maxY, b.bottom);
        count++;
      }
    }

    if (count === 0)
      return { status: "empty" };

    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;
    if (boundsWidth <= 0 || boundsHeight <= 0)
      return { status: "empty" };

    const availableWidth = navRect.width - (insets.left + insets.right);
    const availableHeight = navRect.height - (insets.top + insets.bottom);
    if (availableWidth <= 0 || availableHeight <= 0)
      return { status: "empty" };

    const idealScale = Math.min(availableWidth / boundsWidth, availableHeight / boundsHeight);
    const scale = Math.max(CanvasCamera.MIN_SCALE, Math.min(CanvasCamera.MAX_SCALE, idealScale));
    const exceedsMinimum = (idealScale < CanvasCamera.MIN_SCALE);

    const boundsCenterX = (minX + maxX) / 2;
    const boundsCenterY = (minY + maxY) / 2;
    const availableCenterScreenX = navRect.left + insets.left + availableWidth / 2;
    const availableCenterScreenY = navRect.top + insets.top + availableHeight / 2;

    if (typeof WindowPositioner !== "undefined" && WindowPositioner.cancelReveal)
      WindowPositioner.cancelReveal(this._world);

    this._world.vp_scale = scale;
    node_scale(this._world, scale);

    const newWorldRect = this._world.getBoundingClientRect();
    const currentCenterScreenX = newWorldRect.left + boundsCenterX * scale;
    const currentCenterScreenY = newWorldRect.top + boundsCenterY * scale;
    const currentLeft = parseFloat(this._world.style.left) || 0;
    const currentTop = parseFloat(this._world.style.top) || 0;
    this._world.style.left = (currentLeft + availableCenterScreenX - currentCenterScreenX) + "px";
    this._world.style.top = (currentTop + availableCenterScreenY - currentCenterScreenY) + "px";

    this.notifyChanged();
    return { status: "ok", exceedsMinimum };
  }

  notifyChanged()
  {
    if (this._world)
      this._world.dispatchEvent(new Event("vp_cameraChanged"));
  }
}
