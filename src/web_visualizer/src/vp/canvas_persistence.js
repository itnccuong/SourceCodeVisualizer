require ("../vpw/vpw_unavailable_window.js");

/**
 * CanvasPersistence handles serialization of current canvas state into CanvasFileV1
 * and reconstruction of ResolvedCanvas into the active DOM and graph registry.
 */
class CanvasPersistence
{
  static _copyReference(reference)
  {
    const symbol = reference.symbol;
    return {
      type: reference.type,
      uri: reference.uri,
      language: reference.language,
      documentHash: reference.documentHash,
      symbol: symbol === null ? null : {
        name: symbol.name,
        kind: symbol.kind,
        path: symbol.path === null ? null : symbol.path.map(entry => ({ name: entry.name, kind: entry.kind })),
        selection: SourceNavigation._copyRange(symbol.selection),
        declaration: SourceNavigation._copyRange(symbol.declaration)
      }
    };
  }

  static serialize(graph, camera)
  {
    const viewport = camera.getState();
    const nodes = [];

    for (const [id, node] of graph.nodes)
    {
      const win = node.window;
      if (!win || !win.isConnected) continue;

      const frame = win.vp_getFrameState();
      // offsetLeft/Top round subpixel group movement; CSS positions retain it.
      const x = parseFloat(win.style.left), y = parseFloat(win.style.top);
      if (Number.isFinite(x)) frame.x = x;
      if (Number.isFinite(y)) frame.y = y;
      const independentRoot = !!node.independentRoot;

      let content;
      let commentsVisible = null;

      const model = win.viewEntity?.vp_model;
      if (model && model.sourceReference)
      {
        content = {
          type: 'source',
          reference: this._copyReference(model.sourceReference)
        };
        commentsVisible = win.vp_commentsVisible ?? false;
      }
      else if (win.classList.contains("VpwMessageWindow"))
      {
        const diagnostic = win._vp_savedDiagnostic || {
          severity: model?.type || "Info",
          title: model?.title ?? win.vp_title?.textContent ?? "",
          message: model?.message ?? win.vp_window_clientarea?.textContent ?? ""
        };
        content = {
          type: 'diagnostic',
          severity: diagnostic.severity,
          title: diagnostic.title,
          message: diagnostic.message
        };
        commentsVisible = null;
      }
      else if (win._vp_savedReference)
      {
        content = {
          type: 'source',
          reference: this._copyReference(win._vp_savedReference)
        };
        commentsVisible = win.vp_commentsVisible ?? false;
      }
      else
      {
        if (win.vp_isCodeOutline)
          throw new Error("Source reference unavailable; reopen this source before saving the canvas");
        content = {
          type: 'diagnostic',
          severity: 'Info',
          title: win.vp_title?.textContent || '',
          message: win.vp_window_clientarea?.textContent || ''
        };
        commentsVisible = null;
      }

      nodes.push({
        id,
        independentRoot,
        content,
        frame,
        commentsVisible
      });
    }

    const edges = [];
    const nodeIds = new Set(nodes.map(node => node.id));
    for (const [id, edge] of graph.edges)
    {
      const conn = edge.connection;
      if (!conn || conn._vp_isDeleted) continue;

      if (!nodeIds.has(edge.sourceId) || (edge.targetId !== null && !nodeIds.has(edge.targetId)))
        throw new Error("Canvas connection refers to a missing frame");
      let dock;
      if (edge.targetId !== null)
      {
        const targetWin = graph.nodes.get(edge.targetId)?.window;
        const targetTop = targetWin?.offsetTop ?? 0;
        const y = (conn._vp_yPositionAtDockingTime !== undefined)
          ? conn._vp_yPositionAtDockingTime
          : (conn.offsetTop - targetTop);
        dock = { kind: 'node', y: Math.max(0, y) };
      }
      else
      {
        dock = {
          kind: 'free',
          x: Number.isFinite(parseFloat(conn.style.left)) ? parseFloat(conn.style.left) : conn.offsetLeft,
          y: Number.isFinite(parseFloat(conn.style.top)) ? parseFloat(conn.style.top) : conn.offsetTop
        };
      }

      let origin;
      if (conn._vp_savedOrigin)
      {
        origin = conn._vp_savedOrigin;
      }
      else if (conn._vp_sourceAnchor)
      {
        origin = SourceNavigation.describe(conn._vp_sourceAnchor);
        if (!origin) throw new Error("Saved source location is unavailable");
      }
      else if (conn._vp_domSource?.classList?.contains("btnOpenDefinition"))
      {
        const btn = conn._vp_domSource;
        const outlineEntity = btn.vp_model;
        const ownerWindow = btn.vp_getParentWindow || btn.closest(".Window_OuterFrame");
        const docHash = ownerWindow?.viewEntity?.vp_model?.sourceReference?.documentHash || "";
        const r = SourceNavigation._copyRange(outlineEntity?.displayTextRange || outlineEntity?.totalRange);
        origin = {
          kind: 'declaration',
          uri: outlineEntity?.uri || ownerWindow?.viewEntity?.vp_model?.uri || "",
          documentHash: docHash,
          range: r
        };
      }
      else
      {
        origin = { kind: 'frame' };
      }

      edges.push({
        id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        origin: origin || { kind: 'frame' },
        dock
      });
    }

    return {
      format: 'source-code-visualizer-canvas',
      version: 1,
      viewport,
      nodes,
      edges
    };
  }

  static restore(resolvedCanvas, world, graph, camera)
  {
    if (!resolvedCanvas || !resolvedCanvas.canvas)
      throw new Error("Missing resolved canvas");
    if (graph.nodes.size || graph.edges.size)
      throw new Error("Canvas restoration requires a new, empty canvas");

    // 1. Construct all node frames
    const resolvedNodesMap = new Map();
    if (Array.isArray(resolvedCanvas.nodes))
    {
      for (const rn of resolvedCanvas.nodes)
        resolvedNodesMap.set(rn.id, rn);
    }

    for (const nodeData of resolvedCanvas.canvas.nodes)
    {
      let frameWindow = null;
      if (nodeData.content.type === 'diagnostic')
      {
        const title = "Saved diagnostic: " + (nodeData.content.title || "");
        const viewEntity = new SViewEntity({
          type: nodeData.content.severity,
          title,
          message: nodeData.content.message
        });
        frameWindow = new VpwMessageWindow(viewEntity);
        frameWindow._vp_savedDiagnostic = {
          severity: nodeData.content.severity,
          title: nodeData.content.title,
          message: nodeData.content.message
        };
        world.vp_widget_add(frameWindow);
        graph.addNode(frameWindow, nodeData.independentRoot, nodeData.id);
        frameWindow.vp_restoreFrameState(nodeData.frame);
      }
      else
      {
        const resolved = resolvedNodesMap.get(nodeData.id);
        if (resolved && resolved.outline)
        {
          const viewEntity = new SViewEntity(resolved.outline);
          frameWindow = VpwOutlineWindow(viewEntity);
          world.vp_widget_add(frameWindow);
          graph.addNode(frameWindow, nodeData.independentRoot, nodeData.id);
          if (nodeData.commentsVisible !== null && typeof frameWindow.vp_setCommentsVisible === "function")
            frameWindow.vp_setCommentsVisible(nodeData.commentsVisible);
          frameWindow.vp_restoreFrameState(nodeData.frame);
        }
        else
        {
          const reason = resolved?.unavailable || "Source could not be resolved";
          frameWindow = VpwUnavailableWindow(nodeData, reason);
          frameWindow.vp_commentsVisible = nodeData.commentsVisible;
          world.vp_widget_add(frameWindow);
          graph.addNode(frameWindow, nodeData.independentRoot, nodeData.id);
          frameWindow.vp_restoreFrameState(nodeData.frame);
        }
      }
    }

    // 2. Restore edges
    for (const edgeData of resolvedCanvas.canvas.edges)
    {
      const sourceNode = graph.nodes.get(edgeData.sourceId);
      const targetNode = edgeData.targetId ? graph.nodes.get(edgeData.targetId) : null;
      if (!sourceNode || !sourceNode.window) continue;

      let sourceElement = sourceNode.window;
      let sourceAnchor = null;
      let fallbackReason = null;

      if (edgeData.origin.kind === 'declaration')
      {
        const matchingButtons = [];
        const buttons = sourceNode.window.querySelectorAll(".btnOpenDefinition");
        const origRange = edgeData.origin.range;
        const currentHash = sourceNode.window.viewEntity?.vp_model?.sourceReference?.documentHash;
        const hashMatches = (currentHash === edgeData.origin.documentHash);

        if (hashMatches)
        {
          for (const btn of buttons)
          {
            const btnRange = SourceNavigation._copyRange(btn.vp_model?.displayTextRange || btn.vp_model?.totalRange);
            if (btnRange && origRange && btnRange[0].line === origRange[0].line && btnRange[0].character === origRange[0].character
                && btnRange[1].line === origRange[1].line && btnRange[1].character === origRange[1].character)
            {
              matchingButtons.push(btn);
            }
          }
        }

        const foundBtn = matchingButtons.length === 1 ? matchingButtons[0] : null;
        if (foundBtn)
        {
          sourceElement = foundBtn;
        }
        else
        {
          sourceElement = sourceNode.window;
          fallbackReason = hashMatches ? "Source unavailable" : "Saved source location changed";
        }
      }
      else if (edgeData.origin.kind === 'source')
      {
        const restored = SourceNavigation.restore(sourceNode.window, edgeData.origin);
        if (restored && restored.status === 'exact' && restored.anchor)
        {
          sourceElement = restored.anchor.surface;
          sourceAnchor = restored.anchor;
        }
        else
        {
          sourceElement = sourceNode.window;
          fallbackReason = restored?.status === 'changed' ? "Saved source location changed" : "Source unavailable";
        }
      }

      // Start undocked: constructing against the target starts a 500ms animation
      // which otherwise keeps overwriting the immediate saved docking position.
      Connectable.makeConnectable(sourceElement);
      const connection = new VpwEntityConnection(sourceElement, world, sourceAnchor);
      connection._vp_savedOrigin = edgeData.origin;
      if (fallbackReason)
        connection.title = fallbackReason;

      if (edgeData.dock.kind === 'node' && targetNode && targetNode.window)
      {
        connection.vp_dock(targetNode.window, { animate: false, y: edgeData.dock.y });
      }
      else if (edgeData.dock.kind === 'free')
      {
        connection.vp_dock(world, { animate: false });
        connection.vp_setXY(edgeData.dock.x, edgeData.dock.y);
      }
      graph.addEdge(connection, edgeData.sourceId, edgeData.targetId, edgeData.id);
    }

    // 3. Restore viewport
    if (resolvedCanvas.canvas.viewport)
    {
      camera.setState(resolvedCanvas.canvas.viewport);
    }

    // 4. Clear initial selection/focus
    graph.clearSelection();

    // 5. Publish one graph/UI refresh
    graph.notifyChanged();
  }
}

if (typeof window !== "undefined")
  window.CanvasPersistence = CanvasPersistence;
