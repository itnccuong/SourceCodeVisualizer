import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {AssertX} from '../assert_utils';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {DocumentSymbolX} from '../../../outlineproviderAPI/utils/documentsymbolx';

const suffix = '\nconsole.log("AFTER");\nfunction later() { return 7; }\n';

async function fixture(declaration: string, name: string, kind: vscode.SymbolKind,
                       prefix = '', closing = '', language: 'javascript' | 'typescript' | 'typescriptreact' = 'typescript',
                       selection = declaration.indexOf(name)) {
  const file = MemoryFile.createDocument(language === 'typescriptreact' ? 'tsx' : language === 'javascript' ? 'js' : 'ts');
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
  for (const language of ['javascript', 'typescript'] as const) {
    for (const [declaration, name, head, body] of [
      ['value = {port: 8080}', 'value', 'value =', '{port: 8080}'],
      ['double = (value) => value * 2', 'double', 'double = (value) =>', 'value * 2'],
      ['{host: server} = settings', 'server', '{host: server} =', 'settings']
    ]) {
      test(language + ' preserves a complete provider declarator: ' + declaration, async () => {
        const {document, symbol} = await fixture(declaration, name, vscode.SymbolKind.Constant,
          'export const ', ';', language);
        const originalRange = symbol.range;
        const adapter = new VpLspExtenderTypeScript(language);
        const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
        assert.strictEqual(info.rangeDeclaration, undefined, 'complete provider ranges are not expanded to statements');
        assert.strictEqual(document.getText(info.rangeHead), head);
        assert.strictEqual(document.getText(info.rangeBody!), body);
        const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter);
        AssertX.range_equals(outline.totalRange, originalRange);
        assert.strictEqual(document.getText(outline.totalRange!), declaration);
        assert.strictEqual(symbol.range, originalRange, 'the provider range remains immutable');
      });
    }

    test(language + ' uses actual private-field, accessor, static-block and arrow-field syntax', async () => {
      const declaration = 'class Cache { static { this.ready ??= true; } #value = 1; get value() { return this.#value; } arrow = (input) => input?.value ?? this.#value; }';
      const {document, symbol: parent} = await fixture(declaration, 'Cache', vscode.SymbolKind.Class, '', '', language);
      const adapter = new VpLspExtenderTypeScript(language);
      const children: vscode.DocumentSymbol[] = [];
      for (const [text, name, kind] of [
        ['static { this.ready ??= true; }', 'static', vscode.SymbolKind.Namespace],
        ['#value = 1;', '#value', vscode.SymbolKind.Field],
        ['get value() { return this.#value; }', 'value', vscode.SymbolKind.Method],
        ['arrow = (input) => input?.value ?? this.#value;', 'arrow', vscode.SymbolKind.Field]
      ] as const) {
        const start = document.getText().indexOf(text);
        const nameStart = start + text.indexOf(name);
        children.push(new vscode.DocumentSymbol(name, '', kind,
          new vscode.Range(document.positionAt(start), document.positionAt(start + text.length)),
          new vscode.Range(document.positionAt(nameStart), document.positionAt(nameStart + name.length))));
      }
      parent.children = children;
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(parent, document.uri), adapter);
      const rows = outline.parts.filter(part => part.CLASS_TYPE === 'Symbol');
      assert.deepStrictEqual(rows.map(row => document.getText(row.displayTextRange!)),
        ['static', 'value()', 'arrow = (input) =>']);
      assert.deepStrictEqual(rows.map(row => row.parts.map(part => document.getText(part.displayTextRange!)).join('')),
        ['this.ready ??= true;', 'return this.#value;', 'input?.value ?? this.#value']);
      assert.strictEqual(outline.parts.filter(part => part.CLASS_TYPE === 'Text')
        .map(part => document.getText(part.displayTextRange!)).join(''), ' #value = 1; ');
      assert.strictEqual(adapter.isDeclarationSymbol(document, children[1]), false);
      assert.strictEqual(adapter.isDeclarationSymbol(document, children[3]), true);
      assert.deepStrictEqual(parent.children, children);
    });
  }

  test('preserves complete provider ranges including semicolons and surrounding comments', async () => {
    const declaration = '/* leading 😀 */ export const value = {port: 8080}; /* trailing */';
    const {document, symbol} = await fixture(declaration, 'value', vscode.SymbolKind.Constant);
    const adapter = new VpLspExtenderTypeScript('typescript');
    const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(info.rangeHead), 'value =');
    assert.strictEqual(document.getText(info.rangeBody!), '{port: 8080}');
    assert.strictEqual(info.rangeDeclaration, undefined);
    const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter);
    AssertX.range_equals(outline.totalRange, symbol.range);
    assert.strictEqual(document.getText(outline.totalRange!), declaration);
  });

  test('parses import attributes and await using in their actual document grammar context', async () => {
    const declaration = 'await using resource = acquire();';
    const {document, symbol} = await fixture(declaration, 'resource', vscode.SymbolKind.Constant,
      'import settings from "./settings.json" with {type: "json"};\nexport async function open() {\n  ', '\n}');
    const adapter = new VpLspExtenderTypeScript('typescript');
    const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(info.rangeHead), 'resource =');
    assert.strictEqual(document.getText(info.rangeBody!), 'acquire()');
    assert.strictEqual(adapter.isDeclarationSymbol(document, symbol), false);
    AssertX.range_equals(OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter).totalRange,
      symbol.range);
  });

  test('reports a zero-width missing-token diagnostic at the selected declaration end with source context', async () => {
    const file = MemoryFile.createDocument('ts');
    const source = 'const neighbor = 1;\nfunction broken() { return 1;';
    file.write(source);
    const document = await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(file.uri), 'typescript');
    const start = source.indexOf('function broken');
    const nameStart = source.indexOf('broken');
    const broken = new vscode.DocumentSymbol('broken', '', vscode.SymbolKind.Function,
      new vscode.Range(document.positionAt(start), document.positionAt(source.length)),
      new vscode.Range(document.positionAt(nameStart), document.positionAt(nameStart + 'broken'.length)));
    const adapter = new VpLspExtenderTypeScript('typescript');
    assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, broken), error => {
      const message = String(error);
      assert.ok(message.includes('Cannot determine declaration boundaries for "broken".'));
      assert.ok(message.includes(document.uri.toString()), 'boundary errors name the selected source URI');
      assert.ok(message.includes('}') && /expected/i.test(message), 'the concrete missing-token diagnostic is retained');
      assert.ok(!message.includes('\n'), 'TypeScript diagnostic chains are flattened');
      return true;
    });
    const neighbor = adapter.getDefinitionSymbol(document, document.positionAt(source.indexOf('neighbor')));
    assert.ok(neighbor);
    assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, neighbor!).rangeBody!), '1',
      'a syntax error in the following declaration cannot poison its valid neighbor');
  });

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
      'value =', '{\r\n  emoji: "😀",\r\n}'],
    ['function keep<const T>(value: T) { return value; }', 'keep', vscode.SymbolKind.Function,
      'keep<const T>(value: T)', 'return value;'],
    ['const config = {port: 8080} satisfies Settings;', 'config', vscode.SymbolKind.Constant,
      'config =', '{port: 8080} satisfies Settings'],
    ['using resource = acquire();', 'resource', vscode.SymbolKind.Constant, 'resource =', 'acquire()'],
    ['const value = source?.nested?.value ?? {fallback: true};', 'value', vscode.SymbolKind.Constant,
      'value =', 'source?.nested?.value ?? {fallback: true}'],
    ['namespace Area.Inner { export const value = 1; }', 'Area', vscode.SymbolKind.Namespace,
      'Area.Inner', 'export const value = 1;']
  ];
  for (const [declaration, name, kind, heading, body, declarationOnly = false] of cases) {
    test(declaration.split('\n')[0] + ' selecting ' + name, async () => {
      const member = kind === vscode.SymbolKind.Method || kind === vscode.SymbolKind.Constructor || kind === vscode.SymbolKind.Field;
      const prefix = member ? 'class Scope {\n  ' : kind === vscode.SymbolKind.EnumMember ? 'enum State { ' :
        declaration === 'value = {a: 1}' ? 'const ' : '';
      const closing = member ? '\n}' : kind === vscode.SymbolKind.EnumMember ? ' }' : '';
      const {document, symbol} = await fixture(declaration, name, kind, prefix, closing);
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

  test('rejects a label as a property even without supplied context', async () => {
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
      const constructor = name === 'constructor';
      const {document, symbol} = await fixture(declaration, name,
        constructor ? vscode.SymbolKind.Constructor : vscode.SymbolKind.Function,
        constructor ? 'class Scope { ' : '', constructor ? ' }' : '');
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

  for (const [declaration, name, expectedHead] of [
    ['const {port = 8080, host: server} = settings;', 'port', '{port = 8080, host: server} ='],
    ['const {port = 8080, host: server} = settings;', 'server', '{port = 8080, host: server} ='],
    ['const {nested: {value: renamed = fallback}, ...rest} = settings;', 'renamed',
      '{nested: {value: renamed = fallback}, ...rest} ='],
    ['const {nested: {value: renamed = fallback}, ...rest} = settings;', 'rest',
      '{nested: {value: renamed = fallback}, ...rest} ='],
    ['const [first, , ...remaining] = settings;', 'remaining', '[first, , ...remaining] =']
  ]) {
    test('expands an exact name-only destructured binding: ' + name + ' in ' + declaration, async () => {
      const {document, symbol} = await fixture(declaration, name, vscode.SymbolKind.Constant);
      const completeRange = symbol.range;
      symbol.range = symbol.selectionRange;
      const inputRange = symbol.range;
      const adapter = new VpLspExtenderTypeScript('typescript');
      const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(info.rangeHead), expectedHead);
      assert.strictEqual(document.getText(info.rangeBody!), 'settings');
      AssertX.range_equals(info.rangeDeclaration!, completeRange);
      assert.strictEqual(symbol.range, inputRange, 'the provider range is immutable');
      const outline = OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter);
      AssertX.range_equals(outline.totalRange, completeRange);
      const selected = adapter.getDefinitionSymbol(document, symbol.selectionRange.start);
      assert.ok(selected, 'the binding has a syntax-backed navigation target');
      AssertX.range_equals(selected!.selectionRange, symbol.selectionRange);
      assert.strictEqual(selected!.name, name, 'renamed bindings use their bound name, not their property key');
      for (const reference of ['settings', 'fallback']) {
        const start = document.getText().indexOf(reference);
        if (start >= 0) { assert.strictEqual(adapter.getDefinitionSymbol(document, document.positionAt(start)), undefined); }
      }
    });
  }

  test('name-only selection of a multiple declarator expands only its own value', async () => {
    const declaration = 'const first = 1, second = {port: 8080} satisfies Settings;';
    const {document, symbol} = await fixture(declaration, 'second', vscode.SymbolKind.Constant);
    symbol.range = symbol.selectionRange;
    const info = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(info.rangeDeclaration!), 'second = {port: 8080} satisfies Settings');
    assert.strictEqual(document.getText(info.rangeHead), 'second =');
    assert.strictEqual(document.getText(info.rangeBody!), '{port: 8080} satisfies Settings');
  });

  for (const [parameter, name, head, body] of [
    ['value: {port: number} = {port: 8080}', 'value', 'value: {port: number} =', '{port: 8080}'],
    ['...values: string[]', 'values', '...values: string[]', null],
    ['{host: server = "localhost"}: Settings = settings', 'server',
      '{host: server = "localhost"}: Settings =', 'settings']
  ] as const) {
    test('directly explores a complete parameter: ' + parameter, async () => {
      const {document, symbol} = await fixture(parameter, name, vscode.SymbolKind.Variable,
        'function open(', ') {}');
      symbol.range = symbol.selectionRange;
      const adapter = new VpLspExtenderTypeScript('typescript');
      const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(info.rangeDeclaration!), parameter);
      assert.strictEqual(document.getText(info.rangeHead), head);
      assert.strictEqual(info.rangeBody === null ? null : document.getText(info.rangeBody), body);
      assert.strictEqual(adapter.isDeclarationSymbol(document, symbol), false, 'parameters remain inline in their owner');
    });
  }

  test('uses real class-expression and static-block braces', async () => {
    const declaration = 'class Named<T extends {port: number}> { static { const config = {port: 8080}; use(config); } #value = 1; }';
    const {document, symbol} = await fixture(declaration, 'Named', vscode.SymbolKind.Class, 'const Factory = ', ';');
    const adapter = new VpLspExtenderTypeScript('typescript');
    const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(info.rangeHead), 'Named<T extends {port: number}>');
    assert.strictEqual(document.getText(info.rangeBody!), 'static { const config = {port: 8080}; use(config); } #value = 1;');
    const text = 'static { const config = {port: 8080}; use(config); }';
    const start = document.getText().indexOf(text);
    const block = new vscode.DocumentSymbol('static', '', vscode.SymbolKind.Namespace,
      new vscode.Range(document.positionAt(start), document.positionAt(start + text.length)),
      new vscode.Range(document.positionAt(start), document.positionAt(start + 'static'.length)));
    const blockInfo = adapter.getLanguageSpecificSymbolInformation(document, block);
    assert.strictEqual(document.getText(blockInfo.rangeHead), 'static');
    assert.strictEqual(document.getText(blockInfo.rangeBody!), 'const config = {port: 8080}; use(config);');
    AssertX.range_equals(OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(block, document.uri), adapter).totalRange, block.range);
  });

  test('retains only decorators and modifiers inside the displayed range', async () => {
    const declaration = '@trace({tag: "😀"}) public async read<const T>(value: T) { return value; }';
    const {document, symbol} = await fixture(declaration, 'read', vscode.SymbolKind.Method, 'class Scope { ', ' }');
    const adapter = new VpLspExtenderTypeScript('typescript');
    const info = adapter.getLanguageSpecificSymbolInformation(document, symbol);
    assert.strictEqual(document.getText(info.rangeHead), 'read<const T>(value: T)');
    assert.strictEqual(document.getText(info.rangeBody!), 'return value;');
    assert.deepStrictEqual(info.attributes.map(attribute => document.getText(attribute.displayTextRange!)),
      ['@trace({tag: "😀"})', 'public', 'async']);
    const start = document.getText().indexOf('read<const');
    symbol.range = new vscode.Range(document.positionAt(start), symbol.range.end);
    const omitted = adapter.getLanguageSpecificSymbolInformation(document, symbol);
    assert.deepStrictEqual(omitted.attributes, []);
    assert.strictEqual(document.getText(omitted.rangeHead), 'read<const T>(value: T)');
    AssertX.range_equals(OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri), adapter).totalRange, symbol.range);
  });

  for (const [signature, name] of [
    ['(value: string): {value: string};', '<call>'],
    ['new (value: string): Reader;', '<construct>'],
    ['[key: string]: {value: number};', '<index>']
  ]) {
    test('keeps a bodyless interface signature: ' + name, async () => {
      const {document, symbol} = await fixture(signature, signature, vscode.SymbolKind.Method,
        'interface Reader { ', ' }');
      symbol.name = name;
      symbol.selectionRange = symbol.range;
      const info = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(info.rangeHead), signature.slice(0, -1));
      assert.strictEqual(info.rangeBody, null);
      assert.strictEqual(info.declarationOnly, true);
    });
  }

  for (const extension of ['d.ts', 'd.mts', 'd.cts']) {
    test('selects only the requested overload in .' + extension, async () => {
      const first = 'export declare function read(value: string): string;';
      const second = 'export declare function read(value: number): number;';
      const file = MemoryFile.createDocument(extension);
      file.write(first + '\n' + second + '\nexport interface Reader { read(): void; }\n');
      const document = await vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(file.uri), 'typescript');
      const start = first.length + 1;
      const nameStart = start + second.indexOf('read');
      const symbol = new vscode.DocumentSymbol('read', '', vscode.SymbolKind.Function,
        new vscode.Range(document.positionAt(start), document.positionAt(start + second.length)),
        new vscode.Range(document.positionAt(nameStart), document.positionAt(nameStart + 4)));
      const info = new VpLspExtenderTypeScript('typescript').getLanguageSpecificSymbolInformation(document, symbol);
      assert.strictEqual(document.getText(info.rangeHead), 'read(value: number): number');
      assert.strictEqual(info.rangeBody, null);
      assert.strictEqual(info.declarationOnly, true);
      AssertX.range_equals(OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(symbol, document.uri),
        new VpLspExtenderTypeScript('typescript')).totalRange, symbol.range);
    });
  }

  test('invalidates the cache after edits and rejects invalid document positions', async () => {
    const document = await vscode.workspace.openTextDocument({language: 'typescript', content: 'const value = 1;'});
    const adapter = new VpLspExtenderTypeScript('typescript');
    const symbol = new vscode.DocumentSymbol('value', '', vscode.SymbolKind.Constant,
      new vscode.Range(0, 0, 0, 16), new vscode.Range(0, 6, 0, 11));
    try {
      assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), '1');
      const edit = new vscode.WorkspaceEdit();
      edit.replace(document.uri, symbol.range, 'const value = {emoji: "😀"};');
      assert.ok(await vscode.workspace.applyEdit(edit));
      symbol.range = new vscode.Range(0, 0, 0, document.lineAt(0).text.length);
      assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, symbol).rangeBody!), '{emoji: "😀"}');
      symbol.range = new vscode.Range(0, 0, document.lineCount, 0);
      assert.throws(() => adapter.getLanguageSpecificSymbolInformation(document, symbol), /Cannot determine declaration boundaries/);
    } finally {
      await vscode.window.showTextDocument(document);
      await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
    }
  });
});
