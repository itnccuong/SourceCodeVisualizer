require ("./vpw_outline_window.js");
require ("./vpw_message_window.js");
require ("../vgf/vgf_widget.js");
require ("../vgf/vgf_world.js");
require ("./vpw_button_movable_dockable.js");
require ("./vpw_entity_connection.js");


/**
 *  Extension for `VgfWorld`.
 *  Mainly to provide visualizing options for
 *   outline entities
 **/

const VpwWorld = (function()
{
  let self = new VgfWorld ();

  // ---------------------------------------------------

  self.constructor = function()
  {

    return self;
  }


  // ---------------------------------------------------

  /**
   *  @brief: Create an interactive message box window on screen
   **/
  self.visualizeMessageBox = function(viewEntity_message, isRoot = true){
    let outlineWindow = new VpwMessageWindow (viewEntity_message);
    self.vp_addWindow (outlineWindow);
    if (self.vp_graph)
      self.vp_graph.addNode(outlineWindow, isRoot);
    outlineWindow.vp_fitToContent();
    return outlineWindow;
  }

  // ---------------------------------------------------

  /**
   *  @brief: Create an interactive window containing code outline on screen
   **/
  self.visualizeOutline = function(viewEntity, isRoot = true){
    let outlineWindow = VpwOutlineWindow (viewEntity);

    self.vp_addWindow (outlineWindow);
    if (self.vp_graph)
      self.vp_graph.addNode(outlineWindow, isRoot);
    outlineWindow.vp_fitToContent();

    return outlineWindow;
  }


  // ---------------------------------------------------

  /**
   * @return: succcess: ConnectionLine object
   *          no success: null
   **/
  self.connection_createIfNotExisting = function(source, target, sourceAnchor = null)
  {
    if (!source || !target) return null;
    const connections = Connectable.getInterface(source)?.getConnections();
    if (connections)
    {
      for (const connection of connections)
      {
        if (connection._vp_domTarget !== target) continue;
        const existing = connection._vp_sourceAnchor;
        if (!existing && !sourceAnchor) return connection;
        if (!existing || !sourceAnchor || existing.uri !== sourceAnchor.uri) continue;
        if (existing.range.every((position, index) =>
          position.line === sourceAnchor.range[index].line
          && position.character === sourceAnchor.range[index].character))
          return connection;
      }
    }
    return self._connection_create(source, target, sourceAnchor);
  }

  // ---------------------------------------------------

  /**
   * @return: succcess: ConnectionLine object
   *          no success: null
   **/
  self._connection_create = function(source, target, sourceAnchor = null)
  {
    if (!target || !source) return null;
    let connection = new VpwEntityConnection(source, target, sourceAnchor);
    if (self.vp_graph)
    {
      const sourceWindow = source.closest(".Window_OuterFrame");
      const targetWindow = target.closest(".Window_OuterFrame");
      const sourceId = sourceWindow?.vp_canvasNodeId ?? null;
      const targetId = targetWindow?.vp_canvasNodeId ?? null;
      if (sourceId)
        self.vp_graph.addEdge(connection, sourceId, targetId);
    }
    return connection;
  }



  /**
   *   @return: viewEntityRepresentation object corresponding to
   *             `viewEntity`
   *            OR `null`, if there is none
   *
   **/
  self.window_getFromOutlineEntity = function(outlineEntity){
    // setup
    let collection = self.vp_children();

    // run
    for (let i = 0; i < collection.length; ++i){
      let vpwWidget = collection[i];
      if (vpwWidget.vp_isCodeOutline)
      if (OutlineEntityFunctions.equals (vpwWidget.viewEntity.vp_model, outlineEntity))
        return vpwWidget;
    }

    return null;
  }


  self.vp_outline_openLocationDefiner = function(outlineEntity, requestee_nullable)
  {
    gController.outline_requestLocationDefiner (outlineEntity, requestee_nullable);
  }



  self.vp_host_openRawSource = function(outlineEntity)
  {
    gController.host_openRawSource(outlineEntity);
  }



  self.vp_outline_openSymbolAt = function (uri, selectionStart, selectionEnd, requestee_nullable, sourceAnchor = null)
  {
    gController.outline_requestByFilePosition (uri, selectionStart, selectionEnd, requestee_nullable, sourceAnchor);
  }



  self.vp_outline_openEntity = function(uri, outlineEntity, requestee)
  {
    return gController.outline_request (uri, outlineEntity, requestee);
  }



  self.constructor();
  return self;
});


