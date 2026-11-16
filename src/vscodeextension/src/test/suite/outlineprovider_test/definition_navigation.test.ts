import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {AssertX} from '../assert_utils';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';
import {DefinitionOutlineResult, DefinitionTargetChooser} from '../../../outlineproviderAPI/outlineprovider';
import {OutlineUtils} from '../../../outlineproviderAPI/utils/outlineutils';
import {VpLspExtenderPython} from '../../../outlineproviders/lspextenderpython';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';
import {TargetAdapterResolver, VpLspExtenderProvider} from '../../../outlineproviderAPI/lspextenderprovider';

let fixtureId = 0;

// A unique scheme keeps fixture definitions isolated from installed providers.
// Plaintext fixtures preserve the existing Python adapter-only cases.
class NavigationFixture {
  readonly scheme = 'outline-definition-navigation-' + (++fixtureId);
  readonly reads: string[] = [];
  readonly definitionReads: string[] = [];
  readonly symbols = new Map<string, vscode.DocumentSymbol[]>();
  definitions: vscode.Definition | vscode.LocationLink[] | undefined = [];
  source!: vscode.TextDocument;
  private readonly files = new Map<string, MemoryFile>();
  private readonly registrations: vscode.Disposable[];

  constructor(readonly adapter: VpLspExtenderProvider = new VpLspExtenderPython()) {
    // Built-in TS providers also serve virtual JS/TS documents. Intercept only
    // this fixture's command requests so semantic fixtures cannot leak targets.
    const execute = vscode.commands.executeCommand;
    vscode.commands.executeCommand = <T>(command: string, ...args: unknown[]): Thenable<T | undefined> => {
      const uri = args[0];
      if (uri instanceof vscode.Uri && uri.scheme === this.scheme) {
        if (command === 'vscode.executeDocumentSymbolProvider') {
          return Promise.resolve((this.symbols.get(uri.toString()) ?? []) as T);
        }
        if (command === 'vscode.executeDefinitionProvider') {
          this.definitionReads.push(uri.toString());
          return Promise.resolve((uri.toString() === this.source?.uri.toString() ? this.definitions : []) as T);
        }
      }
      return execute<T>(command, ...args);
    };
    this.registrations = [
      new vscode.Disposable(() => { vscode.commands.executeCommand = execute; }),
      vscode.workspace.registerTextDocumentContentProvider(this.scheme, {
        provideTextDocumentContent: uri => {
          this.reads.push(uri.toString());
          const file = this.files.get(uri.toString());
          if (!file) { throw new Error('Fixture source unavailable: ' + uri.toString()); }
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

  navigate(chooseTarget?: DefinitionTargetChooser, resolveTargetAdapter?: TargetAdapterResolver) {
    return OutlineUtils.provideDefinitionOutline(
      this.adapter, this.source, new vscode.Position(0, 1), chooseTarget, resolveTargetAdapter);
  }

  dispose() { this.registrations.slice().reverse().forEach(registration => registration.dispose()); }
}

async function withFixture(run: (fixture: NavigationFixture) => Promise<void>) {
  const fixture = new NavigationFixture();
  try {
    fixture.source = await fixture.open('source.py', 'lookup()\n');
    await run(fixture);
  } finally {
    fixture.dispose();
  }
}

type JsTsLanguage = 'javascript' | 'typescript' | 'typescriptreact';

const resolveJsTsAdapter: TargetAdapterResolver = language =>
  language === 'javascript' || language === 'typescript' || language === 'typescriptreact'
    ? new VpLspExtenderTypeScript(language) : undefined;

async function withJsTsFixture(language: JsTsLanguage, run: (fixture: NavigationFixture) => Promise<void>) {
  const fixture = new NavigationFixture(new VpLspExtenderTypeScript(language));
  try {
    fixture.source = await fixture.open('source.' + (language === 'javascript' ? 'js' : language === 'typescriptreact' ? 'tsx' : 'ts'),
      'lookup();\n', language);
    await run(fixture);
  } finally {
    fixture.dispose();
  }
}

function rangeOf(document: vscode.TextDocument, text: string, from = 0) {
  const start = document.getText().indexOf(text, from);
  assert.ok(start >= 0, 'fixture contains ' + text);
  return new vscode.Range(document.positionAt(start), document.positionAt(start + text.length));
}

function symbol(document: vscode.TextDocument, declaration: string, name: string,
                kind = vscode.SymbolKind.Function, from = 0) {
  const range = rangeOf(document, declaration, from);
  const selectionRange = rangeOf(document, name, document.offsetAt(range.start));
  assert.ok(range.contains(selectionRange), 'fixture declaration contains its name');
  return new vscode.DocumentSymbol(name, '', kind, range, selectionRange);
}

function onlySymbol(result: DefinitionOutlineResult) {
  assert.ok(result !== null, 'a selected declaration is not cancellation');
  assert.strictEqual(result.length, 1, 'only the selected target is extracted');
  const outline = result[0];
  assert.ok(outline instanceof Outline.Symbol, 'a declaration opens as a symbol, not an enclosing file');
  return outline;
}

function onlyFile(result: DefinitionOutlineResult) {
  assert.ok(result !== null, 'a selected file is not cancellation');
  assert.strictEqual(result.length, 1);
  const outline = result[0];
  assert.ok(outline instanceof Outline.File, 'a module target opens as a file, not its first declaration');
  return outline;
}

function sourceParts(document: vscode.TextDocument, outline: Outline.OutlineRange) {
  return outline.parts.map(part => document.getText(
    part instanceof Outline.Symbol ? part.totalRange! : part.displayTextRange!)).join('');
}

function assertFile(outline: Outline.File, document: vscode.TextDocument) {
  assert.strictEqual(outline.CLASS_TYPE, 'File');
  assert.strictEqual(outline.uri, document.uri.toString());
  assert.strictEqual(outline.language, document.languageId === 'plaintext' ? 'python' : document.languageId);
  AssertX.range_equals(outline.displayTextRange, new vscode.Range(0, 0, 0, 0));
  assert.strictEqual(sourceParts(document, outline), document.getText(), 'file parts retain gaps and the final character');
}

function assertSymbol(outline: Outline.Symbol, document: vscode.TextDocument,
                      declaration: string, heading: string, body: string, kind = 'function', from = 0) {
  assert.strictEqual(outline.CLASS_TYPE, 'Symbol');
  assert.strictEqual(outline.kind, kind);
  assert.strictEqual(outline.uri, document.uri.toString());
  assert.strictEqual(outline.language, document.languageId === 'plaintext' ? 'python' : document.languageId);
  const declarationRange = rangeOf(document, declaration, from);
  AssertX.range_equals(outline.totalRange, declarationRange);
  AssertX.range_equals(outline.displayTextRange, rangeOf(document, heading, document.offsetAt(declarationRange.start)));
  assert.strictEqual(document.getText(outline.totalRange!), declaration);
  assert.strictEqual(document.getText(outline.displayTextRange!), heading);
  assert.strictEqual(sourceParts(document, outline), body, 'the complete selected body is preserved');
}

suite('Definition target navigation', () => {
  test('empty root selection opens the file even when its first declaration starts at zero', async () => {
    await withFixture(async fixture => {
      const declaration = 'def first():\n    return "root"';
      const document = await fixture.open('module.py', declaration + '\n# final Z');
      const first = symbol(document, declaration, 'first');
      fixture.symbols.set(document.uri.toString(), [first]);
      fixture.definitions = [new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))];
      const neverChoose: DefinitionTargetChooser = async () => assert.fail('one target must not invoke a chooser');
      const file = onlyFile(await fixture.navigate(neverChoose));
      assertFile(file, document);
      assert.ok(file.parts[0] instanceof Outline.Symbol);
      assertSymbol(file.parts[0] as Outline.Symbol, document, declaration, 'first()', '    return "root"');

      fixture.definitions = [new vscode.Location(document.uri, first.selectionRange)];
      assertSymbol(onlySymbol(await fixture.navigate(neverChoose)), document,
        declaration, 'first()', '    return "root"');
    });
  });

  test('empty files and no-symbol full-file targets preserve EOF without a newline', async () => {
    await withFixture(async fixture => {
      const empty = await fixture.open('empty.py', '');
      fixture.definitions = [new vscode.Location(empty.uri, new vscode.Range(0, 0, 0, 0))];
      const file = onlyFile(await fixture.navigate());
      assertFile(file, empty);
      assert.deepStrictEqual(file.parts, []);

      const text = await fixture.open('text.py', '"""Module documentation."""\n# final Z');
      const fullRange = new vscode.Range(new vscode.Position(0, 0), text.positionAt(text.getText().length));
      fixture.definitions = [new vscode.Location(text.uri, fullRange)];
      assertFile(onlyFile(await fixture.navigate()), text);
      fixture.definitions = [new vscode.Location(text.uri, new vscode.Range(0, 0, 0, 0))];
      assertFile(onlyFile(await fixture.navigate()), text);
    });
  });

  test('file parts retain whitespace gaps between declarations and at EOF', async () => {
    await withFixture(async fixture => {
      const firstText = 'def first():\n    pass';
      const secondText = 'def second():\n    return 2';
      const document = await fixture.open('gaps.py', '\n' + firstText + '\n\n\n' + secondText + '\n \t');
      fixture.symbols.set(document.uri.toString(),
        [symbol(document, firstText, 'first'), symbol(document, secondText, 'second')]);
      fixture.definitions = [new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))];
      assertFile(onlyFile(await fixture.navigate()), document);
    });
  });

  test('a one-function whole-document declaration remains a symbol', async () => {
    await withFixture(async fixture => {
      const declaration = 'def only():\n    return "last character Z"';
      const document = await fixture.open('one_function.py', declaration);
      const only = symbol(document, declaration, 'only');
      fixture.symbols.set(document.uri.toString(), [only]);
      fixture.definitions = [new vscode.Location(document.uri, only.range)];
      assertSymbol(onlySymbol(await fixture.navigate()), document,
        declaration, 'only()', '    return "last character Z"');
    });
  });

  test('LocationLink uses target coordinates rather than the origin selection', async () => {
    await withFixture(async fixture => {
      const declaration = 'def resolve(value: str):\n    return value + "!"';
      const document = await fixture.open('linked.py', '# target header\n\n' + declaration + '\n# outside');
      const target = symbol(document, declaration, 'resolve');
      fixture.symbols.set(document.uri.toString(), [target]);
      fixture.definitions = [{targetUri: document.uri, targetRange: target.range,
        targetSelectionRange: target.selectionRange, originSelectionRange: new vscode.Range(0, 0, 0, 6)}];
      // Webview requests carry structural positions, not Position instances.
      const position = JSON.parse(JSON.stringify(new vscode.Position(0, 1)));
      const result = await OutlineUtils.provideDefinitionOutline(fixture.adapter, fixture.source, position);
      assertSymbol(onlySymbol(result), document, declaration, 'resolve(value: str)', '    return value + "!"');
    });
  });

  test('LocationLink without targetSelectionRange falls back to the target declaration range', async () => {
    await withFixture(async fixture => {
      const declaration = 'def fallback():\n    return [1, 2, 3]';
      const document = await fixture.open('fallback.py', '# prefix\n' + declaration + '\n# suffix');
      const target = symbol(document, declaration, 'fallback');
      fixture.symbols.set(document.uri.toString(), [target]);
      // Providers can omit this required API field at runtime.
      fixture.definitions = [{targetUri: document.uri, targetRange: target.range,
        originSelectionRange: new vscode.Range(0, 0, 0, 6)}] as unknown as vscode.LocationLink[];
      assertSymbol(onlySymbol(await fixture.navigate()), document,
        declaration, 'fallback()', '    return [1, 2, 3]');
    });
  });

  test('mixed Location and LocationLink entries select and extract the second target', async () => {
    await withFixture(async fixture => {
      const firstText = 'def same():\n    return "first"';
      const secondText = 'def same():\n    return "second"';
      const first = await fixture.open('a_mixed.py', firstText);
      const second = await fixture.open('b_mixed.py', '# different coordinates\n\n' + secondText);
      const firstSymbol = symbol(first, firstText, 'same');
      const secondSymbol = symbol(second, secondText, 'same');
      fixture.symbols.set(first.uri.toString(), [firstSymbol]);
      fixture.symbols.set(second.uri.toString(), [secondSymbol]);
      fixture.definitions = [new vscode.Location(first.uri, firstSymbol.selectionRange),
        {targetUri: second.uri, targetRange: secondSymbol.range, targetSelectionRange: secondSymbol.selectionRange,
          originSelectionRange: new vscode.Range(0, 0, 0, 6)}] as unknown as vscode.Definition;
      let choices = 0;
      const result = await fixture.navigate(async targets => {
        ++choices;
        assert.strictEqual(targets.length, 2);
        return targets.find(target => target.uri.toString() === second.uri.toString());
      });
      assert.strictEqual(choices, 1);
      assertSymbol(onlySymbol(result), second, secondText, 'same()', '    return "second"');
    });
  });

  for (const providerResult of [undefined, []] as const) {
    test('no provider target returns an unresolved empty array: ' + String(providerResult), async () => {
      await withFixture(async fixture => {
        fixture.definitions = providerResult === undefined ? undefined : [];
        const result = await fixture.navigate(async () => assert.fail('no targets require no chooser'));
        assert.deepStrictEqual(result, []);
      });
    });
  }

  for (const sameFile of [false, true]) {
    test('chooses only the second same-named method in ' + (sameFile ? 'different classes' : 'different files'), async () => {
      await withFixture(async fixture => {
        const firstMethod = 'def shared(self):\n        return "first"';
        const secondMethod = 'def shared(self):\n        return "second"';
        const firstClass = 'class First:\n    ' + firstMethod;
        const secondClass = 'class Second:\n    ' + secondMethod;
        const first = await fixture.open('a_methods.py', firstClass + (sameFile ? '\n\n' + secondClass : ''));
        const second = sameFile ? first : await fixture.open('b_methods.py', secondClass);
        const firstParent = symbol(first, firstClass, 'First', vscode.SymbolKind.Class);
        const secondParent = symbol(second, secondClass, 'Second', vscode.SymbolKind.Class);
        const firstChild = symbol(first, firstMethod, 'shared', vscode.SymbolKind.Method);
        const secondChild = symbol(second, secondMethod, 'shared', vscode.SymbolKind.Method);
        firstParent.children = [firstChild];
        secondParent.children = [secondChild];
        fixture.symbols.set(first.uri.toString(), sameFile ? [firstParent, secondParent] : [firstParent]);
        if (!sameFile) { fixture.symbols.set(second.uri.toString(), [secondParent]); }
        fixture.definitions = [new vscode.Location(first.uri, firstChild.selectionRange),
          new vscode.Location(second.uri, secondChild.selectionRange)];
        let choices = 0;
        const result = await fixture.navigate(async targets => {
          ++choices;
          assert.strictEqual(targets.length, 2);
          assert.strictEqual(targets[0].uri.toString(), first.uri.toString());
          AssertX.range_equals(targets[0].selectionRange, firstChild.selectionRange);
          assert.strictEqual(targets[1].uri.toString(), second.uri.toString());
          AssertX.range_equals(targets[1].selectionRange, secondChild.selectionRange);
          return targets[1];
        });
        assert.strictEqual(choices, 1);
        assertSymbol(onlySymbol(result), second, secondMethod, 'shared(self)', '        return "second"', 'method');
      });
    });
  }

  test('duplicate declaration and file-root locations open directly without a chooser', async () => {
    await withFixture(async fixture => {
      const declaration = 'def repeated():\n    return "complete"';
      const document = await fixture.open('repeated.py', declaration + '\n# EOF');
      const target = symbol(document, declaration, 'repeated');
      fixture.symbols.set(document.uri.toString(), [target]);
      const neverChoose: DefinitionTargetChooser = async () => assert.fail('identical locations must be deduplicated');
      fixture.definitions = [new vscode.Location(document.uri, target.selectionRange),
        new vscode.Location(document.uri, target.selectionRange)];
      assertSymbol(onlySymbol(await fixture.navigate(neverChoose)), document,
        declaration, 'repeated()', '    return "complete"');
      const root = new vscode.Range(0, 0, 0, 0);
      fixture.definitions = [
        {targetUri: document.uri, targetRange: target.range, targetSelectionRange: root},
        {targetUri: document.uri, targetRange: root, targetSelectionRange: root}
      ];
      assertFile(onlyFile(await fixture.navigate(neverChoose)), document);
    });
  });

  test('cancellation returns null before either unreadable target is opened', async () => {
    await withFixture(async fixture => {
      const first = fixture.uri('unreadable_first.py');
      const second = fixture.uri('unreadable_second.py');
      fixture.definitions = [new vscode.Location(first, new vscode.Range(1, 0, 1, 5)),
        new vscode.Location(second, new vscode.Range(2, 0, 2, 5))];
      const readsBefore = fixture.reads.slice();
      let choices = 0;
      const result = await fixture.navigate(async targets => {
        ++choices;
        assert.strictEqual(targets.length, 2);
        return undefined;
      });
      assert.strictEqual(result, null, 'cancellation is neither unresolved nor an error outline');
      assert.strictEqual(choices, 1);
      assert.deepStrictEqual(fixture.reads, readsBefore, 'cancellation does not open or extract candidates');
    });
  });

  test('multiple targets without a chooser reject before opening a target', async () => {
    await withFixture(async fixture => {
      fixture.definitions = [new vscode.Location(fixture.uri('first.py'), new vscode.Range(1, 0, 1, 5)),
        new vscode.Location(fixture.uri('second.py'), new vscode.Range(2, 0, 2, 5))];
      const readsBefore = fixture.reads.slice();
      await assert.rejects(fixture.navigate(), /^Error: Multiple definition targets require selection\.$/);
      assert.deepStrictEqual(fixture.reads, readsBefore);
    });
  });

  test('an unavailable selected URI rejects with the actual open failure', async () => {
    await withFixture(async fixture => {
      const missing = fixture.uri('missing.py');
      fixture.definitions = [new vscode.Location(missing, new vscode.Range(0, 0, 0, 0))];
      await assert.rejects(fixture.navigate(), error => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.includes('Fixture source unavailable: ' + missing.toString()), error.message);
        return true;
      });
      assert.ok(fixture.reads.includes(missing.toString()), 'the selected URI, not a guessed alternative, was opened');
    });
  });

  test('a different target language is rejected before source extraction', async () => {
    await withFixture(async fixture => {
      const document = await fixture.open('foreign.js', 'function target() { return 1; }', 'javascript');
      fixture.definitions = [new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))];
      let resolutions = 0;
      await assert.rejects(fixture.navigate(undefined, language => {
        ++resolutions;
        return resolveJsTsAdapter(language);
      }), /^Error: The resolved target uses an unsupported language for this navigation: javascript\.$/);
      assert.strictEqual(resolutions, 0, 'an installed JS adapter does not enable Python cross-language routing');
    });
  });

  test('a malformed selected declaration rejects rather than opening its file or neighbor', async () => {
    await withFixture(async fixture => {
      const declaration = 'def broken(:\n    pass';
      const document = await fixture.open('malformed.py', declaration + '\n\ndef unrelated():\n    return 1');
      const target = symbol(document, declaration, 'broken');
      fixture.symbols.set(document.uri.toString(), [target]);
      fixture.definitions = [new vscode.Location(document.uri, target.selectionRange)];
      await assert.rejects(fixture.navigate(), /Cannot determine declaration boundaries for "broken"\./);
    });
  });

  test('a pyi target retains its actual URI, heading and ellipsis declaration', async () => {
    await withFixture(async fixture => {
      const declaration = 'def read(path: str) -> bytes: ...';
      const document = await fixture.open('library.pyi', '# type stub\n' + declaration + '\n# final stub Z');
      const target = symbol(document, declaration, 'read');
      fixture.symbols.set(document.uri.toString(), [target]);
      fixture.definitions = [new vscode.Location(document.uri, target.selectionRange)];
      const outline = onlySymbol(await fixture.navigate());
      assertSymbol(outline, document, declaration, 'read(path: str) -> bytes', ' ...');
      assert.ok(outline.uri.endsWith('/library.pyi'), 'no guessed implementation path replaces the type stub');
    });
  });

  test('a nonroot unmatched location never falls back to the whole file', async () => {
    await withFixture(async fixture => {
      const document = await fixture.open('unmapped.py', '# preface\nunknown_name\n# EOF');
      fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, 'unknown_name'))];
      await assert.rejects(fixture.navigate(), /No source declaration could be mapped at the resolved location\./);
    });
  });

  // These cases also require step 3's syntax-backed Python target hook. Their
  // providers intentionally omit assignment and parameter DocumentSymbols.
  test('syntax hook opens the exact omitted member assignment, not its constructor or a same-name field', async () => {
    await withFixture(async fixture => {
      const assignment = 'self.config = {\n            "directory": "/tmp/first",\n            "values": [1, 2],\n        }';
      const firstMethod = 'def __init__(self):\n        ' + assignment + '\n        self.other = "after"';
      const firstClass = 'class First:\n    ' + firstMethod;
      const secondMethod = 'def __init__(self):\n        self.config = {"bucket": "production"}';
      const secondClass = 'class Second:\n    ' + secondMethod;
      const document = await fixture.open('assignments.py', firstClass + '\n\n' + secondClass);
      const first = symbol(document, firstClass, 'First', vscode.SymbolKind.Class);
      first.children = [symbol(document, firstMethod, '__init__', vscode.SymbolKind.Constructor)];
      const second = symbol(document, secondClass, 'Second', vscode.SymbolKind.Class);
      second.children = [symbol(document, secondMethod, '__init__', vscode.SymbolKind.Constructor)];
      fixture.symbols.set(document.uri.toString(), [first, second]);
      fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, 'config'))];
      assertSymbol(onlySymbol(await fixture.navigate()), document, assignment, 'self.config =',
        '{\n            "directory": "/tmp/first",\n            "values": [1, 2],\n        }', 'field');
    });
  });

  test('syntax hook rejects RHS, annotation and subscript-index targets inside an enclosing method', async () => {
    await withFixture(async fixture => {
      const method = 'def inspect(self):\n        value = other + value\n        annotated: Value = other\n        items[index] = other\n        return value';
      const declaration = 'class Worker:\n    ' + method;
      const document = await fixture.open('references.py', declaration);
      const parent = symbol(document, declaration, 'Worker', vscode.SymbolKind.Class);
      parent.children = [symbol(document, method, 'inspect', vscode.SymbolKind.Method)];
      fixture.symbols.set(document.uri.toString(), [parent]);
      const rhs = document.offsetAt(rangeOf(document, 'other + value').start) + 'other + '.length;
      const locations = [rangeOf(document, 'value', rhs), rangeOf(document, 'Value'), rangeOf(document, 'index')];
      for (const location of locations) {
        fixture.definitions = [new vscode.Location(document.uri, location)];
        await assert.rejects(fixture.navigate(), /No source declaration could be mapped at the resolved location\./);
      }
    });
  });

  test('syntax hook preserves parameter-name navigation without accepting its annotation or default', async () => {
    await withFixture(async fixture => {
      const declaration = 'def run(\n    config: Config = default_config,\n):\n    return config';
      const document = await fixture.open('parameters.py', '# prefix\n' + declaration);
      fixture.symbols.set(document.uri.toString(), [symbol(document, declaration, 'run')]);
      fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, 'config'))];
      assertSymbol(onlySymbol(await fixture.navigate()), document, declaration,
        'run(\n    config: Config = default_config,\n)', '    return config');
      for (const token of ['Config', 'default_config']) {
        fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, token))];
        await assert.rejects(fixture.navigate(), /No source declaration could be mapped at the resolved location\./);
      }
    });
  });

  test('syntax hook rejects a malformed selected assignment with its concrete boundary error', async () => {
    await withFixture(async fixture => {
      const method = 'def __init__(self):\n        self.config = [1,,2]\n        self.other = 2';
      const declaration = 'class Worker:\n    ' + method;
      const document = await fixture.open('malformed_assignment.py', declaration);
      const parent = symbol(document, declaration, 'Worker', vscode.SymbolKind.Class);
      parent.children = [symbol(document, method, '__init__', vscode.SymbolKind.Constructor)];
      fixture.symbols.set(document.uri.toString(), [parent]);
      fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, 'config'))];
      await assert.rejects(fixture.navigate(), /Cannot determine declaration boundaries for "config"\./);
    });
  });

  for (const origin of ['javascript', 'typescriptreact'] as const) {
    test(origin + ' resolves a TypeScript implementation through its target adapter', async () => {
      await withJsTsFixture(origin, async fixture => {
        const declaration = 'export function keep<const T>(value: T) { return value; }';
        const document = await fixture.open('modern.ts', declaration, 'typescript');
        const target = symbol(document, declaration, 'keep');
        fixture.symbols.set(document.uri.toString(), [target]);
        fixture.definitions = [{targetUri: document.uri, targetRange: target.range,
          targetSelectionRange: target.selectionRange, originSelectionRange: new vscode.Range(0, 0, 0, 6)}];
        const resolutions: string[] = [];
        const outline = onlySymbol(await fixture.navigate(undefined, language => {
          resolutions.push(language);
          return resolveJsTsAdapter(language);
        }));
        assertSymbol(outline, document, declaration, 'keep<const T>(value: T)', 'return value;');
        assert.deepStrictEqual(resolutions, ['typescript']);
        assert.strictEqual(outline.sourceReference?.uri, document.uri.toString());
        assert.strictEqual(outline.sourceReference?.language, 'typescript');
        assert.deepStrictEqual(outline.sourceReference?.symbol?.path,
          [{name: 'keep', kind: vscode.SymbolKind.Function}]);
        assert.deepStrictEqual(fixture.definitionReads, [fixture.source.uri.toString()],
          'the selected target is not sent through the definition provider a second time');
      });
    });
  }

  test('JavaScript opens only the selected declaration-file overload', async () => {
    await withJsTsFixture('javascript', async fixture => {
      const first = 'export declare function read(path: string): string;';
      const second = 'export declare function read(path: number): number;';
      const document = await fixture.open('api.d.ts', first + '\n' + second + '\n', 'typescript');
      const overload = symbol(document, second, 'read', vscode.SymbolKind.Function, first.length);
      fixture.symbols.set(document.uri.toString(), [symbol(document, first, 'read'), overload]);
      fixture.definitions = [{targetUri: document.uri, targetRange: overload.range,
        targetSelectionRange: overload.selectionRange}];
      const outline = onlySymbol(await fixture.navigate(undefined, resolveJsTsAdapter));
      assertSymbol(outline, document, second, 'read(path: number): number', '');
      assert.strictEqual(outline.declarationOnly, true);
      assert.deepStrictEqual(outline.parts, []);
      assert.ok(outline.uri.endsWith('/api.d.ts'));
    });
  });

  test('TypeScript opens a JavaScript callable assignment and retains provider children and ancestry', async () => {
    await withJsTsFixture('typescript', async fixture => {
      const childText = 'function nested() { return 2; }';
      const rhs = '(() => { ' + childText + ' return nested(); })';
      const declaration = 'holder.run = ' + rhs + ';';
      const document = await fixture.open('legacy.cjs', declaration, 'javascript');
      const target = symbol(document, declaration, 'run', vscode.SymbolKind.Function);
      const child = symbol(document, childText, 'nested');
      target.children = [child];
      fixture.symbols.set(document.uri.toString(), [target]);
      fixture.definitions = [{targetUri: document.uri, targetRange: rangeOf(document, rhs),
        targetSelectionRange: rangeOf(document, rhs)}];
      const outline = onlySymbol(await fixture.navigate(undefined, resolveJsTsAdapter));
      assertSymbol(outline, document, declaration, 'holder.run = (() =>', childText + ' return nested();');
      const nested = outline.parts.filter((part): part is Outline.Symbol => part instanceof Outline.Symbol);
      assert.strictEqual(nested.length, 1);
      assertSymbol(nested[0], document, childText, 'nested()', 'return 2;');
      assert.deepStrictEqual(outline.sourceReference?.symbol?.path,
        [{name: 'run', kind: vscode.SymbolKind.Function}]);
      assert.deepStrictEqual(nested[0].sourceReference?.symbol?.path,
        [{name: 'run', kind: vscode.SymbolKind.Function}, {name: 'nested', kind: vscode.SymbolKind.Function}]);
      assert.strictEqual(target.children[0], child, 'navigation does not replace the provider tree');
      AssertX.range_equals(target.range, rangeOf(document, declaration));
      AssertX.range_equals(target.selectionRange, rangeOf(document, 'run'));
    });
  });

  test('an exact single-parameter RHS target stays callable while its parameter target stays a parameter', async () => {
    await withJsTsFixture('typescript', async fixture => {
      const rhs = 'value => value + 1';
      const document = await fixture.open('single.js', 'const run = ' + rhs + ';\n', 'javascript');
      const rhsRange = rangeOf(document, rhs);
      const provider = new vscode.DocumentSymbol('run', '', vscode.SymbolKind.Function, rhsRange, rhsRange);
      fixture.symbols.set(document.uri.toString(), [provider]);
      fixture.definitions = [{targetUri: document.uri, targetRange: rhsRange, targetSelectionRange: rhsRange}];
      const callable = onlySymbol(await fixture.navigate(undefined, resolveJsTsAdapter));
      assertSymbol(callable, document, 'const run = ' + rhs + ';', 'run = value =>', 'value + 1');
      assert.deepStrictEqual(callable.sourceReference?.symbol?.path,
        [{name: 'run', kind: vscode.SymbolKind.Function}]);
      const parameterRange = rangeOf(document, 'value');
      fixture.definitions = [new vscode.Location(document.uri, parameterRange)];
      const parameter = onlySymbol(await fixture.navigate(undefined, resolveJsTsAdapter));
      AssertX.range_equals(parameter.totalRange!, parameterRange);
      assert.strictEqual(document.getText(parameter.displayTextRange!), 'value');
      assert.strictEqual(parameter.sourceReference?.symbol?.name, 'value');
      assert.strictEqual(parameter.sourceReference?.symbol?.path, null);
      assert.strictEqual(parameter.isCallable, false);
      AssertX.range_equals(provider.range, rhsRange);
      AssertX.range_equals(provider.selectionRange, rhsRange);
    });
  });

  test('cross-family syntax lookup opens an omitted binding without promoting an enclosing method', async () => {
    await withJsTsFixture('javascript', async fixture => {
      const declaration = 'function build() { const limit: number = 42; return limit; }';
      const document = await fixture.open('bindings.ts', declaration, 'typescript');
      fixture.symbols.set(document.uri.toString(), [symbol(document, declaration, 'build')]);
      fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, 'limit'))];
      const outline = onlySymbol(await fixture.navigate(undefined, resolveJsTsAdapter));
      assertSymbol(outline, document, 'const limit: number = 42;', 'limit: number =', '42', 'constant');
      assert.strictEqual(outline.sourceReference?.symbol?.name, 'limit');
      assert.strictEqual(outline.sourceReference?.symbol?.path, null);
      const referenceOffset = document.getText().lastIndexOf('limit');
      fixture.definitions = [new vscode.Location(document.uri, rangeOf(document, 'limit', referenceOffset))];
      await assert.rejects(fixture.navigate(undefined, resolveJsTsAdapter),
        /No source declaration could be mapped at the resolved location\./);
    });
  });

  test('cross-family module targets use the target language for file extraction and comments', async () => {
    await withJsTsFixture('javascript', async fixture => {
      const declaration = 'export function keep<const T>(value: T) { return value; }';
      const document = await fixture.open('module.mts', '// module comment\n' + declaration + '\n// EOF', 'typescript');
      fixture.symbols.set(document.uri.toString(), [symbol(document, declaration, 'keep')]);
      fixture.definitions = [new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))];
      const file = onlyFile(await fixture.navigate(undefined, resolveJsTsAdapter));
      assertFile(file, document);
      assert.strictEqual(file.sourceReference?.language, 'typescript');
      assert.strictEqual(file.sourceReference?.uri, document.uri.toString());
      assert.deepStrictEqual(file.commentRanges?.map(comment => document.getText(comment.range)),
        ['// module comment', '// EOF']);
      const child = file.parts.find((part): part is Outline.Symbol => part instanceof Outline.Symbol);
      assert.ok(child);
      assertSymbol(child, document, declaration, 'keep<const T>(value: T)', 'return value;');
    });
  });

  test('same-language targets retain the supplied adapter without consulting the resolver', async () => {
    await withJsTsFixture('typescript', async fixture => {
      const declaration = 'function same(value: string) { return value; }';
      const document = await fixture.open('same.ts', declaration, 'typescript');
      const target = symbol(document, declaration, 'same');
      fixture.symbols.set(document.uri.toString(), [target]);
      fixture.definitions = [new vscode.Location(document.uri, target.selectionRange)];
      const outline = onlySymbol(await fixture.navigate(undefined, () => assert.fail('same-language routing uses its supplied adapter')));
      assertSymbol(outline, document, declaration, 'same(value: string)', 'return value;');
    });
  });

  for (const resolver of [undefined, (() => undefined) as TargetAdapterResolver]) {
    test('cross-family targets reject a missing adapter: ' + (resolver ? 'unregistered' : 'no resolver'), async () => {
      await withJsTsFixture('javascript', async fixture => {
        const document = await fixture.open('missing_adapter.ts', 'export const value: number = 1;', 'typescript');
        fixture.definitions = [new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))];
        await assert.rejects(fixture.navigate(undefined, resolver),
          /^Error: The resolved target uses an unsupported language for this navigation: typescript\.$/);
      });
    });
  }

  test('JavaScript cannot route to Python even when a resolver supplies its adapter', async () => {
    await withJsTsFixture('javascript', async fixture => {
      const document = await fixture.open('foreign.py', 'def target():\n    return 1', 'python');
      fixture.definitions = [new vscode.Location(document.uri, new vscode.Range(0, 0, 0, 0))];
      let resolutions = 0;
      await assert.rejects(fixture.navigate(undefined, () => {
        ++resolutions;
        return new VpLspExtenderPython();
      }), /^Error: The resolved target uses an unsupported language for this navigation: python\.$/);
      assert.strictEqual(resolutions, 0);
    });
  });

  test('cross-family cancellation happens before target reads or adapter resolution', async () => {
    await withJsTsFixture('javascript', async fixture => {
      fixture.definitions = [new vscode.Location(fixture.uri('unreadable.ts'), new vscode.Range(1, 0, 1, 4)),
        new vscode.Location(fixture.uri('unreadable.tsx'), new vscode.Range(2, 0, 2, 4))];
      const reads = fixture.reads.slice();
      let choices = 0;
      const result = await fixture.navigate(async targets => {
        ++choices;
        assert.deepStrictEqual(targets.map(target => target.uri.path), ['/unreadable.ts', '/unreadable.tsx']);
        return undefined;
      }, () => assert.fail('cancelled targets must not resolve adapters'));
      assert.strictEqual(result, null);
      assert.strictEqual(choices, 1);
      assert.deepStrictEqual(fixture.reads, reads);
    });
  });

  test('cross-family duplicate choices retain order and extract only the chosen declaration', async () => {
    await withJsTsFixture('javascript', async fixture => {
      const declaration = 'function chosen(value: number) { return value; }';
      const first = await fixture.open('first.ts', declaration, 'typescript');
      const second = await fixture.open('second.ts', '// selected\n' + declaration, 'typescript');
      const firstSymbol = symbol(first, declaration, 'chosen');
      const secondSymbol = symbol(second, declaration, 'chosen');
      fixture.symbols.set(first.uri.toString(), [firstSymbol]);
      fixture.symbols.set(second.uri.toString(), [secondSymbol]);
      fixture.definitions = [
        {targetUri: first.uri, targetRange: firstSymbol.range, targetSelectionRange: firstSymbol.selectionRange},
        {targetUri: first.uri, targetRange: firstSymbol.selectionRange, targetSelectionRange: firstSymbol.selectionRange},
        {targetUri: second.uri, targetRange: secondSymbol.range, targetSelectionRange: secondSymbol.selectionRange}
      ];
      let choices = 0;
      const outline = onlySymbol(await fixture.navigate(async targets => {
        ++choices;
        assert.deepStrictEqual(targets.map(target => target.uri.toString()),
          [first.uri.toString(), second.uri.toString()]);
        AssertX.range_equals(targets[1].selectionRange, secondSymbol.selectionRange);
        return targets[1];
      }, resolveJsTsAdapter));
      assert.strictEqual(choices, 1);
      assertSymbol(outline, second, declaration, 'chosen(value: number)', 'return value;');
      fixture.definitions = [
        {targetUri: second.uri, targetRange: secondSymbol.range, targetSelectionRange: secondSymbol.selectionRange},
        {targetUri: second.uri, targetRange: secondSymbol.selectionRange, targetSelectionRange: secondSymbol.selectionRange}
      ];
      assertSymbol(onlySymbol(await fixture.navigate(async () => assert.fail('duplicates need no chooser'), resolveJsTsAdapter)),
        second, declaration, 'chosen(value: number)', 'return value;');
    });
  });

  test('a selected cross-family syntax error reports that target instead of opening a valid alternative', async () => {
    await withJsTsFixture('javascript', async fixture => {
      const valid = 'function valid() { return 1; }';
      const broken = 'function broken(value: ) { return value; }';
      const first = await fixture.open('valid.ts', valid, 'typescript');
      const second = await fixture.open('broken.ts', broken, 'typescript');
      const firstSymbol = symbol(first, valid, 'valid');
      const secondSymbol = symbol(second, broken, 'broken');
      fixture.symbols.set(first.uri.toString(), [firstSymbol]);
      fixture.symbols.set(second.uri.toString(), [secondSymbol]);
      fixture.definitions = [new vscode.Location(first.uri, firstSymbol.selectionRange),
        new vscode.Location(second.uri, secondSymbol.selectionRange)];
      await assert.rejects(fixture.navigate(async targets => targets[1], resolveJsTsAdapter), error => {
        assert.ok(error instanceof Error);
        assert.ok(error.message.startsWith('Cannot determine declaration boundaries for "broken".'), error.message);
        assert.ok(error.message.includes(second.uri.toString()), error.message);
        return true;
      });
    });
  });
});
