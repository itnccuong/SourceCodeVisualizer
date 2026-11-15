import * as assert from 'assert';
import * as vscode from 'vscode';
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
});
