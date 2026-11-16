import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import {MemoryFile} from '../memoryfile';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';
import {SourceReference, computeDocumentHash, SavedRange} from '../../../outlineproviderAPI/source_reference';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {VpLspExtenderPython} from '../../../outlineproviders/lspextenderpython';
import {translateOutlineRanges} from '../../../visualprogramming/outline_entities';
import {AssertX} from '../assert_utils';
import {getTestDirPath} from '../../main';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';
import {executeDefinitionProviderForPositionOnDocument, executeSavedOutlineProvider} from '../../../outlineproviderAPI/extensionactivator';

let fixtureId = 0;

class RestoreFixture {
  readonly scheme = 'outline-canvas-restore-' + (++fixtureId);
  readonly adapter = new VpLspExtenderPython();
  readonly symbols = new Map<string, vscode.DocumentSymbol[]>();
  definitionProviderCalled = false;
  private readonly files = new Map<string, MemoryFile>();
  private readonly registrations: vscode.Disposable[];

  constructor() {
    const execute = vscode.commands.executeCommand;
    vscode.commands.executeCommand = <T>(command: string, ...args: unknown[]): Thenable<T | undefined> => {
      const uri = args[0];
      if (uri instanceof vscode.Uri && uri.scheme === this.scheme) {
        if (command === 'vscode.executeDocumentSymbolProvider') {
          return Promise.resolve((this.symbols.get(uri.toString()) ?? []) as T);
        }
        if (command === 'vscode.executeDefinitionProvider') {
          this.definitionProviderCalled = true;
          return Promise.resolve([] as T);
        }
      }
      return execute<T>(command, ...args);
    };
    this.registrations = [
      new vscode.Disposable(() => { vscode.commands.executeCommand = execute; }),
      vscode.workspace.registerTextDocumentContentProvider(this.scheme, {
        provideTextDocumentContent: uri => {
          const file = this.files.get(uri.toString());
          if (!file) throw new Error('Fixture source unavailable: ' + uri.toString());
          return file.read();
        }
      }),
    ];
  }

  uri(path: string) { return vscode.Uri.parse(this.scheme + ':/' + path); }

  async open(path: string, content: string, language = 'plaintext') {
    const uri = this.uri(path);
    const file = MemoryFile.createDocument(path.split('.').pop() ?? '');
    file.write(content);
    this.files.set(uri.toString(), file);
    return vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(uri), language);
  }

  async update(document: vscode.TextDocument, content: string) {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), content);
    assert.ok(await vscode.workspace.applyEdit(edit), 'the fixture edit is applied');
  }

  dispose() {
    this.registrations.slice().reverse().forEach(r => r.dispose());
  }
}

function toSaved(range: vscode.Range): SavedRange {
  return [
    { line: range.start.line, character: range.start.character },
    { line: range.end.line, character: range.end.character }
  ];
}

function rangeOf(document: vscode.TextDocument, text: string, from = 0) {
  const start = document.getText().indexOf(text, from);
  assert.ok(start >= 0, 'fixture contains ' + text);
  return new vscode.Range(document.positionAt(start), document.positionAt(start + text.length));
}

function functionSymbol(document: vscode.TextDocument, declaration: string, name: string, from = 0) {
  const range = rangeOf(document, declaration, from);
  return new vscode.DocumentSymbol(name, '', vscode.SymbolKind.Function, range,
    rangeOf(document, name, document.offsetAt(range.start)));
}

async function saveReference(outline: Outline.Symbol): Promise<SourceReference> {
  await translateOutlineRanges([outline]);
  assert.ok(outline.sourceReference);
  return JSON.parse(JSON.stringify(outline.sourceReference));
}

function assertSameSource(actual: Outline.Symbol, expected: Outline.Symbol, document: vscode.TextDocument) {
  assert.strictEqual(actual.uri, document.uri.toString());
  assert.strictEqual(actual.language, document.languageId);
  AssertX.range_equals(actual.totalRange, expected.totalRange);
  AssertX.range_equals(actual.displayTextRange, expected.displayTextRange);
  assert.deepStrictEqual(actual.sourceReference?.symbol, expected.sourceReference?.symbol);
  assert.strictEqual(document.getText(actual.totalRange!), document.getText(expected.totalRange!));
}

suite('Canvas Restore Validation', () => {
  let fixture: RestoreFixture;

  setup(() => {
    fixture = new RestoreFixture();
  });

  teardown(() => {
    fixture.dispose();
  });

  test('restores symbol when document is unchanged and definition provider is never called', async () => {
    const code = 'def hello():\n    return 42\n';
    const doc = await fixture.open('mod.py', code);
    const symRange = new vscode.Range(0, 0, 1, 13);
    const selRange = new vscode.Range(0, 4, 0, 9);
    const sym = new vscode.DocumentSymbol('hello', '', vscode.SymbolKind.Function, symRange, selRange);
    fixture.symbols.set(doc.uri.toString(), [sym]);

    const hash = computeDocumentHash(code);
    const ref: SourceReference = {
      type: 'symbol',
      uri: doc.uri.toString(),
      language: 'plaintext',
      documentHash: hash,
      symbol: {
        name: 'hello',
        kind: vscode.SymbolKind.Function,
        path: [{ name: 'hello', kind: vscode.SymbolKind.Function }],
        selection: toSaved(selRange),
        declaration: toSaved(symRange)
      }
    };

    const restored = await OutlineUtils.provideSavedOutline(doc, ref, fixture.adapter);
    assert.ok(restored instanceof Outline.Symbol);
    assert.strictEqual(restored.displayTextRange?.start.line, 0);
    assert.strictEqual(fixture.definitionProviderCalled, false, 'definition provider must not be called during restore');
  });

  test('restores symbol by unique ancestry when document hash changed', async () => {
    const originalCode = 'def target():\n    return 1\n';
    const modifiedCode = '# Header comment\n# Another line\ndef target():\n    return 2\n';
    const doc = await fixture.open('mod.py', modifiedCode);
    const symRange = new vscode.Range(2, 0, 3, 12);
    const selRange = new vscode.Range(2, 4, 2, 10);
    const sym = new vscode.DocumentSymbol('target', '', vscode.SymbolKind.Function, symRange, selRange);
    fixture.symbols.set(doc.uri.toString(), [sym]);

    const ref: SourceReference = {
      type: 'symbol',
      uri: doc.uri.toString(),
      language: 'plaintext',
      documentHash: computeDocumentHash(originalCode),
      symbol: {
        name: 'target',
        kind: vscode.SymbolKind.Function,
        path: [{ name: 'target', kind: vscode.SymbolKind.Function }],
        selection: [{ line: 0, character: 4 }, { line: 0, character: 10 }],
        declaration: [{ line: 0, character: 0 }, { line: 1, character: 12 }]
      }
    };

    const restored = await OutlineUtils.provideSavedOutline(doc, ref, fixture.adapter);
    assert.ok(restored instanceof Outline.Symbol);
    assert.strictEqual(restored.displayTextRange?.start.line, 2);
    assert.strictEqual(fixture.definitionProviderCalled, false);
  });

  test('rejects restore if document changed and ancestry is ambiguous', async () => {
    const code = 'def run(): pass\ndef run(): pass\n';
    const doc = await fixture.open('mod.py', code);
    const run1 = new vscode.DocumentSymbol('run', '', vscode.SymbolKind.Function, new vscode.Range(0, 0, 0, 15), new vscode.Range(0, 4, 0, 7));
    const run2 = new vscode.DocumentSymbol('run', '', vscode.SymbolKind.Function, new vscode.Range(1, 0, 1, 15), new vscode.Range(1, 4, 1, 7));
    fixture.symbols.set(doc.uri.toString(), [run1, run2]);

    const ref: SourceReference = {
      type: 'symbol',
      uri: doc.uri.toString(),
      language: 'plaintext',
      documentHash: 'different-hash-'.padEnd(64, '0'),
      symbol: {
        name: 'run',
        kind: vscode.SymbolKind.Function,
        path: [{ name: 'run', kind: vscode.SymbolKind.Function }],
        selection: [{ line: 0, character: 4 }, { line: 0, character: 7 }],
        declaration: [{ line: 0, character: 0 }, { line: 0, character: 15 }]
      }
    };

    await assert.rejects(
      async () => OutlineUtils.provideSavedOutline(doc, ref, fixture.adapter),
      /Ambiguous symbol/
    );
  });

  test('distinguishes duplicate names when exact ancestry matches', async () => {
    const code = 'class A:\n    def run(self): pass\nclass B:\n    def run(self): pass\n';
    const doc = await fixture.open('mod.py', code);
    const symA = new vscode.DocumentSymbol('A', '', vscode.SymbolKind.Class, new vscode.Range(0, 0, 1, 23), new vscode.Range(0, 6, 0, 7));
    const runA = new vscode.DocumentSymbol('run', '', vscode.SymbolKind.Method, new vscode.Range(1, 4, 1, 23), new vscode.Range(1, 8, 1, 11));
    symA.children = [runA];

    const symB = new vscode.DocumentSymbol('B', '', vscode.SymbolKind.Class, new vscode.Range(2, 0, 3, 23), new vscode.Range(2, 6, 2, 7));
    const runB = new vscode.DocumentSymbol('run', '', vscode.SymbolKind.Method, new vscode.Range(3, 4, 3, 23), new vscode.Range(3, 8, 3, 11));
    symB.children = [runB];

    fixture.symbols.set(doc.uri.toString(), [symA, symB]);

    const refB: SourceReference = {
      type: 'symbol',
      uri: doc.uri.toString(),
      language: 'plaintext',
      documentHash: 'different-hash-'.padEnd(64, '0'),
      symbol: {
        name: 'run',
        kind: vscode.SymbolKind.Method,
        path: [
          { name: 'B', kind: vscode.SymbolKind.Class },
          { name: 'run', kind: vscode.SymbolKind.Method }
        ],
        selection: [{ line: 3, character: 8 }, { line: 3, character: 11 }],
        declaration: [{ line: 3, character: 4 }, { line: 3, character: 23 }]
      }
    };

    const restored = await OutlineUtils.provideSavedOutline(doc, refB, fixture.adapter);
    assert.ok(restored instanceof Outline.Symbol);
    assert.strictEqual(restored.displayTextRange?.start.line, 3);
  });

  test('rejects new different symbol placed at old line coordinates', async () => {
    const code = 'def differentName():\n    return 0\n';
    const doc = await fixture.open('mod.py', code);
    const sym = new vscode.DocumentSymbol('differentName', '', vscode.SymbolKind.Function,
      new vscode.Range(0, 0, 1, 12), new vscode.Range(0, 4, 0, 17));
    fixture.symbols.set(doc.uri.toString(), [sym]);

    const ref: SourceReference = {
      type: 'symbol',
      uri: doc.uri.toString(),
      language: 'plaintext',
      documentHash: 'old-hash-'.padEnd(64, '0'),
      symbol: {
        name: 'oldName',
        kind: vscode.SymbolKind.Function,
        path: [{ name: 'oldName', kind: vscode.SymbolKind.Function }],
        selection: [{ line: 0, character: 4 }, { line: 0, character: 11 }],
        declaration: [{ line: 0, character: 0 }, { line: 1, character: 12 }]
      }
    };

    await assert.rejects(
      async () => OutlineUtils.provideSavedOutline(doc, ref, fixture.adapter),
      /Symbol "oldName" not found in modified document/
    );
  });

  test('restores omitted Python assignment via syntax when hash is unchanged', async () => {
    const code = 'CONFIG_VAR = "configured"\n';
    const doc = await fixture.open('mod.py', code);
    // Provider returns NO document symbols (assignment omitted by provider)
    fixture.symbols.set(doc.uri.toString(), []);

    const hash = computeDocumentHash(code);
    const ref: SourceReference = {
      type: 'symbol',
      uri: doc.uri.toString(),
      language: 'plaintext',
      documentHash: hash,
      symbol: {
        name: 'CONFIG_VAR',
        kind: vscode.SymbolKind.Variable,
        path: null, // synthesized
        selection: [{ line: 0, character: 0 }, { line: 0, character: 10 }],
        declaration: [{ line: 0, character: 0 }, { line: 0, character: 25 }]
      }
    };

    const restored = await OutlineUtils.provideSavedOutline(doc, ref, fixture.adapter);
    assert.ok(restored instanceof Outline.Symbol);
    assert.strictEqual(restored.kind, 'variable');
  });

  test('rejects when document language does not match saved language', async () => {
    const doc = await fixture.open('mod.py', 'x = 1\n', 'plaintext');
    const ref: SourceReference = {
      type: 'file',
      uri: doc.uri.toString(),
      language: 'python', // mismatch with 'plaintext'
      documentHash: computeDocumentHash('x = 1\n'),
      symbol: null
    };

    await assert.rejects(
      async () => OutlineUtils.provideSavedOutline(doc, ref, fixture.adapter),
      /Language changed from python to plaintext/
    );
  });

  test('fills text and fresh hashes from serialized outline objects and Range tuples', async () => {
    const code = 'def hello():\n    return 42\n';
    const doc = await fixture.open('serialized.py', code);
    const symbol = new vscode.DocumentSymbol('hello', '', vscode.SymbolKind.Function,
      new vscode.Range(0, 0, 1, 13), new vscode.Range(0, 4, 0, 9));
    fixture.symbols.set(doc.uri.toString(), [symbol]);
    const outline = await OutlineUtils.provideDocumentOutline(fixture.adapter, doc);
    // Simulate the VS Code command/message serialization boundary, not instances.
    const raw: Outline.File = JSON.parse(JSON.stringify(outline));
    await translateOutlineRanges([raw]);
    assert.strictEqual(raw.displayText, 'serialized.py');
    assert.strictEqual(raw.sourceReference?.documentHash, computeDocumentHash(code));
    const child = raw.parts.find(part => part.CLASS_TYPE === 'Symbol');
    assert.ok(child);
    assert.ok(child!.displayText.includes('hello'));
    assert.ok(child!.displayTextRange instanceof vscode.Range);
    assert.strictEqual(child!.sourceReference?.documentHash, computeDocumentHash(code));
    const body = child!.parts.find(part => part.CLASS_TYPE === 'Text');
    assert.ok(body!.displayText.includes('return 42'));
  });

  for (const language of ['javascript', 'typescript'] as const) {
    test('restores an unchanged omitted ' + language + ' binding by exact syntax without definition lookup', async () => {
      const declaration = 'function configure() {\n  const {port = 8080, host: server} = settings;\n  return server;\n}';
      const doc = await fixture.open(language === 'javascript' ? 'bindings.js' : 'bindings.ts', declaration, language);
      fixture.symbols.set(doc.uri.toString(), [functionSymbol(doc, declaration, 'configure')]);
      const adapter = new VpLspExtenderTypeScript(language);
      const selection = rangeOf(doc, 'server');
      const result = await OutlineUtils.provideDefinitionOutline(adapter, doc, selection.start);
      assert.ok(result && result.length === 1 && result[0] instanceof Outline.Symbol);
      const original = result[0];
      const reference = await saveReference(original);
      assert.strictEqual(reference.language, language);
      assert.strictEqual(reference.uri, doc.uri.toString());
      assert.strictEqual(reference.symbol?.name, 'server', 'the renamed leaf uses the bound name, not its property key');
      assert.strictEqual(reference.symbol?.kind, vscode.SymbolKind.Constant);
      assert.strictEqual(reference.symbol?.path, null);
      assert.deepStrictEqual(reference.symbol?.selection, toSaved(selection));
      assert.deepStrictEqual(reference.symbol?.declaration, toSaved(rangeOf(doc, 'const {port = 8080, host: server} = settings;')));

      const restored = await OutlineUtils.provideSavedOutline(doc, reference, adapter);
      assert.ok(restored instanceof Outline.Symbol);
      assertSameSource(restored, original, doc);
      assert.strictEqual(doc.getText(restored.displayTextRange!), '{port = 8080, host: server} =');
      assert.strictEqual(restored.parts.map(part => doc.getText(part.displayTextRange!)).join(''), 'settings');
      assert.strictEqual(fixture.definitionProviderCalled, false);
    });

    test('changed pathless ' + language + ' bindings stay unavailable rather than guessing new coordinates', async () => {
      const code = 'const value = 42;\n';
      const doc = await fixture.open(language === 'javascript' ? 'pathless.js' : 'pathless.ts', code, language);
      fixture.symbols.set(doc.uri.toString(), []);
      const adapter = new VpLspExtenderTypeScript(language);
      const result = await OutlineUtils.provideDefinitionOutline(adapter, doc, rangeOf(doc, 'value').start);
      assert.ok(result && result.length === 1 && result[0] instanceof Outline.Symbol);
      const reference = await saveReference(result[0]);
      assert.strictEqual(reference.symbol?.path, null);
      const version = doc.version;
      try {
        await fixture.update(doc, '// moved declaration\n' + code);
        assert.ok(doc.version > version);
        await assert.rejects(OutlineUtils.provideSavedOutline(doc, reference, adapter),
          /Cannot locate declaration "value": document modified and symbol has no ancestry path/);
        assert.strictEqual(fixture.definitionProviderCalled, false);
      } finally {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
    });

    test('changed ' + language + ' provider ancestry remains unavailable when two declarations match', async () => {
      const first = 'function run() { return 1; }';
      const second = 'function run() { return 2; }';
      const doc = await fixture.open(language === 'javascript' ? 'ambiguous.js' : 'ambiguous.ts', first, language);
      const initialSymbol = functionSymbol(doc, first, 'run');
      fixture.symbols.set(doc.uri.toString(), [initialSymbol]);
      const adapter = new VpLspExtenderTypeScript(language);
      const result = await OutlineUtils.provideDefinitionOutline(adapter, doc, initialSymbol.selectionRange.start);
      assert.ok(result && result.length === 1 && result[0] instanceof Outline.Symbol);
      const reference = await saveReference(result[0]);
      assert.deepStrictEqual(reference.symbol?.path, [{name: 'run', kind: vscode.SymbolKind.Function}]);

      try {
        await fixture.update(doc, '// modified\n' + first + '\n' + second + '\n');
        fixture.symbols.set(doc.uri.toString(), [
          functionSymbol(doc, first, 'run'), functionSymbol(doc, second, 'run', doc.getText().indexOf(second))
        ]);
        await assert.rejects(OutlineUtils.provideSavedOutline(doc, reference, adapter),
          /Ambiguous symbol: multiple declarations match ancestry path for "run"/);
        assert.strictEqual(fixture.definitionProviderCalled, false);
      } finally {
        await vscode.window.showTextDocument(doc);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
    });
  }

  test('saves and restores a real JavaScript to TypeScript target through the target registry', async () => {
    const extension = vscode.extensions.getExtension('vscode.typescript-language-features');
    assert.ok(extension, 'the built-in TypeScript language extension must be available');
    await extension.activate();
    const fixturePath = path.join(getTestDirPath(), 'testfiles', 'js_ts_parser');
    const source = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixturePath, 'consumer.js')));
    const target = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixturePath, 'modern.ts')));
    assert.strictEqual(source.languageId, 'javascript');
    assert.strictEqual(target.languageId, 'typescript');
    const call = /\bkeep\s*\(/.exec(source.getText());
    assert.ok(call, 'the real JavaScript fixture calls keep');
    const position = source.positionAt(call.index);
    const targets = await OutlineUtils.vscode_executeDefinitionProvider(source.uri, position);
    const expectedTarget = targets.find(candidate => candidate.uri.toString() === target.uri.toString()
      && target.getText(candidate.selectionRange) === 'keep');
    assert.ok(expectedTarget, 'the built-in semantic provider resolves keep to modern.ts');
    const result = await executeDefinitionProviderForPositionOnDocument(source, position, async choices => {
      const choice = choices.find(candidate => candidate.uri.toString() === target.uri.toString()
        && candidate.selectionRange.isEqual(expectedTarget.selectionRange));
      assert.ok(choice, 'the real chooser retains the selected target coordinates');
      return choice;
    });
    assert.ok(result && result.length === 1 && result[0] instanceof Outline.Symbol);
    const original = result[0];
    assert.strictEqual(original.uri, target.uri.toString());
    assert.strictEqual(original.language, 'typescript');
    assert.strictEqual(target.getText(original.displayTextRange!), 'keep<const T>(value: T)');
    const reference = await saveReference(original);
    assert.strictEqual(reference.uri, target.uri.toString(), 'the saved source is not the JavaScript origin');
    assert.strictEqual(reference.language, 'typescript');
    assert.deepStrictEqual(reference.symbol?.selection, toSaved(expectedTarget.selectionRange));
    assert.ok(reference.symbol?.path, 'a real provider target retains its ancestry for later edits');

    const restored = await executeSavedOutlineProvider(reference);
    assert.ok(restored instanceof Outline.Symbol);
    assertSameSource(restored, original, target);
    await translateOutlineRanges([restored]);
    assert.strictEqual(restored.displayText, 'keep<const T>(value: T)');
    assert.strictEqual(restored.parts.map(part => part.displayText).join(''), 'return value;');
    assert.strictEqual(restored.sourceReference?.documentHash, reference.documentHash);
  });
});
