require ("../vgf/vgf_widget.js");
require ("../utils/misc_utils.js");
require ("../utils/source_navigation.js");

const VpwCodeEditor = (function(tsOutlineSymbolText, content, groupParent)
{
   let self = new VgfWidget ("div");
   // -------------------------------------------------------

   self._ctor = function()
   {
      self.contentEditable = "true"
      self.classList.add ("VpwCodeEditor");

      self.vp_model = tsOutlineSymbolText;
      self._vp_groupParent = groupParent;
      self.vp_source_mutations_external = true;
      self.vp_setContent (content, tsOutlineSymbolText.language);
      self._setupEvents();
      SourceNavigation.bind (self, self.vp_model, groupParent, {rows: true});
   };



   // -------------------------------------------------------
   // TODO: move to widget? or create a `container` class?
   //          more thinking is needed regarding structure!
   self.vp_getUri = function()
   {
      return self.vp_getToplevelWidget().vp_getUri();
   }

   // -------------------------------------------------------

   self._setupEvents = function()
   {
      const changed = records => {
         SourceNavigation.invalidate (self, records);
         self.dispatchEvent (new CustomEvent("change"));
      };
      const observer = new MutationObserver(changed);
      observer.observe (self, {
         childList: true, subtree: true, attributes: true, characterData: true
      });
      self.vp_source_flush_mutations = function()
      {
         const records = observer.takeRecords();
         if (records.length) changed(records);
      };
      const disconnect = function()
      {
         observer.disconnect();
         delete self.vp_source_flush_mutations;
         if (self._vp_groupParent)
            self._vp_groupParent.removeEventListener ("vp_beforeDelete", disconnect);
         self.removeEventListener ("vp_beforeDelete", disconnect);
      };
      if (self._vp_groupParent)
         self._vp_groupParent.addEventListener ("vp_beforeDelete", disconnect);
   };

   // -------------------------------------------------------

   /**
    * Use this function to the content of this object.
    *  it formats the input so to work with it properly
    *  afterwards
    **/
   self.vp_setContent = function(content, syntaxHighlightingLanguage="")
   {
      const source = content.replace(/\r\n/g, "\n");
      const highlighted = document.createElement ("div");
      const hl = SyntaxHighlighter.run (source, syntaxHighlightingLanguage);
      highlighted.innerHTML = hl.html;
      self._vp_exactLanguage = hl.exactLanguage;
      // Split the highlighted DOM, not its HTML string: multiline highlight
      // spans must not be repaired/reparented across our direct source rows.
      const runs = [];
      const walker = document.createTreeWalker (highlighted, NodeFilter.SHOW_TEXT);
      let node, length = 0;
      while ((node = walker.nextNode()))
      {
         runs.push ({node, start: length, end: length + node.data.length});
         length += node.data.length;
      }
      const point = offset => {
         let low = 0, high = runs.length;
         while (low < high)
         {
            const middle = (low + high) >>> 1;
            if (runs[middle].end < offset) low = middle + 1;
            else high = middle;
         }
         const run = runs[low];
         return run ? [run.node, offset - run.start] : [highlighted, 0];
      };
      const rows = document.createDocumentFragment();
      let offset = 0;
      const lines = source.split("\n");
      const getCoord = (p) => {
         if (!p) return { line: 0, character: 0 };
         if (Array.isArray(p)) return { line: p[0], character: p[1] };
         return { line: p.line ?? 0, character: p.character ?? 0 };
      };
      const baseStart = getCoord(tsOutlineSymbolText?.displayTextRange?.[0]);

      const wrapRowRange = (rowEl, startOffset, endOffset, className) => {
         const rowRuns = [];
         const walker = document.createTreeWalker(rowEl, NodeFilter.SHOW_TEXT);
         let n, len = 0;
         while ((n = walker.nextNode())) {
            rowRuns.push({ node: n, start: len, end: len + n.data.length });
            len += n.data.length;
         }
         const findPoint = (off) => {
            let l = 0, h = rowRuns.length;
            while (l < h) {
               const m = (l + h) >>> 1;
               if (rowRuns[m].end < off) l = m + 1;
               else h = m;
            }
            const r = rowRuns[l];
            return r ? [r.node, off - r.start] : null;
         };
         const sPt = findPoint(startOffset);
         const ePt = findPoint(endOffset);
         if (!sPt || !ePt) return;
         const rng = document.createRange();
         rng.setStart(sPt[0], sPt[1]);
         rng.setEnd(ePt[0], ePt[1]);
         const wrapper = document.createElement("span");
         wrapper.classList.add(className);
         try {
            rng.surroundContents(wrapper);
         } catch (_) {
            const frag = rng.extractContents();
            wrapper.appendChild(frag);
            rng.insertNode(wrapper);
         }
      };

      for (let rowIndex = 0; rowIndex < lines.length; ++rowIndex)
      {
         const line = lines[rowIndex];
         const row = document.createElement ("div");
         row.setAttribute("data-vp-line-number", String(rowIndex + 1));
         if (line.trim().length === 0)
            row.setAttribute("data-vp-blank", "true");
         const range = document.createRange();
         const start = point(offset);
         const end = point(offset + line.length);
         range.setStart (start[0], start[1]);
         range.setEnd (end[0], end[1]);
         let fragment = range.cloneContents();
         let ancestor = range.commonAncestorContainer;
         if (ancestor.nodeType === Node.TEXT_NODE) ancestor = ancestor.parentElement;
         while (ancestor !== highlighted)
         {
            const wrapper = ancestor.cloneNode(false);
            wrapper.appendChild(fragment);
            fragment = wrapper;
            ancestor = ancestor.parentElement;
         }
         row.appendChild(fragment);
         if (!line.length) row.appendChild(document.createElement("br"));

         const docLine = baseStart.line + rowIndex;
         const lineDocCharOffset = (rowIndex === 0 ? baseStart.character : 0);
         const intervals = [];
         if (Array.isArray(tsOutlineSymbolText?.commentRanges))
         {
            for (const c of tsOutlineSymbolText.commentRanges)
            {
               const cStart = getCoord(c.range?.[0]);
               const cEnd = getCoord(c.range?.[1]);
               if (docLine >= cStart.line && docLine <= cEnd.line)
               {
                  const startCol = (docLine === cStart.line) ? Math.max(0, cStart.character - lineDocCharOffset) : 0;
                  const endCol = (docLine === cEnd.line) ? Math.min(line.length, cEnd.character - lineDocCharOffset) : line.length;
                  if (startCol < endCol)
                     intervals.push({ start: startCol, end: endCol, kind: c.kind });
               }
            }

            const trimmed = line.trim();
            if (trimmed.length > 0)
            {
               const firstNonWs = line.search(/\S/);
               const lastNonWs = line.length - line.slice().split("").reverse().join("").search(/\S/);
               let covered = true;
               for (let col = firstNonWs; col < lastNonWs; col++)
               {
                  if (!intervals.some(i => col >= i.start && col < i.end))
                  {
                     covered = false;
                     break;
                  }
               }
               if (covered)
                  row.setAttribute("data-vp-comment-only", "true");
            }

            intervals.sort((a, b) => b.start - a.start);
            for (const intv of intervals)
               wrapRowRange(row, intv.start, intv.end, "vp-comment-span");
         }
         else if (self._vp_exactLanguage)
         {
            const commentSpans = row.querySelectorAll(".hljs-comment");
            for (const span of commentSpans)
               span.classList.add("vp-comment-span");
            let commentTextLen = 0;
            for (const span of commentSpans)
               commentTextLen += span.textContent.trim().length;
            if (line.trim().length > 0 && commentTextLen >= line.trim().length)
               row.setAttribute("data-vp-comment-only", "true");
         }

         rows.appendChild(row);
         offset += line.length + 1;
      }
      self.replaceChildren(rows);
      self.style.setProperty ("--vp-line-number-digits",
          Math.max (2, String (self.childElementCount).length));
      SourceNavigation.invalidate (self);
   };

   self.vp_setCommentsVisible = function(visible)
   {
      if (self.commentHidingError) return;

      if (!visible)
      {
         if (typeof SourceNavigation !== "undefined" && SourceNavigation.isDiverged(self))
         {
            if (typeof gController !== "undefined" && gController && typeof gController.outline_reportError === "function") {
               gController.outline_reportError(self, "Source mapping unavailable",
                 "The displayed text no longer matches its source. Reopen the node before navigating.");
            }
            return;
         }

         const rows = Array.from(self.children);
         for (const row of rows)
         {
            if (row.getAttribute("data-vp-comment-only") === "true"
               || row.getAttribute("data-vp-blank") === "true")
            {
               row.style.display = "none";
            }
            else
            {
               const spans = row.querySelectorAll(".vp-comment-span");
               for (const span of spans)
               {
                  span.style.display = "none";
                  if (!span.previousElementSibling?.classList.contains("vp-comment-separator"))
                  {
                     const sep = document.createElement("span");
                     sep.setAttribute("data-vp-source-ignore", "true");
                     sep.classList.add("vp-comment-separator");
                     sep.textContent = " ";
                     span.parentNode.insertBefore(sep, span);
                  }
               }
            }
         }
         self.style.display = rows.every(row => row.style.display === "none") ? "none" : "";
         self.contentEditable = "false";
      }
      else
      {
         self.style.display = "";
         const rows = Array.from(self.children);
         for (const row of rows)
         {
            row.style.display = "";
            const spans = row.querySelectorAll(".vp-comment-span");
            for (const span of spans)
            {
               span.style.display = "";
            }
            const seps = row.querySelectorAll(".vp-comment-separator");
            for (const sep of seps)
            {
               sep.remove();
            }
         }
         self.contentEditable = "true";
      }

      if (typeof SourceNavigation !== "undefined")
      {
         SourceNavigation.invalidate(self);
      }
   };


   // -------------------------------------------------------

   self._ctor();
   return self;
});
