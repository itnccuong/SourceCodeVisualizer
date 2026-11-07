require ("../vgf/vgf_widget.js");
require ("../vpw/connectable.js");
require ("./misc_utils.js");

/** Maps immutable source coordinates to a rendered, editable source surface.
 * Offsets in anchors count UTF-16 units in the original source (including CRLF).
 * The DOM index uses LF, without counting row structure or generated decorations.
 */
class SourceNavigation
{
  static _surfaces = new WeakMap();
  static _identifierStart = /[$_\p{ID_Start}]/u;
  static _identifierContinue = /[$_\p{ID_Continue}]/u;

  static bind(surface, model, ownerWindow, {rows = false} = {})
  {
    const previous = this._surfaces.get(surface);
    if (previous) previous.dispose();
    if (!surface.vp_isVpObject) VgfWidget_createFrom(surface);
    Connectable.makeConnectable(surface);
    surface.setAttribute("data-vp-source-surface", "");

    const source = model.CLASS_TYPE === "Attribute" ? model.kind : model.displayText;
    const original = typeof source === "string" ? source : "";
    const text = this._normalize(original);
    const state = {
      surface, ownerWindow, rows, original, text,
      uri: model.uri || ownerWindow.viewEntity?.vp_model?.uri,
      sourceRange: this._copyRange(model.displayTextRange),
      definitionRange: this._copyRange(model.definitionRange),
      compact: model.CLASS_TYPE === "Attribute",
      lineStarts: this._lineStarts(text),
      originalLineStarts: this._lineStarts(original),
      dirty: true, valid: false, version: 0, deleted: false,
      runs: [], nodes: new WeakMap(), anchors: new WeakMap(), observer: null
    };
    this._surfaces.set(surface, state);
    surface.vp_request_outline_for_selection = () => this.request(surface);

    const onMouseDown = event => {
      if (event.button !== 0 || !this._hitsSource(state, event)) return;
      event.stopPropagation();
      // Focusing the window changes its stacking order, not the native selection.
      ownerWindow.vp_focus();
    };
    const onDoubleClick = event => {
      if (!this._hitsSource(state, event)) return;
      event.stopPropagation();
      this.request(surface);
    };
    surface.addEventListener("mousedown", onMouseDown);
    surface.addEventListener("dblclick", onDoubleClick);

    // Code editors forward their existing change observer instead of installing
    // a second observer over the same editable subtree.
    if (!surface.vp_source_mutations_external)
    {
      state.observer = new MutationObserver(records => this.invalidate(surface, records));
      state.observer.observe(surface, {
        subtree: true, childList: true, characterData: true,
        attributes: true, attributeFilter: ["style", "class", "hidden"]
      });
    }
    state.dispose = () => {
      if (state.deleted) return;
      state.deleted = true;
      state.observer?.disconnect();
      surface.removeEventListener("mousedown", onMouseDown);
      surface.removeEventListener("dblclick", onDoubleClick);
      ownerWindow.removeEventListener("vp_beforeDelete", state.dispose);
      surface.removeEventListener("vp_beforeDelete", state.dispose);
      this._surfaces.delete(surface);
    };
    // Plain descendants are not necessarily visited by widget deletion traversal.
    ownerWindow.addEventListener("vp_beforeDelete", state.dispose);
    surface.addEventListener("vp_beforeDelete", state.dispose);
    this._ensureIndex(state);
    return surface;
  }

  static invalidate(surface, records)
  {
    const state = this._surfaces.get(surface);
    if (!state || state.deleted) return;
    if (!records || records.some(record =>
      record.type === "childList" || record.type === "characterData"))
      state.dirty = true;
    // Visibility and highlight changes move existing anchors even without text
    // changes. No selection recapture or source reparse is needed for movement.
    state.ownerWindow.dispatchEvent(new Event("vp_windowMoved"));
  }

  static capture(surface)
  {
    const state = this._surfaces.get(surface);
    if (!state || state.deleted) return null;
    const selection = surface.ownerDocument.defaultView.getSelection();
    if (!this._selectionBelongsTo(surface, selection)) return null;
    this._flush(state);
    if (!this._ensureIndex(state)) return null;
    const selected = selection.getRangeAt(0);
    let start = this._pointOffset(state, selected.startContainer, selected.startOffset);
    let end = this._pointOffset(state, selected.endContainer, selected.endOffset);
    if (start === null || end === null) return null;
    if (selected.collapsed)
    {
      const identifier = this._identifierAt(state.text, start);
      if (!identifier) return null;
      [start, end] = identifier;
    }
    else if (start >= end || !this._identifierStart.test(state.text.slice(start, end)))
      return null;
    return this._captureOffsets(state, start, end);
  }

  static request(surface)
  {
    const state = this._surfaces.get(surface);
    if (!state || state.deleted) return false;
    const selection = surface.ownerDocument.defaultView.getSelection();
    if (!state.definitionRange && !this._selectionBelongsTo(surface, selection)) return false;
    this._flush(state);
    if (!this._ensureIndex(state)) return this._reportMappingError(state);

    let captured;
    if (state.definitionRange)
    {
      const start = this._offsetAtPosition(state, state.definitionRange[0]);
      const end = this._offsetAtPosition(state, state.definitionRange[1]);
      if (start === null || end === null || end <= start)
        return this._reportMappingError(state);
      captured = this._captureOffsets(state, start, end);
    }
    else captured = this.capture(surface);
    if (!captured) return false;

    const anchor = {
      surface, uri: captured.uri, range: captured.range,
      offsets: captured.offsets, fallbackElement: state.compact ? surface : null
    };
    state.ownerWindow.vp_getWorld().vp_outline_openSymbolAt(
      captured.uri, captured.range[0], captured.range[1], surface, anchor);
    return true;
  }

  /** Return a screen-space final-codepoint rectangle, or an explicit fallback.
   * The connection layer clips this preferred point against actual scrollports.
   */
  static endpoint(anchor)
  {
    const state = this._surfaces.get(anchor.surface);
    if (!state || state.deleted) return null;
    this._flush(state);
    if (!this._ensureIndex(state) || !this._anchorMatches(state, anchor))
      return this._fallback(state, anchor, false);

    let cached = state.anchors.get(anchor);
    if (!cached || cached.version !== state.version || cached.range
      && (cached.range.startContainer !== cached.from.node || cached.range.startOffset !== cached.from.offset
        || cached.range.endContainer !== cached.to.node || cached.range.endOffset !== cached.to.offset))
    {
      const end = this._toDisplay(state, anchor.offsets[1]);
      const start = this._toDisplay(state, anchor.offsets[0]);
      const last = this._previousCodePointStart(state.text, end);
      const from = last >= start ? this._domPoint(state, last, false) : null;
      const to = last >= start ? this._domPoint(state, end, true) : null;
      let range = null;
      if (from && to)
      {
        range = anchor.surface.ownerDocument.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
      }
      cached = {version: state.version, range, from, to, element: from?.node.parentElement};
      state.anchors.set(anchor, cached);
    }
    if (cached.range && this._visible(cached.element))
    {
      const rects = cached.range.getClientRects();
      for (let i = rects.length - 1; i >= 0; --i)
      {
        const rect = rects[i];
        if (rect.width <= 0 || rect.height <= 0) continue;
        if (state.compact && this._compactClips(state, rect))
          return this._fallback(state, anchor, true);
        return {rect, element: cached.element, fallbackReason: null};
      }
    }
    return this._fallback(state, anchor, !cached.range);
  }

  static _normalize(text) { return text.replace(/\r\n/g, "\n"); }

  static _copyRange(range)
  {
    if (!range) return null;
    const start = range[0] ?? range.start;
    const end = range[1] ?? range.end;
    if (!start || !end || !Number.isInteger(start.line) || !Number.isInteger(start.character)
      || !Number.isInteger(end.line) || !Number.isInteger(end.character)
      || start.line < 0 || start.character < 0 || end.line < 0 || end.character < 0) return null;
    return [{line: start.line, character: start.character},
      {line: end.line, character: end.character}];
  }

  static _lineStarts(text)
  {
    const starts = [0];
    for (let i = 0; i < text.length; ++i)
      if (text[i] === "\n") starts.push(i + 1);
    return starts;
  }

  static _lineAt(starts, offset)
  {
    let low = 0, high = starts.length;
    while (low + 1 < high)
    {
      const middle = (low + high) >>> 1;
      if (starts[middle] <= offset) low = middle;
      else high = middle;
    }
    return low;
  }

  static _toOriginal(state, offset)
  {
    const line = this._lineAt(state.lineStarts, offset);
    return state.originalLineStarts[line] + offset - state.lineStarts[line];
  }

  static _toDisplay(state, offset)
  {
    const line = this._lineAt(state.originalLineStarts, offset);
    return state.lineStarts[line] + offset - state.originalLineStarts[line];
  }

  static _positionAt(state, offset)
  {
    const line = this._lineAt(state.lineStarts, offset);
    return VsCode.position_sum(state.sourceRange[0], {
      line, character: offset - state.lineStarts[line]
    });
  }

  static _offsetAtPosition(state, position)
  {
    const line = position.line - state.sourceRange[0].line;
    if (line < 0 || line >= state.lineStarts.length) return null;
    const column = position.character - (line === 0 ? state.sourceRange[0].character : 0);
    const end = line + 1 < state.lineStarts.length ? state.lineStarts[line + 1] - 1 : state.text.length;
    const offset = state.lineStarts[line] + column;
    return column >= 0 && offset <= end ? offset : null;
  }

  static _captureOffsets(state, start, end)
  {
    return {
      uri: state.uri,
      range: [this._positionAt(state, start), this._positionAt(state, end)],
      offsets: [this._toOriginal(state, start), this._toOriginal(state, end)]
    };
  }

  static _flush(state)
  {
    if (state.surface.vp_source_flush_mutations)
      state.surface.vp_source_flush_mutations();
    else
    {
      const records = state.observer?.takeRecords();
      if (records?.length) this.invalidate(state.surface, records);
    }
  }

  static _ensureIndex(state)
  {
    if (!state.dirty) return state.valid;
    state.dirty = false;
    state.version++;
    state.runs = [];
    state.nodes = new WeakMap();
    state.valid = !!state.sourceRange && !!state.uri;
    if (!state.valid) return false;

    // Walk text nodes, including display-hidden text. Visibility never renumbers
    // source offsets. Bounds also index element-container selection boundaries.
    const visit = (node, offset) => {
      if (node.nodeType === Node.TEXT_NODE)
      {
        const text = this._normalize(node.data);
        const run = {node, start: offset, end: offset + text.length, text};
        state.nodes.set(node, run);
        if (text.length) state.runs.push(run);
        return text;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return "";
      if (node.hasAttribute("data-vp-source-ignore")) return "";
      const boundaries = [offset];
      let text = "";
      for (const child of node.childNodes)
      {
        text += visit(child, offset + text.length);
        boundaries.push(offset + text.length);
      }
      state.nodes.set(node, {start: offset, end: offset + text.length, boundaries});
      return text;
    };

    let displayed = "";
    if (state.rows)
    {
      const rows = Array.from(state.surface.childNodes);
      const boundaries = [0];
      let rowCount = 0;
      for (const row of rows)
      {
        if (row.nodeType !== Node.ELEMENT_NODE || row.tagName !== "DIV")
        {
          if (row.nodeType !== Node.TEXT_NODE || row.data.length) state.valid = false;
          boundaries.push(displayed.length);
          continue;
        }
        if (rowCount++) displayed += "\n";
        const rowText = visit(row, displayed.length);
        // A placeholder/end-of-row BR is structural. A newly edited internal
        // line break or nested block must not silently disappear from the index.
        const breaks = Array.from(row.querySelectorAll("br"));
        if (row.querySelector("div,p") || breaks.length > 1) state.valid = false;
        if (breaks.length)
        {
          const bounds = state.nodes.get(breaks[0]);
          if (bounds && bounds.start !== displayed.length + rowText.length) state.valid = false;
        }
        displayed += rowText;
        boundaries.push(displayed.length);
      }
      // At a direct row boundary the next row starts after its source newline.
      for (let i = 1; i < rows.length; ++i)
      {
        const next = state.nodes.get(rows[i]);
        if (next) boundaries[i] = next.start;
      }
      state.nodes.set(state.surface, {start: 0, end: displayed.length, boundaries});
      if (rowCount !== state.lineStarts.length) state.valid = false;
    }
    else displayed = visit(state.surface, 0);

    // Metadata intentionally displays just the original first-line prefix.
    const expected = state.compact ? state.text.split("\n", 1)[0] : state.text;
    if (displayed !== expected) state.valid = false;
    for (const run of state.runs)
      if (state.text.slice(run.start, run.end) !== run.text) state.valid = false;
    return state.valid;
  }

  static _pointOffset(state, node, offset)
  {
    const indexed = state.nodes.get(node);
    if (!indexed) return null;
    if (node.nodeType === Node.TEXT_NODE)
    {
      if (offset < 0 || offset > node.data.length) return null;
      return indexed.start + this._normalize(node.data.slice(0, offset)).length;
    }
    return indexed.boundaries?.[offset] ?? null;
  }

  static _domPoint(state, offset, preferEnd)
  {
    for (const run of state.runs)
    {
      if (preferEnd ? offset <= run.start || offset > run.end
        : offset < run.start || offset >= run.end) continue;
      let local = offset - run.start;
      if (run.node.data.includes("\r\n"))
      {
        let normalized = 0, raw = 0;
        while (normalized < local)
        {
          if (run.node.data[raw] === "\r" && run.node.data[raw + 1] === "\n") raw++;
          raw++; normalized++;
        }
        local = raw;
      }
      return {node: run.node, offset: local};
    }
    return null;
  }

  static _selectionBelongsTo(surface, selection)
  {
    if (!selection || selection.rangeCount !== 1) return false;
    const range = selection.getRangeAt(0);
    const belongs = node => {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      return element?.closest("[data-vp-source-surface]") === surface;
    };
    return belongs(range.startContainer) && belongs(range.endContainer);
  }

  static _previousCodePointStart(text, offset)
  {
    let start = offset - 1;
    if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start])
      && /[\uD800-\uDBFF]/.test(text[start - 1])) start--;
    return start;
  }

  static _identifierAt(text, offset)
  {
    const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
    const newline = text.indexOf("\n", offset);
    const lineEnd = newline < 0 ? text.length : newline;
    let start = offset, end = offset;
    const right = offset < lineEnd ? String.fromCodePoint(text.codePointAt(offset)) : "";
    if (right && this._identifierContinue.test(right))
      end += right.length;
    else
    {
      const previous = this._previousCodePointStart(text, offset);
      if (previous < lineStart || !this._identifierContinue.test(text.slice(previous, offset))) return null;
      start = previous;
    }
    while (start > lineStart)
    {
      const previous = this._previousCodePointStart(text, start);
      if (!this._identifierContinue.test(text.slice(previous, start))) break;
      start = previous;
    }
    while (end < lineEnd)
    {
      const character = String.fromCodePoint(text.codePointAt(end));
      if (!this._identifierContinue.test(character)) break;
      end += character.length;
    }
    const first = String.fromCodePoint(text.codePointAt(start));
    return this._identifierStart.test(first) ? [start, end] : null;
  }

  static _anchorMatches(state, anchor)
  {
    if (anchor.uri !== state.uri || !Array.isArray(anchor.offsets)
      || anchor.offsets[0] < 0 || anchor.offsets[1] > state.original.length
      || anchor.offsets[0] >= anchor.offsets[1]) return false;
    const start = this._positionAt(state, this._toDisplay(state, anchor.offsets[0]));
    const end = this._positionAt(state, this._toDisplay(state, anchor.offsets[1]));
    return start.line === anchor.range[0].line && start.character === anchor.range[0].character
      && end.line === anchor.range[1].line && end.character === anchor.range[1].character;
  }

  static _visible(element)
  {
    if (!element?.isConnected || !element.getClientRects().length) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.visibility !== "hidden" && style.visibility !== "collapse";
  }

  static _compactClips(state, rect)
  {
    const view = state.surface.ownerDocument.defaultView;
    for (let element = state.surface; element && element !== state.ownerWindow;
      element = element.parentElement)
    {
      const style = view.getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      if (style.overflowX !== "visible"
        && (rect.left < bounds.left || rect.right > bounds.right)) return true;
      if (style.overflowY !== "visible"
        && (rect.top < bounds.top || rect.bottom > bounds.bottom)) return true;
      if (element.classList.contains("Window_Titlebar_MetatypeDiv")) break;
    }
    return false;
  }

  static _fallback(state, anchor, compact)
  {
    if (compact && anchor.fallbackElement && this._visible(anchor.fallbackElement))
      return {rect: anchor.fallbackElement.getBoundingClientRect(),
        element: anchor.fallbackElement, fallbackReason: "Compact decorator source"};
    const heading = state.ownerWindow.querySelector(".Window_Titlebar_Title");
    const element = this._visible(heading) ? heading : state.ownerWindow;
    return {rect: element.getBoundingClientRect(), element, fallbackReason: "Source is hidden"};
  }

  static _hitsSource(state, event)
  {
    if (state.rows || state.definitionRange) return true;
    const range = state.surface.ownerDocument.createRange();
    range.selectNodeContents(state.surface);
    return Array.from(range.getClientRects()).some(rect =>
      event.clientX >= rect.left && event.clientX <= rect.right
      && event.clientY >= rect.top && event.clientY <= rect.bottom);
  }

  static _reportMappingError(state)
  {
    gController.outline_reportError(state.surface, "Source mapping unavailable",
      "The displayed text no longer matches its source. Reopen the node before navigating.");
    return true;
  }
}
