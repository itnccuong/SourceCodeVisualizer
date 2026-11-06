import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {AssertX} from '../assert_utils';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {DocumentSymbolX} from '../../../outlineproviderAPI/utils/documentsymbolx';

const suffix = '\nconsole.log("AFTER");\nfunction later() { return 7; }\n';

async function fixture(declaration: string, name: string, kind: vscode.SymbolKind,
                       prefix = '', closing = '', language: 'typescript' | 'typescriptreact' = 'typescript',
                       selection = declaration.indexOf(name)) {
  const file = MemoryFile.createDocument(language === 'typescriptreact' ? 'tsx' : 'ts');
  file.write(prefix + declaration + closing + (declaration.includes('\r\n') ? suffix.replace(/\n/g, '\r\n') : suffix));
  const document = await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(file.uri), language);
  const range = new vscode.Range(document.positionAt(prefix.length), document.positionAt(prefix.length + declaration.length));
  const nameRange = new vscode.Range(document.positionAt(prefix.length + selection), document.positionAt(prefix.length + selection + name.length));
  const symbol = new vscode.DocumentSymbol(name, '', kind, range, nameRange);
  assert.strictEqual(document.getText(range), declaration, 'fake LSP declaration');
  assert.strictEqual(document.getText(nameRange), name, 'fake LSP name');
  return {document, symbol};
}

suite('TypeScript declaration boundaries', () => {
  const cases: Array<[string, string, vscode.SymbolKind, string, string | null, boolean?]> = [
    ['const limit = 42', 'limit', vscode.SymbolKind.Constant, 'limit =', '42'],
    ['const config = { value: 42 };', 'config', vscode.SymbolKind.Constant, 'config =', '{ value: 42 }'],
    ['read(): void;', 'read', vscode.SymbolKind.Method, 'read(): void', null, true],
    ['empty() {}', 'empty', vscode.SymbolKind.Method, 'empty()', ''],
    ['read(): { value: number } { return { value: 1 }; }', 'read', vscode.SymbolKind.Method,
      'read(): { value: number }', 'return { value: 1 };'],
    ['const values = [1, {value: 2}];', 'values', vscode.SymbolKind.Constant, 'values =', '[1, {value: 2}]'],
    ['const text = `value: ${fn({value: 1})}`;', 'text', vscode.SymbolKind.Constant, 'text =', '`value: ${fn({value: 1})}`'],
    ['value: { count: number } = { count: 1 };', 'value', vscode.SymbolKind.Field,
      'value: { count: number } =', '{ count: 1 }'],
    ['value: { count: number };', 'value', vscode.SymbolKind.Field, 'value: { count: number }', null],
    ['Ready = 1', 'Ready', vscode.SymbolKind.EnumMember, 'Ready =', '1'],
    ['value = {a: 1}', 'value', vscode.SymbolKind.Constant, 'value =', '{a: 1}'],
    ['const first = 1, second = {a: 2};', 'second', vscode.SymbolKind.Constant, 'second =', '{a: 2}'],
    ['const first = 1, second = {a: 2};', 'first', vscode.SymbolKind.Constant, 'first =', '1'],
    ['const build = (): {a: number} => { return {a: 1}; };', 'build', vscode.SymbolKind.Constant,
      'build = (): {a: number} =>', 'return {a: 1};'],
    ['const build = () => ({a: 1});', 'build', vscode.SymbolKind.Constant, 'build = () =>', '({a: 1})'],
    ['const build = function(): {a: number} { return {a: 1}; };', 'build', vscode.SymbolKind.Constant,
      'build = function(): {a: number}', 'return {a: 1};'],
    ['function read(): {value: number} { return {value: 1}; }', 'read', vscode.SymbolKind.Function,
      'read(): {value: number}', 'return {value: 1};'],
    ['declare function read(): void;', 'read', vscode.SymbolKind.Function, 'read(): void', null, true],
    ['abstract read(): void;', 'read', vscode.SymbolKind.Method, 'read(): void', null, true],
    ['constructor(public value: number) {}', 'constructor', vscode.SymbolKind.Constructor,
      'constructor(public value: number)', ''],
    ['get value(): {a: number} { return {a: 1}; }', 'value', vscode.SymbolKind.Method,
      'value(): {a: number}', 'return {a: 1};'],
    ['set value(input: number) { use(input); }', 'value', vscode.SymbolKind.Method,
      'value(input: number)', 'use(input);'],
    ['class Worker<T extends {a: number}> { value = 1; }', 'Worker', vscode.SymbolKind.Class,
      'Worker<T extends {a: number}>', 'value = 1;'],
    ['interface Reader extends Other<{a: number}> { read(): void; }', 'Reader', vscode.SymbolKind.Interface,
      'Reader extends Other<{a: number}>', 'read(): void;'],
    ['enum State { Ready = 1 }', 'State', vscode.SymbolKind.Enum, 'State', 'Ready = 1'],
    ['namespace Area { export const value = 1; }', 'Area', vscode.SymbolKind.Namespace,
      'Area', 'export const value = 1;'],
    ['type Shape = {value: number};', 'Shape', vscode.SymbolKind.Class, 'type Shape = {value: number}', null],
    ['/* comment containing const */ const value = 1;', 'value', vscode.SymbolKind.Constant, 'value =', '1'],
    ['const value = {\r\n  emoji: "😀",\r\n};', 'value', vscode.SymbolKind.Constant,
      'value =', '{\r\n  emoji: "😀",\r\n}']
  ];
  for (const [declaration, name, kind, heading, body, declarationOnly = false] of cases) {
    test(declaration.split('\n')[0] + ' selecting ' + name, async () => {
      const member = kind === vscode.SymbolKind.Method || kind === vscode.SymbolKind.Constructor || kind === vscode.SymbolKind.Field;
      const {document, symbol} = await fixture(declaration, name, kind, member ? 'class Scope {\n  ' : '', member ? '\n}' : '');
      const adapter = new VpLspExtenderTypeScript('typescript');
      const actual = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(actual.rangeHead).trim(), heading);
      assert.strictEqual(actual.rangeBody === null ? null : document.getText(actual.rangeBody).trim(), body);
      assert.strictEqual(actual.declarationOnly, declarationOnly);
      assert.ok(symbol.range.contains(actual.rangeHead));
      if (actual.rangeBody) { assert.ok(symbol.range.contains(actual.rangeBody)); }
      if (body === '') { assert.ok(actual.rangeBody!.isEmpty); }
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter);
      AssertX.range_equals(outline.totalRange, symbol.range);
      const repeated = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      AssertX.range_equals(repeated.rangeBody, actual.rangeBody);
    });
  }

  test('TSX preserves complete JSX values', async () => {
    const {document, symbol} = await fixture('const view = <Widget value={{a: 1}}>hello</Widget>;', 'view', vscode.SymbolKind.Constant,
      '', '', 'typescriptreact');
    const result = new VpLspExtenderTypeScript('typescriptreact').getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeBody!), '<Widget value={{a: 1}}>hello</Widget>');
  });

  test('keeps block indentation and ignores braces in comments', async () => {
    const {document, symbol} = await fixture('function read(): {a: number} /* { */ {\n  return {a: 1};\n}', 'read', vscode.SymbolKind.Function);
    const result = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeHead), 'read(): {a: number} /* { */');
    assert.strictEqual(document.getText(result.rangeBody!), '  return {a: 1};');
  });

  test('selects an interface signature without borrowing another overload body', async () => {
    const declaration = 'read(value: string): void;';
    const {document, symbol} = await fixture(declaration, 'read', vscode.SymbolKind.Method,
      'interface Reader {\n  ', '\n}\nclass Worker { read(value: any) { return value; } }');
    const result = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(result.rangeHead), 'read(value: string): void');
    assert.strictEqual(result.rangeBody, null);
    assert.strictEqual(result.declarationOnly, true);
  });

  test('uses only source modifiers, not parser wrapper keywords', async () => {
    const {document, symbol} = await fixture('public async read() { return 1; }', 'read', vscode.SymbolKind.Method,
      'class Scope {\n  ', '\n}');
    const result = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
    assert.deepStrictEqual(result.attributes.map(a => a.kind), ['public', 'async']);
    for (const attribute of result.attributes) { assert.ok(symbol.range.contains(attribute.displayTextRange!)); }
  });

  for (const parentText of ['const object = { value: {a: 1} };', 'class Scope { value: {a: number}; }',
                            'interface Scope { value: {a: number}; }']) {
    test('uses supplied parent context: ' + parentText, async () => {
      const isObject = parentText.startsWith('const');
      const parentName = isObject ? 'object' : 'Scope';
      const parentKind = isObject ? vscode.SymbolKind.Constant : parentText.startsWith('class') ? vscode.SymbolKind.Class : vscode.SymbolKind.Interface;
      const {document, symbol: parent} = await fixture(parentText, parentName, parentKind);
      const childText = isObject ? 'value: {a: 1}' : 'value: {a: number};';
      const start = parentText.indexOf(childText);
      const symbol = new vscode.DocumentSymbol('value', '', vscode.SymbolKind.Property,
        new vscode.Range(document.positionAt(start), document.positionAt(start + childText.length)),
        new vscode.Range(document.positionAt(start), document.positionAt(start + 5)));
      assert.strictEqual(document.getText(symbol.range), childText);
      const adapter = new VpLspExtenderTypeScript('typescript');
      const result = adapter.getLanguageSpecificSymbolInformation(document, symbol, {ancestors: [parent]});
      assert.strictEqual(document.getText(result.rangeHead), isObject ? 'value:' : 'value: {a: number}');
      assert.strictEqual(result.rangeBody === null ? null : document.getText(result.rangeBody), isObject ? '{a: 1}' : null);
      assert.strictEqual(result.declarationOnly, false);
      adapter.getLanguageSpecificSymbolInformation(document, parent);
      const cached = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      AssertX.range_equals(cached.rangeBody, result.rangeBody);
    });
  }

  test('rejects ambiguous properties without supplied context', async () => {
    const {document, symbol} = await fixture('value: other', 'value', vscode.SymbolKind.Property);
    assert.throws(() => new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
  });

  for (const declaration of ['function broken( {', 'function broken() {', 'const broken = {', 'const broken =', 'broken(): {a: ;']) {
    test('rejects selected syntax: ' + declaration, async () => {
      const kind = declaration.startsWith('function') ? vscode.SymbolKind.Function : declaration.startsWith('const') ? vscode.SymbolKind.Constant : vscode.SymbolKind.Method;
      const {document, symbol} = await fixture(declaration, 'broken', kind);
      assert.throws(() => new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries for "broken"\./);
    });
  }

  test('rejects unrelated reference and type selections', async () => {
    for (const declaration of ['const value = other + value;', 'const value: value = other;']) {
      const {document, symbol} = await fixture(declaration, 'value', vscode.SymbolKind.Constant, '', '', 'typescript', declaration.lastIndexOf('value'));
      assert.throws(() => new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
    }
  });

  test('accepts constructor and declaration-start selections', async () => {
    for (const declaration of ['export function value() {}', 'constructor() {}']) {
      const name = declaration.startsWith('export') ? 'value' : 'constructor';
      const {document, symbol} = await fixture(declaration, name, name === 'value' ? vscode.SymbolKind.Function : vscode.SymbolKind.Constructor);
      symbol.selectionRange = symbol.range;
      const result = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(result.rangeHead), name + '()');
      assert.ok(result.rangeBody!.isEmpty);
    }
  });

  test('isolates malformed neighboring syntax in a cached parent', async () => {
    const declaration = 'class Scope { good() { return 1; } bad(: }';
    const {document, symbol: parent} = await fixture(declaration, 'Scope', vscode.SymbolKind.Class);
    const adapter = new VpLspExtenderTypeScript('typescript');
    assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, parent), /Cannot determine declaration boundaries/);
    const text = 'good() { return 1; }';
    const start = declaration.indexOf(text);
    const child = new vscode.DocumentSymbol('good', '', vscode.SymbolKind.Method,
      new vscode.Range(document.positionAt(start), document.positionAt(start + text.length)),
      new vscode.Range(document.positionAt(start), document.positionAt(start + 4)));
    const result = adapter.getLanguageSpecificSymbolInformation(document, child);
    assert.strictEqual(document.getText(result.rangeBody!), 'return 1;');
  });

  test('does not treat an object inside a class as a class property', async () => {
    const source = 'class Scope { options = { value: other }; }';
    const {document, symbol: parent} = await fixture(source, 'Scope', vscode.SymbolKind.Class);
    const propertyStart = source.indexOf('options');
    const propertyEnd = source.indexOf(';') + 1;
    const property = new vscode.DocumentSymbol('options', '', vscode.SymbolKind.Property,
      new vscode.Range(document.positionAt(propertyStart), document.positionAt(propertyEnd)),
      new vscode.Range(document.positionAt(propertyStart), document.positionAt(propertyStart + 7)));
    const start = source.indexOf('value');
    const child = new vscode.DocumentSymbol('value', '', vscode.SymbolKind.Property,
      new vscode.Range(document.positionAt(start), document.positionAt(start + 'value: other'.length)),
      new vscode.Range(document.positionAt(start), document.positionAt(start + 5)));
    const result = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(
      document, child, {ancestors: [property, parent]});
    assert.strictEqual(document.getText(result.rangeHead), 'value:');
    assert.strictEqual(document.getText(result.rangeBody!), 'other');
  });

  test('destructured names do not select default-value references', async () => {
    const source = 'const {value = other} = input;';
    const {document, symbol} = await fixture(source, 'value', vscode.SymbolKind.Constant);
    const adapter = new VpLspExtenderTypeScript('typescript');
    assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), 'input');
    const start = source.indexOf('other');
    symbol.selectionRange = new vscode.Range(document.positionAt(start), document.positionAt(start + 5));
    assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
  });

  test('invalidates the cache after edits and rejects invalid document positions', async () => {
    const document = await vscode.workspace.openTextDocument({language: 'typescript', content: 'const value = 1;'});
    const adapter = new VpLspExtenderTypeScript('typescript');
    const symbol = new vscode.DocumentSymbol('value', '', vscode.SymbolKind.Constant,
      new vscode.Range(0, 0, 0, 16), new vscode.Range(0, 6, 0, 11));
    assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), '1');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, symbol.range, 'const value = {emoji: "😀"};');
    assert.ok(await vscode.workspace.applyEdit(edit));
    symbol.range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
    assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), '{emoji: "😀"}');
    symbol.range = new vscode.Range(0, 0, document.lineCount, 0);
    assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
  });
});
