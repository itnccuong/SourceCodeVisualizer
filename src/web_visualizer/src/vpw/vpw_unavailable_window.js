require ("../vgf/vgf_window_tiled.js");

const VpwUnavailableWindow = (function(nodeData, unavailableReason)
{
  const self = new VgfWindowTitled();

  self.constructor = function()
  {
    self.classList.add("VpwUnavailableWindow");
    self.classList.add("Window_OuterFrame");

    const ref = nodeData.content?.reference;
    self._vp_savedReference = ref;

    self.vp_title.textContent = "Source unavailable";

    const client = self.vp_window_clientarea;
    client.style.padding = "10px";
    client.style.fontFamily = "var(--vscode-font-family, sans-serif)";
    client.style.fontSize = "12px";

    const reasonEl = document.createElement("div");
    reasonEl.style.color = "var(--vscode-errorForeground, #f48771)";
    reasonEl.style.fontWeight = "bold";
    reasonEl.style.marginBottom = "8px";
    reasonEl.textContent = unavailableReason || "Source could not be resolved";
    client.appendChild(reasonEl);

    if (ref)
    {
      const uriEl = document.createElement("div");
      uriEl.style.marginBottom = "4px";
      uriEl.style.wordBreak = "break-all";
      uriEl.textContent = "URI: " + ref.uri;
      client.appendChild(uriEl);

      if (ref.symbol)
      {
        const symEl = document.createElement("div");
        symEl.style.marginBottom = "4px";
        symEl.textContent = `Symbol: ${ref.symbol.name} (kind ${ref.symbol.kind})`;
        client.appendChild(symEl);
      }
    }

    self.vp_commentsVisible = false;
    if (self._vp_btn_comments)
    {
      self._vp_btn_comments.setAttribute("aria-disabled", "true");
      self._vp_btn_comments.title = "Source unavailable";
      self._vp_btn_comments.classList.add("disabled");
    }

    return self;
  };

  self.constructor();
  return self;
});
