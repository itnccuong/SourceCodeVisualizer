require ("../vgf/vgf_window_tiled.js");
require ("../vgf/vgf_expandable_with_title.js");
require ("../vgf/vgf_button_toggle.js");

require ("./vpw_btn_open_definition.js");
require ("./vpw_code_editor.js");
require ("../utils/misc_utils.js");
require ("../vgf/vgf_menu.js");
require ("../utils/source_navigation.js");

require ("vpw_view_entity_window.js");



const VpwOutlineWindow = (function(viewEntity_outline)
{
  let self = new VpwViewEntityWindow (viewEntity_outline);

  let _constructor = function ()
  {
    // object type indicator
    self.vp_isCodeOutline = true;

    let tsOutlineRange = viewEntity_outline.vp_model;


    let metatype = "";
    let quickhelp = metatype + "\n";

    // object specific handling
    switch (tsOutlineRange.CLASS_TYPE)
    {
      case "File":
        {
          let tsOutlineFile = tsOutlineRange;

          metatype = tsOutlineFile.CLASS_TYPE;
          quickhelp += tsOutlineRange.uri;
        }
        break;
      case "Symbol":
        {
          let tsOutlineSymbol = tsOutlineRange;

          metatype = tsOutlineSymbol.kind;
          for (const attribute of tsOutlineSymbol.attributes)
            quickhelp += attribute.kind + "\n";
          quickhelp += tsOutlineSymbol.displayText;
        }
        break;
      case "Text":
        break;
      case "Attribute":
        break;
    }

    let titletext = SyntaxHighlighter.run (tsOutlineRange.displayText,
                                            tsOutlineRange.language).html;

    self._vp_createClientTitle (self.vp_title, metatype, titletext, quickhelp, tsOutlineRange);
    self._vp_fillClientarea (self, self.vp_window_clientarea, tsOutlineRange);

    self.vp_commentsVisible = (tsOutlineRange.CLASS_TYPE === "File");
    if (tsOutlineRange.commentHidingError)
    {
      self._vp_commentHidingError = tsOutlineRange.commentHidingError;
      if (self._vp_btn_comments)
      {
        self._vp_btn_comments.setAttribute("aria-disabled", "true");
        self._vp_btn_comments.title = "Comment hiding unavailable: " + tsOutlineRange.commentHidingError;
        self._vp_btn_comments.classList.add("disabled");
      }
    }
    else if (self._vp_btn_comments)
    {
      self._vp_btn_comments.setAttribute("aria-pressed", self.vp_commentsVisible ? "true" : "false");
      self._vp_btn_comments.title = self.vp_commentsVisible ? "Hide comments and docstrings" : "Show comments and docstrings";
    }

    self.vp_setCommentsVisible (self.vp_commentsVisible);

    self.vp_getUri = function(){
      return viewEntity_outline.vp_model.uri;
    };




    let _setupContextMenu = function()
    {
      self.vp_title.addEventListener ("contextmenu", e =>
      {
        let menu = new VgfMenu ();
        menu.vp_addEntry ("Open parent", function(){
          self.vp_getWorld ().vp_outline_openLocationDefiner (
              self.viewEntity.vp_model, self);
        });
        //menu.vp_addEntry ("Open callers", function(){ alarm ("not yet implemented"); });
        menu.vp_addSeparator ();
        menu.vp_addEntry ("Show in code", function(){
          self.vp_getWorld().vp_host_openRawSource(self.viewEntity.vp_model);
        });

        self.vp_getWorld ().vp_runPopup (menu, e.x, e.y);
      });
    }
    _setupContextMenu ();


    return self;
  };
  self.vp_setCommentsVisible = function(visible)
  {
    self.vp_commentsVisible = visible;
    if (self._vp_btn_comments && self._vp_btn_comments.getAttribute("aria-disabled") !== "true")
    {
      self._vp_btn_comments.setAttribute("aria-pressed", visible ? "true" : "false");
      self._vp_btn_comments.title = visible ? "Hide comments and docstrings" : "Show comments and docstrings";
    }
    const editors = self.querySelectorAll(".VpwCodeEditor");
    for (const editor of editors)
    {
      if (typeof editor.vp_setCommentsVisible === "function")
        editor.vp_setCommentsVisible(visible);
    }
    if (typeof SourceNavigation !== "undefined")
      SourceNavigation.invalidate(self);
    self.dispatchEvent(new Event("vp_windowMoved"));
  };



  self._vp_createClientTitle = function(root, metatype, titleString, quickhelp, model)
  {
    const metadata = document.createElement ("div");
    metadata.classList.add ("Window_Titlebar_MetatypeDiv");
    metadata.title = quickhelp;
    root.appendChild (metadata);

    const attributes = model.CLASS_TYPE === "Symbol" ? model.attributes : [];
    if (attributes.length === 0)
      metadata.textContent = metatype;
    else
    {
      for (const attribute of attributes)
      {
        if (metadata.childNodes.length > 0)
          metadata.appendChild (document.createTextNode (" "));

        const badge = document.createElement ("span");
        badge.classList.add ("Window_Titlebar_Attribute");
        badge.title = attribute.kind;
        const firstLine = attribute.kind.split (/\r?\n/, 1)[0];
        badge.appendChild (document.createTextNode (firstLine));
        if (attribute.kind.includes ("\n"))
        {
          const ellipsis = document.createElement ("span");
          ellipsis.dataset.vpSourceIgnore = "";
          ellipsis.textContent = "…";
          badge.appendChild (ellipsis);
        }
        metadata.appendChild (badge);

        if (attribute.definitionRange)
        {
          badge.tabIndex = 0;
          SourceNavigation.bind (badge, {
            ...attribute,
            uri: attribute.uri || model.uri,
            language: attribute.language || model.language,
          }, self, {rows: false});
        }
      }
    }

    const title = document.createElement ("div");
    title.classList.add ("Window_Titlebar_Title");
    title.title = quickhelp;
    title.innerHTML = titleString;
    root.appendChild (title);
    if (model.CLASS_TYPE === "Symbol" && model.displayTextRange)
    {
      title.tabIndex = 0;
      SourceNavigation.bind (title, model, self, {rows: false});
    }
  }



  self._vp_fillClientarea = function(window, root, tsOutlineSymbol){
    if (tsOutlineSymbol.CLASS_TYPE === "Symbol" && tsOutlineSymbol.declarationOnly === true)
    {
      root.style.display = "none";
      return;
    }

    if (tsOutlineSymbol.language === "yaml")
    {
      root.classList.add("vp-yaml-body");
      const columns = [];
      for (const part of tsOutlineSymbol.parts)
      {
        const start = part.displayTextRange?.[0] ?? part.displayTextRange?.start;
        const column = start?.character ?? 0;
        if (part.CLASS_TYPE === "Symbol") columns.push(column);
        else if (part.CLASS_TYPE === "Text")
        {
          const lines = part.displayText.replace(/\r\n/g, "\n").split("\n");
          lines.forEach((line, index) => {
            if (line.trim()) columns.push((index === 0 ? column : 0) + line.match(/^ */)[0].length);
          });
        }
      }
      window.vp_yamlIndent = columns.length ? Math.min(...columns) : 0;
    }
    for (let i=0; i<tsOutlineSymbol.parts.length; ++i)
    {
      let part = tsOutlineSymbol.parts[i];
      // special treatment for "code"
      switch (part.CLASS_TYPE){
        case "File":
        case "Symbol":
          let tsOutlineSymbol = part;
          self._vp_addDeclaration (window, root, tsOutlineSymbol);
          break;
        case "Text":
          self._vp_addCodeblock (root, part, part.displayText, true, window);
          break;
      }
    }
  }



  self._vp_addDeclaration = function(theWindow, root, tsOutlineSymbol)
  {

    let domDecl = document.createElement ("div");
    domDecl.classList.add ("Window_Clientarea_OpenDeclarationBlock");
    domDecl.title = tsOutlineSymbol.kind;
    /*
    // add kind information
    // Why commented out?
    //  looks aweful; I'm not sure, if we need it, because
    //  functions start small, classes start large.
    let kind;
    {
      kind = document.createElement ("div");
      kind.classList.add ("viewEntityRepr_OutlineKindIndicator");
      kind.title = tsOutlineSymbol.kind;
      kind.innerText = tsOutlineSymbol.kind.substr(0,1);
    }
    domDecl.appendChild (kind);*/

    // test:

    let table = document.createElement ("table");
    table.style.borderSpacing = "0px";
    table.style.width = "100%";
    domDecl.append (table);

    let line = document.createElement ("tr");
    table.append (line);

    let td1 = document.createElement("td");
    td1.textContent = tsOutlineSymbol.displayText;
    if (theWindow.viewEntity.vp_model.language === "yaml")
    {
      const start = tsOutlineSymbol.displayTextRange?.[0] ?? tsOutlineSymbol.displayTextRange?.start;
      const indent = Math.max(0, (start?.character ?? 0) - theWindow.vp_yamlIndent);
      td1.style.paddingLeft = `calc(var(--vp-yaml-gutter) + ${indent}ch)`;
    }
    line.append (td1);

    let td2 = document.createElement("td");
    td2.style.textAlign = "right";
    line.append (td2);

    let btn = new BtnOpenDefinition (tsOutlineSymbol,
                                     theWindow)

    domDecl.addEventListener ("click", e => {
      btn.click();
    });

    td2.append (btn);

    root.appendChild (domDecl);
  }




  /**
   *  @brief: Adds a source-backed code editor.
   **/
   self._vp_addCodeblock = function(root, tsOutlineSymbolText, content, editable, groupParent)
   {
     console.log("content:");
     console.log(content + "\n\n");
     let node = new VpwCodeEditor(tsOutlineSymbolText, content, groupParent);

     root.appendChild(node);
   }




  _constructor ();
  return self;
});
