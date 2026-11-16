import * as vscode from 'vscode';
import * as path from 'path';
import * as assert from 'assert';
import {AssertX} from './assert_utils';
import {getTestDirPath} from '../main';
import {
  executeDefinitionProviderForPositionOnDocument,
  executeDocumentDefinitionProvider
} from '../../outlineproviderAPI/extensionactivator';
import * as Outline from '../../outlineproviderAPI/SymbolDefinition';

async function openDocument(filename: string) {
  const document = await vscode.workspace.openTextDocument(
    vscode.Uri.file(path.resolve(getTestDirPath(), 'testfiles', 'js_ts_parser', filename)));
  assert.strictEqual(document.uri.scheme, 'file', 'integration inputs use the real language-service project');
  return document;
}

async function providerSymbols(document: vscode.TextDocument) {
  const result = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
    'vscode.executeDocumentSymbolProvider', document.uri);
  assert.ok(result && result.length, 'built-in TypeScript document-symbol provider must return declarations');
  assert.ok(result!.every(symbol => symbol.range instanceof vscode.Range && Array.isArray(symbol.children)),
    'these tests require hierarchical DocumentSymbols, not a fake provider');
  const flattened: vscode.DocumentSymbol[] = [];
  const visit = (symbols: readonly vscode.DocumentSymbol[]) => {
    for (const symbol of symbols) {
      flattened.push(symbol);
      visit(symbol.children);
    }
  };
  visit(result!);
  return flattened;
}

function declarationParts(outline: Outline.OutlineRange): Outline.Symbol[] {
  return outline.parts.filter((part): part is Outline.Symbol => part instanceof Outline.Symbol);
}

function sourceRange(document: vscode.TextDocument, text: string) {
  const start = document.getText().indexOf(text);
  assert.ok(start >= 0, 'fixture contains exact source: ' + text);
  return new vscode.Range(document.positionAt(start), document.positionAt(start + text.length));
}

async function assertDefinition(source: vscode.TextDocument, reference: string, targetFile: string,
                                declaration: string, name: string, head: string, body: string | null) {
  const targetDocument = await openDocument(targetFile);
  const declarationRange = sourceRange(targetDocument, declaration);
  const nameOffset = targetDocument.offsetAt(declarationRange.start) + declaration.indexOf(name);
  const nameSelection = new vscode.Range(targetDocument.positionAt(nameOffset),
    targetDocument.positionAt(nameOffset + name.length));
  const providerTargets = (await providerSymbols(targetDocument)).filter(candidate =>
    declarationRange.contains(candidate.range) && candidate.range.contains(nameSelection)
      && candidate.selectionRange.contains(nameSelection));
  assert.strictEqual(providerTargets.length, 1, 'the real provider identifies exactly the selected declaration');
  const expectedProvider = providerTargets[0];
  const expectedRange = expectedProvider.range;
  const expectedSelection = expectedProvider.selectionRange;
  const position = sourceRange(source, reference).start;
  const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
    'vscode.executeDefinitionProvider', source.uri, position);
  assert.ok(definitions && definitions.some(target =>
    ('targetUri' in target ? target.targetUri : target.uri).toString() === targetDocument.uri.toString()),
  'the built-in semantic provider resolves the expected target file');
  const opened = await executeDefinitionProviderForPositionOnDocument(source, position, async targets => {
    const selected = targets.find(target => target.uri.toString() === targetDocument.uri.toString() &&
      target.selectionRange.start.isEqual(nameSelection.start));
    assert.ok(selected, 'the real target chooser retains the selected overload/source coordinates');
    return selected;
  });
  assert.ok(opened !== null, 'a selected real target is not cancellation');
  assert.strictEqual(opened!.length, 1);
  const actual = opened![0];
  assert.ok(actual instanceof Outline.Symbol, 'a declaration target opens as a symbol');
  const symbol = actual as Outline.Symbol;
  assert.strictEqual(symbol.uri, targetDocument.uri.toString());
  assert.strictEqual(symbol.language, targetDocument.languageId);
  assert.strictEqual(targetDocument.getText(symbol.displayTextRange!), head);
  AssertX.range_equals(symbol.totalRange, expectedRange);
  assert.strictEqual(symbol.parts.map(part =>
    targetDocument.getText(part instanceof Outline.Symbol ? part.totalRange! : part.displayTextRange!)).join(''), body ?? '');
  assert.strictEqual(symbol.declarationOnly, body === null);
  assert.strictEqual(symbol.sourceReference!.uri, targetDocument.uri.toString());
  assert.strictEqual(symbol.sourceReference!.language, targetDocument.languageId);
  assert.strictEqual(symbol.sourceReference!.symbol!.name, expectedProvider.name);
  assert.strictEqual(symbol.sourceReference!.symbol!.kind, expectedProvider.kind);
  assert.deepStrictEqual(symbol.sourceReference!.symbol!.selection,
    [{line: expectedSelection.start.line, character: expectedSelection.start.character},
      {line: expectedSelection.end.line, character: expectedSelection.end.character}]);
  return symbol;
}

suite('Real JavaScript/TypeScript provider integration', () => {
  suiteSetup(async () => {
    const extension = vscode.extensions.getExtension('vscode.typescript-language-features');
    assert.ok(extension, 'VS Code built-in TypeScript language features are required');
    await extension!.activate();
    assert.ok(extension!.isActive, 'VS Code built-in TypeScript language features must activate');
  });

  test('modern declarations use the real provider tree and exact syntax-backed source', async () => {
    const document = await openDocument('modern.ts');
    const symbols = await providerSymbols(document);
    const keep = symbols.find(symbol => symbol.name === 'keep')!;
    assert.ok(keep, 'real provider exposes the const-type-parameter function');
    assert.strictEqual(document.getText(keep.range), 'export function keep<const T>(value: T) { return value; }');
    const file = await executeDocumentDefinitionProvider(document);
    assert.strictEqual(file.language, 'typescript');
    assert.strictEqual(file.uri, document.uri.toString());
    const keepOutline = declarationParts(file).find(symbol => symbol.totalRange!.isEqual(keep.range))!;
    assert.ok(keepOutline);
    assert.strictEqual(document.getText(keepOutline.displayTextRange!), 'keep<const T>(value: T)');
    assert.strictEqual(document.getText(keepOutline.parts[0].displayTextRange!), 'return value;');
    const cacheProvider = symbols.find(symbol => symbol.name === 'Cache')!;
    const cache = declarationParts(file).find(symbol => symbol.totalRange!.isEqual(cacheProvider.range))!;
    assert.ok(cache);
    assert.strictEqual(document.getText(cache.displayTextRange!), 'Cache');
    assert.ok(cache.attributes.some(attribute => document.getText(attribute.displayTextRange!) === '@tracked'));
    const children = declarationParts(cache);
    assert.ok(children.some(child => document.getText(child.displayTextRange!) === 'method<const T extends {port: number}>(input: T): T'));
    assert.ok(children.some(child => document.getText(child.displayTextRange!) === 'arrow = (input: number) =>'));
    const classSource = cache.parts.filter(part => part instanceof Outline.Text)
      .map(part => document.getText(part.displayTextRange!)).join('');
    assert.ok(classSource.includes('#value = 1;'), 'ordinary private fields remain source');
    const buildProvider = symbols.find(symbol => symbol.name === 'build')!;
    const build = declarationParts(file).find(symbol => symbol.totalRange!.isEqual(buildProvider.range))!;
    assert.ok(build);
    const executor = declarationParts(build).find(child =>
      document.getText(child.totalRange!).startsWith('(resolve) =>'))!;
    assert.ok(executor, 'the real Promise executor becomes a declaration row');
    assert.strictEqual(document.getText(executor.displayTextRange!), '(resolve) =>');
    assert.ok(declarationParts(executor).some(child =>
      document.getText(child.totalRange!) === '(value) => {\n      resolve(done(value));\n    }'));
  });

  test('JavaScript resolves modern TypeScript functions and satisfies values', async () => {
    const consumer = await openDocument('consumer.js');
    await providerSymbols(consumer);
    await assertDefinition(consumer, 'keep({port', 'modern.ts',
      'export function keep<const T>(value: T) { return value; }', 'keep', 'keep<const T>(value: T)', 'return value;');
    const config = await assertDefinition(consumer, 'config.port', 'modern.ts',
      'export const config = {port: 8080} satisfies Settings;', 'config', 'config =', '{port: 8080} satisfies Settings');
    assert.notStrictEqual(config.isCallable, true);
  });

  for (const consumerFile of ['consumer.js', 'consumer.ts']) {
    test(consumerFile + ' resolves real ESM and CommonJS callable owners', async () => {
      const consumer = await openDocument(consumerFile);
      const doubleReference = consumerFile === 'consumer.js' ? 'double(2)' : 'double(4)';
      await assertDefinition(consumer, doubleReference, 'helpers.mjs',
        'export const double = (value) => value * 2;', 'double', 'double = (value) =>', 'value * 2');
      const runReference = consumerFile === 'consumer.js' ? 'run(3)' : 'run(5)';
      await assertDefinition(consumer, runReference, 'legacy.cjs',
        'module.exports.run = function(value) { return value + 1; };', 'run',
        'module.exports.run = function(value)', 'return value + 1;');
    });
  }

  test('real declaration-file overloads retain their own bodyless signatures', async () => {
    const consumer = await openDocument('consumer.ts');
    for (const [reference, declaration, head] of [
      ["lookup('value')", 'export declare function lookup(value: string): string;', 'lookup(value: string): string'],
      ['lookup(42)', 'export declare function lookup(value: number): number;', 'lookup(value: number): number']
    ]) {
      await assertDefinition(consumer, reference, 'api.d.ts', declaration, 'lookup', head, null);
    }
    await assertDefinition(consumer, "esmLookup('esm')", 'esm-api.d.mts',
      'export declare function esmLookup(value: string): string;', 'esmLookup', 'esmLookup(value: string): string', null);
    await assertDefinition(consumer, "lookup('cjs')", 'cjs-api.d.cts',
      'function lookup(value: string): string;', 'lookup', 'lookup(value: string): string', null);
  });

  test('a real module-specifier definition opens the target file root', async () => {
    const document = await openDocument('consumer.js');
    const target = await openDocument('helpers.mjs');
    const position = sourceRange(document, './helpers.mjs').start;
    const definitions = await vscode.commands.executeCommand<Array<vscode.Location | vscode.LocationLink>>(
      'vscode.executeDefinitionProvider', document.uri, position);
    assert.ok(definitions && definitions.length, 'module specifier has a real semantic target');
    const opened = await executeDefinitionProviderForPositionOnDocument(document, position, async targets =>
      targets.find(candidate => candidate.uri.toString() === target.uri.toString()));
    assert.ok(opened !== null);
    assert.strictEqual(opened!.length, 1);
    assert.ok(opened![0] instanceof Outline.File);
    assert.strictEqual(opened![0].uri, target.uri.toString());
    assert.strictEqual(opened![0].language, 'javascript');
    assert.deepStrictEqual(declarationParts(opened![0]).map(symbol => target.getText(symbol.displayTextRange!)),
      ['double = (value) =>']);
  });

  for (const filename of ['module.mts', 'module.cts', 'api.d.ts', 'esm-api.d.mts', 'cjs-api.d.cts']) {
    test('real provider extracts the actual module/declaration filename: ' + filename, async () => {
      const document = await openDocument(filename);
      assert.strictEqual(document.languageId, 'typescript');
      const symbols = await providerSymbols(document);
      const file = await executeDocumentDefinitionProvider(document);
      assert.strictEqual(file.uri, document.uri.toString());
      assert.strictEqual(file.language, 'typescript');
      assert.ok(declarationParts(file).length);
      if (filename === 'module.mts' || filename === 'module.cts') {
        const resources = symbols.find(symbol => symbol.name === 'resources')!;
        const outline = declarationParts(file).find(symbol => symbol.totalRange!.isEqual(resources.range))!;
        assert.ok(outline);
        assert.strictEqual(document.getText(outline.displayTextRange!), 'resources()');
        assert.strictEqual(outline.parts.map(part => document.getText(part.displayTextRange!)).join(''),
          '  using resource = acquire();\n  await using pending = acquireAsync();\n  return {resource, pending};');
      }
    });
  }
});