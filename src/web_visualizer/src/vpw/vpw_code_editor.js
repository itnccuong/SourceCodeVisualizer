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
         self._vp_groupParent.removeEventListener ("vp_beforeDelete", disconnect);
         self.removeEventListener ("vp_beforeDelete", disconnect);
      };
      self._vp_groupParent.addEventListener ("vp_beforeDelete", disconnect);
      self.addEventListener ("vp_beforeDelete", disconnect);
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
      highlighted.innerHTML = SyntaxHighlighter.run (source, syntaxHighlightingLanguage);

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
      for (const line of source.split("\n"))
      {
         const row = document.createElement ("div");
         const range = document.createRange();
         const start = point(offset);
         const end = point(offset + line.length);
         range.setStart (start[0], start[1]);
         range.setEnd (end[0], end[1]);
         let fragment = range.cloneContents();
         // cloneContents omits the common ancestor. Restore its highlight
         // wrappers when the whole line sits inside a multiline token.
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
         rows.appendChild(row);
         offset += line.length + 1;
      }
      self.replaceChildren(rows);
      self.style.setProperty ("--vp-line-number-digits",
          Math.max (2, String (self.childElementCount).length));
      SourceNavigation.invalidate (self);
   };


   // -------------------------------------------------------

   self._ctor();
   return self;
});
