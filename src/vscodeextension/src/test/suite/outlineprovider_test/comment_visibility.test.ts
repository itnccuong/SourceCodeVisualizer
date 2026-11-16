import * as assert from 'assert';
import * as vscode from 'vscode';
import {MemoryFile} from '../memoryfile';
import {VpLspExtenderPython} from '../../../outlineproviders/lspextenderpython';
import {VpLspExtenderTypeScript} from '../../../outlineproviders/lspextendertypescript';

let fixtureId = 0;

class CommentFixture {
  readonly scheme = 'outline-comment-visibility-' + (++fixtureId);
  private readonly files = new Map<string, MemoryFile>();
  private readonly registration: vscode.Disposable;

  constructor() {
    this.registration = vscode.workspace.registerTextDocumentContentProvider(this.scheme, {
      provideTextDocumentContent: uri => {
        const file = this.files.get(uri.toString());
        if (!file) throw new Error('Fixture source unavailable: ' + uri.toString());
        return file.read();
      }
    });
  }

  uri(path: string) { return vscode.Uri.parse(this.scheme + ':/' + path); }

  async open(path: string, content: string, language: string) {
    const uri = this.uri(path);
    const file = MemoryFile.createDocument(path.split('.').pop() || 'txt');
    file.write(content);
    this.files.set(uri.toString(), file);
    return vscode.languages.setTextDocumentLanguage(await vscode.workspace.openTextDocument(uri), language);
  }

  dispose() {
    this.registration.dispose();
  }
}

suite('Comment & Docstring Visibility Extraction', () => {
  let fixture: CommentFixture;
  const pythonAdapter = new VpLspExtenderPython();
  const tsxAdapter = new VpLspExtenderTypeScript('typescriptreact');

  setup(() => {
    fixture = new CommentFixture();
  });

  teardown(() => {
    fixture.dispose();
  });

  test('Python module and nested function/class docstrings and comments', async () => {
    const code = [
      '# Module comment',
      '"""Module docstring"""',
      '',
      'def outer():',
      '    """Outer docstring"""',
      '    # Inside outer',
      '    def inner():',
      '        """Inner docstring"""',
      '        return 1',
      '    return inner',
      '',
      'class Sample:',
      '    """Class docstring"""',
      '    def method(self):',
      '        """Method docstring"""',
      '        pass'
    ].join('\n');

    const doc = await fixture.open('sample.py', code, 'python');
    const comments = pythonAdapter.getCommentRanges(doc);

    const docstrings = comments.filter(c => c.kind === 'docstring');
    assert.strictEqual(docstrings.length, 5);
    assert.strictEqual(doc.getText(docstrings[0].range), '"""Module docstring"""');
    assert.strictEqual(doc.getText(docstrings[1].range), '"""Outer docstring"""');
    assert.strictEqual(doc.getText(docstrings[2].range), '"""Inner docstring"""');
    assert.strictEqual(doc.getText(docstrings[3].range), '"""Class docstring"""');
    assert.strictEqual(doc.getText(docstrings[4].range), '"""Method docstring"""');

    const lineComments = comments.filter(c => c.kind === 'comment');
    assert.strictEqual(lineComments.length, 2);
    assert.strictEqual(doc.getText(lineComments[0].range), '# Module comment');
    assert.strictEqual(doc.getText(lineComments[1].range), '# Inside outer');
  });

  test('Python raw, concatenated, and parenthesized docstrings', async () => {
    const code = [
      'def f_raw():',
      '    r"""Raw docstring with \\n"""',
      '    return 1',
      '',
      'def f_parenthesized():',
      '    ("parenthesized "\n     "docstring")',
      '    return 2'
    ].join('\n');

    const doc = await fixture.open('doc_variations.py', code, 'python');
    const comments = pythonAdapter.getCommentRanges(doc);
    const docstrings = comments.filter(c => c.kind === 'docstring');

    assert.strictEqual(docstrings.length, 2);
    assert.strictEqual(doc.getText(docstrings[0].range), 'r"""Raw docstring with \\n"""');
    assert.strictEqual(doc.getText(docstrings[1].range), '("parenthesized "\n     "docstring")');
  });

  test('Python excludes bytes, f-strings, and string assignments from docstrings', async () => {
    const code = [
      'def f_bytes():',
      '    b"byte string not doc"',
      '    return 1',
      '',
      'def f_format():',
      '    f"formatted {1} not doc"',
      '    return 2',
      '',
      'def f_assign():',
      '    doc = "assigned string not doc"',
      '    return 3'
    ].join('\n');

    const doc = await fixture.open('non_docs.py', code, 'python');
    const comments = pythonAdapter.getCommentRanges(doc);
    const docstrings = comments.filter(c => c.kind === 'docstring');

    assert.strictEqual(docstrings.length, 0, 'Bytes, f-strings, and assignments must not be docstrings');
  });

  test('Python statement group docstring includes semicolon when another statement follows', async () => {
    const code = [
      'class Compact:',
      '    "compact doc"; x = 10; y = 20',
      '    pass'
    ].join('\n');

    const doc = await fixture.open('stmt_group.py', code, 'python');
    const comments = pythonAdapter.getCommentRanges(doc);
    const docstrings = comments.filter(c => c.kind === 'docstring');

    assert.strictEqual(docstrings.length, 1);
    assert.strictEqual(doc.getText(docstrings[0].range), '"compact doc";');
  });

  test('Python CRLF and Unicode comments/docstrings preserve source offsets', async () => {
    const code = '# Unicode comment: 🚀\r\ndef unicode_func():\r\n    """Unicode docstring: ✨"""\r\n    return "value"\r\n';
    const doc = await fixture.open('unicode.py', code, 'python');
    const comments = pythonAdapter.getCommentRanges(doc);

    assert.strictEqual(comments.length, 2);
    assert.strictEqual(doc.getText(comments[0].range), '# Unicode comment: 🚀');
    assert.strictEqual(doc.getText(comments[1].range), '"""Unicode docstring: ✨"""');
  });

  for (const language of ['javascript', 'typescript'] as const) {
    test(language + ' extracts exact comments while preserving strings, regex and templates', async () => {
      const code = [
        '// leading single-line comment',
        '/**',
        ' * JSDoc comment for fn',
        ' */',
        language === 'typescript'
          ? 'function testFn(param: string /* inline comment */): string {'
          : 'function testFn(param /* inline comment */) {',
        '  // inside body comment',
        '  const str = "hello // not a comment /* still not */";',
        '  const re = /pattern\\/\\* not comment *\\//g;',
        '  const tpl = `template with ${param} // not comment`;',
        '  return str; /* trailing comment */',
        '}',
        '// trailing EOF comment'
      ].join('\n');
      const doc = await fixture.open(language === 'typescript' ? 'sample.ts' : 'sample.js', code, language);
      const adapter = new VpLspExtenderTypeScript(language);
      const comments = adapter.getCommentRanges(doc);
      const expected = ['// leading single-line comment', '/**\n * JSDoc comment for fn\n */',
        '/* inline comment */', '// inside body comment', '/* trailing comment */', '// trailing EOF comment'];
      assert.deepStrictEqual(comments.map(comment => doc.getText(comment.range)), expected);
      for (let index = 0; index < comments.length; index++) {
        assert.strictEqual(comments[index].kind, 'comment');
        assert.strictEqual(doc.offsetAt(comments[index].range.start), code.indexOf(expected[index]));
        assert.strictEqual(doc.offsetAt(comments[index].range.end), code.indexOf(expected[index]) + expected[index].length);
      }
    });

    test(language + ' preserves CRLF/non-BMP navigation offsets around modern syntax', async () => {
      const code = [
        'const emoji = "😀 // literal"; /* 😀 real comment */',
        'class Cache { #value = 1; static { /* static comment */ this.ready = true; } }',
        language === 'typescript'
          ? 'const config = {port: 8080} satisfies Settings; // config comment'
          : 'const config = {port: 8080}; // config comment',
        'const result = config?.port ?? 0; // 😀 trailing comment',
        'const template = `😀 /* text */ ${result /* interpolation comment */}`;'
      ].join('\r\n');
      const doc = await fixture.open(language === 'typescript' ? 'modern.ts' : 'modern.js', code, language);
      const adapter = new VpLspExtenderTypeScript(language);
      const comments = adapter.getCommentRanges(doc);
      const expected = ['/* 😀 real comment */', '/* static comment */', '// config comment',
        '// 😀 trailing comment', '/* interpolation comment */'];
      assert.deepStrictEqual(comments.map(comment => doc.getText(comment.range)), expected);
      for (let index = 0; index < comments.length; index++) {
        const offset = code.indexOf(expected[index]);
        assert.ok(comments[index].range.start.isEqual(doc.positionAt(offset)));
        assert.strictEqual(doc.offsetAt(comments[index].range.end), offset + expected[index].length);
      }
      const referenceOffset = code.indexOf('config?.port');
      const target = adapter.getDefinitionSymbol(doc, doc.positionAt(code.indexOf('config =')));
      assert.ok(target);
      assert.strictEqual(doc.getText(target!.selectionRange), 'config');
      assert.strictEqual(adapter.getDefinitionSymbol(doc, doc.positionAt(referenceOffset)), undefined,
        'a reference remains a reference after comment classification');
      const hidden = comments.reduceRight((text, comment) =>
        text.slice(0, doc.offsetAt(comment.range.start)) + text.slice(doc.offsetAt(comment.range.end)), code);
      assert.ok(hidden.includes('"😀 // literal"'));
      assert.ok(hidden.includes('`😀 /* text */ ${result }`'));
      assert.ok(hidden.includes('config?.port ?? 0;'));
      assert.deepStrictEqual(adapter.getCommentRanges(doc).map(comment => comment.range), comments.map(comment => comment.range));
    });

    test(language + ' refreshes extraction and comments after a document version changes', async () => {
      const original = 'const value = "😀"; /* old comment */\r\n';
      const changed = 'const value = {port: 8080}; // new 😀 comment\r\n';
      const document = await vscode.workspace.openTextDocument({language, content: original});
      const adapter = new VpLspExtenderTypeScript(language);
      try {
        const before = document.version;
        assert.deepStrictEqual(adapter.getCommentRanges(document).map(comment => document.getText(comment.range)), ['/* old comment */']);
        const originalTarget = adapter.getDefinitionSymbol(document, document.positionAt(original.indexOf('value')));
        assert.ok(originalTarget);
        assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, originalTarget!).rangeBody!), '"😀"');
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(original.length)), changed);
        assert.ok(await vscode.workspace.applyEdit(edit));
        assert.ok(document.version > before);
        const comments = adapter.getCommentRanges(document);
        assert.deepStrictEqual(comments.map(comment => document.getText(comment.range)), ['// new 😀 comment']);
        assert.strictEqual(document.offsetAt(comments[0].range.start), changed.indexOf('//'));
        const target = adapter.getDefinitionSymbol(document, document.positionAt(changed.indexOf('value')));
        assert.ok(target);
        assert.strictEqual(document.getText(adapter.getLanguageSpecificSymbolInformation(document, target!).rangeBody!), '{port: 8080}');
      } finally {
        await vscode.window.showTextDocument(document);
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
      }
    });
  }

  test('TSX JSX text vs real comments', async () => {
    const code = [
      'const Component = () => (',
      '  <div className="test">',
      '    /* not a comment inside JSX text */',
      '    {/* real JSX comment */}',
      '    <span>Text</span>',
      '  </div>',
      ');'
    ].join('\n');

    const doc = await fixture.open('component.tsx', code, 'typescriptreact');
    const comments = tsxAdapter.getCommentRanges(doc);
    const texts = comments.map(c => doc.getText(c.range));

    assert.strictEqual(comments.length, 1);
    assert.strictEqual(texts[0], '/* real JSX comment */');
  });
});
