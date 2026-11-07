import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {AssertX} from '../assert_utils';
import {VpLspExtenderPython} from '../../../outlineproviders/lspextenderpython';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {DocumentSymbolX} from '../../../outlineproviderAPI/utils/documentsymbolx';

const suffix = '\nprint("AFTER")\ndef later():\n    return 7\n';

async function fixture(declaration: string, name: string, kind: vscode.SymbolKind,
                       prefix = '', selection = declaration.indexOf(name), extension = 'py') {
  const file = MemoryFile.createDocument(extension);
  file.write(prefix + declaration + (declaration.includes('\r\n') ? suffix.replace(/\n/g, '\r\n') : suffix));
  const document = await vscode.languages.setTextDocumentLanguage(
    await vscode.workspace.openTextDocument(file.uri), 'python');
  const range = new vscode.Range(document.positionAt(prefix.length),
    document.positionAt(prefix.length + declaration.length));
  const nameRange = new vscode.Range(document.positionAt(prefix.length + selection),
    document.positionAt(prefix.length + selection + name.length));
  const symbol = new vscode.DocumentSymbol(name, '', kind, range, nameRange);
  assert.strictEqual(document.getText(range), declaration, 'fake LSP declaration');
  assert.strictEqual(document.getText(nameRange), name, 'fake LSP name');
  return {document, symbol};
}

suite('Python declaration boundaries', () => {
  const cases: Array<[string, string, vscode.SymbolKind, string, string | null]> = [
    ['limit = 42', 'limit', vscode.SymbolKind.Variable, 'limit =', '42'],
    ['def build(value=tuple(), label=":"):\n    return value', 'build', vscode.SymbolKind.Function,
      'build(value=tuple(), label=":")', 'return value'],
    ['config = {\n    "message": ":",\n    "values": [1, 2],\n}', 'config', vscode.SymbolKind.Variable,
      'config =', '{\n    "message": ":",\n    "values": [1, 2],\n}'],
    ['def simple():\n    return 1', 'simple', vscode.SymbolKind.Function, 'simple()', 'return 1'],
    ['def placeholder():\n    pass', 'placeholder', vscode.SymbolKind.Function, 'placeholder()', 'pass'],
    ['def placeholder():\n    ...', 'placeholder', vscode.SymbolKind.Function, 'placeholder()', '...'],
    ['def doc_only():\n    """Keep the docstring."""', 'doc_only', vscode.SymbolKind.Function,
      'doc_only()', '"""Keep the docstring."""'],
    ['@abstractmethod\ndef read(self):\n    pass', 'read', vscode.SymbolKind.Function, 'read(self)', 'pass'],
    ['left = right = [1, 2]', 'right', vscode.SymbolKind.Variable, 'left = right =', '[1, 2]'],
    ['left, (middle, right) = values', 'right', vscode.SymbolKind.Variable,
      'left, (middle, right) =', 'values'],
    ['self.value: int = 42', 'value', vscode.SymbolKind.Variable, 'self.value: int =', '42'],
    ['total += 2', 'total', vscode.SymbolKind.Variable, 'total +=', '2'],
    ['value: dict[str, int]', 'value', vscode.SymbolKind.Variable, 'value: dict[str, int]', null],
    ['type Values = list[int]', 'Values', vscode.SymbolKind.Variable, 'type Values = list[int]', null],
    ['first = 1; second = {"a": 2}', 'second', vscode.SymbolKind.Variable, 'second =', '{"a": 2}'],
    ['first = 1; second = {"a": 2}', 'first', vscode.SymbolKind.Variable, 'first =', '1'],
    ['def inline(): return ":"', 'inline', vscode.SymbolKind.Function, 'inline()', 'return ":"'],
    ['def unicode(label="😀"):\r\n    return label', 'unicode', vscode.SymbolKind.Function,
      'unicode(label="😀")', 'return label']
  ];
  for (const [declaration, name, kind, heading, body] of cases) {
    test(declaration.split('\n')[0] + ' selecting ' + name, async () => {
      const {document, symbol} = await fixture(declaration, name, kind);
      const adapter = new VpLspExtenderPython();
      const actual = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(actual.rangeHead).trim(), heading);
      assert.strictEqual(actual.rangeBody === null ? null : document.getText(actual.rangeBody).trim(), body);
      assert.strictEqual(actual.declarationOnly, false);
      assert.ok(symbol.range.contains(actual.rangeHead));
      if (actual.rangeBody) { assert.ok(symbol.range.contains(actual.rangeBody)); }
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter);
      AssertX.range_equals(outline.totalRange, symbol.range);
      const repeated = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      AssertX.range_equals(repeated.rangeBody, actual.rangeBody);
    });
  }

  test('restores nested indentation without changing multiline strings', async () => {
    const declaration = '@identity\n    async def build():\n        text = """first\n  untouched\n        last"""\n        return text';
    const {document, symbol} = await fixture(declaration, 'build', vscode.SymbolKind.Method, 'class Worker:\n    ');
    const result = new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeHead), 'build()');
    assert.strictEqual(document.getText(result.rangeBody!), '        text = """first\n  untouched\n        last"""\n        return text');
    assert.deepStrictEqual(result.attributes.map(a => a.kind), ['@identity', 'async']);
  });

  test('stacked qualified decorators retain original callable coordinates', async () => {
    const declaration = '@dag\n    @pkg.decorators.dag(\n        schedule="daily",\n    )\n    async def build():\n        return 1';
    const prefix = 'class Worker:\n    ';
    const {document, symbol} = await fixture(declaration, 'build', vscode.SymbolKind.Method, prefix);
    const result = new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol);
    assert.deepStrictEqual(result.attributes.map(attribute => attribute.kind),
      ['@dag', '@pkg.decorators.dag(\n        schedule="daily",\n    )', 'async']);
    for (let index = 0; index < 2; ++index) {
      const attribute = result.attributes[index];
      const start = prefix.length + declaration.indexOf(index === 0 ? 'dag' : 'dag(');
      assert.strictEqual(document.getText(attribute.definitionRange!), 'dag');
      AssertX.range_equals(attribute.definitionRange!,
        new vscode.Range(document.positionAt(start), document.positionAt(start + 3)));
      assert.strictEqual(document.getText(attribute.displayTextRange!), attribute.kind);
    }
    assert.strictEqual(result.attributes[2].definitionRange, undefined);
    assert.strictEqual(document.getText(result.rangeHead), 'build()');
    assert.strictEqual(document.getText(result.rangeBody!), '        return 1');
  });

  test('accepts the decorated declaration start but not a decorator reference', async () => {
    const declaration = '@identity\nasync def build():\n    return 1';
    const {document, symbol} = await fixture(declaration, 'build', vscode.SymbolKind.Function);
    const adapter = new VpLspExtenderPython();
    symbol.selectionRange = new vscode.Range(0, 0, 0, 0);
    const result = adapter.getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeHead), 'build()');
    assert.strictEqual(document.getText(result.rangeBody!), '    return 1');
    assert.deepStrictEqual(result.attributes.map(a => a.kind), ['@identity', 'async']);
    symbol.selectionRange = new vscode.Range(0, 1, 0, 9);
    assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, symbol),
      /Cannot determine declaration boundaries for "build"\./);
  });

  test('tabs and source attributes outside the LSP range', async () => {
    const {document, symbol} = await fixture('def read(self):\n\t\tpass', 'read', vscode.SymbolKind.Method,
      'class Worker:\n\t@abstractmethod\n\t');
    const result = new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeBody!), '\t\tpass');
    assert.deepStrictEqual(result.attributes, []);
  });

  test('keeps pyi ellipsis source', async () => {
    const {document, symbol} = await fixture('def read(): ...', 'read', vscode.SymbolKind.Function, '', 4, 'pyi');
    const result = new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeBody!).trim(), '...');
    assert.strictEqual(result.declarationOnly, false);
  });

  test('does not copy preceding code into a semicolon fragment', async () => {
    const {document, symbol} = await fixture('second = 2', 'second', vscode.SymbolKind.Variable, 'first = 1; ');
    const result = new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeHead), 'second =');
    assert.strictEqual(document.getText(result.rangeBody!), '2');
  });

  const nameOnlyCases: Array<[string, string, string, string | null, string?]> = [
    ['CONFIG_DIR = Path(__file__).with_name("config_oracle2iceberg")', 'CONFIG_DIR',
      'CONFIG_DIR =', 'Path(__file__).with_name("config_oracle2iceberg")'],
    ['REQUIRED_KEYS = frozenset(\n    (*IDENTIFIER_KEYS, "write_mode", "schedule")\n)', 'REQUIRED_KEYS',
      'REQUIRED_KEYS =', 'frozenset(\n    (*IDENTIFIER_KEYS, "write_mode", "schedule")\n)'],
    ['OPTIONAL_KEYS = frozenset(\n    {\n        "partition_columns",\n        "primary_key",\n    }\n)',
      'OPTIONAL_KEYS', 'OPTIONAL_KEYS =', 'frozenset(\n    {\n        "partition_columns",\n        "primary_key",\n    }\n)'],
    ['params = {\n    "year": Param(type="integer", description="year: value"),\n}', 'params',
      'params =', '{\n    "year": Param(type="integer", description="year: value"),\n}'],
    ['value: dict[str, int]', 'value', 'value: dict[str, int]', null],
    ['left = right = [1, 2]', 'right', 'left = right =', '[1, 2]'],
    ['first = 1; second = {"a": 2}', 'second', 'second =', '{"a": 2}', 'second = {"a": 2}'],
    ['text = """first\n  preserve me\nlast"""', 'text', 'text =', '"""first\n  preserve me\nlast"""'],
    ['value = \\\n    call(1)', 'value', 'value =', 'call(1)']
  ];
  for (const [declaration, name, heading, body, selectedDeclaration] of nameOnlyCases) {
    test('resolves name-only ' + declaration.split('\n')[0], async () => {
      const {document, symbol} = await fixture(declaration, name, vscode.SymbolKind.Constant);
      const originalRange = symbol.selectionRange;
      symbol.range = originalRange;
      const adapter = new VpLspExtenderPython();
      const result = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(result.rangeHead), heading);
      assert.strictEqual(result.rangeBody === null ? null : document.getText(result.rangeBody), body);
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter);
      assert.strictEqual(document.getText(outline.totalRange!), selectedDeclaration ?? declaration);
      AssertX.range_equals(symbol.range, originalRange);
    });
  }

  test('resolves a nested name-only target from cached parent syntax', async () => {
    const declaration = 'def build():\n    left = right = {\n        "value": 1,\n    }\n    return right';
    const {document, symbol: parent} = await fixture(declaration, 'build', vscode.SymbolKind.Function);
    const adapter = new VpLspExtenderPython();
    adapter.getLanguageSpecificSymbolInformation(document, parent);
    const start = declaration.indexOf('right');
    const nameRange = new vscode.Range(document.positionAt(start), document.positionAt(start + 5));
    const child = new vscode.DocumentSymbol('right', '', vscode.SymbolKind.Variable, nameRange, nameRange);
    const result = adapter.getLanguageSpecificSymbolInformation(document, child, {ancestors: [parent]});
    assert.strictEqual(document.getText(result.rangeHead), 'left = right =');
    assert.strictEqual(document.getText(result.rangeBody!), '{\n        "value": 1,\n    }');
  });

  test('rejects malformed and reference-only name ranges without borrowing later statements', async () => {
    for (const [declaration, selection] of [
      ['value = [1,,2]', 0],
      ['value =\nother = 1', 0],
      ['value = other + value', 16],
      ['value: value', 7]
    ] as Array<[string, number]>) {
      const {document, symbol} = await fixture(declaration, 'value', vscode.SymbolKind.Variable, '', selection);
      symbol.range = symbol.selectionRange;
      assert.throws(() => new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol),
        /Cannot determine declaration boundaries for "value"\./);
    }
  });

  for (const declaration of ['def broken(:\n    pass', 'def broken():', 'broken = {', 'broken =']) {
    test('rejects selected syntax: ' + declaration, async () => {
      const kind = declaration.startsWith('def') ? vscode.SymbolKind.Function : vscode.SymbolKind.Variable;
      const {document, symbol} = await fixture(declaration, 'broken', kind);
      assert.throws(() => new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol),
        /Cannot determine declaration boundaries for "broken"\./);
    });
  }

  test('rejects reference/type selections and invalid document positions', async () => {
    for (const declaration of ['value = other + value', 'value: value']) {
      const {document, symbol} = await fixture(declaration, 'value', vscode.SymbolKind.Variable, '', declaration.lastIndexOf('value'));
      assert.throws(() => new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
    }
    const {document, symbol} = await fixture('value = 1', 'value', vscode.SymbolKind.Variable);
    symbol.range = new vscode.Range(0, 0, document.lineCount, 0);
    assert.throws(() => new VpLspExtenderPython().getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
  });

  test('isolates malformed neighboring syntax in a cached parent', async () => {
    const declaration = 'class Worker:\n    def good(self):\n        return 1\n    def bad(:\n        pass';
    const {document, symbol: parent} = await fixture(declaration, 'Worker', vscode.SymbolKind.Class);
    const adapter = new VpLspExtenderPython();
    assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, parent), /Cannot determine declaration boundaries/);
    const childText = 'def good(self):\n        return 1';
    const start = declaration.indexOf(childText);
    const child = new vscode.DocumentSymbol('good', '', vscode.SymbolKind.Method,
      new vscode.Range(document.positionAt(start), document.positionAt(start + childText.length)),
      new vscode.Range(document.positionAt(start + 4), document.positionAt(start + 8)));
    const result = adapter.getLanguageSpecificSymbolInformation(document, child);
    assert.strictEqual(document.getText(result.rangeBody!).trim(), 'return 1');
  });

  test('invalidates the cache after an editable document changes', async () => {
    const document = await vscode.workspace.openTextDocument({language: 'python', content: 'value = 1'});
    const adapter = new VpLspExtenderPython();
    const symbol = new vscode.DocumentSymbol('value', '', vscode.SymbolKind.Variable,
      new vscode.Range(0, 0, 0, 5), new vscode.Range(0, 0, 0, 5));
    assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), '1');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, document.lineAt(0).range, 'value = {"😀": 2}');
    assert.ok(await vscode.workspace.applyEdit(edit));
    assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), '{"😀": 2}');
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });
});
