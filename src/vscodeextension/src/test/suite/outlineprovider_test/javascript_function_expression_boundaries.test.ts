import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {AssertX} from '../assert_utils';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {DocumentSymbolX} from '../../../outlineproviderAPI/utils/documentsymbolx';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';

const constructorText = 'self.constructor = function() {\n    { let container = makeContainer(); use(container); }\n    return self;\n  }';
const constructorStatementText = constructorText + ';';
const helperText = 'helper = function() { return 1; }';
const factoryText = 'const Factory = (function() {\n  let self = makeWindow();\n  ' + constructorText + ';\n  ' + helperText + ';\n  return self;\n});';
const source = factoryText + '\nafterFactory();\nfunction later() { return 2; }\n';
const safetyError = /Overlapping or out-of-bounds declaration ranges cannot be displayed safely\./;
const boundaryError = /Cannot determine declaration boundaries/;

async function memory(content: string, language = 'javascript') {
  const file = MemoryFile.createDocument(language === 'typescript' ? 'ts' : 'js');
  file.write(content);
  return vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(file.uri), language);
}

function rangeOf(document: vscode.TextDocument, text: string, from = 0) {
  const start = document.getText().indexOf(text, from);
  assert.ok(start >= 0, 'fixture source contains ' + text);
  const range = new vscode.Range(document.positionAt(start), document.positionAt(start + text.length));
  assert.strictEqual(document.getText(range), text);
  return range;
}

function symbol(document: vscode.TextDocument, text: string, name: string,
                kind = vscode.SymbolKind.Function, selection = name, from = 0) {
  const range = rangeOf(document, text, from);
  const selectionStart = document.getText().indexOf(selection, document.offsetAt(range.start));
  assert.ok(selectionStart >= 0 && selectionStart + selection.length <= document.offsetAt(range.end));
  return new vscode.DocumentSymbol(name, '', kind, range,
    new vscode.Range(document.positionAt(selectionStart), document.positionAt(selectionStart + selection.length)));
}

function extract(document: vscode.TextDocument, input: vscode.DocumentSymbol,
                 adapter = new VpLspExtenderTypeScript(document.languageId === 'typescript' ? 'typescript' : 'javascript')) {
  return OutlineUtils.documentSymbol2outlineSymbol(document, new DocumentSymbolX(input, document.uri), adapter);
}

function childOutlines(outline: Outline.OutlineRange): Outline.Symbol[] {
  return outline.parts.filter((part): part is Outline.Symbol => part instanceof Outline.Symbol);
}

function heading(document: vscode.TextDocument, outline: Outline.OutlineRange) {
  return document.getText(outline.displayTextRange!);
}

function assertPartition(document: vscode.TextDocument, outline: Outline.OutlineRange, body: vscode.Range) {
  let cursor = body.start;
  let expected = document.getText(body);
  const bodyStart = document.offsetAt(body.start);
  const omitted: Array<[number, number]> = [];
  const slices: string[] = [];
  for (const part of outline.parts) {
    const range = part instanceof Outline.Symbol ? part.totalRange! : part.displayTextRange!;
    assert.ok(body.contains(range), 'each effective display range stays inside the body');
    assert.ok(!range.start.isBefore(cursor), 'effective display ranges do not overlap');
    assert.strictEqual(document.getText(new vscode.Range(cursor, range.start)).trim(), '', 'only whitespace-only gaps may be omitted');
    omitted.push([document.offsetAt(cursor) - bodyStart, document.offsetAt(range.start) - bodyStart]);
    const slice = document.getText(range);
    slices.push(slice);
    cursor = range.end;
  }
  assert.strictEqual(document.getText(new vscode.Range(cursor, body.end)).trim(), '', 'the final body source is preserved');
  omitted.push([document.offsetAt(cursor) - bodyStart, document.offsetAt(body.end) - bodyStart]);
  for (const [start, end] of omitted.reverse()) {
    expected = expected.slice(0, start) + expected.slice(end);
  }
  assert.strictEqual(slices.join(''), expected, 'source slices reconstruct the body except omitted whitespace-only gaps');
}

function snapshot(roots: readonly vscode.DocumentSymbol[]) {
  const entries: Array<{input: vscode.DocumentSymbol; range: vscode.Range; selection: vscode.Range;
    children: vscode.DocumentSymbol[]; order: vscode.DocumentSymbol[]; name: string; kind: vscode.SymbolKind}> = [];
  const seen = new Set<vscode.DocumentSymbol>();
  const visit = (input: vscode.DocumentSymbol) => {
    if (seen.has(input)) { return; }
    seen.add(input);
    entries.push({input, range: input.range, selection: input.selectionRange, children: input.children,
      order: input.children.slice(), name: input.name, kind: input.kind});
    input.children.forEach(visit);
  };
  roots.forEach(visit);
  return () => {
    for (const entry of entries) {
      assert.strictEqual(entry.input.range, entry.range);
      assert.strictEqual(entry.input.selectionRange, entry.selection);
      assert.strictEqual(entry.input.children, entry.children);
      assert.deepStrictEqual(entry.input.children, entry.order);
      assert.strictEqual(entry.input.name, entry.name);
      assert.strictEqual(entry.input.kind, entry.kind);
    }
  };
}

async function factory(wrapped: boolean, mode: 'complete' | 'rhs-target' | 'rhs-selection', language = 'javascript') {
  const document = await memory(source, language);
  const parent = symbol(document, factoryText, 'Factory', vscode.SymbolKind.Constant);
  const constructor = symbol(document, constructorText, 'constructor', vscode.SymbolKind.Function);
  if (mode !== 'complete') {
    constructor.range = rangeOf(document, constructorText.slice(constructorText.indexOf('function')));
    if (mode === 'rhs-selection') { constructor.selectionRange = constructor.range; }
  }
  const helper = symbol(document, helperText, 'helper');
  const self = symbol(document, 'let self = makeWindow();', 'self', vscode.SymbolKind.Variable);
  const container = symbol(document, 'let container = makeContainer();', 'container', vscode.SymbolKind.Variable);
  constructor.children = [container];
  const wrapperText = factoryText.slice(factoryText.indexOf('function'), factoryText.lastIndexOf(')'));
  const wrapper = symbol(document, wrapperText, '<function>', vscode.SymbolKind.Function, wrapperText);
  const descendants = [helper, self, constructor];
  wrapper.children = descendants;
  parent.children = wrapped ? [wrapper] : descendants;
  return {document, parent, constructor, helper, wrapper};
}

for (const language of ['javascript', 'typescript'] as const) {
suite(language + ' function-expression boundaries', () => {
  test('keeps a standalone nested callback distinct from its callable owner', async () => {
    const callbackText = '(value) => { return value + 1; }';
    const text = 'const outer = () => { return values.map(' + callbackText + '); };';
    const document = await memory(text, language);
    const parent = symbol(document, text, 'outer', vscode.SymbolKind.Constant);
    const callback = symbol(document, callbackText, 'map() callback', vscode.SymbolKind.Function, callbackText);
    parent.children = [callback];
    const unchanged = snapshot([parent]);
    const adapter = new VpLspExtenderTypeScript(language);
    const ownerOutline = extract(document, parent, adapter);
    const children = childOutlines(ownerOutline);
    assert.strictEqual(children.length, 1);
    AssertX.range_equals(children[0].totalRange, callback.range);
    assert.strictEqual(heading(document, children[0]), '(value) =>');
    assertPartition(document, ownerOutline, adapter.getLanguageSpecificSymbolInformation(document, parent).rangeBody!);
    const independent = extract(document, callback, adapter);
    assert.strictEqual(heading(document, independent), '(value) =>');
    assert.strictEqual(document.getText(independent.totalRange!), callbackText);
    assert.strictEqual(document.getText(independent.parts[0].displayTextRange!), 'return value + 1;');
    unchanged();
  });

  for (const wrapped of [false, true]) {
    for (const mode of ['complete', 'rhs-target', 'rhs-selection'] as const) {
      test((wrapped ? 'projects an exact initializer wrapper' : 'keeps a flattened provider tree') + ': ' + mode, async () => {
        const {document, parent, constructor, helper} = await factory(wrapped, mode, language);
        const unchanged = snapshot([parent]);
        const adapter = new VpLspExtenderTypeScript(language);
        const outline = extract(document, parent, adapter);
        const children = childOutlines(outline);
        const expectedConstructor = mode === 'complete' ? constructorText : constructorStatementText;
        assert.strictEqual(heading(document, outline), 'Factory = (function()');
        AssertX.range_equals(outline.totalRange, parent.range);
        assert.deepStrictEqual(children.map(child => heading(document, child)), ['self.constructor = function()', 'helper = function()']);
        assert.deepStrictEqual(children.map(child => document.getText(child.totalRange!)), [expectedConstructor, helperText]);
        const parentInformation = adapter.getLanguageSpecificSymbolInformation(document, parent);
        assertPartition(document, outline, parentInformation.rangeBody!);
        const body = document.getText(parentInformation.rangeBody!);
        assert.ok(body.includes('let self = makeWindow();'));
        assert.ok(body.endsWith('return self;'));
        assert.ok(!body.includes('afterFactory') && !body.includes('function later'));
        const constructorInformation = adapter.getLanguageSpecificSymbolInformation(document, constructor, {ancestors: [parent]});
        assert.strictEqual(document.getText(constructorInformation.rangeBody!),
          '    { let container = makeContainer(); use(container); }\n    return self;');
        assertPartition(document, children[0], constructorInformation.rangeBody!);
        assert.deepStrictEqual(childOutlines(children[0]), [], 'non-callable container remains source');
        if (mode === 'complete') {
          assert.strictEqual(constructorInformation.rangeDeclaration, undefined);
          AssertX.range_equals(children[0].totalRange, constructor.range);
        } else {
          AssertX.range_equals(children[0].totalRange, rangeOf(document, constructorStatementText));
          AssertX.range_equals(constructorInformation.rangeDeclaration!, children[0].totalRange);
        }
        assert.deepStrictEqual(outline.parts.filter(part => part instanceof Outline.Text)
          .map(part => document.getText(part.displayTextRange!)), mode === 'complete'
          ? ['  let self = makeWindow();\n  ', ';\n  ', ';\n  return self;']
          : ['  let self = makeWindow();\n  ', ';\n  return self;'],
        'only expanded assignments consume their statement semicolon from the parent source gaps');
        unchanged();
      });
    }
  }

  for (const mode of ['rhs-target', 'rhs-selection'] as const) {
    test('opens the assigned callable rather than its receiver: ' + mode, async () => {
      const {document, parent} = await factory(true, mode, 'plaintext');
      const unchanged = snapshot([parent]);
      const registration = vscode.languages.registerDocumentSymbolProvider(
        {scheme: document.uri.scheme, language: 'plaintext'},
        {provideDocumentSymbols: doc => doc.uri.toString() === document.uri.toString() ? [parent] : []});
      try {
        const adapter = new VpLspExtenderTypeScript(language);
        const outline = await OutlineUtils.provideDocumentOutline(adapter, document);
        const factoryOutline = childOutlines(outline)[0];
        const constructorOutline = childOutlines(factoryOutline)[0];
        const destination = constructorOutline.definitionPosition ?? constructorOutline.displayTextRange!.start;
        const opened = await OutlineUtils.provideDefinitionOutline(adapter, document, destination);
        assert.ok(opened !== null, 'opening a known declaration is not cancellation');
        assert.strictEqual(opened!.length, 1);
        const selected = opened![0];
        assert.ok(selected instanceof Outline.Symbol, 'the assigned callable opens as a symbol, not its file');
        assert.deepStrictEqual(opened!.map(part => heading(document, part)), ['self.constructor = function()']);
        assert.strictEqual(document.getText(selected.totalRange!), constructorStatementText);
        assert.strictEqual(selected.parts.map(part => document.getText(part.displayTextRange!)).join(''),
          '    { let container = makeContainer(); use(container); }\n    return self;');
        unchanged();
      } finally {
        registration.dispose();
      }
    });
  }

  test('an exact RHS declaration start wins over an enclosing wrapper selection', async () => {
    const {document, parent, constructor} = await factory(true, 'rhs-target', 'plaintext');
    const registration = vscode.languages.registerDocumentSymbolProvider(
      {scheme: document.uri.scheme, language: 'plaintext'},
      {provideDocumentSymbols: () => [parent]});
    try {
      const opened = await OutlineUtils.provideDefinitionOutline(
        new VpLspExtenderTypeScript(language), document, constructor.range.start);
      assert.ok(opened !== null, 'opening a known declaration is not cancellation');
      assert.strictEqual(opened!.length, 1);
      const selected = opened![0];
      assert.ok(selected instanceof Outline.Symbol, 'the exact declaration opens as a symbol, not its file');
      assert.deepStrictEqual(opened!.map(part => heading(document, part)), ['self.constructor = function()']);
      assert.strictEqual(document.getText(selected.totalRange!), constructorStatementText);
    } finally {
      registration.dispose();
    }
  });

  test('a complete assignment reopens from its syntax-backed RHS lookup point', async () => {
    const {document, parent} = await factory(true, 'complete', 'plaintext');
    const registration = vscode.languages.registerDocumentSymbolProvider(
      {scheme: document.uri.scheme, language: 'plaintext'},
      {provideDocumentSymbols: () => [parent]});
    try {
      const adapter = new VpLspExtenderTypeScript(language);
      const file = await OutlineUtils.provideDocumentOutline(adapter, document);
      const constructor = childOutlines(childOutlines(file)[0])[0];
      // Webview messages carry plain positions, not VS Code Position instances.
      const position = JSON.parse(JSON.stringify(constructor.definitionPosition));
      const opened = await OutlineUtils.provideDefinitionOutline(adapter, document, position);
      assert.ok(opened !== null, 'opening a known declaration is not cancellation');
      assert.strictEqual(opened!.length, 1);
      const selected = opened![0];
      assert.ok(selected instanceof Outline.Symbol, 'the syntax-backed destination opens as a symbol, not its file');
      assert.deepStrictEqual(opened!.map(part => heading(document, part)), ['self.constructor = function()']);
      assert.strictEqual(document.getText(selected.totalRange!), constructorText);
    } finally {
      registration.dispose();
    }
  });

  test('whole-file traversal promotes a callable constant and leaves ordinary variables in source', async () => {
    const {document, parent} = await factory(true, 'rhs-selection', 'plaintext');
    const later = symbol(document, 'function later() { return 2; }', 'later');
    const inputs = [later, parent];
    const unchanged = snapshot(inputs);
    const provider = vscode.languages.registerDocumentSymbolProvider({scheme: document.uri.scheme, language: 'plaintext'},
      {provideDocumentSymbols: doc => doc.uri.toString() === document.uri.toString() ? inputs : []});
    try {
      const outline = await OutlineUtils.provideDocumentOutline(new VpLspExtenderTypeScript(language), document);
      assert.deepStrictEqual(childOutlines(outline).map(child => heading(document, child)), ['Factory = (function()', 'later()']);
      assertPartition(document, outline, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)));
      assert.deepStrictEqual(inputs, [later, parent]);
      unchanged();
    } finally {
      provider.dispose();
    }
  });

  for (const kind of [vscode.SymbolKind.Variable, vscode.SymbolKind.Constant, vscode.SymbolKind.Property, vscode.SymbolKind.Field]) {
    test('opts only callable initializers and assignments into ignored kind ' + kind, async () => {
      const text = 'function outer() { const self = makeWindow(); const container = {}; const expandible = class {}; holder.run = (() => { return 3; }); }';
      const document = await memory(text, language);
      const parent = symbol(document, text, 'outer');
      const callable = symbol(document, 'holder.run = (() => { return 3; });', 'run', kind);
      parent.children = [symbol(document, 'const self = makeWindow();', 'self', kind),
        symbol(document, 'const container = {};', 'container', kind),
        symbol(document, 'const expandible = class {};', 'expandible', kind), callable];
      const outline = extract(document, parent);
      assert.deepStrictEqual(childOutlines(outline).map(child => heading(document, child)), ['holder.run = (() =>']);
      assert.strictEqual(outline.parts.filter(part => part instanceof Outline.Text)
        .map(part => document.getText(part.displayTextRange!)).join(''),
        'const self = makeWindow(); const container = {}; const expandible = class {}; ');
    });
  }

  for (const [text, name, expectedHead, expectedBody] of [
    ['const value = (((function() { return "}; {"; /* }; { */ })));', 'value', 'value = (((function()', 'return "}; {"; /* }; { */'],
    ['const value = function(input = "{;}") /* }; */ { return input; };', 'value',
      'value = function(input = "{;}") /* }; */', 'return input;'],
    ['value = function() {};', 'value', 'value = function()', ''],
    ['holder.run = function() {};', 'run', 'holder.run = function()', ''],
    ['holder["run"] = (() => ({value: "};"}));', 'holder["run"]', 'holder["run"] = (() =>', '({value: "};"})'],
    ['const value = () => 42;', 'value', 'value = () =>', '42']
  ]) {
    test('extracts callable syntax without punctuation scanning: ' + text, async () => {
      const document = await memory(text + '\nafter();', language);
      const input = symbol(document, text, name, vscode.SymbolKind.Variable);
      const adapter = new VpLspExtenderTypeScript(language);
      const information = adapter.getLanguageSpecificSymbolInformation(document, input);
      assert.strictEqual(document.getText(information.rangeHead), expectedHead);
      assert.strictEqual(document.getText(information.rangeBody!), expectedBody);
      assert.strictEqual(information.declarationOnly, false);
      const outline = extract(document, input, adapter);
      AssertX.range_equals(outline.totalRange, input.range);
      if (expectedBody === '') {
        assert.ok(information.rangeBody!.isEmpty);
        assert.deepStrictEqual(outline.parts, []);
      }
    });
  }

  if (language === 'typescript') {
    for (const initializer of [
      '((() => { return 3; }) as (() => number))',
      '((() => { return 3; }) satisfies (() => number))',
      '(<() => number>(() => { return 3; }))',
      '((() => { return 3; })!)'
    ]) {
      test('recognizes a callable through transparent TypeScript wrappers: ' + initializer, async () => {
        const text = 'const run = ' + initializer + ';';
        const document = await memory(text, language);
        const owner = symbol(document, text, 'run', vscode.SymbolKind.Constant);
        const adapter = new VpLspExtenderTypeScript(language);
        const unchanged = snapshot([owner]);
        assert.strictEqual(adapter.isDeclarationSymbol(document, owner), true);
        const info = adapter.getLanguageSpecificSymbolInformation(document, owner);
        assert.strictEqual(document.getText(info.rangeHead),
          'run = ' + initializer.slice(0, initializer.indexOf('{')).trim());
        assert.strictEqual(document.getText(info.rangeBody!), 'return 3;');
        AssertX.range_equals(extract(document, owner, adapter).totalRange, owner.range);
        unchanged();
      });
    }
  }

  test('extracts an anonymous callback from its actual call expression', async () => {
    const text = 'function() { return 7; }';
    const document = await memory('subscribe(' + text + ');', language);
    const input = symbol(document, text, '<function>', vscode.SymbolKind.Function, text);
    const adapter = new VpLspExtenderTypeScript(language);
    const information = adapter.getLanguageSpecificSymbolInformation(document, input);
    assert.strictEqual(document.getText(information.rangeHead), 'function()');
    assert.strictEqual(document.getText(information.rangeBody!), 'return 7;');
    AssertX.range_equals(extract(document, input, adapter).totalRange, input.range);
  });

  test('projects only exact function or parenthesized initializer AST ranges', async () => {
    const text = 'const Factory = (((function() { helper = function() {}; return helper; })));';
    const document = await memory(text, language);
    const parent = symbol(document, text, 'Factory', vscode.SymbolKind.Constant);
    const helper = symbol(document, 'helper = function() {}', 'helper');
    for (const wrapperText of ['function() { helper = function() {}; return helper; }',
      '(function() { helper = function() {}; return helper; })',
      '((function() { helper = function() {}; return helper; }))']) {
      const wrapper = symbol(document, wrapperText, 'provider wrapper', vscode.SymbolKind.Function, wrapperText);
      wrapper.children = [helper];
      parent.children = [wrapper];
      const unchanged = snapshot([parent]);
      const outline = extract(document, parent);
      assert.strictEqual(heading(document, outline), 'Factory = (((function()');
      assert.deepStrictEqual(childOutlines(outline).map(child => heading(document, child)), ['helper = function()']);
      unchanged();
    }
  });

  test('retains unrelated real children when projecting an initializer wrapper', async () => {
    const {document, parent, wrapper} = await factory(true, 'complete', language);
    const outside = symbol(document, 'function later() { return 2; }', 'later');
    parent.children = [outside, wrapper];
    const unchanged = snapshot([parent]);
    const outline = extract(document, parent);
    assert.deepStrictEqual(childOutlines(outline).map(child => heading(document, child)), ['self.constructor = function()', 'helper = function()']);
    unchanged();
  });

  test('rejects an unrelated enclosing wrapper instead of flattening it', async () => {
    const {document, parent, wrapper} = await factory(true, 'complete', language);
    wrapper.range = new vscode.Range(rangeOf(document, '(function').start, parent.range.end);
    wrapper.selectionRange = wrapper.range;
    const unchanged = snapshot([parent]);
    assert.throws(() => extract(document, parent), safetyError);
    unchanged();
  });

  test('rejects a second certified initializer wrapper rather than deduplicating it', async () => {
    const {document, parent, wrapper} = await factory(true, 'complete', language);
    const duplicate = new vscode.DocumentSymbol('another provider wrapper', '', vscode.SymbolKind.Function, wrapper.range, wrapper.selectionRange);
    duplicate.children = wrapper.children;
    parent.children = [wrapper, duplicate];
    const unchanged = snapshot([parent]);
    assert.throws(() => extract(document, parent), boundaryError);
    unchanged();
  });

  test('preflights duplicate, overlapping and crossing real children before extraction', async () => {
    for (const mode of ['duplicate', 'overlap', 'cross-start', 'cross-end']) {
      const {document, parent, constructor, helper, wrapper} = await factory(true, 'complete', language);
      if (mode === 'duplicate') {
        wrapper.children = [constructor, constructor];
      } else if (mode === 'overlap') {
        constructor.range = new vscode.Range(constructor.range.start, helper.range.end);
        wrapper.children = [constructor, helper];
      } else {
        constructor.range = mode === 'cross-start'
          ? new vscode.Range(parent.range.start, constructor.range.end)
          : new vscode.Range(constructor.range.start, parent.range.end);
        wrapper.children = [constructor];
      }
      const unchanged = snapshot([parent]);
      assert.throws(() => extract(document, parent), safetyError);
      unchanged();
    }
  });

  test('rejects malformed selected callables and unrelated reference selections', async () => {
    for (const text of ['const broken = function() {', 'self.broken = function( {', 'const broken = (() => {']) {
      const document = await memory(text, language);
      const input = symbol(document, text, 'broken', vscode.SymbolKind.Variable);
      assert.throws(() => extract(document, input), boundaryError);
    }
    const text = 'const value = function() { return value; };';
    const document = await memory(text, language);
    const input = symbol(document, text, 'value', vscode.SymbolKind.Constant);
    input.selectionRange = rangeOf(document, 'value', text.lastIndexOf('value'));
    assert.throws(() => extract(document, input), boundaryError);
  });

  test('projected variable-like children retain exact source and immutable provider input', async () => {
    const {document, parent, constructor, helper} = await factory(true, 'rhs-target', language);
    constructor.kind = vscode.SymbolKind.Property;
    helper.kind = vscode.SymbolKind.Variable;
    const unchanged = snapshot([parent]);
    const adapter = new VpLspExtenderTypeScript(language);
    const outline = extract(document, parent, adapter);
    assert.deepStrictEqual(childOutlines(outline).map(child => heading(document, child)),
      ['self.constructor = function()', 'helper = function()']);
    assert.deepStrictEqual(childOutlines(outline).map(child => document.getText(child.totalRange!)),
      [constructorStatementText, helperText]);
    assertPartition(document, outline, adapter.getLanguageSpecificSymbolInformation(document, parent).rangeBody!);
    assert.deepStrictEqual(outline.parts.filter(part => part instanceof Outline.Text)
      .map(part => document.getText(part.displayTextRange!)),
      ['  let self = makeWindow();\n  ', ';\n  return self;']);
    unchanged();
  });

  test('an empty child projection leaves provider children as ordinary source', async () => {
    const text = 'function outer() { function inner() {} return inner; }';
    const document = await memory(text, language);
    const parent = symbol(document, text, 'outer');
    parent.children = [symbol(document, 'function inner() {}', 'inner')];
    const unchanged = snapshot([parent]);
    const adapter = new VpLspExtenderTypeScript(language);
    const getInformation = adapter.getLanguageSpecificSymbolInformation.bind(adapter);
    adapter.getLanguageSpecificSymbolInformation = (doc, input, context) => {
      const information = getInformation(doc, input, context);
      return input === parent ? {...information, children: []} : information;
    };
    const outline = extract(document, parent, adapter);
    assert.deepStrictEqual(childOutlines(outline), []);
    assert.strictEqual(document.getText(outline.parts[0].displayTextRange!), 'function inner() {} return inner;');
    unchanged();
  });

  test('rejects overlapping or out-of-body effective ranges after successful raw preflight', async () => {
    for (const crossing of [false, true]) {
      const {document, parent, constructor, helper} = await factory(false, 'complete', language);
      const adapter = new VpLspExtenderTypeScript(language);
      const getInformation = adapter.getLanguageSpecificSymbolInformation.bind(adapter);
      adapter.getLanguageSpecificSymbolInformation = (doc, input, context) => {
        const information = getInformation(doc, input, context);
        return input === helper ? {...information, rangeDeclaration: new vscode.Range(
          crossing ? parent.range.start : constructor.range.start, helper.range.end)} : information;
      };
      assert.throws(() => extract(document, parent, adapter), safetyError);
    }
  });

  test('opens an AST-proven RHS owner without supplied ancestors', async () => {
    const assignment = 'self.constructor = function() { return self; };';
    const document = await memory(assignment, language);
    const rhs = symbol(document, 'function() { return self; }', 'constructor', vscode.SymbolKind.Function,
      'function() { return self; }');
    rhs.selectionRange = rangeOf(document, 'constructor');
    const unchanged = snapshot([rhs]);
    const adapter = new VpLspExtenderTypeScript(language);
    const info = adapter.getLanguageSpecificSymbolInformation(document, rhs);
    assert.strictEqual(document.getText(info.rangeDeclaration!), assignment);
    assert.strictEqual(document.getText(info.rangeHead), 'self.constructor = function()');
    assert.strictEqual(document.getText(info.rangeBody!), 'return self;');
    const outline = extract(document, rhs, adapter);
    AssertX.range_equals(outline.totalRange, info.rangeDeclaration!);
    unchanged();
  });

  test('rejects an unrelated RHS selection and a truncated executable RHS', async () => {
    const text = 'const unrelated = 1; self.constructor = function() { return self; };';
    const document = await memory(text, language);
    const rhsText = 'function() { return self; }';
    const rhs = symbol(document, rhsText, '<function>', vscode.SymbolKind.Function, rhsText);
    rhs.selectionRange = rangeOf(document, 'unrelated');
    assert.throws(() => extract(document, rhs), boundaryError);
    rhs.selectionRange = rangeOf(document, 'constructor');
    rhs.range = new vscode.Range(rhs.range.start, document.positionAt(document.offsetAt(rhs.range.end) - 1));
    assert.throws(() => extract(document, rhs), boundaryError);
  });

  for (const text of ['const value = makeWindow();', 'const value = class {};',
    'value += function() {};', 'use(value = function() {});']) {
    test('keeps a non-callable declaration or expression as ordinary source: ' + text, async () => {
      const document = await memory(text, language);
      const input = symbol(document, text, 'value', vscode.SymbolKind.Variable);
      assert.strictEqual(new VpLspExtenderTypeScript(language).isDeclarationSymbol(document, input), false);
    });
  }
});
}
