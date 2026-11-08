require ("../vpw/vpw_world.js");
require ("../vgf/vgf_navigationarea.js");
require ("window_positioner.js");
require ("view_entity.js");
require ("request_message.js");
require ("outline_object_functions.js");
require ("canvas_graph.js");
require ("canvas_selection.js");
require ("canvas_camera.js");
require ("canvas_controls.js");
require ("canvas_persistence.js");


class RequestInformation
{
  static CALLEE = "callee";
  static CALLER = "caller";

  requestee = null;
  sourceAnchor = null;
  // CALLEE => visualize a call; I.e. put the new
  //           outline to the right of the requestee
  // CALLER => visualize a caller; I.e. put the new
  //           outline to the left of the requestee
  //requestDirection = RequestInformation.CALLEE;
  requestDirection = RequestInformation.CALLEE;
}


class Controller
{
  // -------------------------------------------------------

  /**
   *  Param systemDomRoot: DOM node that is used as root node for
   *                       the whole system
   **/
  constructor(systemDomRoot)
  {

    this._vp_world = new VpwWorld();
    this._graph = new CanvasGraph(this._vp_world, this);
    this._vp_world.vp_graph = this._graph;
    let navigationArea = new VgfNavigationArea (this._vp_world);
    this._selection = new CanvasSelection (this._graph, this._vp_world, navigationArea);
    this._vp_world.vp_selection = this._selection;
    this._camera = new CanvasCamera (this._vp_world, navigationArea, this._graph);
    this._vp_world.vp_camera = this._camera;
    this._controls = new CanvasControls (this._graph, this._vp_world, navigationArea, this._camera, this);
    this._vp_world.vp_controls = this._controls;
    systemDomRoot.appendChild (navigationArea);


    // List of requested outlines. This way we know
    //  where to place an incomming outline
    // Index is the ID
    // Containing object is a VpwOutlineWindow
    this._request_awaitingRequests = {};
    // used for creating unique IDs for requesting outlines
    // ONLY USE VIA ACCESS FUNCTION!
    this._nextRequestId = 0;
    this._canvasOperations = new Map();

    let self = this;
    window.addEventListener('message', function(e){
      self._message_receive(e,self);
    });
  }

  // -------------------------------------------------------

  /**
   *  @brief: Callback for when the `openDeclaration-button` was pressed
   *  @return: true  => `openDeclaration` was processed
   *           false => Did not run `openDeclaration`
   **/
  onKeyDown_openDeclaration(){
    const sourceSurface = node => {
      const element = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
      return element ? element.closest ("[data-vp-source-surface]") : null;
    };
    const focusedElement = document.activeElement;
    let surface = sourceSurface (focusedElement);
    if (!surface)
    {
      const selection = window.getSelection ();
      if (selection && selection.rangeCount > 0)
      {
        const selectedSurface = sourceSurface (selection.anchorNode);
        if (selectedSurface && selectedSurface === sourceSurface (selection.focusNode))
          surface = selectedSurface;
      }
    }
    if (surface && typeof surface.vp_request_outline_for_selection === "function")
      return surface.vp_request_outline_for_selection () !== false;

    if (focusedElement && typeof focusedElement.vp_request_outline_for_selection === "function")
    {
      focusedElement.vp_request_outline_for_selection ();
      return true;
    }
    return false;
  }

  // -------------------------------------------------------


  /**
   * Gets the object, the request information, connected
   *  to that request and deletes the index.
   * @return: object, that started a request.
   *          null, if no such object exists.
   **/
  _request_getRequestInformation(strRequestId_nullable_undefiendable)
  {
    let requestInformation = null;
    const strRequestId = strRequestId_nullable_undefiendable;
    if (isObject (strRequestId) && strRequestId != "")
    {
      requestInformation = this._request_awaitingRequests[strRequestId];
      delete this._request_awaitingRequests[strRequestId];
    }

    return requestInformation;
  }

  // ----------------------------------------------------------------

  show_debug_message(message)
  {
    let log = document.createElement("div");
    log.style.border = "1px solid black";
    log.innerText = "Debug message: " + message;
    document.body.insertBefore (log, document.body.firstChild);
  }

  // ----------------------------------------------------------------

  /**
   * Convert CALLER/CALLEE information to LEFT/RIGHT information
   **/
  _requestDirection2visualizationLocation(requestDirection)
  {
    switch (requestDirection)
    {
      case RequestInformation.CALLEE:
        return Direction.RIGHT;
      case RequestInformation.CALLER:
        return Direction.LEFT;
    }
    return Direction.RIGHT;
  }


  // ----------------------------------------------------------------

  /**
   * Visualize outlineEntities within `requestMessage` on screen.
   **/
  _visualizeOutline(requestMessage)
  {
    let self = this;

    const requestedId = requestMessage.getRequestId();
    let requestInfo = this._request_getRequestInformation (requestedId);
    if (!requestInfo)
    {
      if (requestedId !== null)
        return;
      requestInfo = new RequestInformation ();
    }

    const isRoot = (requestedId === null) || (requestInfo.requestDirection === RequestInformation.CALLER);
    // translate direction
    let visualizingLocation = this._requestDirection2visualizationLocation (requestInfo.requestDirection);

    const requestee = requestInfo.requestee && this._vp_world.contains(requestInfo.requestee)
      ? requestInfo.requestee : null;
    let positioner = new WindowPositioner (this._vp_world, requestee, visualizingLocation);
    let lastCreatedWindow = null;

    // visualize all outlineEntities
    const outlineEntities = requestMessage.getOutlineEntities ();

    for (let i=0; i<outlineEntities.length; ++i)
    {
      let outlineEntity = outlineEntities[i];
      let managedWindow = self._window_focusFromOutlineEntity (outlineEntity);
      const created = !managedWindow;

      if (!managedWindow)
      {
        managedWindow = self._managedWindow_create(requestMessage, outlineEntity, 0, 0, isRoot);
        const position = positioner.placeWindow(managedWindow);
        managedWindow.vp_setXY(position.x, position.y);
        lastCreatedWindow = managedWindow;
      }
      else
      {
        if (isRoot && managedWindow.vp_canvasNodeId && self._graph)
          self._graph.promoteToRoot(managedWindow.vp_canvasNodeId);
      }

      // A late response must not attach connections to a deleted requestee.
      if (RequestInformation.CALLEE == requestInfo.requestDirection && requestee)
        self._connection_createIfNotExisting (requestee, managedWindow, requestInfo.sourceAnchor);

      // Start presentation only after attached sizing, final placement and wiring.
      if (created) managedWindow.vp_animateEntrance();

    }
    if (lastCreatedWindow) positioner.revealWindow(lastCreatedWindow);
  }

  // ----------------------------------------------------------------

  /**
   * @return true, entity was focuessed
   *          false, entity could not be focussed (= it does not exist, yet)
   **/
  _outlineEntity_tryFocusAndConnect (newOutlineEntity, source)
  {
    let target = this._window_focusFromOutlineEntity (newOutlineEntity);
    if (target)
    {
      this._connection_createIfNotExisting (source, target);
      return true;
    }
    return false;
  }

  // -------------------------------------------------------

  /**
   *   @param: type: VpwOutlineWindow
   **/
  _window_focusAndConnect (dom_sourceWindow, dom_targetWindow){
    this._connection_createIfNotExisting (dom_sourceWindow, dom_targetWindow)
    dom_targetWindow.vp_focus();
  }

  // -------------------------------------------------------

  /**
   *  @param: type: VpwOutlineWindow
   *  @return: success: connection between entities
   *           fail: null (if no connection could be created)
   **/
  _connection_createIfNotExisting(dom_source_nullable, dom_target_nullable, sourceAnchor = null)
  {
    if (isObject(dom_source_nullable) && isObject (dom_target_nullable))
    {
      return this._vp_world.connection_createIfNotExisting (dom_source_nullable, dom_target_nullable, sourceAnchor);
    }
    return null;
  }

  // -------------------------------------------------------

  /**
   *   @return: entity corresponding to `outlineEntity`
   *           null, if there is none
   **/
  _managedWindow_create(msg, outlineEntity, windowX, windowY, isRoot = true)
  {
    let viewEntity = new SViewEntity (outlineEntity, windowX, windowY);

    // Add to GUI
    if (msg.isOutline()){
      return this._vp_world.visualizeOutline (viewEntity, isRoot);
    }else if (msg.isMessage())
      return this._vp_world.visualizeMessageBox (viewEntity, isRoot);

    return null;
  }

  cancelRequestsForFrames(nodeIdSet)
  {
    for (const [reqId, reqInfo] of Object.entries(this._request_awaitingRequests))
    {
      if (reqInfo && reqInfo.requestee)
      {
        const topFrame = reqInfo.requestee.closest(".Window_OuterFrame");
        if (topFrame && topFrame.vp_canvasNodeId && nodeIdSet.has(topFrame.vp_canvasNodeId))
          delete this._request_awaitingRequests[reqId];
      }
    }
  }
  requestSaveCanvas()
  {
    this._requestCanvasOperation("save");
  }

  requestLoadCanvas()
  {
    this._requestCanvasOperation("load");
  }

  _requestCanvasOperation(operation)
  {
    if (this._canvasOperations.has(operation)) return;
    if (typeof gBackend === "undefined" || !gBackend || typeof gBackend.postMessage !== "function")
    {
      this._controls.setStatus("Canvas files require the VS Code extension host.");
      return;
    }
    const requestId = this._requestId_get();
    this._canvasOperations.set(operation, requestId);
    this._controls.setOperationPending(operation, true);
    try
    {
      gBackend.postMessage({type: `canvas_${operation}`, requestId});
    }
    catch (err)
    {
      this._canvasOperations.delete(operation);
      this._controls.setOperationPending(operation, false);
      this._controls.setStatus("Error: " + (err instanceof Error ? err.message : String(err)));
    }
  }


  // -------------------------------------------------------

  /**
   *  brief: receives a message from IDE (vscode) and processes it.
   **/
  _message_receive(event){
    const message = event.data;
    if (!message) return false;

    if (message.type === "canvas_export_request")
    {
      const requestId = message.requestId;
      try
      {
        WindowPositioner.cancelReveal(this._vp_world);
        for (const node of this._graph.nodes.values())
          node.window.vp_finishEntrance?.();
        const canvasData = CanvasPersistence.serialize(this._graph, this._camera);
        const pendingNav = Object.keys(this._request_awaitingRequests).length > 0;
        if (typeof gBackend !== "undefined" && gBackend && typeof gBackend.postMessage === "function")
        {
          gBackend.postMessage({
            type: "canvas_export_response",
            requestId,
            data: canvasData,
            pendingNavigation: pendingNav
          });
        }
      }
      catch (err)
      {
        if (typeof gBackend !== "undefined" && gBackend && typeof gBackend.postMessage === "function")
        {
          gBackend.postMessage({
            type: "canvas_export_response",
            requestId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      return true;
    }

    if (message.type === "canvas_restore")
    {
      const requestId = message.requestId;
      try
      {
        CanvasPersistence.restore(message.data, this._vp_world, this._graph, this._camera);
        if (typeof gBackend !== "undefined" && gBackend && typeof gBackend.postMessage === "function")
        {
          gBackend.postMessage({
            type: "canvas_restore_result",
            requestId,
            error: null
          });
        }
      }
      catch (err)
      {
        if (typeof gBackend !== "undefined" && gBackend && typeof gBackend.postMessage === "function")
        {
          gBackend.postMessage({
            type: "canvas_restore_result",
            requestId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      }
      return true;
    }

    if (message.type === "canvas_operation_result")
    {
      const resultData = message.data;
      if (!resultData || !["saved", "loaded", "cancelled", "error"].includes(resultData.status))
        return false;
      if (message.requestedId !== null)
      {
        const pending = Array.from(this._canvasOperations).find(([, id]) => id === message.requestedId);
        if (!pending) return false;
        this._canvasOperations.delete(pending[0]);
        this._controls.setOperationPending(pending[0], false);
      }
      if (resultData.status === "error")
        this._controls.setStatus("Error: " + resultData.message);
      else if (resultData.status !== "cancelled")
        this._controls.setStatus(resultData.message);
      return true;
    }

    let msg = new RequestMessage (message);
    if (msg.isCancelled ())
    {
      this._request_getRequestInformation (msg.getRequestId ());
      return true;
    }
    if (msg.isMessage ()){
      this._visualizeOutline (msg);
    } else
    if (msg.isOutline ()){
      this._visualizeOutline (msg);
    } else {
      document.body.innerHTML += "<br>ERROR: did not understand message (no known `type` given): " + JSON.stringify (message);
      return false;
    }

    return true;
  }

  // -------------------------------------------------------

  /**
   * @brief
   * @return: focused entity,  if entity was focused
   *          null          ,  if entity was not focused
   **/
  _window_focusFromOutlineEntity(outlineEntity)
  {
    let window = this._vp_world.window_getFromOutlineEntity (outlineEntity);
    if (isObject (window)){
      window.vp_focus();
      return window;
    }
    return null;
  }

  // -------------------------------------------------------

  /**
   *  @brief Send a message to outliner (vscode) and when the
   *          answer comes (as `message`), render it on screen.
   *  @param: outlineEntity with all necessary content filled
   *  @return: true, if request was send
   *           false, if request was not send because
   *                   requested entity already exists
   **/
  outline_request(uri, outlineEntity, requestee){
    // TODO: performance: <obsolete, but keep for reasoning reasons>
    // Currently we only check if the entity is already shown; if so, focus it.
    //  Otherwise we request it from "the server" (vscode)
    // However, maybe the outline is already here on the client side (webview) and it's just
    //  not shown (like when a function definition is already within the
    //  class definition outline data.
    // REJECTED:
    //  1. func defintion should not be inside class outline (this might only be the case
    //                                                        in the prototype)
    //  2. If the class gets closed and the object destroyed, but not the function definition,
    //     things get nasty


    // If requested entity is already on screen: focus and draw line
    if (this._outlineEntity_tryFocusAndConnect (outlineEntity, requestee))
      return false; // entity exists; no request was sent


    // Otherwise: send out a request
    this.outline_requestByFilePosition (uri,
                                        OutlineEntityFunctions.getPosStart (outlineEntity),
                                        OutlineEntityFunctions.getPosEnd (outlineEntity),
                                        requestee);

    return true;
  }

  // -------------------------------------------------------

  /**
   * returns a requestId, that can be used with `_request_awaitingRequests`
   **/
  _requestId_get(){
    return "a" + this._nextRequestId++;
  };

  // -------------------------------------------------------

  /**
   *   requests the outline on the given position
   **/
  outline_requestByFilePosition(uri,
                                cursorStart, cursorEnd,
                                requestee, sourceAnchor = null)
  {
    let data = {
      uri: uri,
      cursorStart: cursorStart,
      cursorEnd: cursorEnd,
    }

    let requestInformation = new RequestInformation();
    requestInformation.requestee = requestee;
    requestInformation.sourceAnchor = sourceAnchor;

    this._outlineEntity_request ("outline_requestByFilePosition",
                                  data,
                                  requestInformation);
  }

  // -------------------------------------------------------

  outline_reportError(requestee, title, message)
  {
    const requestInformation = new RequestInformation();
    requestInformation.requestee = requestee;
    const requestedId = this._request_memorize (requestInformation);
    this._visualizeOutline (new RequestMessage ({
      type: "messageBox",
      data: [{type: "Error", title, message}],
      requestedId,
    }));
  }

  // -------------------------------------------------------


  outline_requestLocationDefiner(outlineEntity, requestee_nullable)
  {
    let requestInformation = new RequestInformation();
    requestInformation.requestee = requestee_nullable;
    requestInformation.requestDirection = RequestInformation.CALLER;

    this._outlineEntity_request ("outline_requestLocationDefiner",
                                 outlineEntity,
                                 requestInformation);
  }


  // -------------------------------------------------------


  host_openRawSource(outlineEntity)
  {
    // Opening an editor has no diagram reply and must not leave a request ticket.
    gBackend.postMessage({
      type: "vp_host_openRawSource",
      requestId: null,
      data: outlineEntity,
    });
  }


  // -------------------------------------------------------

  /**
   * File a "request ticket":
   * Create a request ID and assoziate it with the object.
   * When the request comes back, the request ID can
   * be used to track the object, that requested it
   *
   * @return: request ID that was created.
   **/
  _request_memorize (requestInformation){
    let requestId = this._requestId_get();

    this._request_awaitingRequests[requestId] = requestInformation;

    return requestId;
  }

  // -------------------------------------------------------

  /**
   * @brief Sends a request to IDE containting an ID, that
   *        will be used, when the answer for the request
   *        is comming back
   **/
  _outlineEntity_request(type, data, requestInformation){

    // remember request
    let requestId = this._request_memorize (requestInformation);

    let message = {
                    type: type,
                    requestId: requestId,
                    data: data
                  };
    //this.show_debug_message ( JSON.stringify (message));

    gBackend.postMessage(message);
  }

  // -------------------------------------------------------

  // -------------------------------------------------------

}