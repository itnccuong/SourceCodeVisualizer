import * as vscode from 'vscode';
import {WebviewCreator} from './webviewcreator';
import * as Outline from "../outlineproviderAPI/SymbolDefinition";
import * as utils from '../utils';
import { promises } from 'dns';
import { request } from 'http';
import { VsCodeWindow } from './adapter/vscodewindow';
import { DefinitionOutlineResult, DefinitionTarget } from '../outlineproviderAPI/outlineprovider';

interface OutlineResponse {
  type: 'visualizeOutline' | 'outline_cancelled' | 'messageBox';
  requestedId: string | null;
  data?: unknown;
}

export class VisualizingTab
{
  private readonly _vscodeWindow: any;
  private _vscodeWindow2: VsCodeWindow;
  private _context: any;

  // lazy init; use ONLY through getWebviewPanel()
  private __webviewPanel: vscode.WebviewPanel | null = null;

  // -------------------------------------------------------------------------

  public constructor(vscodeWindow:  any,
                     context:       any)
  {
    this._vscodeWindow = vscodeWindow;
    this._vscodeWindow2 = new VsCodeWindow (vscodeWindow);

    this._context = context;
  }

  // ------------------------------------------------------------------------

  /**
   *  Lazy initialization of webview
   **/
  private getWebviewPanel()
  {
    if (null == this.__webviewPanel) {
      const panel = WebviewCreator.createWebview(this._context, this._vscodeWindow2);
      this.__webviewPanel = panel;
      panel.onDidDispose(
          () => {
            if (this.__webviewPanel === panel) {
              this.__webviewPanel = null;
            }
          },
          null, this._context.subscriptions
        );
      panel.webview.onDidReceiveMessage(message => {
        return this._receiveMessage(message, panel);
      });
    }
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

  /**
   * Visualize definition OF THE BEGINNING of a selection
   **/
  public visualizeDocumentFromUri(uri: vscode.Uri): void
  {
    // setup
    vscode.workspace.openTextDocument (uri).
    then ( document =>
    {
      if (!document)
      this._vscodeWindow.showErrorMessage("Cannot visualize. No document is focussed. Please focus a document.");

      // run
      this.visualizeDocument(document);
    });
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

    await this._translate_outlineRanges2outlineEntities ([outlineFile]);

    // run
    this._postOutlineEntities([outlineFile], requestedId);

  }

  // -------------------------------------------------------------------------

  /**
   * Visualize definition OF THE BEGINNING of a selection
   **/
  public visualizeFromCursorPositions(): void
  {
    // setup
    const activeEditor = this._vscodeWindow.activeTextEditor;
    if (null == activeEditor) {
      this._vscodeWindow.showErrorMessage("Cannot visualize. No document is focussed. Please focus a document.");
    }
    let document   = activeEditor.document;
    let selections = activeEditor.selections

    // run
    this._visualizeSelectionInDocument(document, selections);
  }

  // -------------------------------------------------------------------------

  private _visualizeSelectionInDocument(document: vscode.TextDocument,
                                        selections: vscode.Selection[])
  {
    // run
    selections.forEach ( (selection) =>
    {
      let position = selection.start;
      this._getOutlineAndSend(document.uri, position, null, position);
    });
  }


  // -------------------------------------------------------------------------

  private _receiveMessage(JSONmessage: unknown,
                          requestPanel: vscode.WebviewPanel | null = this.__webviewPanel)
  {
    if (!this._isRecord(JSONmessage)) {
      return;
    }
    const requestId = typeof JSONmessage.requestId === 'string' ? JSONmessage.requestId : null;
    const type = JSONmessage.type;
    const data = JSONmessage.data;

    switch (type) {
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
        const entities = await this._translate_outlineRanges2outlineEntities(definitionResults);
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
      return this._translate_outlineRanges2outlineEntities (definitionResults);
    }

    return definitionResults;
  }

  // ------------------------------------------------------------------------

  /**
   * OutlineSymbols do not contain strings of their content.
   * OutlineEntities are like OutlineSymbols, but with strings for their content
   **/
  private async _translate_outlineRanges2outlineEntities (outlineRanges: Outline.OutlineRange[])
  {
    for (let i=0; i<outlineRanges.length; ++i){
      let outlineRange: Outline.OutlineRange = outlineRanges[i];
      let doc = await vscode.workspace.openTextDocument ( vscode.Uri.parse (outlineRange.uri));
      _outlineRange2outlineEntity (outlineRange, doc);
    }
    return outlineRanges;

    // ----------

    function _outlineRange2outlineEntity(outlineRange: Outline.OutlineRange,
                                         doc:          vscode.TextDocument)
    {

      if (outlineRange instanceof Outline.Symbol){
        // fill displayText
        if (outlineRange.displayTextRange)
          outlineRange.displayText = doc.getText( outlineRange.displayTextRange );
        else
          outlineRange.displayText = "<UNKNOWN>";
        if (/\.pyi$/i.test(doc.uri.path)
            && !outlineRange.attributes.some(attribute => attribute.kind === 'Type stub — declaration only')) {
          const attribute = new Outline.Attribute();
          attribute.kind = 'Type stub — declaration only';
          attribute.uri = outlineRange.uri;
          attribute.language = outlineRange.language;
          outlineRange.attributes.push(attribute);
        }
      }
      else
      if (outlineRange instanceof Outline.File){
        outlineRange.displayText = utils.path_getFilename (outlineRange.uri);
      }
      else
      if (outlineRange instanceof Outline.Text){
        let outlineText = outlineRange;

        // fill `displayText`
        outlineText.displayText = "<UNKNOWN>";
        if (outlineText.displayTextRange)
          outlineText.displayText = doc.getText( outlineText.displayTextRange );
      }

      for (let i = 0; i < outlineRange.parts.length; ++i)
      {
        let part = outlineRange.parts[i];
        _outlineRange2outlineEntity (part, doc);
      }
    }
  }

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
                              requestPanel: vscode.WebviewPanel | null) {
    const panel = message.requestedId === null ? this.getWebviewPanel() : requestPanel;
    if (!panel || (message.requestedId !== null && panel !== this.__webviewPanel)) {
      return;
    }
    panel.webview.postMessage(message);
  }

  // ------------------------------------------------------------------------

}
