require ("./vgf_expandable.js");
require ("./button_flat.js");
require ("./vgf_button_toggle.js");


/**
 *  Expandable, that always shows content of "title":
 *
 *    [>] [title]
 *
 *    [v] [title]
 *    [         ]
 *    [ content ]
 *    [_________]
 **/
const VgfExpandableWithTitle = (function()
{
  let self = new VgfExpandable();



  self.constructor = function()
  {
    let titleRow = document.createElement ("div");
    titleRow.classList.add ("VgfExpandableTitleRow");
    self.appendChild (titleRow);

    let toggleHolder = document.createElement ("div");
    toggleHolder.classList.add ("VgfExpandableToggle");
    titleRow.appendChild (toggleHolder);
    let expanderButton = _createToggleButton(self);
    self._vp_button_expand = expanderButton;
    toggleHolder.appendChild (expanderButton);

    let titleHolder = document.createElement ("div");
    titleHolder.classList.add ("VgfExpandableTitle");
    titleRow.appendChild (titleHolder);
    self.vp_title = titleHolder;

    self.appendChild (self.vp_content);

    return self;
  }



  let _createToggleButton = function(self)
  {
    let button = new VgfButtonToggle(["▸", "▾"]);

    button.addEventListener ("vp_toggled", e =>
    {
      if (button.vp_getState() == 0)
      {
        self.vp_title.classList.add ("expandable_title_collapsed");
        self.vp_title.classList.remove ("expandable_title_extended");

        self.vp_content.style.display = "none";
      } else
      {
        self.vp_title.classList.add ("expandable_title_extended");
        self.vp_title.classList.remove ("expandable_title_collapsed");

        self.vp_content.style.display = "";
      }

      self.vp_childSizeChanged();
      //self.dispatchEvent(new Event("vp_expansionChanged"));
    });

    return button;
  }



  /**
   * Append element to title area
   *
   * Param `value`: string or DOM object
   **/
  self.vp_appendTitle = function(value)
  {
    self.vp_title.append (value);
  }


  self.vp_setTitleFullWidth = function()
  {
    //self.vp_title.style.width = "100%";
  }



  // @override
  self.vp_expand = function()
  {
    if (self._vp_button_expand.vp_getState() == 0)
      self._vp_button_expand.vp_onClick();
  }



  self.constructor();
  return self;
});


