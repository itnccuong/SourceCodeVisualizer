import * as assert from 'assert';
import {parseCanvasFile, CanvasFileV1} from '../../visualprogramming/canvas_format';

suite('Canvas Format Validation', () => {
  const validFile: CanvasFileV1 = {
    format: 'source-code-visualizer-canvas',
    version: 1,
    viewport: { centerX: 100, centerY: 200, scale: 1.0 },
    nodes: [
      {
        id: 'n1',
        independentRoot: true,
        content: {
          type: 'source',
          reference: {
            type: 'file',
            uri: 'file:///path/to/file.py',
            language: 'python',
            documentHash: 'a'.repeat(64),
            symbol: null
          }
        },
        frame: { x: 10, y: 20, width: 200, height: 150, collapsed: false, expandedHeight: 150 },
        commentsVisible: true
      },
      {
        id: 'n2',
        independentRoot: false,
        content: {
          type: 'source',
          reference: {
            type: 'symbol',
            uri: 'file:///path/to/file.py',
            language: 'python',
            documentHash: 'a'.repeat(64),
            symbol: {
              name: 'myFunc',
              kind: 12,
              path: [{ name: 'myFunc', kind: 12 }],
              selection: [{ line: 5, character: 4 }, { line: 5, character: 10 }],
              declaration: [{ line: 5, character: 0 }, { line: 10, character: 0 }]
            }
          }
        },
        frame: { x: 300, y: 20, width: 220, height: 180, collapsed: true, expandedHeight: 180 },
        commentsVisible: false
      },
      {
        id: 'n3',
        independentRoot: true,
        content: {
          type: 'diagnostic',
          severity: 'Warning',
          title: 'Syntax warning',
          message: 'Deprecated feature used'
        },
        frame: { x: 10, y: 300, width: 200, height: 100, collapsed: false, expandedHeight: 100 },
        commentsVisible: null
      }
    ],
    edges: [
      {
        id: 'e1',
        sourceId: 'n1',
        targetId: 'n2',
        origin: { kind: 'frame' },
        dock: { kind: 'node', y: 30 }
      },
      {
        id: 'e2',
        sourceId: 'n2',
        targetId: null,
        origin: {
          kind: 'declaration',
          uri: 'file:///path/to/file.py',
          documentHash: 'a'.repeat(64),
          range: [{ line: 5, character: 4 }, { line: 5, character: 10 }]
        },
        dock: { kind: 'free', x: 550, y: 80 }
      },
      {
        id: 'e3',
        sourceId: 'n2',
        targetId: 'n2',
        origin: {
          kind: 'source',
          uri: 'file:///path/to/file.py',
          documentHash: 'a'.repeat(64),
          surface: { kind: 'body', range: [{ line: 6, character: 0 }, { line: 9, character: 0 }] },
          range: [{ line: 7, character: 4 }, { line: 7, character: 10 }],
          offsets: [10, 16]
        },
        dock: { kind: 'node', y: 40 }
      }
    ]
  };

  test('valid canvas passes validation with exact round-trip structure', () => {
    const parsed = parseCanvasFile(JSON.parse(JSON.stringify(validFile)));
    assert.strictEqual(parsed.format, 'source-code-visualizer-canvas');
    assert.strictEqual(parsed.version, 1);
    assert.strictEqual(parsed.nodes.length, 3);
    assert.strictEqual(parsed.edges.length, 3);
  });

  test('rejects incorrect format tag', () => {
    const data = JSON.parse(JSON.stringify(validFile));
    data.format = 'other-format';
    assert.throws(() => parseCanvasFile(data), /Invalid format/);
  });

  test('rejects unsupported versions with explicit message', () => {
    const data = JSON.parse(JSON.stringify(validFile));
    data.version = 2;
    assert.throws(() => parseCanvasFile(data), /Unsupported canvas version: 2/);
  });

  test('rejects scale outside [0.2, 3]', () => {
    const tooSmall = JSON.parse(JSON.stringify(validFile));
    tooSmall.viewport.scale = 0.15;
    assert.throws(() => parseCanvasFile(tooSmall), /Viewport scale out of range/);

    const tooLarge = JSON.parse(JSON.stringify(validFile));
    tooLarge.viewport.scale = 3.5;
    assert.throws(() => parseCanvasFile(tooLarge), /Viewport scale out of range/);
  });

  test('rejects malformed numbers and non-finite coordinates', () => {
    const badX = JSON.parse(JSON.stringify(validFile));
    badX.nodes[0].frame.x = NaN;
    assert.throws(() => parseCanvasFile(badX), /frame coordinates must be finite/);

    const badDim = JSON.parse(JSON.stringify(validFile));
    badDim.nodes[0].frame.width = -50;
    assert.throws(() => parseCanvasFile(badDim), /frame dimensions must be positive/);
  });

  test('rejects inverted or negative ranges', () => {
    const inverted = JSON.parse(JSON.stringify(validFile));
    inverted.nodes[1].content.reference.symbol.selection = [
      { line: 10, character: 0 },
      { line: 5, character: 0 }
    ];
    assert.throws(() => parseCanvasFile(inverted), /Range start must not be after end/);
  });

  test('rejects unsafe URIs (http, untitled, command)', () => {
    const httpUri = JSON.parse(JSON.stringify(validFile));
    httpUri.nodes[0].content.reference.uri = 'http://example.com/file.py';
    assert.throws(() => parseCanvasFile(httpUri), /Unsupported source URI/);

    const untitledUri = JSON.parse(JSON.stringify(validFile));
    untitledUri.nodes[0].content.reference.uri = 'untitled:Untitled-1';
    assert.throws(() => parseCanvasFile(untitledUri), /Unsupported source URI/);
  });

  test('accepts vscode-remote URIs', () => {
    const remoteUri = JSON.parse(JSON.stringify(validFile));
    remoteUri.nodes[0].content.reference.uri = 'vscode-remote://wsl%2Bubuntu/home/user/file.py';
    remoteUri.edges[0].sourceId = 'n1';
    const parsed = parseCanvasFile(remoteUri);
    assert.strictEqual(parsed.nodes[0].content.type === 'source' && parsed.nodes[0].content.reference.uri, 'vscode-remote://wsl%2Bubuntu/home/user/file.py');
  });

  test('rejects duplicate source references', () => {
    const dup = JSON.parse(JSON.stringify(validFile));
    dup.nodes[1].content.reference = JSON.parse(JSON.stringify(dup.nodes[0].content.reference));
    assert.throws(() => parseCanvasFile(dup), /Duplicate source reference/);
  });

  test('rejects edge with missing sourceId or targetId', () => {
    const missingSource = JSON.parse(JSON.stringify(validFile));
    missingSource.edges[0].sourceId = 'nonexistent';
    assert.throws(() => parseCanvasFile(missingSource), /missing sourceId/);

    const missingTarget = JSON.parse(JSON.stringify(validFile));
    missingTarget.edges[0].targetId = 'nonexistent';
    assert.throws(() => parseCanvasFile(missingTarget), /missing targetId/);
  });

  test('rejects dock kind mismatch with targetId nullability', () => {
    const dockMismatch1 = JSON.parse(JSON.stringify(validFile));
    dockMismatch1.edges[0].dock = { kind: 'free', x: 10, y: 20 };
    assert.throws(() => parseCanvasFile(dockMismatch1), /has targetId but dock\.kind is "free"/);

    const dockMismatch2 = JSON.parse(JSON.stringify(validFile));
    dockMismatch2.edges[1].dock = { kind: 'node', y: 50 };
    assert.throws(() => parseCanvasFile(dockMismatch2), /has null targetId but dock\.kind is "node"/);
  });

  test('allows cyclic graphs, self-loops, and multi-edges', () => {
    const cyclic = JSON.parse(JSON.stringify(validFile));
    cyclic.edges.push({
      id: 'e4',
      sourceId: 'n2',
      targetId: 'n1',
      origin: { kind: 'frame' },
      dock: { kind: 'node', y: 20 }
    });
    const parsed = parseCanvasFile(cyclic);
    assert.strictEqual(parsed.edges.length, 4);
  });

  test('rejects coerced numbers, booleans, identifiers, and diagnostic text', () => {
    const mutations: Array<{ path: Array<string | number>; value: unknown }> = [
      { path: ['viewport', 'centerX'], value: '100' },
      { path: ['viewport', 'centerY'], value: null },
      { path: ['viewport', 'scale'], value: true },
      { path: ['nodes', 0, 'frame', 'width'], value: '200' },
      { path: ['nodes', 0, 'independentRoot'], value: 'false' },
      { path: ['nodes', 0, 'frame', 'collapsed'], value: 0 },
      { path: ['nodes', 0, 'id'], value: 123 },
      { path: ['nodes', 2, 'content', 'message'], value: { text: 'not plain text' } },
      { path: ['edges', 0, 'dock', 'y'], value: '30' },
      { path: ['nodes', 1, 'content', 'reference', 'symbol', 'selection', 0, 'line'], value: '5' },
      { path: ['nodes', 1, 'content', 'reference', 'symbol', 'selection', 0, 'character'], value: Number.MAX_SAFE_INTEGER + 1 },
      { path: ['nodes', 1, 'content', 'reference', 'symbol', 'path', 0, 'kind'], value: '12' },
      { path: ['nodes', 1, 'content', 'reference', 'symbol', 'path', 0, 'name'], value: '' }
    ];
    for (const mutation of mutations) {
      const data = JSON.parse(JSON.stringify(validFile));
      let object: Record<string | number, unknown> = data;
      for (const part of mutation.path.slice(0, -1)) {
        // The cloned valid fixture has these exact containers before mutation.
        object = object[part] as Record<string | number, unknown>;
      }
      object[mutation.path[mutation.path.length - 1]] = mutation.value;
      assert.throws(() => parseCanvasFile(data));
    }
  });

  test('rejects missing and non-allowlisted fields at every model boundary', () => {
    const missing = JSON.parse(JSON.stringify(validFile));
    delete missing.nodes[0].independentRoot;
    assert.throws(() => parseCanvasFile(missing), /Missing field/);
    for (const field of ['canvas', 'viewport', 'node', 'reference', 'symbol', 'position', 'origin', 'dock']) {
      const data = JSON.parse(JSON.stringify(validFile));
      const object = field === 'canvas' ? data : field === 'viewport' ? data.viewport
        : field === 'node' ? data.nodes[0] : field === 'reference' ? data.nodes[1].content.reference
        : field === 'symbol' ? data.nodes[1].content.reference.symbol
        : field === 'position' ? data.nodes[1].content.reference.symbol.selection[0]
        : field === 'origin' ? data.edges[0].origin : data.edges[0].dock;
      object.untrusted = true;
      assert.throws(() => parseCanvasFile(data), /Unknown field/);
    }
  });

  test('rejects empty or out-of-surface source tokens and empty offsets', () => {
    const emptyRange = JSON.parse(JSON.stringify(validFile));
    emptyRange.edges[2].origin.range[1] = emptyRange.edges[2].origin.range[0];
    assert.throws(() => parseCanvasFile(emptyRange), /source-token range/);
    const outside = JSON.parse(JSON.stringify(validFile));
    outside.edges[2].origin.range[1] = { line: 10, character: 0 };
    assert.throws(() => parseCanvasFile(outside), /source-token range/);
    const emptyOffsets = JSON.parse(JSON.stringify(validFile));
    emptyOffsets.edges[2].origin.offsets = [10, 10];
    assert.throws(() => parseCanvasFile(emptyOffsets), /source-token offsets/);
  });

  test('rejects incomplete remote authorities and malformed symbol paths', () => {
    const remote = JSON.parse(JSON.stringify(validFile));
    remote.nodes[0].content.reference.uri = 'vscode-remote:/home/user/file.py';
    assert.throws(() => parseCanvasFile(remote), /Unsupported source URI/);
    const path = JSON.parse(JSON.stringify(validFile));
    path.nodes[1].content.reference.symbol.path[0].name = 'someOtherSymbol';
    assert.throws(() => parseCanvasFile(path), /Symbol path must end/);
  });
});
