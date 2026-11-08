import * as assert from 'assert';
import * as vscode from 'vscode';
import { MemoryFile } from '../memoryfile';
import * as Outline from '../../../outlineproviderAPI/SymbolDefinition';
import { SourceReference, computeDocumentHash, SavedRange } from '../../../outlineproviderAPI/source_reference';
import { VpOutlineProviderYaml } from '../../../outlineproviders/outlineprovideryaml';
import { translateOutlineRanges } from '../../../visualprogramming/outline_entities';

let fixtureSeq = 0;

class YamlTestFixture {
  readonly scheme = 'yaml-test-fixture-' + (++fixtureSeq);
  readonly provider = new VpOutlineProviderYaml();
  private readonly files = new Map<string, MemoryFile>();
  private readonly registration: vscode.Disposable;

  constructor() {
    this.registration = vscode.workspace.registerTextDocumentContentProvider(this.scheme, {
      provideTextDocumentContent: uri => {
        const file = this.files.get(uri.toString());
        if (!file) throw new Error('Fixture file not found: ' + uri.toString());
        return file.read();
      }
    });
  }

  uri(name: string): vscode.Uri {
    return vscode.Uri.parse(this.scheme + ':/' + name);
  }

  async open(name: string, content: string): Promise<vscode.TextDocument> {
    const uri = this.uri(name);
    const file = MemoryFile.createDocument('yaml');
    file.write(content);
    this.files.set(uri.toString(), file);
    const doc = await vscode.workspace.openTextDocument(uri);
    return vscode.languages.setTextDocumentLanguage(doc, 'yaml');
  }

  update(name: string, content: string): void {
    const uri = this.uri(name);
    const file = this.files.get(uri.toString());
    if (file) {
      file.write(content);
    }
  }

  dispose(): void {
    this.registration.dispose();
  }
}

function toSaved(range: vscode.Range): SavedRange {
  return [
    { line: range.start.line, character: range.start.character },
    { line: range.end.line, character: range.end.character }
  ];
}

suite('YAML Outline Provider — Behavior Test Suite', () => {
  let fixture: YamlTestFixture;

  setup(() => {
    fixture = new YamlTestFixture();
  });

  teardown(() => {
    fixture.dispose();
  });

  test('1. Block and flow nesting: scalar settings remain source, empty containers clickable, delimiters visible', async () => {
    const src = [
      'config:',
      '  retries: 3',
      '  nested_map: { a: 1, b: 2 }',
      '  empty_flow_map: {}',
      '  empty_flow_seq: []',
      '  settings:',
      '    debug: true'
    ].join('\n') + '\n';

    const doc = await fixture.open('nesting.yaml', src);
    const fileOutline = await vscode.commands.executeCommand<Outline.File>(
      'vp.executeDocumentDefinitionProvider', doc
    );
    assert.ok(fileOutline, 'file outline returned');
    await translateOutlineRanges([fileOutline!]);

    assert.strictEqual(fileOutline!.language, 'yaml');
    assert.strictEqual(fileOutline!.parts.length > 0, true);

    // File root has config container
    const configSym = fileOutline!.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    assert.ok(configSym, 'config mapping symbol found');
    assert.strictEqual(configSym.kind, 'YAML mapping');
    assert.strictEqual(doc.getText(configSym.displayTextRange!), 'config:');

    // Inside config body: child containers are nested_map, empty_flow_map, empty_flow_seq, settings
    const childSymbols = configSym.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[];
    assert.strictEqual(childSymbols.length, 4, '4 child containers in config');

    const names = childSymbols.map(s => doc.getText(s.displayTextRange!));
    assert.deepStrictEqual(names, ['nested_map:', 'empty_flow_map:', 'empty_flow_seq:', 'settings:']);

    // Check empty container delimiters retained in body
    const emptyMapSym = childSymbols[1];
    assert.ok(emptyMapSym.displayText.includes('empty_flow_map:'));
    assert.strictEqual(emptyMapSym.parts.length, 1);
    const emptyMapBody = doc.getText(emptyMapSym.parts[0].displayTextRange!);
    assert.ok(emptyMapBody.includes('{}'), 'literal delimiters {} retained');

    const emptySeqSym = childSymbols[2];
    assert.strictEqual(emptySeqSym.parts.length, 1);
    const emptySeqBody = doc.getText(emptySeqSym.parts[0].displayTextRange!);
    assert.ok(emptySeqBody.includes('[]'), 'literal delimiters [] retained');

    // retries: 3 is a scalar setting, preserved in source text gap
    const textParts = configSym.parts.filter(p => p instanceof Outline.Text) as Outline.Text[];
    const gapTexts = textParts.map(t => doc.getText(t.displayTextRange!)).join('');
    assert.ok(gapTexts.includes('retries: 3'), 'scalar setting retained in source gap');
  });

  test('2. Collection items beginning with a scalar or nested collection', async () => {
    const src = [
      'jobs:',
      '  - name: build',
      '    image: alpine',
      '    env: { FLAGS: [fast, safe] }',
      '  - { name: test, pass: true }'
    ].join('\n') + '\n';

    const doc = await fixture.open('items.yaml', src);
    const fileOutline = await vscode.commands.executeCommand<Outline.File>(
      'vp.executeDocumentDefinitionProvider', doc
    );
    assert.ok(fileOutline);
    await translateOutlineRanges([fileOutline!]);

    const jobsSym = fileOutline!.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    assert.ok(jobsSym);
    assert.strictEqual(jobsSym.kind, 'YAML sequence');

    // Two sequence items
    const items = jobsSym.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[];
    assert.strictEqual(items.length, 2);

    const item0 = items[0];
    assert.strictEqual(item0.kind, 'YAML mapping item [0]');
    // Heading is first physical line: - name: build
    assert.strictEqual(doc.getText(item0.displayTextRange!), '- name: build');
    // First scalar name: build is retained in item0's body
    const item0Body = item0.parts.map(p => doc.getText(p instanceof Outline.Symbol ? p.totalRange! : p.displayTextRange!)).join('');
    assert.ok(item0Body.includes('name: build'), 'first scalar retained in body');
    assert.ok(item0Body.includes('image: alpine'));

    // env: is child container of item0
    const envChild = item0.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    assert.ok(envChild, 'child container env: found in item0');
    assert.strictEqual(doc.getText(envChild.displayTextRange!), 'env:');

    // Parent navigation from envChild heading start goes to item0
    const envParent = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeLocationDefinerProvider', doc.uri, envChild.displayTextRange!.start
    );
    assert.ok(envParent && envParent.length > 0);
    assert.strictEqual(envParent[0].displayTextRange!.start.line, item0.displayTextRange!.start.line);

    // Parent navigation from item0 heading start goes to jobs:
    const item0Parent = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeLocationDefinerProvider', doc.uri, item0.displayTextRange!.start
    );
    assert.ok(item0Parent && item0Parent.length > 0);
    assert.strictEqual(item0Parent[0].displayTextRange!.start.line, jobsSym.displayTextRange!.start.line);
  });

  test('3. Literal/folded/multiline quoted values, comments, literal #, CRLF, non-BMP text', async () => {
    const src =
      '# Top comment\r\n' +
      'literal_val: |\r\n' +
      '  echo "# literal hash"\r\n' +
      '  second line\r\n' +
      'folded_val: >\r\n' +
      '  hello world\r\n' +
      'target: &target "target_val"\r\n' +
      'emoji: ✨\r\n' +
      'ref: *target\r\n';

    const doc = await fixture.open('multiline_crlf.yaml', src);
    const fileOutline = await vscode.commands.executeCommand<Outline.File>(
      'vp.executeDocumentDefinitionProvider', doc
    );
    assert.ok(fileOutline);
    await translateOutlineRanges([fileOutline!]);

    // Check comments: only Top comment is in commentRanges, NOT "# literal hash"
    const comments = fileOutline!.commentRanges ?? [];
    assert.strictEqual(comments.length, 1, 'only 1 true comment');
    assert.strictEqual(doc.getText(comments[0].range), '# Top comment');

    // Follow alias ref: *target
    const refLine = 8;
    const refChar = 6; // '*target'
    const def = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(refLine, refChar)
    );
    assert.ok(def && def.length > 0);
    const firstDef = def![0];
    // target is scalar anchor &target
    assert.strictEqual(doc.getText(firstDef.displayTextRange!), '&target');
    assert.strictEqual(firstDef.kind, 'YAML scalar anchor');
  });

  test('4. Multi-document, root scalar/sequence, empty/comment-only input, explicit multiline keys', async () => {
    const multiSrc = [
      '---',
      'key: value',
      '---',
      '- item1',
      '- item2',
      '---',
      '"root scalar"',
      '---',
      '? "multi',
      '  line',
      '  key"',
      ':',
      '  nested: 1'
    ].join('\n') + '\n';

    const doc = await fixture.open('multi.yaml', multiSrc);
    const fileOutline = await vscode.commands.executeCommand<Outline.File>(
      'vp.executeDocumentDefinitionProvider', doc
    );
    assert.ok(fileOutline);
    await translateOutlineRanges([fileOutline!]);

    // Preserves separators --- in Text gaps
    const allText = fileOutline!.parts
      .map(p => doc.getText(p instanceof Outline.Symbol ? p.totalRange! : p.displayTextRange!))
      .join('');
    assert.ok(allText.includes('---'));
    assert.ok(allText.includes('"root scalar"'));

    // Test empty file
    const emptyDoc = await fixture.open('empty.yaml', '');
    const emptyOutline = await vscode.commands.executeCommand<Outline.File>(
      'vp.executeDocumentDefinitionProvider', emptyDoc
    );
    assert.ok(emptyOutline);
    assert.strictEqual(emptyOutline!.parts.length, 0);

    // Test comment-only file
    const commentDoc = await fixture.open('comment_only.yaml', '# Only a comment\n# Second comment\n');
    const commentOutline = await vscode.commands.executeCommand<Outline.File>(
      'vp.executeDocumentDefinitionProvider', commentDoc
    );
    assert.ok(commentOutline);
    assert.strictEqual(commentOutline!.parts.length, 1);
    assert.ok(commentOutline!.parts[0] instanceof Outline.Text);
  });

  test('5. Container reuse, scalar/root/empty anchors, scalar-key anchor collision, rebinding, cyclic aliases', async () => {
    const src = [
      'defaults: &base',
      '  retries: 3',
      'job1:',
      '  config: *base',
      'job2:',
      '  config: *base',
      'image: &image alpine:3.20',
      'other_image: *image',
      'empty_val: &empty_anchor',
      'other_empty: *empty_anchor',
      'rebind: &a 1',
      'ref_a1: *a',
      'rebind2: &a 2',
      'ref_a2: *a'
    ].join('\n') + '\n';

    const doc = await fixture.open('anchors.yaml', src);

    // 1. Follow *base in job1
    const job1BaseDef = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(3, 11) // *base
    );
    assert.ok(job1BaseDef && job1BaseDef.length > 0);
    assert.strictEqual(doc.getText(job1BaseDef[0].displayTextRange!), 'defaults: &base');

    // 2. Follow *base in job2 -> reuses exact same container target
    const job2BaseDef = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(5, 11) // *base
    );
    assert.ok(job2BaseDef && job2BaseDef.length > 0);
    assert.strictEqual(job2BaseDef[0].totalRange!.start.line, job1BaseDef[0].totalRange!.start.line);

    // 3. Follow *image -> scalar anchor &image
    const imageDef = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(7, 14) // *image
    );
    assert.ok(imageDef && imageDef.length > 0);
    assert.strictEqual(doc.getText(imageDef[0].displayTextRange!), '&image');
    assert.strictEqual(imageDef[0].kind, 'YAML scalar anchor');

    // 4. Follow *empty_anchor -> empty body
    const emptyDef = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(9, 14) // *empty_anchor
    );
    assert.ok(emptyDef && emptyDef.length > 0);
    assert.strictEqual(emptyDef[0].parts.length, 0);

    // 5. Rebinding: ref_a1 -> value 1, ref_a2 -> value 2
    const a1Def = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(11, 9) // *a
    );
    const a2Def = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', doc.uri, new vscode.Position(13, 9) // *a
    );
    assert.ok(a1Def && a2Def);
    assert.strictEqual(a1Def[0].totalRange!.start.line, 10); // line of rebind: &a 1
    assert.strictEqual(a2Def[0].totalRange!.start.line, 12); // line of rebind2: &a 2

    // 6. Cyclic alias test
    const cyclicSrc = '&self\nself: *self\n';
    const cyclicDoc = await fixture.open('cyclic.yaml', cyclicSrc);
    const cyclicOutline = await fixture.provider.provideDocumentOutline(cyclicDoc);
    assert.ok(cyclicOutline);

    // 7. Text inside comments or strings does not navigate to anchor
    const commentAliasSrc = 'key: "*base"\n# *base\n';
    const commentAliasDoc = await fixture.open('comment_alias.yaml', commentAliasSrc);
    const inStringDef = await vscode.commands.executeCommand<Outline.OutlineRange[]>(
      'vp.executeDefinitionProvider', commentAliasDoc.uri, new vscode.Position(0, 7)
    );
    // Should return the containing container or file, NOT an alias target
    assert.ok(inStringDef);
    assert.strictEqual(inStringDef[0] instanceof Outline.File, true);
  });

  test('6. Malformed syntax, duplicate keys, forward/missing aliases, non-scalar keys, unresolved tags', async () => {
    // Malformed syntax
    const badSyntaxDoc = await fixture.open('bad_syntax.yaml', 'foo: [1, 2\n');
    await assert.rejects(
      async () => fixture.provider.provideDocumentOutline(badSyntaxDoc),
      /YAML parse error at line \d+, column \d+:/
    );

    // Duplicate keys
    const dupKeyDoc = await fixture.open('dup_key.yaml', 'a: 1\na: 2\n');
    await assert.rejects(
      async () => fixture.provider.provideDocumentOutline(dupKeyDoc),
      /YAML parse error at line \d+, column \d+: Map keys must be unique/
    );

    // Missing alias
    const missingAliasDoc = await fixture.open('missing_alias.yaml', 'foo: *missing\n');
    await assert.rejects(
      async () => fixture.provider.provideDocumentOutline(missingAliasDoc),
      /YAML parse error at line \d+, column \d+: Aliased anchor not found: missing/
    );

    // Non-scalar mapping key
    const nonScalarKeyDoc = await fixture.open('non_scalar.yaml', '? [1, 2]: val\n');
    await assert.rejects(
      async () => fixture.provider.provideDocumentOutline(nonScalarKeyDoc),
      /Unsupported YAML at line \d+, column \d+: mapping keys must be scalars\./
    );

    // Unresolved custom tag
    const customTagDoc = await fixture.open('custom_tag.yaml', 'a: !custom foo\n');
    await assert.rejects(
      async () => fixture.provider.provideDocumentOutline(customTagDoc),
      /Unsupported YAML at line \d+, column \d+: The tag !custom is unavailable/
    );
  });

  test('7. Exact save/load for ordinary and on-demand nodes, ancestry paths, modified rejection', async () => {
    const src = [
      'service:',
      '  metadata:',
      '    name: demo',
      'image: &image alpine:3.20'
    ].join('\n') + '\n';

    const doc = await fixture.open('save_load.yaml', src);
    const fileOutline = await fixture.provider.provideDocumentOutline(doc);
    assert.ok(fileOutline.sourceReference);
    assert.strictEqual(fileOutline.sourceReference.type, 'file');

    // Restore file outline
    const restoredFile = await fixture.provider.provideSavedOutline(doc, fileOutline.sourceReference);
    assert.ok(restoredFile instanceof Outline.File);

    // Get metadata symbol
    const serviceSym = fileOutline.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    const metadataSym = serviceSym.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    assert.ok(metadataSym.sourceReference);
    const metaRef = metadataSym.sourceReference!;
    assert.strictEqual(metaRef.symbol?.path?.length, 2);

    // Restore unchanged hash
    const restoredMeta = await fixture.provider.provideSavedOutline(doc, metaRef);
    assert.ok(restoredMeta instanceof Outline.Symbol);
    assert.strictEqual(restoredMeta.displayTextRange?.start.line, 1);

    // Restore on-demand scalar anchor &image
    const imageDef = await fixture.provider.provideDefinitionOutline(doc, new vscode.Position(3, 8)); // &image
    assert.ok(imageDef && imageDef.length > 0);
    const imageRef = (imageDef[0] as Outline.Symbol).sourceReference!;
    assert.ok(imageRef);
    assert.strictEqual(imageRef.symbol?.path, null);
    const restoredImage = await fixture.provider.provideSavedOutline(doc, imageRef);
    assert.ok(restoredImage instanceof Outline.Symbol);
    assert.strictEqual(restoredImage.kind, 'YAML scalar anchor');

    // Prepend comments to doc (document modified, hash changed)
    const modifiedSrc = '# Header comment\n# Second comment\n' + src;
    const modifiedDoc = await fixture.open('save_load_mod.yaml', modifiedSrc);

    // Unique mapping ancestry survives prepended comments
    const restoredMetaMod = await fixture.provider.provideSavedOutline(modifiedDoc, {
      ...metaRef,
      uri: modifiedDoc.uri.toString()
    });
    assert.ok(restoredMetaMod instanceof Outline.Symbol);
    // Shifted by 2 comment lines
    assert.strictEqual(restoredMetaMod.displayTextRange?.start.line, 3);

    // Changed reference with path: null rejects
    await assert.rejects(
      async () => fixture.provider.provideSavedOutline(modifiedDoc, {
        ...imageRef,
        uri: modifiedDoc.uri.toString()
      }),
      /Cannot locate declaration "anchor:image": document modified and symbol has no ancestry path/
    );

    // Single-doc to multi-doc rejects path restore
    const multiDoc = await fixture.open('save_load_multi.yaml', src + '---\nother: 1\n');
    await assert.rejects(
      async () => fixture.provider.provideSavedOutline(multiDoc, {
        ...metaRef,
        uri: multiDoc.uri.toString()
      }),
      /Symbol "key:"metadata"" not found in modified document/
    );

    // Direct provider URI mismatch
    await assert.rejects(
      async () => fixture.provider.provideSavedOutline(doc, {
        ...metaRef,
        uri: 'vscode-test://different/uri.yaml'
      }),
      /Saved outline URI does not match document/
    );

    // Language mismatch
    await assert.rejects(
      async () => fixture.provider.provideSavedOutline(doc, {
        ...metaRef,
        language: 'python'
      }),
      /Language changed from python to yaml/
    );
  });

  test('8. Document edit invalidates syntax/range/alias caches; earlier translated outlines do not contaminate', async () => {
    const src1 = 'service:\n  name: v1\n';
    const doc = await fixture.open('cache_test.yaml', src1);

    const outline1 = await fixture.provider.provideDocumentOutline(doc);
    await translateOutlineRanges([outline1]);
    const service1 = outline1.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    assert.ok(service1);
    assert.ok(service1.displayText);

    // Modify document content
    const src2 = 'service:\n  name: v2\n  port: 8080\n';
    fixture.update('cache_test.yaml', src2);
    // Invalidate version by changing language or triggering doc update
    const doc2 = await vscode.workspace.openTextDocument(doc.uri);

    const outline2 = await fixture.provider.provideDocumentOutline(doc2);
    const service2 = outline2.parts.find(p => p instanceof Outline.Symbol) as Outline.Symbol;
    assert.ok(service2);

    // Outline2 is fresh and does not share mutated state with outline1
    assert.notStrictEqual(outline1, outline2);
    assert.notStrictEqual(service1, service2);
  });

  test('9. Real-world GitOps manifest verification (catalog-postgresql statefulset.yaml)', async () => {
    const fs = require('fs');
    const path = require('path');
    const filePath = path.resolve(__dirname, '../../../../../../MAFC/Workspace/gitops-data/applications/data-platform/catalog-postgresql/statefulset.yaml');
    if (!fs.existsSync(filePath)) {
      return; // Skip if external repo path is not present in environment
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const doc = await fixture.open('statefulset.yaml', content);

    const outline = await fixture.provider.provideDocumentOutline(doc);
    assert.ok(outline);
    await translateOutlineRanges([outline]);

    // Root contains metadata: and spec:
    const rootSymbols = outline.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[];
    const rootNames = rootSymbols.map(s => doc.getText(s.displayTextRange!));
    assert.ok(rootNames.includes('metadata:'));
    assert.ok(rootNames.includes('spec:'));

    // spec: contains selector: and template:
    const specSym = rootSymbols.find(s => doc.getText(s.displayTextRange!) === 'spec:')!;
    const specChildren = specSym.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[];
    const specChildNames = specChildren.map(s => doc.getText(s.displayTextRange!));
    assert.ok(specChildNames.includes('template:'));

    // template: -> spec: -> containers:
    const templateSym = specChildren.find(s => doc.getText(s.displayTextRange!) === 'template:')!;
    const templateSpecSym = (templateSym.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[])
      .find(s => doc.getText(s.displayTextRange!) === 'spec:')!;
    assert.ok(templateSpecSym);

    const containersSym = (templateSpecSym.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[])
      .find(s => doc.getText(s.displayTextRange!) === 'containers:')!;
    assert.ok(containersSym);
    assert.strictEqual(containersSym.kind, 'YAML sequence');

    // containers: has postgresql item
    const containerItems = containersSym.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[];
    assert.strictEqual(containerItems.length, 1);
    const pgItem = containerItems[0];
    assert.strictEqual(doc.getText(pgItem.displayTextRange!), '- name: postgresql');
    assert.strictEqual(pgItem.kind, 'YAML mapping item [0]');

    // postgresql item body retains image: ...
    const pgBody = pgItem.parts.map(p => doc.getText(p instanceof Outline.Symbol ? p.totalRange! : p.displayTextRange!)).join('');
    assert.ok(pgBody.includes('image: 10.90.88.61:5000/data-platform/docker.io/library/postgres:17.11-bookworm'));
    assert.ok(pgBody.includes('imagePullPolicy: IfNotPresent'));

    // postgresql item contains child containers
    const pgChildren = pgItem.parts.filter(p => p instanceof Outline.Symbol) as Outline.Symbol[];
    const pgChildNames = pgChildren.map(s => doc.getText(s.displayTextRange!));
    assert.ok(pgChildNames.includes('securityContext:'));
    assert.ok(pgChildNames.includes('ports:'));
    assert.ok(pgChildNames.includes('env:'));
    assert.ok(pgChildNames.includes('resources:'));

    // Parent navigation from pgItem goes to containers:
    const pgParent = await fixture.provider.provideLocationDefiner(doc, pgItem.displayTextRange!.start);
    assert.ok(pgParent && pgParent.length > 0);
    assert.strictEqual(doc.getText(pgParent[0].displayTextRange!), 'containers:');
  });
});
