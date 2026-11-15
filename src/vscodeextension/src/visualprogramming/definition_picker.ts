import * as path from 'path';
import * as vscode from 'vscode';
import {DefinitionTarget} from '../outlineproviderAPI/outlineprovider';

interface DefinitionChoice extends vscode.QuickPickItem {
  target: DefinitionTarget;
}

function declarationKind(uri: vscode.Uri): string {
  if (/\.pyi$/i.test(uri.path)) return 'Type stub — declaration only';
  if (/\.d\.(?:ts|mts|cts)$/i.test(uri.path)) return 'Type declaration — no implementation';
  return 'Source';
}

function origin(uri: vscode.Uri): string {
  if (uri.scheme !== 'file') return uri.scheme + ' document' + (uri.authority ? ': ' + uri.authority : '');
  const relativeToApp = path.relative(vscode.env.appRoot, uri.fsPath);
  if (relativeToApp && !relativeToApp.startsWith('..' + path.sep)
      && relativeToApp !== '..' && !path.isAbsolute(relativeToApp)) {
    return 'VS Code bundled library';
  }
  const dependencyStart = uri.path.lastIndexOf('/node_modules/');
  if (dependencyStart !== -1) {
    const segments = uri.path.slice(dependencyStart + '/node_modules/'.length).split('/');
    return 'Dependency: ' + segments.slice(0, segments[0].startsWith('@') ? 2 : 1).join('/');
  }
  const workspace = vscode.workspace.getWorkspaceFolder(uri);
  return workspace ? 'Workspace: ' + workspace.name : 'External file';
}

function containingSymbol(document: vscode.TextDocument, symbols: readonly vscode.DocumentSymbol[],
                          position: vscode.Position): vscode.DocumentSymbol | undefined {
  let found: vscode.DocumentSymbol | undefined;
  let smallest = Infinity;
  const visit = (symbol: vscode.DocumentSymbol) => {
    // Some providers return flat SymbolInformation rather than DocumentSymbol.
    if (!symbol.range || !symbol.selectionRange || !Array.isArray(symbol.children)) return;
    if (position.isBefore(symbol.range.start) || !position.isBefore(symbol.range.end)) return;
    const size = document.offsetAt(symbol.range.end) - document.offsetAt(symbol.range.start);
    if (size < smallest) { found = symbol; smallest = size; }
    symbol.children.forEach(visit);
  };
  symbols.forEach(visit);
  return found;
}

async function choices(targets: readonly DefinitionTarget[]): Promise<DefinitionChoice[]> {
  let commonDirectory = path.posix.dirname(targets[0]?.uri.path || '/');
  for (const target of targets) {
    while (commonDirectory !== '/' && commonDirectory !== '.'
        && !target.uri.path.startsWith(commonDirectory + '/')) {
      commonDirectory = path.posix.dirname(commonDirectory);
    }
  }
  const documents = new Map<string, Promise<{
    document: vscode.TextDocument;
    symbols: vscode.DocumentSymbol[];
    contextUnavailable: boolean;
  }>>();
  return Promise.all(targets.map(async target => {
    const {uri, selectionRange} = target;
    const filename = path.posix.basename(uri.path);
    const workspace = vscode.workspace.getWorkspaceFolder(uri);
    const location = workspace ? vscode.workspace.asRelativePath(uri)
      : path.posix.relative(commonDirectory, uri.path) || filename;
    const description = `${location}:${selectionRange.start.line + 1}:${selectionRange.start.character + 1}`;
    const facts = [declarationKind(uri), origin(uri)];
    try {
      const key = uri.toString();
      let entry = documents.get(key);
      if (!entry) {
        entry = (async () => {
          const document = await vscode.workspace.openTextDocument(uri);
          try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
              'vscode.executeDocumentSymbolProvider', uri);
            return {document, symbols: symbols || [], contextUnavailable: false};
          } catch {
            return {document, symbols: [], contextUnavailable: true};
          }
        })();
        documents.set(key, entry);
      }
      const {document, symbols, contextUnavailable} = await entry;
      const isFile = selectionRange.isEmpty && selectionRange.start.isEqual(new vscode.Position(0, 0));
      const declaration = isFile ? undefined : containingSymbol(document, symbols, selectionRange.start);
      // Providers often select only an identifier. Show its declaration line, not just that name.
      const label = isFile ? filename : document.lineAt(selectionRange.start.line).text.trim() || filename;
      if (declaration && declaration.children.length) {
        const names = [...new Set(declaration.children.map(child => child.name))];
        const members = [vscode.SymbolKind.Class, vscode.SymbolKind.Interface, vscode.SymbolKind.Enum,
          vscode.SymbolKind.Module, vscode.SymbolKind.Namespace].includes(declaration.kind);
        facts.unshift((members ? 'Members: ' : 'Contains: ') + names.slice(0, 6).join(', ')
          + (names.length > 6 ? `, +${names.length - 6} more` : ''));
      } else if (contextUnavailable) {
        facts.push('Symbol context unavailable');
      }
      return {label, description, detail: facts.join(' · '), target};
    } catch {
      return {label: filename, description, detail: facts.concat('Source unavailable').join(' · '), target};
    }
  }));
}

/** Present distinct locations without guessing that one merged declaration is the implementation. */
export function chooseDefinitionTarget(targets: readonly DefinitionTarget[]): Promise<DefinitionTarget | undefined> {
  const picker = vscode.window.createQuickPick<DefinitionChoice>();
  picker.title = `Choose a definition (${targets.length} locations)`;
  picker.placeholder = 'Compare declarations and members; use the file button to preview the highlighted source.';
  picker.matchOnDescription = true;
  picker.matchOnDetail = true;
  picker.canSelectMany = false;
  picker.busy = true;
  picker.ignoreFocusOut = true;
  const preview: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('go-to-file'),
    tooltip: 'Preview highlighted definition in the editor (keeps this picker open)'
  };
  picker.buttons = [preview];

  return new Promise((resolve, reject) => {
    let settled = false;
    const disposables: vscode.Disposable[] = [];
    const close = () => {
      settled = true;
      disposables.forEach(disposable => disposable.dispose());
      picker.hide();
      picker.dispose();
    };
    disposables.push(picker.onDidAccept(() => {
      const selected = picker.selectedItems[0];
      if (!selected || settled) return;
      close();
      resolve(selected.target);
    }));
    disposables.push(picker.onDidHide(() => {
      if (settled) return;
      close();
      resolve(undefined);
    }));
    disposables.push(picker.onDidTriggerButton(async button => {
      const selected = picker.activeItems[0];
      if (button !== preview || !selected || settled) return;
      try {
        const document = await vscode.workspace.openTextDocument(selected.target.uri);
        if (settled) return;
        await vscode.window.showTextDocument(document, {
          preview: true, preserveFocus: true, selection: selected.target.selectionRange
        });
      } catch (error) {
        if (!settled) vscode.window.showErrorMessage('Cannot preview definition: ' + String(error));
      }
    }));
    picker.show();
    choices(targets).then(items => {
      if (settled) return;
      picker.items = items;
      picker.busy = false;
    }, error => {
      if (settled) return;
      close();
      reject(error);
    });
  });
}
