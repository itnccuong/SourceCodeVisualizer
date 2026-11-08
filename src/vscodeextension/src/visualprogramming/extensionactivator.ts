import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import {VisualizingTab, ResolvedCanvas} from './visualizer';
import * as utils from '../utils';
import {CanvasFileV1, parseCanvasFile} from './canvas_format';
import {executeSavedOutlineProvider} from '../outlineproviderAPI/extensionactivator';
import {translateOutlineRanges} from './outline_entities';

export interface LiveTabRecord {
  id: string;
  displayName: string;
  tab: VisualizingTab;
  panel: vscode.WebviewPanel;
  importedUri?: vscode.Uri;
}

export function activate(context: vscode.ExtensionContext)
{
  const tab = new VpTabManager (context);
  const register = utils.registerCommand;
  const c = context;

  register (c, "code-visualizerzer-local.visualize",                     () => tab.visualize ());
  register (c, "code-visualizerzer-local.visualize.fromContextMenu",     () => tab.visualize ());
  register (c, "code-visualizerzer-local.visualize.fromExplorer", (uri: vscode.Uri) => tab.visualizeFileWithDestination(uri));

  register (c, "code-visualizerzer-local.visualizeFile",                 () => tab.visualizeCurrentFile ());

  register (c, "code-visualizerzer-local.saveCanvas",                     () => tab.saveCanvas ());
  register (c, "code-visualizerzer-local.loadCanvas",                     () => tab.loadCanvas ());

  return context;
}

export class VpTabManager
{
  public static readonly viewType = 'codeVisualizer';
  private readonly _context: vscode.ExtensionContext;

  private _newCanvasCounter = 1;
  private _sessionTabCounter = 1;
  private _records: LiveTabRecord[] = [];
  private _activeOrder: LiveTabRecord[] = [];
  private readonly _canvasOperations = new Map<VisualizingTab, Set<'save' | 'load'>>();

  public constructor(context: vscode.ExtensionContext)
  {
    this._context = context;
  }

  private _createNewCanvasTab(name?: string, importedUri?: vscode.Uri): LiveTabRecord
  {
    if (!name)
    {
      const num = this._newCanvasCounter++;
      name = `New-${num}`;
    }
    const panelTitle = `Code Diagram — ${name}`;
    const tab = new VisualizingTab(vscode.window, this._context, panelTitle, this);
    const panel = tab.panel!;
    const record: LiveTabRecord = {
      id: 'canvas_' + (this._sessionTabCounter++),
      displayName: name,
      tab,
      panel,
      importedUri
    };
    this._records.push(record);
    this._activeOrder.unshift(record);

    panel.onDidChangeViewState(e => {
      if (e.webviewPanel.active)
        this._markActive(record);
    }, null, this._context.subscriptions);

    return record;
  }

  public onTabDisposed(tab: VisualizingTab)
  {
    this._records = this._records.filter(r => r.tab !== tab);
    this._activeOrder = this._activeOrder.filter(r => r.tab !== tab);
  }

  private _markActive(record: LiveTabRecord)
  {
    this._activeOrder = [record, ...this._activeOrder.filter(r => r !== record)];
  }

  public getOrCreateMostRecentCanvas(): VisualizingTab
  {
    if (this._activeOrder.length > 0)
      return this._activeOrder[0].tab;
    return this._createNewCanvasTab().tab;
  }

  public async chooseCanvasForVisualization(): Promise<VisualizingTab | undefined>
  {
    interface CanvasPickItem extends vscode.QuickPickItem {
      tabId?: string;
      isNew?: boolean;
    }

    const items: CanvasPickItem[] = [
      { label: "New canvas", description: "Create a new canvas tab", isNew: true }
    ];

    for (const record of this._records)
    {
      const detail = record.importedUri
        ? `Imported · ${record.importedUri.toString()} · canvas ${record.id}`
        : `${record.displayName} · canvas ${record.id}`;
      items.push({
        label: record.displayName,
        detail,
        tabId: record.id
      });
    }

    const chosen = await vscode.window.showQuickPick<CanvasPickItem>(items, {
      placeHolder: "Select a canvas for Visualize This",
      canPickMany: false
    });

    if (!chosen) return undefined;

    if (chosen.isNew)
    {
      return this._createNewCanvasTab().tab;
    }

    const targetRecord = this._records.find(r => r.id === chosen.tabId);
    if (!targetRecord || !targetRecord.tab.panel)
    {
      vscode.window.showErrorMessage("Selected canvas was closed. Run Visualize This again.");
      return undefined;
    }

    targetRecord.tab.reveal();
    return targetRecord.tab;
  }

  public async visualize(): Promise<void>
  {
    const editor = vscode.window.activeTextEditor;
    if (!editor)
    {
      vscode.window.showErrorMessage("Cannot visualize. No document is focussed. Please focus a document.");
      return;
    }

    const document = editor.document;
    const selections = Array.from(editor.selections);
    const tab = await this.chooseCanvasForVisualization();
    if (!tab) return;
    await tab.visualizeSelections(document, selections);
  }

  public async visualizeFileWithDestination(uri: vscode.Uri): Promise<void>
  {
    const tab = await this.chooseCanvasForVisualization();
    if (!tab) return;
    try
    {
      const document = await vscode.workspace.openTextDocument(uri);
      await tab.visualizeDocument(document);
    }
    catch (error)
    {
      const reason = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage("Cannot visualize file: " + reason);
    }
  }

  public visualizeCurrentFile(): void
  {
    this.getOrCreateMostRecentCanvas().visualizeCurrentDocument();
  }

  public async saveCanvas(originatingTab?: VisualizingTab, requestedId: string | null = null): Promise<void>
  {
    const targetTab = originatingTab ?? this._activeOrder[0]?.tab;
    if (!targetTab)
    {
      vscode.window.showWarningMessage("No canvas to save");
      return;
    }
    if (!targetTab.panel) return;
    const operations = this._canvasOperations.get(targetTab) ?? new Set<'save' | 'load'>();
    if (operations.has('save'))
    {
      if (requestedId) targetTab.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
        data: { status: 'cancelled', message: '' } });
      return;
    }
    this._canvasOperations.set(targetTab, operations);
    operations.add('save');

    try
    {
      const exported = await targetTab.exportCanvasState();
      if (!targetTab.panel) return;
      const canvas = parseCanvasFile(exported.canvas);
      const hasDirtyEdits = vscode.workspace.textDocuments.some(doc => doc.isDirty
        && canvas.nodes.some(node => node.content.type === 'source' && node.content.reference.uri === doc.uri.toString()));
      const importedUri = this._records.find(record => record.tab === targetTab)?.importedUri;
      const folder = importedUri
        ? importedUri.with({ path: path.posix.dirname(importedUri.path) })
        : vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(os.homedir());
      const saveUri = await vscode.window.showSaveDialog({
        filters: { 'Canvas JSON': ['json'] },
        defaultUri: importedUri ?? vscode.Uri.joinPath(folder, 'canvas.scv-canvas.json')
      });
      if (!targetTab.panel) return;
      if (!saveUri)
      {
        targetTab.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
          data: { status: 'cancelled', message: '' } });
        return;
      }
      await vscode.workspace.fs.writeFile(saveUri, Buffer.from(JSON.stringify(canvas, null, 2) + "\n", 'utf8'));
      if (!targetTab.panel) return;
      let message = exported.pendingNavigation
        ? "Saved current canvas; pending navigation was not included."
        : "Saved canvas successfully.";
      if (hasDirtyEdits) message += " Unsaved source edits are not stored in this canvas file.";
      message += " Local edits to displayed text are not stored in this canvas file.";
      targetTab.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
        data: { status: 'saved', message } });
    }
    catch (error)
    {
      if (!targetTab.panel) return;
      const message = "Cannot save canvas: " + (error instanceof Error ? error.message : String(error));
      void vscode.window.showErrorMessage(message);
      targetTab.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
        data: { status: 'error', message } });
    }
    finally
    {
      operations.delete('save');
      if (!operations.size) this._canvasOperations.delete(targetTab);
    }
  }

  public async loadCanvas(originatingTab?: VisualizingTab, requestedId: string | null = null): Promise<void>
  {
    if (originatingTab && !originatingTab.panel) return;
    const operations = originatingTab
      ? this._canvasOperations.get(originatingTab) ?? new Set<'save' | 'load'>()
      : null;
    if (operations?.has('load'))
    {
      if (requestedId) originatingTab?.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
        data: { status: 'cancelled', message: '' } });
      return;
    }
    if (originatingTab && operations)
    {
      this._canvasOperations.set(originatingTab, operations);
      operations.add('load');
    }
    let newRecord: LiveTabRecord | undefined;
    let originDisposed: vscode.Disposable | undefined;
    try
    {
      const openUris = await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { 'Canvas JSON': ['json'] }
      });
      if (originatingTab && !originatingTab.panel) return;
      if (!openUris?.length)
      {
        originatingTab?.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
          data: { status: 'cancelled', message: '' } });
        return;
      }
      const fileUri = openUris[0];
      const bytes = await vscode.workspace.fs.readFile(fileUri);
      if (originatingTab && !originatingTab.panel) return;
      const canvasFile = parseCanvasFile(JSON.parse(Buffer.from(bytes).toString('utf8')));
      const resolvedNodes: ResolvedCanvas['nodes'] = [];
      const documents = new Map<string, { document: vscode.TextDocument; version: number }>();
      const declarations = new Map<string, ResolvedCanvas['nodes'][number]>();

      for (const node of canvasFile.nodes)
      {
        if (node.content.type === 'diagnostic')
        {
          resolvedNodes.push({ id: node.id });
          continue;
        }
        try
        {
          const reference = node.content.reference;
          let entry = documents.get(reference.uri);
          if (!entry)
          {
            const document = await vscode.workspace.openTextDocument(vscode.Uri.parse(reference.uri));
            if (originatingTab && !originatingTab.panel) return;
            entry = { document, version: document.version };
            documents.set(reference.uri, entry);
          }
          const outline = await executeSavedOutlineProvider(reference);
          if (originatingTab && !originatingTab.panel) return;
          if (entry.document.version !== entry.version) throw new Error('Source changed during restore');
          await translateOutlineRanges([outline]);
          if (originatingTab && !originatingTab.panel) return;
          if (entry.document.version !== entry.version) throw new Error('Source changed during restore');
          const freshReference = outline.sourceReference;
          if (!freshReference?.documentHash) throw new Error('Provider did not return a persistent source reference');
          const key = JSON.stringify([freshReference.uri, freshReference.type, freshReference.symbol?.declaration ?? null]);
          const resolved: ResolvedCanvas['nodes'][number] = { id: node.id, outline };
          const previous = declarations.get(key);
          if (previous)
          {
            delete previous.outline;
            previous.unavailable = 'Source identity conflict';
            delete resolved.outline;
            resolved.unavailable = 'Source identity conflict';
          }
          else
          {
            declarations.set(key, resolved);
          }
          resolvedNodes.push(resolved);
        }
        catch (error)
        {
          resolvedNodes.push({ id: node.id, unavailable: error instanceof Error ? error.message : String(error) });
        }
      }

      // An edit while resolving a later node invalidates earlier ranges too.
      for (let index = 0; index < canvasFile.nodes.length; index++)
      {
        const node = canvasFile.nodes[index];
        if (node.content.type !== 'source') continue;
        const entry = documents.get(node.content.reference.uri);
        if (entry && entry.document.version !== entry.version)
        {
          delete resolvedNodes[index].outline;
          resolvedNodes[index].unavailable = 'Source changed during restore';
        }
      }
      const nodesById = new Map<string, ResolvedCanvas['nodes'][number]>(resolvedNodes.map(node => [node.id, node]));
      const resolvedCanvas: ResolvedCanvas = {
        canvas: canvasFile,
        nodes: resolvedNodes,
        edges: canvasFile.edges.map<ResolvedCanvas['edges'][number]>(edge => {
          const source = nodesById.get(edge.sourceId);
          return { id: edge.id, anchorStatus: edge.origin.kind === 'frame' ? 'exact'
            : !source?.outline ? 'missing'
            : source.outline.sourceReference?.documentHash === edge.origin.documentHash ? 'exact' : 'changed' };
        })
      };
      if (originatingTab && !originatingTab.panel) return;
      newRecord = this._createNewCanvasTab(path.posix.basename(fileUri.path), fileUri);
      // Closing a toolbar's owner also abandons reconstruction already in flight.
      originDisposed = originatingTab?.panel?.onDidDispose(() => newRecord?.panel.dispose());
      await newRecord.tab.restoreCanvas(resolvedCanvas);
      if (originatingTab && !originatingTab.panel)
      {
        newRecord.panel.dispose();
        return;
      }
      const result = { status: 'loaded', message: 'Canvas loaded successfully.' };
      originatingTab?.postMessageToPanel({ type: 'canvas_operation_result', requestedId, data: result });
      newRecord.tab.postMessageToPanel({ type: 'canvas_operation_result', requestedId: null, data: result });
    }
    catch (error)
    {
      newRecord?.panel.dispose();
      if (originatingTab && !originatingTab.panel) return;
      const message = "Cannot load canvas: " + (error instanceof Error ? error.message : String(error));
      void vscode.window.showErrorMessage(message);
      originatingTab?.postMessageToPanel({ type: 'canvas_operation_result', requestedId,
        data: { status: 'error', message } });
    }
    finally
    {
      originDisposed?.dispose();
      operations?.delete('load');
      if (originatingTab && !operations?.size) this._canvasOperations.delete(originatingTab);
    }
  }
}
