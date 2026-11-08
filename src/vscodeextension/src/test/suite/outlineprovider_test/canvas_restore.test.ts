import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';
import {SourceReference, computeDocumentHash, SavedRange} from '../../../outlineproviderAPI/source_reference';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {VpLspExtenderPython} from '../../../outlineproviders/lspextenderpython';
import {translateOutlineRanges} from '../../../visualprogramming/outline_entities';

let fixtureId = 0;

class RestoreFixture {
  readonly scheme = 'outline-canvas-restore-' + (++fixtureId);
  readonly adapter = new VpLspExtenderPython();
  readonly symbols = new Map<string, vscode.DocumentSymbol[]>();
  definitionProviderCalled = false;
  private readonly files = new Map<string, MemoryFile>();
  private readonly registrations: vscode.Disposable[];

  constructor() {
    this.registrations = [
      vscode.workspace.registerTextDocumentContentProvider(this.scheme, {
        provideTextDocumentContent: uri => {
          const file = this.files.get(uri.toString());
          if (!file) throw new Error('Fixture source unavailable: ' + uri.toString());
          return file.read();
        }
      }),
      vscode.languages.registerDocumentSymbolProvider({ scheme: this.scheme, language: 'plaintext' }, {
        provideDocumentSymbols: document => this.symbols.get(document.uri.toString()) ?? []
      }),
      vscode.languages.registerDefinitionProvider({ scheme: this.scheme, language: 'plaintext' }, {
        provideDefinition: () => {
          this.definitionProviderCalled = true;
          return [];
        }
      })
    ];
  }

  uri(path: string) { return vscode.Uri.parse(this.scheme + ':/' + path); }

  async open(path: string, content: string, language = 'plaintext') {
    const uri = this.uri(path);
    const file = MemoryFile.createDocument(path.endsWith('.pyi') ? 'pyi' : 'py');
    file.write(content);
    this.files.set(uri.toString(), file);
    return vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(uri), language);
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
});
