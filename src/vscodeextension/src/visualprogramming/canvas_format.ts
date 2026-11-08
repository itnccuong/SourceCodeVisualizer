import * as vscode from 'vscode';
import {SourceReference, SavedRange, SavedPosition} from '../outlineproviderAPI/source_reference';

export type CanvasNodeV1 = {
  id: string;
  independentRoot: boolean;
  content:
    | { type: 'source'; reference: SourceReference }
    | { type: 'diagnostic'; severity: 'Error' | 'Warning' | 'Info'; title: string; message: string };
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    collapsed: boolean;
    expandedHeight: number;
  };
  commentsVisible: boolean | null;
};

export type CanvasEdgeV1 = {
  id: string;
  sourceId: string;
  targetId: string | null;
  origin:
    | { kind: 'frame' }
    | { kind: 'declaration'; uri: string; documentHash: string; range: SavedRange }
    | {
        kind: 'source';
        uri: string;
        documentHash: string;
        surface: { kind: 'heading' | 'body' | 'attribute'; range: SavedRange };
        range: SavedRange;
        offsets: [number, number];
      };
  dock: { kind: 'node'; y: number } | { kind: 'free'; x: number; y: number };
};

export type CanvasFileV1 = {
  format: 'source-code-visualizer-canvas';
  version: 1;
  viewport: { centerX: number; centerY: number; scale: number };
  nodes: CanvasNodeV1[];
  edges: CanvasEdgeV1[];
};

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: readonly string[], field: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new Error(`Unknown field ${field}.${key}`);
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new Error(`Missing field ${field}.${key}`);
  }
}

function string(value: unknown, field: string, nonempty = true): string {
  if (typeof value !== 'string' || (nonempty && !value.trim())) {
    throw new Error(`${field} must be ${nonempty ? 'a non-empty string' : 'a string'}`);
  }
  return value;
}

function number(value: unknown, reason: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(reason);
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${field} must be boolean`);
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative safe integer`);
  }
  return value;
}

function symbolKind(value: unknown, field: string): number {
  const kind = integer(value, field);
  if (kind > vscode.SymbolKind.TypeParameter) throw new Error(`Invalid symbol kind in ${field}`);
  return kind;
}

function position(value: unknown, field: string): SavedPosition {
  const p = record(value, field);
  keys(p, ['line', 'character'], field);
  return { line: integer(p.line, `${field}.line`), character: integer(p.character, `${field}.character`) };
}

function compare(a: SavedPosition, b: SavedPosition): number {
  return a.line - b.line || a.character - b.character;
}

function range(value: unknown, field: string): SavedRange {
  if (!Array.isArray(value) || value.length !== 2) throw new Error(`Range must be a 2-element tuple in ${field}`);
  const start = position(value[0], `${field}.start`);
  const end = position(value[1], `${field}.end`);
  if (compare(start, end) > 0) throw new Error(`Range start must not be after end in ${field}`);
  return [start, end];
}

function uri(value: unknown, field: string): string {
  const text = string(value, field);
  let parsed: vscode.Uri;
  try {
    parsed = vscode.Uri.parse(text, true);
  } catch {
    throw new Error(`Unsupported source URI: ${text}`);
  }
  if ((parsed.scheme !== 'file' && parsed.scheme !== 'vscode-remote')
      || !parsed.path.startsWith('/') || parsed.query || parsed.fragment
      || (parsed.scheme === 'vscode-remote' && !parsed.authority)) {
    throw new Error(`Unsupported source URI: ${text}`);
  }
  return text;
}

function hash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    throw new Error(`Invalid document hash in ${field}: must be 64 lowercase hex digits`);
  }
  return value;
}

function reference(value: unknown, field: string): SourceReference {
  const ref = record(value, field);
  keys(ref, ['type', 'uri', 'language', 'documentHash', 'symbol'], field);
  if (ref.type !== 'file' && ref.type !== 'symbol') throw new Error(`Invalid source reference type in ${field}`);
  let symbol: SourceReference['symbol'] = null;
  if (ref.type === 'file') {
    if (ref.symbol !== null) throw new Error(`File reference in ${field} must have symbol: null`);
  } else {
    const s = record(ref.symbol, `${field}.symbol`);
    keys(s, ['name', 'kind', 'path', 'selection', 'declaration'], `${field}.symbol`);
    const name = string(s.name, `${field}.symbol.name`);
    const kind = symbolKind(s.kind, `${field}.symbol.kind`);
    let path: NonNullable<SourceReference['symbol']>['path'] = null;
    if (s.path !== null) {
      if (!Array.isArray(s.path) || !s.path.length) throw new Error(`Symbol path in ${field} must be null or a non-empty array`);
      path = s.path.map((value, index) => {
        const entry = record(value, `${field}.symbol.path[${index}]`);
        keys(entry, ['name', 'kind'], `${field}.symbol.path[${index}]`);
        return { name: string(entry.name, `${field}.symbol.path[${index}].name`), kind: symbolKind(entry.kind, `${field}.symbol.path[${index}].kind`) };
      });
      const leaf = path[path.length - 1];
      if (leaf.name !== name || leaf.kind !== kind) throw new Error(`Symbol path must end with the saved symbol in ${field}`);
    }
    symbol = { name, kind, path, selection: range(s.selection, `${field}.symbol.selection`), declaration: range(s.declaration, `${field}.symbol.declaration`) };
  }
  return { type: ref.type, uri: uri(ref.uri, `${field}.uri`), language: string(ref.language, `${field}.language`), documentHash: hash(ref.documentHash, field), symbol };
}

/** Validate untrusted JSON and rebuild only the versioned, allowlisted model. */
export function parseCanvasFile(value: unknown): CanvasFileV1 {
  const obj = record(value, 'Root');
  if (obj.format !== 'source-code-visualizer-canvas') throw new Error('Invalid format: expected "source-code-visualizer-canvas"');
  if (obj.version !== 1) throw new Error(`Unsupported canvas version: ${String(obj.version)}`);
  keys(obj, ['format', 'version', 'viewport', 'nodes', 'edges'], 'canvas');
  const vp = record(obj.viewport, 'viewport');
  keys(vp, ['centerX', 'centerY', 'scale'], 'viewport');
  const reason = 'Viewport coordinates and scale must be finite numbers';
  const centerX = number(vp.centerX, reason), centerY = number(vp.centerY, reason), scale = number(vp.scale, reason);
  if (scale < 0.2 || scale > 3) throw new Error(`Viewport scale out of range [0.2, 3]: ${scale}`);
  if (!Array.isArray(obj.nodes)) throw new Error('Nodes must be an array');
  if (!Array.isArray(obj.edges)) throw new Error('Edges must be an array');

  const nodes = new Map<string, CanvasNodeV1>();
  const references = new Set<string>();
  const parsedNodes: CanvasNodeV1[] = obj.nodes.map((value, index) => {
    const field = `node[${index}]`;
    const n = record(value, field);
    keys(n, ['id', 'independentRoot', 'content', 'frame', 'commentsVisible'], field);
    const id = string(n.id, `${field}.id`);
    if (nodes.has(id)) throw new Error(`Duplicate node id: "${id}"`);
    const f = record(n.frame, `${field}.frame`);
    keys(f, ['x', 'y', 'width', 'height', 'collapsed', 'expandedHeight'], `${field}.frame`);
    const coordinateReason = `Node "${id}" frame coordinates must be finite numbers`;
    const dimensionReason = `Node "${id}" frame dimensions must be positive numbers`;
    const x = number(f.x, coordinateReason), y = number(f.y, coordinateReason);
    const width = number(f.width, dimensionReason), height = number(f.height, dimensionReason), expandedHeight = number(f.expandedHeight, dimensionReason);
    if (width <= 0 || height <= 0 || expandedHeight <= 0) throw new Error(dimensionReason);
    const c = record(n.content, `${field}.content`);
    let content: CanvasNodeV1['content'];
    let commentsVisible: boolean | null;
    if (c.type === 'source') {
      keys(c, ['type', 'reference'], `${field}.content`);
      const ref = reference(c.reference, `${field}.content.reference`);
      const key = JSON.stringify(ref);
      if (references.has(key)) throw new Error(`Duplicate source reference for ${ref.uri}`);
      references.add(key);
      content = { type: 'source', reference: ref };
      commentsVisible = boolean(n.commentsVisible, `${field}.commentsVisible`);
    } else if (c.type === 'diagnostic') {
      keys(c, ['type', 'severity', 'title', 'message'], `${field}.content`);
      if (c.severity !== 'Error' && c.severity !== 'Warning' && c.severity !== 'Info') throw new Error(`Invalid diagnostic severity in ${field}`);
      content = { type: 'diagnostic', severity: c.severity, title: string(c.title, `${field}.title`, false), message: string(c.message, `${field}.message`, false) };
      if (n.commentsVisible !== null) throw new Error(`${field}.commentsVisible must be null for diagnostic nodes`);
      commentsVisible = null;
    } else {
      throw new Error(`Invalid content type in ${field}`);
    }
    const node: CanvasNodeV1 = { id, independentRoot: boolean(n.independentRoot, `${field}.independentRoot`), content, frame: { x, y, width, height, collapsed: boolean(f.collapsed, `${field}.frame.collapsed`), expandedHeight }, commentsVisible };
    nodes.set(id, node);
    return node;
  });

  const edgeIds = new Set<string>();
  const parsedEdges: CanvasEdgeV1[] = obj.edges.map((value, index) => {
    const field = `edge[${index}]`;
    const e = record(value, field);
    keys(e, ['id', 'sourceId', 'targetId', 'origin', 'dock'], field);
    const id = string(e.id, `${field}.id`);
    if (edgeIds.has(id)) throw new Error(`Duplicate edge id: "${id}"`);
    edgeIds.add(id);
    const sourceId = string(e.sourceId, `${field}.sourceId`);
    const source = nodes.get(sourceId);
    if (!source) throw new Error(`Edge "${id}" refers to missing sourceId "${sourceId}"`);
    const targetId = e.targetId === null ? null : string(e.targetId, `${field}.targetId`);
    if (targetId !== null && !nodes.has(targetId)) throw new Error(`Edge "${id}" refers to missing targetId "${targetId}"`);
    const d = record(e.dock, `${field}.dock`);
    let dock: CanvasEdgeV1['dock'];
    if (targetId !== null) {
      if (d.kind !== 'node') throw new Error(`Edge "${id}" has targetId but dock.kind is "${String(d.kind)}" (expected "node")`);
      keys(d, ['kind', 'y'], `${field}.dock`);
      dock = { kind: 'node', y: number(d.y, `${field}.dock.y must be finite`) };
    } else {
      if (d.kind !== 'free') throw new Error(`Edge "${id}" has null targetId but dock.kind is "${String(d.kind)}" (expected "free")`);
      keys(d, ['kind', 'x', 'y'], `${field}.dock`);
      dock = { kind: 'free', x: number(d.x, `${field}.dock.x must be finite`), y: number(d.y, `${field}.dock.y must be finite`) };
    }
    const o = record(e.origin, `${field}.origin`);
    let origin: CanvasEdgeV1['origin'];
    if (o.kind === 'frame') {
      keys(o, ['kind'], `${field}.origin`);
      origin = { kind: 'frame' };
    } else if (o.kind === 'declaration' || o.kind === 'source') {
      keys(o, o.kind === 'declaration' ? ['kind', 'uri', 'documentHash', 'range'] : ['kind', 'uri', 'documentHash', 'surface', 'range', 'offsets'], `${field}.origin`);
      if (source.content.type !== 'source') throw new Error(`${field} non-frame origin requires a source node`);
      const originUri = uri(o.uri, `${field}.origin.uri`);
      if (originUri !== source.content.reference.uri) throw new Error(`${field} origin URI does not match source node reference URI`);
      const documentHash = hash(o.documentHash, `${field}.origin`);
      const originRange = range(o.range, `${field}.origin.range`);
      if (o.kind === 'declaration') {
        origin = { kind: 'declaration', uri: originUri, documentHash, range: originRange };
      } else {
        const s = record(o.surface, `${field}.origin.surface`);
        keys(s, ['kind', 'range'], `${field}.origin.surface`);
        if (s.kind !== 'heading' && s.kind !== 'body' && s.kind !== 'attribute') throw new Error(`Invalid surface kind in ${field}`);
        const surfaceRange = range(s.range, `${field}.origin.surface.range`);
        if (compare(originRange[0], originRange[1]) === 0 || compare(originRange[0], surfaceRange[0]) < 0 || compare(originRange[1], surfaceRange[1]) > 0) throw new Error(`${field} source-token range must be non-empty and within its source surface`);
        if (!Array.isArray(o.offsets) || o.offsets.length !== 2) throw new Error(`${field} offsets must be a 2-element tuple`);
        const start = integer(o.offsets[0], `${field}.offsets[0]`), end = integer(o.offsets[1], `${field}.offsets[1]`);
        if (start >= end) throw new Error(`${field} source-token offsets must be non-empty and ordered`);
        origin = { kind: 'source', uri: originUri, documentHash, surface: { kind: s.kind, range: surfaceRange }, range: originRange, offsets: [start, end] };
      }
    } else {
      throw new Error(`Invalid origin kind in ${field}`);
    }
    return { id, sourceId, targetId, origin, dock };
  });
  return { format: 'source-code-visualizer-canvas', version: 1, viewport: { centerX, centerY, scale }, nodes: parsedNodes, edges: parsedEdges };
}
