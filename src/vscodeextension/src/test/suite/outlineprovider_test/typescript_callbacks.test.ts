import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import {getTestDirPath} from '../../main';
import {AssertX} from '../assert_utils';
import {MemoryFile} from '../memoryfile';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {DocumentSymbolX} from '../../../outlineproviderAPI/utils/documentsymbolx';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';

suite('TypeScript callback boundaries', () => {
  const cases: Array<[string, string, string]> = [
    ['() => { return "ready"; }', '() =>', 'return "ready";'],
    ['function () { return "ready"; }', 'function ()', 'return "ready";'],
    ['(value: string) => value.trim()', '(value: string) =>', 'value.trim()'],
    ['async (value: string): Promise<string> => { return value; }',
      'async (value: string): Promise<string> =>', 'return value;']
  ];
  for (const [callback, heading, body] of cases) {
    test('extracts nested anonymous callable: ' + callback, async () => {
      const source = 'class Panel { open() { subscribe(' + callback + '); } }';
      const file = MemoryFile.createDocument('ts');
      file.write(source);
      const document = await vscode.languages.setTextDocumentLanguage(
        await vscode.workspace.openTextDocument(file.uri), 'typescript');
      const rangeOf = (text: string) => {
        const start = source.indexOf(text);
        return new vscode.Range(document.positionAt(start), document.positionAt(start + text.length));
      };
      const parent = new vscode.DocumentSymbol('Panel', '', vscode.SymbolKind.Class, rangeOf(source), rangeOf('Panel'));
      const method = new vscode.DocumentSymbol('open', '', vscode.SymbolKind.Method,
        rangeOf('open() { subscribe(' + callback + '); }'), rangeOf('open'));
      // VS Code selects the entire expression for a Promise executor's <function> symbol.
      const anonymous = new vscode.DocumentSymbol('<function>', '', vscode.SymbolKind.Function, rangeOf(callback), rangeOf(callback));
      parent.children = [method];
      method.children = [anonymous];
      const adapter = new VpLspExtenderTypeScript('typescript');
      const result = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), adapter);
      const methodOutline = result.parts.find(part => part instanceof Outline.Symbol) as Outline.Symbol;
      const callbackOutline = methodOutline.parts.find(part => part instanceof Outline.Symbol) as Outline.Symbol;
      assert.ok(callbackOutline.isCallable);
      assert.strictEqual(document.getText(callbackOutline.totalRange!), callback);
      const info = adapter.getLanguageSpecificSymbolInformation(document, anonymous, {ancestors: [method, parent]});
      assert.strictEqual(document.getText(info.rangeHead).trim(), heading);
      assert.strictEqual(document.getText(info.rangeBody!).trim(), body);
      const independent = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, anonymous);
      assert.strictEqual(document.getText(independent.rangeBody!), document.getText(info.rangeBody!));
    });
  }

  test('rejects a truncated anonymous body instead of borrowing its parent closing brace', async () => {
    const file = MemoryFile.createDocument('ts');
    const source = 'class Panel { open() { return new Promise((resolve) => { resolve(1); }); } }';
    file.write(source);
    const document = await vscode.languages.setTextDocumentLanguage(
      await vscode.workspace.openTextDocument(file.uri), 'typescript');
    const start = source.indexOf('(resolve)');
    const end = source.indexOf(' });');
    const truncated = new vscode.Range(document.positionAt(start), document.positionAt(end));
    const callback = new vscode.DocumentSymbol('<function>', '', vscode.SymbolKind.Function, truncated, truncated);
    const parent = new vscode.DocumentSymbol('Panel', '', vscode.SymbolKind.Class,
      new vscode.Range(document.positionAt(0), document.positionAt(source.length)), new vscode.Range(0, 6, 0, 11));
    assert.throws(() => new VpLspExtenderTypeScript('typescript')
      .getLanguageSpecificSymbolInformation(document, callback, {ancestors: [parent]}), /Cannot determine declaration boundaries/);
  });

  test('real VisualizingTab provider callbacks retain their exact method and expression boundaries', async () => {
    const extension = vscode.extensions.getExtension('vscode.typescript-language-features');
    assert.ok(extension, 'built-in TypeScript language features are required for real-source regression coverage');
    await extension!.activate();
    const document = await vscode.workspace.openTextDocument(
      vscode.Uri.file(path.resolve(getTestDirPath(), '../visualprogramming/visualizer.ts')));
    assert.strictEqual(document.uri.scheme, 'file');
    const roots = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
      'vscode.executeDocumentSymbolProvider', document.uri);
    const visualizingTab = roots?.find(symbol => symbol.name === 'VisualizingTab');
    assert.ok(visualizingTab, 'the built-in provider exposes the actual VisualizingTab class');
    const adapter = new VpLspExtenderTypeScript('typescript');
    const outline = OutlineUtils.documentSymbol2outlineSymbol(document,
      new DocumentSymbolX(visualizingTab!, document.uri), adapter);
    for (const [name, callbackText, expectedHeading, expectedBody] of [
      ['waitReady', '(resolve, reject) => this._readyDeferred.push({ resolve, reject })',
        '(resolve, reject) =>', 'this._readyDeferred.push({ resolve, reject })'],
      ['exportCanvasState', '(resolve, reject) => {\n      this._pendingExportRequests.set(requestId, { resolve, reject });\n      this.postMessageToPanel({\n        type: \'canvas_export_request\',\n        requestId\n      });\n    }',
        '(resolve, reject) =>',
        '      this._pendingExportRequests.set(requestId, { resolve, reject });\n      this.postMessageToPanel({\n        type: \'canvas_export_request\',\n        requestId\n      });'],
      ['restoreCanvas', '(resolve, reject) => {\n      this._pendingRestoreRequests.set(requestId, { resolve, reject });\n      this.postMessageToPanel({\n        type: \'canvas_restore\',\n        requestId,\n        data: state\n      });\n    }',
        '(resolve, reject) =>',
        '      this._pendingRestoreRequests.set(requestId, { resolve, reject });\n      this.postMessageToPanel({\n        type: \'canvas_restore\',\n        requestId,\n        data: state\n      });']
    ]) {
      const method: vscode.DocumentSymbol | undefined = visualizingTab!.children.find(symbol => symbol.name === name);
      assert.ok(method, 'real provider exposes ' + name);
      const providerCallback: vscode.DocumentSymbol | undefined = method!.children.find(symbol => document.getText(symbol.range) === callbackText);
      assert.ok(providerCallback, 'real provider exposes the Promise callback in ' + name);
      const methodOutline = outline.parts.find(part =>
        part instanceof Outline.Symbol && part.totalRange!.isEqual(method!.range)) as Outline.Symbol;
      assert.ok(methodOutline);
      const callback = methodOutline.parts.find(part =>
        part instanceof Outline.Symbol && part.totalRange!.isEqual(providerCallback!.range)) as Outline.Symbol;
      assert.ok(callback, 'the real callback is not discarded by its provider display name');
      assert.strictEqual(callback.isCallable, true);
      AssertX.range_equals(callback.totalRange, providerCallback!.range);
      assert.strictEqual(document.getText(callback.displayTextRange!), expectedHeading);
      const info = adapter.getLanguageSpecificSymbolInformation(document, providerCallback!, {ancestors: [method!, visualizingTab!]});
      assert.strictEqual(document.getText(info.rangeBody!), expectedBody);
      assert.ok(method!.range.contains(info.rangeBody!));
      assert.strictEqual(callback.parts.map(part => document.getText(part.displayTextRange!)).join(''), expectedBody);
      assert.strictEqual(document.getText(providerCallback!.range), callbackText, 'provider ranges stay unchanged');
    }
    const bindingStart = document.getText().indexOf('const {line, character} = position;');
    assert.ok(bindingStart >= 0, 'real source includes the destructured navigation coordinates');
    for (const name of ['line', 'character']) {
      const start = document.getText().indexOf(name, bindingStart);
      const target = adapter.getDefinitionSymbol(document, document.positionAt(start));
      assert.ok(target, 'the real destructured ' + name + ' can be opened without an invented provider row');
      assert.strictEqual(document.getText(target!.selectionRange), name);
      assert.strictEqual(document.offsetAt(target!.selectionRange.start), start);
      const info = adapter.getLanguageSpecificSymbolInformation(document, target!);
      assert.strictEqual(document.getText(info.rangeHead), '{line, character} =');
      assert.strictEqual(document.getText(info.rangeBody!), 'position');
    }
  });
});
