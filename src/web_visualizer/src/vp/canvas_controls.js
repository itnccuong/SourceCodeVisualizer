/**
 * CanvasControls provides top-left toolbar (Fit all, Nodes (N), Save, Load, status),
 * nodes dropdown, and passive SVG minimap.
 */
class CanvasControls
{
  constructor(graph, world, navigationArea, camera, controller)
  {
    this._graph = graph;
    this._world = world;
    this._navArea = navigationArea;
    this._camera = camera;
    this._controller = controller;

    this._minimapRaf = null;
    this._dropdownOpen = false;

    this._initToolbar();
    this._initDropdown();
    this._initMinimap();
    this._initListeners();

    this.updateNodesList();
    this.scheduleMinimapRender();
  }

  setStatus(message, durationMs = 5000)
  {
    if (!this._statusEl) return;
    this._statusEl.textContent = message;
    clearTimeout(this._statusTimer);
    if (durationMs > 0 && message)
    {
      this._statusTimer = setTimeout(() => {
        if (this._statusEl.textContent === message)
          this._statusEl.textContent = "";
      }, durationMs);
    }
  }

  setOperationPending(operation, pending)
  {
    const button = operation === "save" ? this._btnSave : operation === "load" ? this._btnLoad : null;
    if (button)
      button.disabled = !!pending;
  }

  _initToolbar()
  {
    const toolbar = document.createElement("div");
    toolbar.classList.add("VgfControlsToolbar");

    // Fit all button
    this._btnFitAll = document.createElement("button");
    this._btnFitAll.type = "button";
    this._btnFitAll.classList.add("VgfControlsButton");
    this._btnFitAll.textContent = "Fit all";
    this._btnFitAll.addEventListener("click", () => {
      const res = this._camera.fitAll();
      if (res && res.exceedsMinimum)
        this.setStatus("Content exceeds minimum zoom; some nodes remain outside the viewport.");
    });
    toolbar.appendChild(this._btnFitAll);

    // Nodes button
    this._btnNodes = document.createElement("button");
    this._btnNodes.type = "button";
    this._btnNodes.classList.add("VgfControlsButton");
    this._btnNodes.textContent = "Nodes (0)";
    this._btnNodes.setAttribute("aria-expanded", "false");
    this._btnNodes.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleNodesDropdown();
    });
    toolbar.appendChild(this._btnNodes);

    // Save canvas button
    this._btnSave = document.createElement("button");
    this._btnSave.type = "button";
    this._btnSave.classList.add("VgfControlsButton");
    this._btnSave.textContent = "Save canvas";
    this._btnSave.addEventListener("click", () => {
      if (this._controller && typeof this._controller.requestSaveCanvas === "function")
        this._controller.requestSaveCanvas();
    });
    toolbar.appendChild(this._btnSave);

    // Load canvas button
    this._btnLoad = document.createElement("button");
    this._btnLoad.type = "button";
    this._btnLoad.classList.add("VgfControlsButton");
    this._btnLoad.textContent = "Load canvas";
    this._btnLoad.addEventListener("click", () => {
      if (this._controller && typeof this._controller.requestLoadCanvas === "function")
        this._controller.requestLoadCanvas();
    });
    toolbar.appendChild(this._btnLoad);

    // Status element
    this._statusEl = document.createElement("div");
    this._statusEl.classList.add("VgfControlsStatus");
    toolbar.appendChild(this._statusEl);

    this._navArea.appendChild(toolbar);
    this._toolbarEl = toolbar;
  }

  _initDropdown()
  {
    const dropdown = document.createElement("div");
    dropdown.classList.add("VgfNodesDropdown");
    this._navArea.appendChild(dropdown);
    this._dropdownEl = dropdown;

    document.addEventListener("click", (e) => {
      if (this._dropdownOpen && !this._dropdownEl.contains(e.target) && e.target !== this._btnNodes)
      {
        this.closeNodesDropdown();
      }
    });

    window.addEventListener("keydown", (e) => {
      if (this._dropdownOpen && e.key === "Escape")
      {
        this.closeNodesDropdown();
        this._btnNodes.focus();
      }
    });
  }

  toggleNodesDropdown()
  {
    if (this._dropdownOpen)
      this.closeNodesDropdown();
    else
      this.openNodesDropdown();
  }

  openNodesDropdown()
  {
    this.updateNodesList();
    this._dropdownEl.classList.add("open");
    this._dropdownOpen = true;
    this._btnNodes.setAttribute("aria-expanded", "true");
  }

  closeNodesDropdown()
  {
    this._dropdownEl.classList.remove("open");
    this._dropdownOpen = false;
    this._btnNodes.setAttribute("aria-expanded", "false");
  }

  updateNodesList()
  {
    const items = [];
    if (this._graph)
    {
      for (const [id, node] of this._graph.nodes)
      {
        const win = node.window;
        const model = win.viewEntity?.vp_model;
        const reference = model?.sourceReference || win._vp_savedReference;
        const uri = model?.uri || reference?.uri || "";
        const range = model?.displayTextRange || model?.totalRange || reference?.symbol?.selection;
        const start = range?.[0];
        const line = Number.isInteger(start?.line) ? start.line : null;
        const character = Number.isInteger(start?.character) ? start.character : 0;
        const unavailable = !!win._vp_savedReference;
        const diagnostic = win.classList.contains("VpwMessageWindow");
        const heading = model?.displayText || reference?.symbol?.name || model?.title
          || uri.split("/").pop() || "Untitled node";
        const label = (unavailable ? `Source unavailable — ${heading}` : heading).trim().replace(/\s+/g, " ");
        const secondary = uri
          ? uri + (line !== null ? `:${line + 1}` : "")
          : diagnostic ? `${model?.type || "Info"} diagnostic` : model?.kind || "Canvas node";
        items.push({ id, window: win, label, uri, line, character, secondary });
      }
    }

    if (this._btnNodes)
      this._btnNodes.textContent = `Nodes (${items.length})`;

    items.sort((a, b) => {
      const cmpLabel = a.label.localeCompare(b.label);
      if (cmpLabel !== 0) return cmpLabel;
      const cmpUri = a.uri.localeCompare(b.uri);
      if (cmpUri !== 0) return cmpUri;
      if (a.line !== b.line) return (a.line ?? -1) - (b.line ?? -1);
      if (a.character !== b.character) return a.character - b.character;
      return a.id.localeCompare(b.id);
    });

    while (this._dropdownEl.firstChild)
      this._dropdownEl.removeChild(this._dropdownEl.firstChild);

    if (items.length === 0)
    {
      const empty = document.createElement("div");
      empty.classList.add("VgfNodesEmpty");
      empty.textContent = "No nodes on this canvas";
      this._dropdownEl.appendChild(empty);
      return;
    }

    for (const item of items)
    {
      const row = document.createElement("div");
      row.classList.add("VgfNodeItem");
      row.tabIndex = 0;

      const nameEl = document.createElement("div");
      nameEl.classList.add("VgfNodeName");
      nameEl.textContent = item.label;
      row.appendChild(nameEl);

      const secEl = document.createElement("div");
      secEl.classList.add("VgfNodeSecondary");
      secEl.textContent = item.secondary;
      secEl.title = item.secondary;
      row.appendChild(secEl);

      const activate = () => {
        this.closeNodesDropdown();
        item.window.vp_focus();
        if (typeof WindowPositioner !== "undefined")
        {
          const pos = new WindowPositioner(this._world, null);
          pos.revealWindow(item.window);
        }
      };

      row.addEventListener("click", activate);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ")
        {
          e.preventDefault();
          activate();
        }
      });
      this._dropdownEl.appendChild(row);
    }
  }

  _initMinimap()
  {
    const minimap = document.createElement("div");
    minimap.classList.add("VgfMinimap");

    const shield = document.createElement("div");
    shield.classList.add("VgfMinimapShield");
    const swallow = (e) => {
      e.stopPropagation();
      e.preventDefault();
    };
    shield.addEventListener("pointerdown", swallow);
    shield.addEventListener("mousedown", swallow);
    shield.addEventListener("wheel", swallow, { passive: false });
    shield.addEventListener("dblclick", swallow);
    shield.addEventListener("click", swallow);
    minimap.appendChild(shield);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("VgfMinimapSvg");
    minimap.appendChild(svg);
    this._minimapSvg = svg;

    this._navArea.appendChild(minimap);
    this._minimapEl = minimap;
  }

  _initListeners()
  {
    this._world.addEventListener("vp_graphChanged", () => {
      this.updateNodesList();
      this.scheduleMinimapRender();
    });

    this._world.addEventListener("vp_cameraChanged", () => {
      this.scheduleMinimapRender();
    });

    window.addEventListener("resize", () => {
      this.scheduleMinimapRender();
    });

    this._world.addEventListener("vp_windowMoved", () => {
      this.scheduleMinimapRender();
    });

    this._world.addEventListener("vp_windowResizedByUser", () => {
      this.scheduleMinimapRender();
    });
  }

  scheduleMinimapRender()
  {
    if (this._minimapRaf !== null) return;
    this._minimapRaf = requestAnimationFrame(() => {
      this._minimapRaf = null;
      this._renderMinimap();
    });
  }

  _renderMinimap()
  {
    if (!this._minimapSvg || !this._camera) return;

    const svg = this._minimapSvg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width <= 0 || svgRect.height <= 0) return;

    const vp = this._camera.viewportBounds();
    let minX = vp.x, minY = vp.y, maxX = vp.right, maxY = vp.bottom;

    const nodeBounds = [];
    if (this._graph)
    {
      for (const [id, node] of this._graph.nodes)
      {
        if (node.window && node.window.isConnected)
        {
          const b = this._camera.frameBounds(node.window);
          nodeBounds.push({ id, b });
          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.right);
          maxY = Math.max(maxY, b.bottom);
        }
      }
    }

    const PADDING = 8;
    const availW = svgRect.width - PADDING * 2;
    const availH = svgRect.height - PADDING * 2;
    if (availW <= 0 || availH <= 0) return;

    const totalW = maxX - minX;
    const totalH = maxY - minY;
    if (totalW <= 0 || totalH <= 0) return;

    const scale = Math.min(availW / totalW, availH / totalH);
    const offsetX = PADDING + (availW - totalW * scale) / 2 - minX * scale;
    const offsetY = PADDING + (availH - totalH * scale) / 2 - minY * scale;

    const toSvgX = (wx) => wx * scale + offsetX;
    const toSvgY = (wy) => wy * scale + offsetY;

    // Draw node rectangles
    for (const { id, b } of nodeBounds)
    {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(toSvgX(b.x)));
      rect.setAttribute("y", String(toSvgY(b.y)));
      rect.setAttribute("width", String(Math.max(2, b.width * scale)));
      rect.setAttribute("height", String(Math.max(2, b.height * scale)));
      rect.classList.add("VgfMinimapNode");
      if (this._graph.selection.has(id))
        rect.classList.add("VgfMinimapNodeSelected");
      svg.appendChild(rect);
    }

    // Draw viewport rectangle
    const vpRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    vpRect.setAttribute("x", String(toSvgX(vp.x)));
    vpRect.setAttribute("y", String(toSvgY(vp.y)));
    vpRect.setAttribute("width", String(Math.max(2, vp.width * scale)));
    vpRect.setAttribute("height", String(Math.max(2, vp.height * scale)));
    vpRect.classList.add("VgfMinimapViewport");
    svg.appendChild(vpRect);
  }
}
