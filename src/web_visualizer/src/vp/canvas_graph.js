/**
 * CanvasGraph owns the graph model for a canvas:
 * - nodes: Map<string, {window, independentRoot: boolean}>
 * - edges: Map<string, {connection, sourceId: string, targetId: string|null}>
 * - selection: Set<string> of selected node IDs
 */
class CanvasGraph
{
  constructor(world, controller)
  {
    this._world = world;
    this._controller = controller;

    this.nodes = new Map();
    this.edges = new Map();
    this.selection = new Set();

    this._nextNodeNum = 1;
    this._nextEdgeNum = 1;
  }

  addNode(frameWindow, independentRoot = false, id = null)
  {
    if (id !== null && id !== undefined)
    {
      const match = /^n(\d+)$/.exec(id);
      if (match)
      {
        const num = parseInt(match[1], 10);
        if (num >= this._nextNodeNum)
          this._nextNodeNum = num + 1;
      }
    }
    else
    {
      while (this.nodes.has("n" + this._nextNodeNum))
        this._nextNodeNum++;
      id = "n" + (this._nextNodeNum++);
    }

    this.nodes.set(id, {
      window: frameWindow,
      independentRoot: !!independentRoot
    });
    frameWindow.vp_canvasNodeId = id;

    frameWindow.vp_requestClose = () => {
      this.requestClose(id);
    };

    const onBeforeDelete = () => {
      if (typeof frameWindow.removeEventListener === "function")
        frameWindow.removeEventListener("vp_beforeDelete", onBeforeDelete);
      if (this.nodes.has(id))
      {
        this.selection.delete(id);
        this.nodes.delete(id);
        for (const [edgeId, edge] of Array.from(this.edges.entries()))
        {
          if (edge.sourceId === id || edge.targetId === id)
          {
            if (edge.connection && !edge.connection._vp_isDeleted && !edge.connection._vp_isDeleting)
              edge.connection.vp_delete();
            this.edges.delete(edgeId);
          }
        }
        this.notifyChanged();
      }
    };
    if (typeof frameWindow.addEventListener === "function")
      frameWindow.addEventListener("vp_beforeDelete", onBeforeDelete);

    this.notifyChanged();
    return id;
  }

  promoteToRoot(nodeId)
  {
    const node = this.nodes.get(nodeId);
    if (node && !node.independentRoot)
    {
      node.independentRoot = true;
      this.notifyChanged();
    }
  }

  /**
   * Allocate monotonic edge ID or register with explicit restored ID.
   */
  addEdge(connection, sourceId, targetId = null, id = null)
  {
    if (id !== null && id !== undefined)
    {
      const match = /^e(\d+)$/.exec(id);
      if (match)
      {
        const num = parseInt(match[1], 10);
        if (num >= this._nextEdgeNum)
          this._nextEdgeNum = num + 1;
      }
    }
    else
    {
      while (this.edges.has("e" + this._nextEdgeNum))
        this._nextEdgeNum++;
      id = "e" + (this._nextEdgeNum++);
    }

    this.edges.set(id, {
      connection: connection,
      sourceId: sourceId,
      targetId: targetId
    });
    connection._vp_canvasEdgeId = id;
    this.notifyChanged();
    return id;
  }

  setTarget(edgeId, targetId)
  {
    const edge = this.edges.get(edgeId);
    if (edge)
    {
      if (edge.targetId !== targetId)
      {
        edge.targetId = targetId;
        this.notifyChanged();
      }
    }
  }

  removeEdge(edgeId)
  {
    if (this.edges.delete(edgeId))
      this.notifyChanged();
  }

  /**
   * Undirected connected component containing nodeId.
   */
  connectedComponent(nodeId)
  {
    if (!this.nodes.has(nodeId))
      return new Set();

    const adj = new Map();
    for (const id of this.nodes.keys())
      adj.set(id, new Set());

    for (const [edgeId, edge] of this.edges)
    {
      if (edge.targetId && this.nodes.has(edge.sourceId) && this.nodes.has(edge.targetId))
      {
        adj.get(edge.sourceId).add(edge.targetId);
        adj.get(edge.targetId).add(edge.sourceId);
      }
    }

    const component = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0)
    {
      const curr = queue.shift();
      const neighbors = adj.get(curr);
      if (neighbors)
      {
        for (const nxt of neighbors)
        {
          if (!component.has(nxt))
          {
            component.add(nxt);
            queue.push(nxt);
          }
        }
      }
    }
    return component;
  }

  /**
   * R06 closeSet algorithm:
   * C = forward-reachable nodes from K, including K, through docked edges
   * seeds = remaining independent roots in C
   *       + nodes in C\{K} with an incoming edge from outside C
   * protected = forward traversal from seeds within C, excluding K and its edges
   * delete = {K} union (C minus protected)
   */
  closeSet(k)
  {
    if (!this.nodes.has(k))
      return new Set();

    const forwardAdj = new Map();
    for (const id of this.nodes.keys())
      forwardAdj.set(id, new Set());

    for (const [edgeId, edge] of this.edges)
    {
      if (edge.targetId && this.nodes.has(edge.sourceId) && this.nodes.has(edge.targetId))
      {
        forwardAdj.get(edge.sourceId).add(edge.targetId);
      }
    }

    const C = new Set([k]);
    const queue = [k];
    while (queue.length > 0)
    {
      const curr = queue.shift();
      const neighbors = forwardAdj.get(curr);
      if (neighbors)
      {
        for (const nxt of neighbors)
        {
          if (!C.has(nxt))
          {
            C.add(nxt);
            queue.push(nxt);
          }
        }
      }
    }

    const seeds = new Set();
    for (const nodeId of C)
    {
      if (nodeId === k) continue;
      const nodeInfo = this.nodes.get(nodeId);
      if (nodeInfo && nodeInfo.independentRoot)
        seeds.add(nodeId);
    }

    for (const [edgeId, edge] of this.edges)
    {
      if (edge.targetId && C.has(edge.targetId) && edge.targetId !== k)
      {
        if (!C.has(edge.sourceId))
          seeds.add(edge.targetId);
      }
    }

    const protectedNodes = new Set(seeds);
    const protQueue = Array.from(seeds);
    while (protQueue.length > 0)
    {
      const curr = protQueue.shift();
      const neighbors = forwardAdj.get(curr);
      if (neighbors)
      {
        for (const nxt of neighbors)
        {
          if (C.has(nxt) && nxt !== k && !protectedNodes.has(nxt))
          {
            protectedNodes.add(nxt);
            protQueue.push(nxt);
          }
        }
      }
    }

    const deleteSet = new Set([k]);
    for (const nodeId of C)
    {
      if (!protectedNodes.has(nodeId))
        deleteSet.add(nodeId);
    }

    return deleteSet;
  }

  requestClose(nodeId)
  {
    const toDelete = this.closeSet(nodeId);
    this.removeNodes(toDelete);
  }

  removeNodes(ids)
  {
    const idSet = (ids instanceof Set) ? ids : new Set(ids);
    if (idSet.size === 0) return;

    if (this._controller && typeof this._controller.cancelRequestsForFrames === "function")
      this._controller.cancelRequestsForFrames(idSet);

    const edgesToDelete = [];
    for (const [edgeId, edge] of this.edges)
    {
      if (idSet.has(edge.sourceId) || (edge.targetId && idSet.has(edge.targetId)))
        edgesToDelete.push(edge);
    }

    for (const edge of edgesToDelete)
    {
      if (edge.connection && !edge.connection._vp_isDeleted && !edge.connection._vp_isDeleting)
        edge.connection.vp_delete();
    }

    const framesToDelete = [];
    for (const id of idSet)
    {
      const node = this.nodes.get(id);
      if (node)
      {
        this.selection.delete(id);
        this.nodes.delete(id);
        if (node.window)
          framesToDelete.push(node.window);
      }
    }

    for (const frame of framesToDelete)
    {
      if (!frame._vp_isDeleted && !frame._vp_isDeleting)
        frame.vp_delete();
    }

    this.notifyChanged();
  }

  setSelection(ids)
  {
    const nextSet = new Set();
    const idArray = Array.from(ids);
    for (const id of idArray)
    {
      if (this.nodes.has(id))
        nextSet.add(id);
    }

    for (const id of this.selection)
    {
      if (!nextSet.has(id))
      {
        const node = this.nodes.get(id);
        if (node && node.window)
          node.window.classList.remove("VpwNode_selected");
      }
    }

    for (const id of nextSet)
    {
      const node = this.nodes.get(id);
      if (node && node.window)
        node.window.classList.add("VpwNode_selected");
    }

    this.selection = nextSet;
    this.notifyChanged();
  }

  clearSelection()
  {
    this.setSelection([]);
  }

  notifyChanged()
  {
    if (this._world)
    {
      this._world.dispatchEvent(new Event("vp_graphChanged"));
    }
  }
}
