import * as vscode from 'vscode';
import {WebviewCreator} from './webviewcreator';
import * as Outline from "../outlineproviderAPI/SymbolDefinition";
import * as utils from '../utils';
import { promises } from 'dns';
import { request } from 'http';
import { VsCodeWindow } from './adapter/vscodewindow';
import { DefinitionOutlineResult, DefinitionTarget } from '../outlineproviderAPI/outlineprovider';
import {translateOutlineRanges} from './outline_entities';
import {CanvasFileV1, parseCanvasFile} from './canvas_format';

export interface ResolvedCanvas {
  canvas: CanvasFileV1;
  nodes: Array<{
    id: string;
    outline?: Outline.File | Outline.Symbol;
    unavailable?: string;
  }>;
  edges: Array<{
    id: string;
    anchorStatus: 'exact' | 'changed' | 'missing';
  }>;
}

interface OutlineResponse {
  type: 'visualizeOutline' | 'outline_cancelled' | 'messageBox';
  requestedId: string | null;
  data?: unknown;
}

interface CanvasTabManager {
  saveCanvas(tab?: VisualizingTab, requestedId?: string | null): Promise<void>;
  loadCanvas(tab?: VisualizingTab, requestedId?: string | null): Promise<void>;
  onTabDisposed(tab: VisualizingTab): void;
}

export class VisualizingTab
{
  private readonly _vscodeWindow: any;
  private _vscodeWindow2: VsCodeWindow;
  private _context: any;

  private __webviewPanel: vscode.WebviewPanel | null = null;
  private _isReady = false;
  private readonly _queuedMessages: unknown[] = [];
  private readonly _readyDeferred: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private _nextOperationId = 0;
  private readonly _pendingExportRequests = new Map<string, { resolve: (val: { canvas: CanvasFileV1; pendingNavigation: boolean }) => void; reject: (err: Error) => void }>();
  private readonly _pendingRestoreRequests = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();
  private _manager?: CanvasTabManager;

  // -------------------------------------------------------------------------

  public constructor(vscodeWindow:  any,
                     context:       any,
                     title = 'Code Diagram',
                     manager?: CanvasTabManager)
  {
    this._vscodeWindow = vscodeWindow;
    this._vscodeWindow2 = new VsCodeWindow (vscodeWindow);
    this._context = context;
    this._manager = manager;

    const panel = WebviewCreator.createWebview(this._context, this._vscodeWindow2, title);
    this.__webviewPanel = panel;
    panel.onDidDispose(
      () => {
        this.__webviewPanel = null;
        this._isReady = false;
        this._queuedMessages.length = 0;
        for (const waiter of this._readyDeferred) waiter.reject(new Error('Panel disposed'));
        this._readyDeferred.length = 0;
        for (const req of this._pendingExportRequests.values()) {
          req.reject(new Error('Panel disposed'));
        }
        this._pendingExportRequests.clear();
        for (const req of this._pendingRestoreRequests.values()) {
          req.reject(new Error('Panel disposed'));
        }
        this._pendingRestoreRequests.clear();
        this._manager?.onTabDisposed(this);
      },
      null, this._context.subscriptions
    );
    panel.webview.onDidReceiveMessage(message => {
      return this._receiveMessage(message, panel);
    });
  }

  public get panel(): vscode.WebviewPanel | null {
    return this.__webviewPanel;
  }

  public reveal(): void {
    this.__webviewPanel?.reveal();
  }

  public waitReady(): Promise<void> {
    if (!this.__webviewPanel) return Promise.reject(new Error('Canvas tab is closed'));
    if (this._isReady) return Promise.resolve();
    return new Promise<void>((resolve, reject) => this._readyDeferred.push({ resolve, reject }));
  }

  public postMessageToPanel(message: unknown): void {
    if (!this.__webviewPanel) return;
    if (!this._isReady) {
      this._queuedMessages.push(message);
    } else {
      this._sendMessage(message);
    }
  }

  private _sendMessage(message: unknown): void {
    const panel = this.__webviewPanel;
    if (!panel) return;
    const rejectRequest = (error: unknown) => {
      if (!this._isRecord(message) || typeof message.requestId !== 'string') return;
      const id = message.requestId;
      const pending = this._pendingExportRequests.get(id) ?? this._pendingRestoreRequests.get(id);
      this._pendingExportRequests.delete(id);
      this._pendingRestoreRequests.delete(id);
      pending?.reject(error instanceof Error ? error : new Error(String(error)));
    };
    panel.webview.postMessage(message).then(delivered => {
      if (!delivered) rejectRequest(new Error('Canvas did not receive the operation request'));
    }, rejectRequest);
  }

  // ------------------------------------------------------------------------

  /**
   *  Lazy initialization of webview
   **/
  public getWebviewPanel(): vscode.WebviewPanel | null
  {
    return this.__webviewPanel;
  }

  // -------------------------------------------------------------------------

  /**
   * Visualize definition OF THE BEGINNING of a selection
   **/
  public visualizeCurrentDocument(): void
  {
    // setup
    const activeEditor = this._vscodeWindow.activeTextEditor;
    if (null == activeEditor) {
      this._vscodeWindow.showErrorMessage("Cannot visualize. No document is focussed. Please focus a document.");
    }
    let document   = activeEditor.document;

    // run
    this.visualizeDocument(document);
  }

  // -------------------------------------------------------------------------


  public async visualizeDocument(document: vscode.TextDocument)
  {
    // setup
    let requestedId: any = null;
    let outlineFile: Outline.File | undefined = undefined;

    try {
      outlineFile = await vscode.commands.executeCommand <Outline.File>(
                        "vp.executeDocumentDefinitionProvider", document)
    } catch (e) {
      this._vscodeWindow.showErrorMessage(e);
    }

    if (!outlineFile)
    {
      this._vscodeWindow.showErrorMessage("Could not visualize");
      return;
    }

    await translateOutlineRanges ([outlineFile]);

    // run
    this._postOutlineEntities([outlineFile], requestedId);

  }

  // -------------------------------------------------------------------------

  /**
   * Visualize definition OF THE BEGINNING of a selection
   **/
  public async visualizeSelections(document: vscode.TextDocument, selections: readonly vscode.Selection[]): Promise<void>
  {
    if (!this.__webviewPanel) return;
    this.reveal();
    const panel = this.__webviewPanel;
    for (const selection of selections) {
      await this._getOutlineAndSend(document.uri, selection.start, null, selection.start, panel);
    }
  }


  // -------------------------------------------------------------------------

  private _receiveMessage(JSONmessage: unknown,
                          requestPanel: vscode.WebviewPanel | null = this.__webviewPanel)
  {
    if (!this._isRecord(JSONmessage)) {
      return;
    }
    if (!requestPanel || requestPanel !== this.__webviewPanel) {
      return;
    }
    const requestId = typeof JSONmessage.requestId === 'string' ? JSONmessage.requestId : null;
    const type = JSONmessage.type;
    const data = JSONmessage.data;

    switch (type) {
      case "canvas_ready":
        {
          if (this._isReady) break;
          this._isReady = true;
          for (const queued of this._queuedMessages) this._sendMessage(queued);
          this._queuedMessages.length = 0;
          for (const waiter of this._readyDeferred) waiter.resolve();
          this._readyDeferred.length = 0;
        }
        break;
      case "canvas_save":
        {
          if (requestId) void this._manager?.saveCanvas(this, requestId);
        }
        break;
      case "canvas_load":
        {
          if (requestId) void this._manager?.loadCanvas(this, requestId);
        }
        break;
      case "canvas_export_response":
        {
          if (requestId && this._pendingExportRequests.has(requestId)) {
            const req = this._pendingExportRequests.get(requestId)!;
            this._pendingExportRequests.delete(requestId);
            try {
              if (JSONmessage.error) throw new Error(String(JSONmessage.error));
              if (typeof JSONmessage.pendingNavigation !== 'boolean') throw new Error('Invalid canvas export response');
              req.resolve({
                canvas: parseCanvasFile(JSONmessage.data),
                pendingNavigation: JSONmessage.pendingNavigation
              });
            } catch (error) {
              req.reject(error instanceof Error ? error : new Error(String(error)));
            }
          }
        }
        break;
      case "canvas_restore_result":
        {
          if (requestId && this._pendingRestoreRequests.has(requestId)) {
            const req = this._pendingRestoreRequests.get(requestId)!;
            this._pendingRestoreRequests.delete(requestId);
            if (JSONmessage.error !== null) {
              req.reject(new Error(typeof JSONmessage.error === 'string' ? JSONmessage.error : 'Invalid canvas restore response'));
            } else {
              req.resolve();
            }
          }
        }
        break;
      case "outline_requestByFilePosition":
        {
          const navigationData: Record<string, unknown> = this._isRecord(data) ? data : {};
          return this._getOutlineAndSend(navigationData.uri, navigationData.cursorStart, requestId,
                                        navigationData.cursorEnd, requestPanel);
        }
      case "outline_requestLocationDefiner":
        {
          // return the parent entity of a given outlineEntity.
          // IMPORTANT: this will not return a parent class of
          //            a child class. Instead, it will return
          //            the file or namespace the child class
          //            is in.
          this._outline_requestLocationDefinerAndSend(data, requestId, requestPanel);
        }
        break;
      case "vp_host_openRawSource":
        {
          let outlineEntity: Outline.OutlineRange = Outline.OutlineRange.fromRawObject (data);
          this._showOutlineEntityInRawSource (outlineEntity);
        }
        break;

      default:
    }
    return;
  }

  // ------------------------------------------------------------------------


  private _showOutlineEntityInRawSource (outlineEntity: Outline.OutlineRange)
  {
    vscode.workspace.openTextDocument(vscode.Uri.parse (outlineEntity.uri)).then(doc => {
      vscode.window.showTextDocument(doc).then(editor =>
        {
          if (!outlineEntity.displayTextRange)
            return;

          let rangeStart = outlineEntity.displayTextRange.start;
          let rangeEnd = outlineEntity.displayTextRange.end;

          // Put visible editor range here
          var range = new vscode.Range(rangeStart, rangeEnd);
          editor.revealRange(range);

          // Put a cursor at the beginning of the range
          editor.selections = [new vscode.Selection (rangeStart,rangeStart)];
        });
    });
  }


  // ------------------------------------------------------------------------

  private async _getOutlineAndSend(uri: unknown,
                                  cursorStart: unknown,
                                  requestedId: string | null,
                                  cursorEnd: unknown,
                                  requestPanel: vscode.WebviewPanel | null = this.__webviewPanel)
  {
    let response: OutlineResponse;
    try {
      const position = this._normalizeNavigationPosition(cursorStart, 'cursorStart');
      this._normalizeNavigationPosition(cursorEnd, 'cursorEnd');
      let documentUri: vscode.Uri;
      if (uri instanceof vscode.Uri) {
        documentUri = uri;
      } else if (typeof uri === 'string' && uri.length > 0) {
        documentUri = vscode.Uri.parse(uri, true);
      } else {
        throw new Error('A source navigation request must include a valid URI.');
      }

      const definitionResults = await vscode.commands.executeCommand<DefinitionOutlineResult>(
        'vp.executeDefinitionProvider', documentUri, position,
        (targets: readonly DefinitionTarget[]) => this._chooseDefinitionTarget(targets));
      if (definitionResults === null) {
        response = {type: 'outline_cancelled', requestedId};
      } else if (definitionResults === undefined) {
        throw new Error('The definition provider did not return a result.');
      } else if (definitionResults.length === 0) {
        response = this._definitionNotFoundMessage(requestedId);
      } else {
        const entities = await translateOutlineRanges(definitionResults);
        response = {type: 'visualizeOutline', requestedId, data: entities};
      }
    } catch (error) {
      const message = this._isRecord(error) && 'message' in error
        ? String(error.message)
        : String(error);
      response = {
        type: 'messageBox',
        requestedId,
        data: [{type: 'Error', title: 'Source navigation failed', message}]
      };
    }
    this._postOutlineMessage(response, requestPanel);
  }

  // -------------------------------------------------------------------------

  private _processFoundOutlineEntities(foundEntities: Outline.OutlineRange[] | Error | undefined,
                                       requestedId: string | null,
                                       requestPanel: vscode.WebviewPanel | null)
  {
    if(!foundEntities)
    {
      foundEntities = [];
    }

    if (foundEntities instanceof Error){
      vscode.window.showErrorMessage(foundEntities.message);
    }
    else
    {
      // send current selection to outliner
      this._postOutlineEntities(foundEntities, requestedId, requestPanel);
    }
  }

  // -------------------------------------------------------------------------

  /**
   *  "LocationDefiner" is in some sense the "parent" of an entity.
   *  File                  <-- "LocationDefiner" of class1, class2
   *    |
   *    |-- class1          <-- "LocationDefiner" of func1, func2
   *    |     |-- func1
   *    |     |-- func2
   *    |
   *    |-- class2
   **/
  private _outline_requestLocationDefinerAndSend(outlineEntity: unknown,
                                          requestId: string | null,
                                          requestPanel: vscode.WebviewPanel | null)
  {
    let self = this;

    if (!this._isRecord(outlineEntity) || typeof outlineEntity.uri !== 'string'
        || !Array.isArray(outlineEntity.displayTextRange))
    {
      self._processFoundOutlineEntities([], requestId, requestPanel);
      return false;
    }
    const uri = vscode.Uri.parse(outlineEntity.uri);

    const position = this._normalizeNavigationPosition(outlineEntity.displayTextRange[0],
                                                       'displayTextRange.start');


    let promise = self._outline_getLocationDefiner (uri, position);
    promise.then ( (foundEntities) =>
    {
      self._processFoundOutlineEntities(foundEntities, requestId, requestPanel);
    });

    return true;
  }


  // -------------------------------------------------------------------------

  private _isRecord(value: unknown): value is Record<string, unknown>
  {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private _normalizeNavigationPosition(position: unknown, name: string): vscode.Position
  {
    if (this._isRecord(position)) {
      const {line, character} = position;
      if (typeof line === 'number' && Number.isSafeInteger(line) && line >= 0
          && typeof character === 'number' && Number.isSafeInteger(character) && character >= 0) {
        return new vscode.Position(line, character);
      }
    }
    throw new Error(`Invalid ${name}: expected nonnegative integer line and character values.`);
  }

  private async _chooseDefinitionTarget(targets: readonly DefinitionTarget[])
    : Promise<DefinitionTarget | undefined>
  {
    const items = await Promise.all(targets.map(async target => {
      const {uri, selectionRange} = target;
      const filename = utils.path_getFilename(uri.path);
      let label = filename;
      let detail = uri.toString();
      if (/\.pyi$/i.test(uri.path)) {
        detail += '\nType stub — declaration only';
      }
      try {
        const document = await vscode.workspace.openTextDocument(uri);
        const isFileRoot = selectionRange.isEmpty
          && selectionRange.start.line === 0 && selectionRange.start.character === 0;
        if (!isFileRoot) {
          const firstLine = document.getText(selectionRange).split(/\r?\n/, 1)[0].trim();
          if (firstLine) {
            label = firstLine;
          }
        }
      } catch {
        detail += '\nSource unavailable';
      }
      return {
        label,
        description: `${vscode.workspace.asRelativePath(uri)}:${selectionRange.start.line + 1}:${selectionRange.start.character + 1}`,
        detail,
        target
      };
    }));
    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a definition to open',
      matchOnDescription: true,
      matchOnDetail: true,
      canPickMany: false
    });
    return selected?.target;
  }

  // -------------------------------------------------------------------------

  /**
   *
   **/
  private async _outline_getLocationDefiner(document: vscode.Uri,
                                          position: vscode.Position):
    Promise<Outline.OutlineRange[] | Error | undefined>
  {
    let definitionResults = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
                          "vp.executeLocationDefinerProvider", document, position);

    // translate
    if (definitionResults){
      return translateOutlineRanges (definitionResults);
    }

    return definitionResults;
  }

  // ------------------------------------------------------------------------


  // ------------------------------------------------------------------------

  private _postOutlineEntities(outlineEntities: Outline.OutlineRange[],
                                requestedId: string | null = null,
                                requestPanel: vscode.WebviewPanel | null = this.__webviewPanel)
  {
    if (0 == outlineEntities.length) {
      this._postOutlineMessage(this._definitionNotFoundMessage(requestedId), requestPanel);
      return false;
    } else {
      this.message_post_visualizeOutline(outlineEntities, requestedId, requestPanel);
      return true;
    }
  }

  // -------------------------------------------------------------------------

  private message_post_visualizeOutline(entities: Outline.OutlineRange[],
    requestedId: string | null = null,
    requestPanel: vscode.WebviewPanel | null = this.__webviewPanel) {
    this._postOutlineMessage({
      type: 'visualizeOutline',
      data: entities,
      requestedId
    }, requestPanel);
  }

  // -------------------------------------------------------------------------

  private _definitionNotFoundMessage(requestedId: string | null): OutlineResponse {
    return {
      type: 'messageBox',
      requestedId,
      data: [{
        type: 'Error',
        title: 'Definition not found',
        message: 'No source definition was returned for this location.'
      }]
    };
  }

  private _postOutlineMessage(message: OutlineResponse,
                              requestPanel: vscode.WebviewPanel | null = this.__webviewPanel) {
    const panel = requestPanel ?? this.__webviewPanel;
    if (!panel || panel !== this.__webviewPanel) {
      return;
    }
    this.postMessageToPanel(message);
  }

  public exportCanvasState(): Promise<{ canvas: CanvasFileV1; pendingNavigation: boolean }> {
    if (!this.__webviewPanel) {
      return Promise.reject(new Error('Canvas tab is closed'));
    }
    const requestId = 'export_' + (++this._nextOperationId);
    return new Promise((resolve, reject) => {
      this._pendingExportRequests.set(requestId, { resolve, reject });
      this.postMessageToPanel({
        type: 'canvas_export_request',
        requestId
      });
    });
  }

  public async restoreCanvas(state: ResolvedCanvas): Promise<void> {
    if (!this.__webviewPanel) {
      throw new Error('Canvas tab is closed');
    }
    await this.waitReady();
    if (!this.__webviewPanel) throw new Error('Canvas tab is closed');
    const requestId = 'restore_' + (++this._nextOperationId);
    return new Promise<void>((resolve, reject) => {
      this._pendingRestoreRequests.set(requestId, { resolve, reject });
      this.postMessageToPanel({
        type: 'canvas_restore',
        requestId,
        data: state
      });
    });
  }
  // ------------------------------------------------------------------------

}
