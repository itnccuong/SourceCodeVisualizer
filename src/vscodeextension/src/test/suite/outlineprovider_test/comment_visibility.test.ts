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
  const tsAdapter = new VpLspExtenderTypeScript('typescript');
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

  test('TypeScript/JavaScript extracts comments and JSDoc while preserving strings, regex, and templates', async () => {
    const code = [
      '// leading single-line comment',
      '/**',
      ' * JSDoc comment for fn',
      ' */',
      'function testFn(param: string /* inline comment */): string {',
      '  // inside body comment',
      '  const str = "hello // not a comment /* still not */";',
      '  const re = /pattern\\/\\* not comment *\\//g;',
      '  const tpl = `template with ${param} // not comment`;',
      '  return str; /* trailing comment */',
      '}',
      '// trailing EOF comment'
    ].join('\n');

    const doc = await fixture.open('sample.ts', code, 'typescript');
    const comments = tsAdapter.getCommentRanges(doc);

    const texts = comments.map(c => doc.getText(c.range));
    assert.ok(texts.includes('// leading single-line comment'));
    assert.ok(texts.some(t => t.includes('* JSDoc comment for fn')));
    assert.ok(texts.includes('/* inline comment */'));
    assert.ok(texts.includes('// inside body comment'));
    assert.ok(texts.includes('/* trailing comment */'));
    assert.ok(texts.includes('// trailing EOF comment'));

    for (const t of texts) {
      assert.ok(!t.includes('hello // not a comment'), 'Must not treat string literals as comments');
      assert.ok(!t.includes('pattern\\/'), 'Must not treat regex literals as comments');
      assert.ok(!t.includes('template with'), 'Must not treat template literals as comments');
    }
  });

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
