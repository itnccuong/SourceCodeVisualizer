import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {AssertX} from '../assert_utils';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {DocumentSymbolX} from '../../../outlineproviderAPI/utils/documentsymbolx';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';

async function memory(content: string) {
  const file = MemoryFile.createDocument('ts');
  file.write(content);
  return vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(file.uri), 'typescript');
}

function symbol(document: vscode.TextDocument, text: string, name: string, kind = vscode.SymbolKind.Method) {
  const source = document.getText();
  const start = source.indexOf(text);
  assert.ok(start >= 0);
  const nameStart = start + text.indexOf(name);
  const result = new vscode.DocumentSymbol(name, '', kind,
    new vscode.Range(document.positionAt(start), document.positionAt(start + text.length)),
    new vscode.Range(document.positionAt(nameStart), document.positionAt(nameStart + name.length)));
  assert.strictEqual(document.getText(result.range), text);
  assert.strictEqual(document.getText(result.selectionRange), name);
  return result;
}

suite('Outline partition and navigation', () => {
  test('partitions same-line declarations in source order without losing gaps', async () => {
    const source = 'class Scope { value = 1; first() {} value2 = 2; second() {} value3 = 3; }';
    const document = await memory(source);
    const parent = symbol(document, source, 'Scope', vscode.SymbolKind.Class);
    const first = symbol(document, 'first() {}', 'first');
    const second = symbol(document, 'second() {}', 'second');
    const ignored = symbol(document, 'value2 = 2;', 'value2', vscode.SymbolKind.Property);
    parent.children = [second, ignored, first];
    const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), new VpLspExtenderTypeScript('typescript'));
    const parts = outline.parts.map(part => document.getText(part instanceof Outline.Symbol ? part.totalRange! : part.displayTextRange!));
    assert.deepStrictEqual(parts, ['value = 1; ', 'first() {}', ' value2 = 2; ', 'second() {}', ' value3 = 3;']);
    assert.strictEqual(parts.join(''), 'value = 1; first() {} value2 = 2; second() {} value3 = 3;');
    assert.deepStrictEqual(parent.children, [second, ignored, first]);
    assert.deepStrictEqual(outline.parts.filter(p => p instanceof Outline.Symbol).map(p => p.parts), [[], []]);
  });

  test('skips outside children and keeps ignored callback source', async () => {
    const source = 'function outer() { promise.then(() => { return 1; }); }\nfunction later() {}';
    const document = await memory(source);
    const parent = symbol(document, source.split('\n')[0], 'outer', vscode.SymbolKind.Function);
    const callback = symbol(document, '() => { return 1; }', '()', vscode.SymbolKind.Function);
    callback.name = 'then() callback';
    const outside = symbol(document, 'function later() {}', 'later', vscode.SymbolKind.Function);
    parent.children = [outside, callback];
    const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), new VpLspExtenderTypeScript('typescript'));
    assert.deepStrictEqual(outline.parts.map(p => document.getText(p.displayTextRange!)), ['promise.then(() => { return 1; });']);
  });

  test('rejects crossing and overlapping child ranges', async () => {
    const source = 'class Scope { first() {} second() {} }';
    const document = await memory(source);
    const parent = symbol(document, source, 'Scope', vscode.SymbolKind.Class);
    const first = symbol(document, 'first() {}', 'first');
    const second = symbol(document, 'second() {}', 'second');
    const adapter = new VpLspExtenderTypeScript('typescript');
    parent.children = [first, first];
    assert.throws(() => OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), adapter),
      /Overlapping or out-of-bounds declaration ranges cannot be displayed safely\./);
    second.range = new vscode.Range(second.range.start, parent.range.end);
    parent.children = [second];
    assert.throws(() => OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), adapter),
      /Overlapping or out-of-bounds declaration ranges cannot be displayed safely\./);
    first.range = new vscode.Range(parent.range.start, first.range.end);
    parent.children = [first];
    assert.throws(() => OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), adapter),
      /Overlapping or out-of-bounds declaration ranges cannot be displayed safely\./);
  });

  test('records parent context during child traversal for later property extraction', async () => {
    const source = 'class Scope { value: {count: number}; }';
    const document = await memory(source);
    const parent = symbol(document, source, 'Scope', vscode.SymbolKind.Class);
    const child = symbol(document, 'value: {count: number};', 'value', vscode.SymbolKind.Property);
    parent.children = [child];
    OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), new VpLspExtenderTypeScript('typescript'));
    const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(child, document.uri), new VpLspExtenderTypeScript('typescript'));
    assert.strictEqual(document.getText(outline.displayTextRange!), 'value: {count: number}');
    assert.deepStrictEqual(outline.parts, []);
    assert.strictEqual(outline.declarationOnly, false);
  });

  test('empty and absent method bodies have distinct visible state', async () => {
    const document = await memory('interface Reader { read(): void; }\nclass Worker { empty() {} }');
    const adapter = new VpLspExtenderTypeScript('typescript');
    for (const [text, name, status] of [['read(): void;', 'read', true], ['empty() {}', 'empty', false]] as const) {
      const input = symbol(document, text, name);
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(input, document.uri), adapter);
      assert.deepStrictEqual(outline.parts, []);
      assert.strictEqual(outline.declarationOnly, status);
      AssertX.range_equals(outline.totalRange, input.range);
    }
  });

  // Plaintext isolates fake providers; the explicitly chosen adapter still parses TypeScript.
  test('handles whole-file EOF without a newline', async () => {
    const scheme = 'outline-partition-eof';
    const source = 'function first() {} const value = 1; function second() {}';
    const contentProvider = vscode.workspace.registerTextDocumentContentProvider(scheme, {provideTextDocumentContent: () => source});
    let symbolProvider: vscode.Disposable | undefined;
    try {
      const document = await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(vscode.Uri.parse(scheme + ':/eof.ts')), 'plaintext');
      const first = symbol(document, 'function first() {}', 'first', vscode.SymbolKind.Function);
      const second = symbol(document, 'function second() {}', 'second', vscode.SymbolKind.Function);
      const inputs = [second, first];
      symbolProvider = vscode.languages.registerDocumentSymbolProvider({scheme}, {provideDocumentSymbols: () => inputs});
      const outline = await OutlineUtils.provideDocumentOutline(new VpLspExtenderTypeScript('typescript'), document);
      assert.deepStrictEqual(outline.parts.map(p => document.getText(p instanceof Outline.Symbol ? p.totalRange! : p.displayTextRange!)),
        ['function first() {}', ' const value = 1; ', 'function second() {}']);
      assert.deepStrictEqual(inputs, [second, first]);
    } finally {
      symbolProvider?.dispose();
      contentProvider.dispose();
    }
  });

  test('lookup uses containment, smallest selection, end exclusivity and stable ties', async () => {
    const scheme = 'outline-partition-lookup';
    const source = '0123456789abcdef\n0123456789abcdef\n0123456789abcdef';
    const contentProvider = vscode.workspace.registerTextDocumentContentProvider(scheme, {provideTextDocumentContent: () => source});
    let symbolProvider: vscode.Disposable | undefined;
    try {
      const uri = vscode.Uri.parse(scheme + ':/lookup.ts');
      await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(uri), 'plaintext');
      const outer = new vscode.DocumentSymbol('outer', '', vscode.SymbolKind.Class, new vscode.Range(0, 8, 2, 10), new vscode.Range(0, 8, 0, 13));
      const inner = new vscode.DocumentSymbol('inner', '', vscode.SymbolKind.Method, new vscode.Range(1, 2, 1, 12), new vscode.Range(1, 3, 1, 8));
      const small = new vscode.DocumentSymbol('small', '', vscode.SymbolKind.Method, inner.range, new vscode.Range(1, 4, 1, 6));
      const tie = new vscode.DocumentSymbol('tie', '', vscode.SymbolKind.Method, small.range, small.selectionRange);
      outer.children = [inner, small, tie];
      const inputs = [outer];
      symbolProvider = vscode.languages.registerDocumentSymbolProvider({scheme}, {provideDocumentSymbols: () => inputs});
      for (let repeat = 0; repeat < 2; ++repeat) {
        assert.strictEqual((await OutlineUtils.getDocumentSymbolAtPosition(uri, new vscode.Position(1, 4)))!.name, 'small');
        assert.strictEqual((await OutlineUtils.getDocumentSymbolAtPosition(uri, new vscode.Position(1, 10)))!.name, 'inner');
        assert.strictEqual((await OutlineUtils.getDocumentSymbolAtPosition(uri, new vscode.Position(1, 0)))!.name, 'outer');
        assert.strictEqual((await OutlineUtils.getDocumentSymbolAtPosition(uri, new vscode.Position(1, 12)))!.name, 'outer');
        assert.strictEqual(await OutlineUtils.getDocumentSymbolAtPosition(uri, new vscode.Position(2, 10)), null);
        assert.strictEqual(await OutlineUtils.getDocumentSymbolAtPosition(uri, new vscode.Position(0, 7)), null);
      }
      assert.deepStrictEqual(inputs, [outer]);
      assert.deepStrictEqual(outer.children, [inner, small, tie]);
    } finally {
      symbolProvider?.dispose();
      contentProvider.dispose();
    }
  });

  test('flat lookup supplies ancestors to ambiguous object properties', async () => {
    const scheme = 'outline-partition-context';
    const source = 'const options = { value: {count: 1} };';
    const contentProvider = vscode.workspace.registerTextDocumentContentProvider(scheme, {provideTextDocumentContent: () => source});
    let symbolProvider: vscode.Disposable | undefined;
    try {
      const document = await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(vscode.Uri.parse(scheme + ':/context.ts')), 'plaintext');
      const parent = symbol(document, source, 'options', vscode.SymbolKind.Constant);
      const child = symbol(document, 'value: {count: 1}', 'value', vscode.SymbolKind.Property);
      parent.children = [child];
      symbolProvider = vscode.languages.registerDocumentSymbolProvider({scheme}, {provideDocumentSymbols: () => [parent]});
      const selected = await OutlineUtils.getDocumentSymbolAtPosition(document.uri, child.selectionRange.start);
      assert.ok(selected);
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(selected!, document.uri), new VpLspExtenderTypeScript('typescript'));
      assert.strictEqual(document.getText(outline.displayTextRange!), 'value:');
      assert.strictEqual(document.getText(outline.parts[0].displayTextRange!), '{count: 1}');
    } finally {
      symbolProvider?.dispose();
      contentProvider.dispose();
    }
  });

  test('definition links navigate to target coordinates and preserve no-definition behavior', async () => {
    const scheme = 'outline-partition-definition';
    const contentProvider = vscode.workspace.registerTextDocumentContentProvider(scheme, {provideTextDocumentContent: () => 'call();\nfunction target() {}'});
    let definitionProvider: vscode.Disposable | undefined;
    try {
      const source = vscode.Uri.parse(scheme + ':/source.ts');
      const target = vscode.Uri.parse(scheme + ':/target.ts');
      await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(source), 'plaintext');
      const targetRange = new vscode.Range(1, 0, 1, 20);
      const targetSelectionRange = new vscode.Range(1, 9, 1, 15);
      const originSelectionRange = new vscode.Range(0, 0, 0, 4);
      let links: vscode.LocationLink[] = [{targetUri: target, targetRange, targetSelectionRange, originSelectionRange}];
      definitionProvider = vscode.languages.registerDefinitionProvider({scheme}, {provideDefinition: () => links});
      const selected = await OutlineUtils.vscode_executeDefinitionProvider(source, new vscode.Position(0, 1));
      assert.strictEqual(selected[0].uri.toString(), target.toString());
      AssertX.range_equals(selected[0].range, targetSelectionRange);
      // Runtime LocationLinks can lack targetSelectionRange despite the old API typing.
      links = [{targetUri: target, targetRange, originSelectionRange}] as unknown as vscode.LocationLink[];
      const fallback = await OutlineUtils.vscode_executeDefinitionProvider(source, new vscode.Position(0, 1));
      AssertX.range_equals(fallback[0].range, targetRange);
      links = [];
      assert.deepStrictEqual(await OutlineUtils.vscode_executeDefinitionProvider(source, new vscode.Position(0, 1)), []);
    } finally {
      definitionProvider?.dispose();
      contentProvider.dispose();
    }
  });
});
