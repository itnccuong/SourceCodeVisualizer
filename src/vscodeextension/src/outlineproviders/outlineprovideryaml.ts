import * as vscode from 'vscode';
import * as YAML from 'yaml';
import { CST } from 'yaml/parse-cst';
import { YAMLMap, YAMLSeq, Scalar, Alias, Pair } from 'yaml/types';
import * as Outline from '../outlineproviderAPI/SymbolDefinition';
import {
  VpOutlineProvider,
  DefinitionTargetChooser,
  DefinitionOutlineResult
} from '../outlineproviderAPI/outlineprovider';
import {
  SourceReference,
  computeDocumentHash,
  SavedPosition,
  SavedRange,
  SymbolPathEntry
} from '../outlineproviderAPI/source_reference';

interface CommentInfo {
  range: vscode.Range;
  startOffset: number;
  endOffset: number;
}

interface ContainerDescriptor {
  id: number;
  astNode: YAMLMap | YAMLSeq | Scalar | null;
  cstNode?: CST.Node;
  headingRange: vscode.Range;
  bodyRange: vscode.Range;
  totalRange: vscode.Range;
  definitionPosition: vscode.Position;
  displayKind: string;
  symbolKindNumber: number;
  identityName: string;
  path: SymbolPathEntry[] | null;
  parent: ContainerDescriptor | null;
  children: ContainerDescriptor[];
  isOnDemandAnchor?: boolean;
  isRootAnchor?: boolean;
}

interface AliasInfo {
  cstRange: vscode.Range;
  startOffset: number;
  endOffset: number;
  targetAstNode: unknown;
}

interface AnchorInfo {
  name: string;
  tokenRange: vscode.Range;
  startOffset: number;
  endOffset: number;
  targetDescriptor: ContainerDescriptor;
}

interface YamlDocumentSnapshot {
  version: number;
  languageId: string;
  hash: string;
  documentCount: number;
  rootContainers: ContainerDescriptor[];
  allDescriptors: ContainerDescriptor[];
  aliasInfos: AliasInfo[];
  anchorInfos: AnchorInfo[];
  comments: CommentInfo[];
  astToDescriptor: Map<unknown, ContainerDescriptor>;
}

function toSavedRange(range: vscode.Range): SavedRange {
  return [
    { line: range.start.line, character: range.start.character },
    { line: range.end.line, character: range.end.character }
  ];
}

function getCstStart(range: CST.Range | null | undefined): number {
  if (!range) return 0;
  return range.origStart ?? range.start;
}

function getCstEnd(range: CST.Range | null | undefined): number {
  if (!range) return 0;
  return range.origEnd ?? range.end;
}

function isPositionInDocument(document: vscode.TextDocument, position: vscode.Position): boolean {
  if (
    position.line < 0 ||
    position.character < 0 ||
    position.line >= document.lineCount
  ) {
    return false;
  }
  const lineLength = document.lineAt(position.line).text.length;
  return position.character <= lineLength;
}

export class VpOutlineProviderYaml implements VpOutlineProvider {
  private readonly _snapshots = new WeakMap<vscode.TextDocument, YamlDocumentSnapshot>();

  public async provideDocumentOutline(document: vscode.TextDocument): Promise<Outline.File> {
    const snapshot = this.getSnapshot(document);
    return this.createOutlineFile(document, snapshot);
  }

  public async provideDefinitionOutline(
    document: vscode.TextDocument,
    position: vscode.Position,
    _chooseTarget?: DefinitionTargetChooser
  ): Promise<DefinitionOutlineResult> {
    if (!isPositionInDocument(document, position)) {
      throw new Error('Position is outside the current document');
    }

    const snapshot = this.getSnapshot(document);

    // 1. Exact declaration definitionPosition
    for (const desc of snapshot.allDescriptors) {
      if (position.isEqual(desc.definitionPosition)) {
        return [this.createOutlineSymbol(document, desc, snapshot)];
      }
    }

    // 2. Alias token
    for (const alias of snapshot.aliasInfos) {
      if (alias.cstRange.contains(position) || alias.cstRange.end.isEqual(position)) {
        const targetDesc = snapshot.astToDescriptor.get(alias.targetAstNode);
        if (targetDesc) {
          return [this.createOutlineSymbol(document, targetDesc, snapshot)];
        }
      }
    }

    // 3. Anchor token
    for (const anchor of snapshot.anchorInfos) {
      if (anchor.tokenRange.contains(position) || anchor.tokenRange.end.isEqual(position)) {
        return [this.createOutlineSymbol(document, anchor.targetDescriptor, snapshot)];
      }
    }

    // 4. Narrowest ordinary displayed container containing position (end-exclusive)
    const container = this.findNarrowestContainer(snapshot.allDescriptors, position);
    if (container) {
      return [this.createOutlineSymbol(document, container, snapshot)];
    }

    // Fall back to file
    return [this.createOutlineFile(document, snapshot)];
  }

  public async provideLocationDefiner(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<Outline.OutlineRange[]> {
    if (!isPositionInDocument(document, position)) {
      throw new Error('Position is outside the current document');
    }

    const snapshot = this.getSnapshot(document);

    // Idempotent file request at (0, 0)
    if (position.line === 0 && position.character === 0) {
      return [this.createOutlineFile(document, snapshot)];
    }

    // Identify symbol at heading start (prefer exact match)
    for (const desc of snapshot.allDescriptors) {
      if (desc.headingRange.start.isEqual(position)) {
        if (desc.isOnDemandAnchor) {
          if (desc.isRootAnchor) {
            return [this.createOutlineFile(document, snapshot)];
          }
          // Scalar-anchor target: nearest displayed containing container or file
          const enclosing = this.findNarrowestContainer(snapshot.allDescriptors, desc.totalRange.start);
          if (enclosing) {
            return [this.createOutlineSymbol(document, enclosing, snapshot)];
          }
          return [this.createOutlineFile(document, snapshot)];
        }

        if (desc.parent) {
          return [this.createOutlineSymbol(document, desc.parent, snapshot)];
        }
        return [this.createOutlineFile(document, snapshot)];
      }
    }

    // Fall back to narrowest container parent
    const container = this.findNarrowestContainer(snapshot.allDescriptors, position);
    if (container) {
      if (container.parent) {
        return [this.createOutlineSymbol(document, container.parent, snapshot)];
      }
      return [this.createOutlineFile(document, snapshot)];
    }

    return [this.createOutlineFile(document, snapshot)];
  }

  public async provideSavedOutline(
    document: vscode.TextDocument,
    reference: SourceReference
  ): Promise<Outline.File | Outline.Symbol> {
    if (reference.uri !== document.uri.toString()) {
      throw new Error('Saved outline URI does not match document');
    }
    if (reference.language !== document.languageId) {
      throw new Error(`Language changed from ${reference.language} to ${document.languageId}`);
    }
    if (reference.type === 'file') {
      return this.provideDocumentOutline(document);
    }

    const symRef = reference.symbol;
    if (!symRef) {
      throw new Error('Missing symbol reference');
    }

    const snapshot = this.getSnapshot(document);
    const currentHash = snapshot.hash;
    const hashUnchanged = (currentHash === reference.documentHash);

    if (hashUnchanged) {
      for (const desc of snapshot.allDescriptors) {
        if (
          desc.identityName === symRef.name &&
          desc.symbolKindNumber === symRef.kind &&
          desc.headingRange.start.line === symRef.selection[0].line &&
          desc.headingRange.start.character === symRef.selection[0].character &&
          desc.headingRange.end.line === symRef.selection[1].line &&
          desc.headingRange.end.character === symRef.selection[1].character &&
          desc.totalRange.start.line === symRef.declaration[0].line &&
          desc.totalRange.start.character === symRef.declaration[0].character &&
          desc.totalRange.end.line === symRef.declaration[1].line &&
          desc.totalRange.end.character === symRef.declaration[1].character
        ) {
          if (symRef.path && !this.matchesAncestry(desc.path, symRef.path)) {
            continue;
          }
          return this.createOutlineSymbol(document, desc, snapshot);
        }
      }
      throw new Error(`Declaration "${symRef.name}" could not be resolved at saved coordinates`);
    }

    // Hash changed
    if (!symRef.path || symRef.path.length === 0) {
      throw new Error(`Cannot locate declaration "${symRef.name}": document modified and symbol has no ancestry path`);
    }
    if (snapshot.documentCount > 1) {
      throw new Error(`Symbol "${symRef.name}" not found in modified document`);
    }

    const candidates = snapshot.allDescriptors.filter(d =>
      !d.isOnDemandAnchor && d.path !== null && this.matchesAncestry(d.path, symRef.path)
    );

    if (candidates.length === 0) {
      throw new Error(`Symbol "${symRef.name}" not found in modified document`);
    }
    if (candidates.length > 1) {
      throw new Error(`Ambiguous symbol: multiple declarations match ancestry path for "${symRef.name}"`);
    }

    return this.createOutlineSymbol(document, candidates[0], snapshot);
  }

  public async provideRangeOutline(
    document: vscode.TextDocument,
    range: vscode.Range | null
  ): Promise<Array<Outline.OutlineRange | Outline.Text>> {
    if (range === null) {
      return [await this.provideDocumentOutline(document)];
    }
    throw new Error('Range visualization is not yet implemented');
  }

  private matchesAncestry(path: SymbolPathEntry[] | null, targetPath: SymbolPathEntry[] | null): boolean {
    if (!path || !targetPath) return false;
    if (path.length !== targetPath.length) return false;
    return path.every((entry, i) => entry.name === targetPath[i].name && entry.kind === targetPath[i].kind);
  }

  private findNarrowestContainer(
    descriptors: ContainerDescriptor[],
    position: vscode.Position
  ): ContainerDescriptor | null {
    let narrowest: ContainerDescriptor | null = null;
    for (const desc of descriptors) {
      if (desc.isOnDemandAnchor) continue;
      const start = desc.totalRange.start;
      const end = desc.totalRange.end;
      const contains = (start.isBefore(position) || start.isEqual(position)) && position.isBefore(end);
      if (contains) {
        if (!narrowest) {
          narrowest = desc;
        } else {
          // Compare span sizes
          const currentSpan = (desc.totalRange.end.line - desc.totalRange.start.line) * 10000 +
            (desc.totalRange.end.character - desc.totalRange.start.character);
          const narrowestSpan = (narrowest.totalRange.end.line - narrowest.totalRange.start.line) * 10000 +
            (narrowest.totalRange.end.character - narrowest.totalRange.start.character);
          if (currentSpan <= narrowestSpan) {
            narrowest = desc;
          }
        }
      }
    }
    return narrowest;
  }

  private getSnapshot(document: vscode.TextDocument): YamlDocumentSnapshot {
    const existing = this._snapshots.get(document);
    if (existing && existing.version === document.version && existing.languageId === document.languageId) {
      return existing;
    }

    const snapshot = this.buildSnapshot(document);
    this._snapshots.set(document, snapshot);
    return snapshot;
  }

  private buildSnapshot(document: vscode.TextDocument): YamlDocumentSnapshot {
    const text = document.getText();
    const hash = computeDocumentHash(text);

    const cst = YAML.parseCST(text);
    cst.setOrigRanges();

    const documents = cst.map(node =>
      new YAML.Document({
        keepCstNodes: true,
        keepNodeTypes: true,
        version: '1.2',
        merge: false
      }).parse(node)
    );

    // Validate entire stream for errors, warnings, non-scalar keys
    this.validateStream(document, documents, text);

    // Extract deduplicated comments
    const comments = this.extractComments(document, cst, text);

    // Build container hierarchy & index anchors and aliases
    const rootContainers: ContainerDescriptor[] = [];
    const allDescriptors: ContainerDescriptor[] = [];
    const aliasInfos: AliasInfo[] = [];
    const anchorInfos: AnchorInfo[] = [];
    const astToDescriptor = new Map<unknown, ContainerDescriptor>();

    let descriptorIdSeq = 0;
    const isSingleDoc = (documents.length === 1);

    for (let docIdx = 0; docIdx < documents.length; docIdx++) {
      const doc = documents[docIdx];
      const contents = doc.contents;
      if (!contents) continue;

      if (contents instanceof YAMLMap) {
        const rootEntries = this.indexMapEntries(
          document,
          contents,
          null,
          isSingleDoc,
          allDescriptors,
          astToDescriptor,
          aliasInfos,
          () => ++descriptorIdSeq
        );
        rootContainers.push(...rootEntries);

        // Check if root map has an anchor
        this.checkRootAnchor(document, contents, rootEntries, allDescriptors, astToDescriptor, anchorInfos, () => ++descriptorIdSeq);
      } else if (contents instanceof YAMLSeq) {
        const rootItems = this.indexSeqItems(
          document,
          contents,
          null,
          allDescriptors,
          astToDescriptor,
          aliasInfos,
          () => ++descriptorIdSeq
        );
        rootContainers.push(...rootItems);

        // Check if root seq has an anchor
        this.checkRootAnchor(document, contents, rootItems, allDescriptors, astToDescriptor, anchorInfos, () => ++descriptorIdSeq);
      } else if (contents instanceof Scalar) {
        this.collectScalarAnchorAndAliases(document, contents, null, allDescriptors, astToDescriptor, anchorInfos, aliasInfos, () => ++descriptorIdSeq);
      } else if (contents instanceof Alias) {
        this.recordAlias(document, contents, aliasInfos);
      }
    }

    // Collect all anchor infos
    this.collectAllAnchorInfos(document, cst, allDescriptors, astToDescriptor, anchorInfos, () => ++descriptorIdSeq, text);

    return {
      version: document.version,
      languageId: document.languageId,
      hash,
      documentCount: documents.length,
      rootContainers,
      allDescriptors,
      aliasInfos,
      anchorInfos,
      comments,
      astToDescriptor
    };
  }

  private validateStream(
    document: vscode.TextDocument,
    documents: YAML.Document[],
    text: string
  ): void {
    interface Problem {
      type: 'error' | 'warning';
      offset: number;
      message: string;
    }

    const problems: Problem[] = [];

    const getDiagnosticOffset = (source: unknown): number => {
      if (source === null || typeof source !== 'object') return 0;
      const obj = source as Record<string, unknown>;
      if ('range' in obj && obj.range && typeof obj.range === 'object') {
        const r = obj.range as CST.Range;
        return r.origStart ?? r.start ?? 0;
      }
      if ('valueRange' in obj && obj.valueRange && typeof obj.valueRange === 'object') {
        const vr = obj.valueRange as CST.Range;
        return vr.origStart ?? vr.start ?? 0;
      }
      if ('origStart' in obj && typeof obj.origStart === 'number') {
        return obj.origStart;
      }
      if ('start' in obj && typeof obj.start === 'number') {
        return obj.start;
      }
      return 0;
    };
    for (const doc of documents) {
      for (const err of doc.errors) {
        const offset = getDiagnosticOffset(err.source);
        problems.push({
          type: 'error',
          offset,
          message: err.message
        });
      }

      for (const warn of doc.warnings) {
        if (warn.message.includes('Keys with collection values will be stringified')) {
          continue;
        }
        const offset = getDiagnosticOffset(warn.source);
        problems.push({
          type: 'warning',
          offset,
          message: warn.message
        });
      }

      // Check non-scalar keys
      this.checkNonScalarKeys(doc.contents, problems);
    }

    if (problems.length > 0) {
      // Sort by offset ascending; errors before warnings at same offset
      problems.sort((a, b) => {
        if (a.offset !== b.offset) return a.offset - b.offset;
        if (a.type === 'error' && b.type !== 'error') return -1;
        if (b.type === 'error' && a.type !== 'error') return 1;
        return 0;
      });

      const first = problems[0];
      const pos = document.positionAt(first.offset);
      const line = pos.line + 1;
      const col = pos.character + 1;

      if (first.type === 'error') {
        throw new Error(`YAML parse error at line ${line}, column ${col}: ${first.message}`);
      } else {
        throw new Error(`Unsupported YAML at line ${line}, column ${col}: ${first.message}`);
      }
    }
  }

  private checkNonScalarKeys(node: unknown, problems: Array<{ type: 'error' | 'warning'; offset: number; message: string }>): void {
    if (!node || typeof node !== 'object') return;
    if (node instanceof YAMLMap) {
      for (const item of node.items) {
        const key = item.key;
        if (key !== null && key !== undefined && !(key instanceof Scalar)) {
          let offset = 0;
          if (key && typeof key === 'object') {
            if ('cstNode' in key) {
              const cstNode = (key as { cstNode?: CST.Node }).cstNode;
              if (cstNode?.range) {
                offset = cstNode.range.origStart ?? cstNode.range.start;
              }
            } else if ('range' in key) {
              const r = (key as { range?: [number, number] }).range;
              if (Array.isArray(r) && typeof r[0] === 'number') {
                offset = r[0];
              }
            }
          }
          problems.push({
            type: 'warning',
            offset,
            message: 'mapping keys must be scalars.'
          });
        }
        this.checkNonScalarKeys(item.key, problems);
        this.checkNonScalarKeys(item.value, problems);
      }
    } else if (node instanceof YAMLSeq) {
      for (const item of node.items) {
        this.checkNonScalarKeys(item, problems);
      }
    }
  }

  private extractComments(
    document: vscode.TextDocument,
    cst: CST.Document[],
    text: string
  ): CommentInfo[] {
    const rawComments = new Map<string, { start: number; end: number }>();

    const record = (start: number, end: number) => {
      if (start < end && end <= text.length) {
        const key = `${start}:${end}`;
        if (!rawComments.has(key)) {
          rawComments.set(key, { start, end });
        }
      }
    };

    const traverse = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as {
        type?: string;
        range?: CST.Range;
        props?: CST.Range[];
        directives?: unknown[];
        contents?: unknown[];
        items?: unknown[];
        node?: unknown;
      };

      if (n.type === 'COMMENT' && n.range) {
        record(getCstStart(n.range), getCstEnd(n.range));
      }

      if (Array.isArray(n.props)) {
        for (const p of n.props) {
          const s = getCstStart(p);
          const e = getCstEnd(p);
          if (text.slice(s, e).startsWith('#')) {
            record(s, e);
          }
        }
      }

      if (Array.isArray(n.directives)) {
        for (const d of n.directives) traverse(d);
      }
      if (Array.isArray(n.contents)) {
        for (const c of n.contents) traverse(c);
      }
      if (Array.isArray(n.items)) {
        for (const it of n.items) traverse(it);
      }
      if (n.node) {
        traverse(n.node);
      }
    };

    for (const doc of cst) {
      traverse(doc);
    }

    const sorted = Array.from(rawComments.values()).sort((a, b) => a.start - b.start);
    return sorted.map(c => ({
      range: new vscode.Range(document.positionAt(c.start), document.positionAt(c.end)),
      startOffset: c.start,
      endOffset: c.end
    }));
  }

  private indexMapEntries(
    document: vscode.TextDocument,
    map: YAMLMap,
    parent: ContainerDescriptor | null,
    isSingleDoc: boolean,
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    aliasInfos: AliasInfo[],
    nextId: () => number
  ): ContainerDescriptor[] {
    const containerEntries: ContainerDescriptor[] = [];
    const cstMap = map.cstNode;
    if (!cstMap) return containerEntries;

    const sourceText = document.getText();
    const pairs = map.items;

    if (cstMap.type === 'MAP') {
      const cstItems = (cstMap as CST.Map).items;
      let cstIdx = 0;

      for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
        const pair = pairs[pIdx];

        while (cstIdx < cstItems.length && (cstItems[cstIdx].type === 'BLANK_LINE' || cstItems[cstIdx].type === 'COMMENT')) {
          cstIdx++;
        }
        let keyItem: CST.Node | null = null;
        if (cstIdx < cstItems.length && cstItems[cstIdx].type !== 'MAP_VALUE') {
          keyItem = cstItems[cstIdx++];
        }
        while (cstIdx < cstItems.length && (cstItems[cstIdx].type === 'BLANK_LINE' || cstItems[cstIdx].type === 'COMMENT')) {
          cstIdx++;
        }
        let valItem: CST.MapValue | null = null;
        if (cstIdx < cstItems.length && cstItems[cstIdx].type === 'MAP_VALUE') {
          valItem = cstItems[cstIdx++] as CST.MapValue;
        }

        const desc = this.processPair(
          document,
          pair,
          keyItem,
          valItem,
          parent,
          isSingleDoc,
          allDescriptors,
          astToDescriptor,
          aliasInfos,
          nextId,
          sourceText
        );
        if (desc) {
          containerEntries.push(desc);
        }
      }
    } else if (cstMap.type === 'FLOW_MAP') {
      const flowItems = (cstMap as CST.FlowMap).items;
      let cstIdx = 0;
      if (cstIdx < flowItems.length && (flowItems[cstIdx] as CST.FlowChar).char === '{') {
        cstIdx++;
      }

      for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
        const pair = pairs[pIdx];

        while (cstIdx < flowItems.length && (
          (flowItems[cstIdx] as CST.Node).type === 'BLANK_LINE' ||
          (flowItems[cstIdx] as CST.Node).type === 'COMMENT' ||
          (flowItems[cstIdx] as CST.FlowChar).char === ','
        )) {
          cstIdx++;
        }

        let explicitMark: CST.FlowChar | null = null;
        if (cstIdx < flowItems.length && (flowItems[cstIdx] as CST.FlowChar).char === '?') {
          explicitMark = flowItems[cstIdx++] as CST.FlowChar;
        }

        while (cstIdx < flowItems.length && (
          (flowItems[cstIdx] as CST.Node).type === 'BLANK_LINE' ||
          (flowItems[cstIdx] as CST.Node).type === 'COMMENT'
        )) {
          cstIdx++;
        }

        let keyItem: CST.Node | null = null;
        if (cstIdx < flowItems.length && (flowItems[cstIdx] as CST.FlowChar).char !== ':') {
          keyItem = flowItems[cstIdx++] as CST.Node;
        }

        while (cstIdx < flowItems.length && (
          (flowItems[cstIdx] as CST.Node).type === 'BLANK_LINE' ||
          (flowItems[cstIdx] as CST.Node).type === 'COMMENT'
        )) {
          cstIdx++;
        }

        let colonFlowChar: CST.FlowChar | null = null;
        if (cstIdx < flowItems.length && (flowItems[cstIdx] as CST.FlowChar).char === ':') {
          colonFlowChar = flowItems[cstIdx++] as CST.FlowChar;
        }

        while (cstIdx < flowItems.length && (
          (flowItems[cstIdx] as CST.Node).type === 'BLANK_LINE' ||
          (flowItems[cstIdx] as CST.Node).type === 'COMMENT'
        )) {
          cstIdx++;
        }

        let valItem: CST.Node | null = null;
        if (cstIdx < flowItems.length &&
            (flowItems[cstIdx] as CST.FlowChar).char !== ',' &&
            (flowItems[cstIdx] as CST.FlowChar).char !== '}') {
          valItem = flowItems[cstIdx++] as CST.Node;
        }

        const desc = this.processFlowPair(
          document,
          pair,
          explicitMark,
          keyItem,
          colonFlowChar,
          valItem,
          parent,
          isSingleDoc,
          allDescriptors,
          astToDescriptor,
          aliasInfos,
          nextId,
          sourceText
        );
        if (desc) {
          containerEntries.push(desc);
        }
      }
    }

    return containerEntries;
  }

  private processPair(
    document: vscode.TextDocument,
    pair: Pair,
    keyItem: CST.Node | null,
    valItem: CST.MapValue | null,
    parent: ContainerDescriptor | null,
    isSingleDoc: boolean,
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    aliasInfos: AliasInfo[],
    nextId: () => number,
    sourceText: string
  ): ContainerDescriptor | null {
    let pairStart = 0;
    if (keyItem?.range) {
      pairStart = getCstStart(keyItem.range);
    } else if (valItem?.range) {
      pairStart = getCstStart(valItem.range);
    }

    const colonOffset = valItem?.range ? getCstStart(valItem.range) : pairStart;

    let pairEnd = colonOffset + 1;
    let valCst: CST.Node | undefined;
    if (pair.value && typeof pair.value === 'object' && 'cstNode' in pair.value) {
      valCst = (pair.value as { cstNode?: CST.Node }).cstNode ?? undefined;
    } else if (valItem?.node) {
      valCst = valItem.node;
    }
    if (valCst?.range) {
      pairEnd = getCstEnd(valCst.range);
    }

    const isContainer = (pair.value instanceof YAMLMap || pair.value instanceof YAMLSeq);

    // If key is an anchored scalar and start collides with pairStart, record mapping later
    if (!isContainer) {
      if (pair.value instanceof Alias) {
        this.recordAlias(document, pair.value, aliasInfos);
      }
      return null;
    }

    // Determine heading end
    let headingEnd = colonOffset + 1;
    if (valCst && Array.isArray(valCst.props)) {
      for (const p of valCst.props) {
        const ps = getCstStart(p);
        const pe = getCstEnd(p);
        const pText = sourceText.slice(ps, pe);
        if (pText.startsWith('&') || pText.startsWith('!')) {
          if (pe > headingEnd) {
            headingEnd = pe;
          }
        }
      }
    }

    // Trim trailing whitespace & comments on the heading line
    headingEnd = this.trimTrailingWhitespaceAndComments(sourceText, pairStart, headingEnd);

    const totalRange = new vscode.Range(document.positionAt(pairStart), document.positionAt(pairEnd));
    const headingRange = new vscode.Range(document.positionAt(pairStart), document.positionAt(headingEnd));
    const bodyRange = new vscode.Range(document.positionAt(headingEnd), document.positionAt(pairEnd));
    const defPos = document.positionAt(pairStart);

    let identityName: string;
    if (!pair.key || !keyItem) {
      identityName = 'key:""';
    } else {
      const keyRange = new vscode.Range(
        document.positionAt(getCstStart(keyItem.range)),
        document.positionAt(getCstEnd(keyItem.range))
      );
      const originalLexeme = document.getText(keyRange);
      identityName = 'key:' + JSON.stringify(originalLexeme);
    }

    const displayKind = pair.value instanceof YAMLMap ? 'YAML mapping' : 'YAML sequence';
    const symbolKindNumber = pair.value instanceof YAMLMap ? vscode.SymbolKind.Object : vscode.SymbolKind.Array;

    let path: SymbolPathEntry[] | null = null;
    if (isSingleDoc && (parent === null || parent.path !== null)) {
      path = [...(parent?.path ?? []), { name: identityName, kind: symbolKindNumber }];
    }

    const desc: ContainerDescriptor = {
      id: nextId(),
      astNode: pair.value,
      cstNode: valCst,
      headingRange,
      bodyRange,
      totalRange,
      definitionPosition: defPos,
      displayKind,
      symbolKindNumber,
      identityName,
      path,
      parent,
      children: []
    };

    allDescriptors.push(desc);
    astToDescriptor.set(pair.value, desc);

    // If key has an anchor whose start collides with this declaration, map key to desc as well
    if (pair.key) {
      astToDescriptor.set(pair.key, desc);
    }

    // Index children
    if (pair.value instanceof YAMLMap) {
      desc.children = this.indexMapEntries(
        document,
        pair.value,
        desc,
        isSingleDoc,
        allDescriptors,
        astToDescriptor,
        aliasInfos,
        nextId
      );
    } else if (pair.value instanceof YAMLSeq) {
      desc.children = this.indexSeqItems(
        document,
        pair.value,
        desc,
        allDescriptors,
        astToDescriptor,
        aliasInfos,
        nextId
      );
    }

    return desc;
  }

  private processFlowPair(
    document: vscode.TextDocument,
    pair: Pair,
    explicitMark: CST.FlowChar | null,
    keyItem: CST.Node | null,
    colonFlowChar: CST.FlowChar | null,
    valItem: CST.Node | null,
    parent: ContainerDescriptor | null,
    isSingleDoc: boolean,
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    aliasInfos: AliasInfo[],
    nextId: () => number,
    sourceText: string
  ): ContainerDescriptor | null {
    let pairStart = 0;
    if (explicitMark) {
      pairStart = explicitMark.origOffset ?? explicitMark.offset;
    } else if (keyItem?.range) {
      pairStart = getCstStart(keyItem.range);
    } else if (colonFlowChar) {
      pairStart = colonFlowChar.origOffset ?? colonFlowChar.offset;
    }

    const colonOffset = colonFlowChar ? (colonFlowChar.origOffset ?? colonFlowChar.offset) : pairStart;

    let pairEnd = colonOffset + 1;
    let valCst: CST.Node | undefined;
    if (pair.value && typeof pair.value === 'object' && 'cstNode' in pair.value) {
      valCst = (pair.value as { cstNode?: CST.Node }).cstNode ?? undefined;
    } else if (valItem) {
      valCst = valItem;
    }
    if (valCst?.range) {
      pairEnd = getCstEnd(valCst.range);
    }

    const isContainer = (pair.value instanceof YAMLMap || pair.value instanceof YAMLSeq);

    if (!isContainer) {
      if (pair.value instanceof Alias) {
        this.recordAlias(document, pair.value, aliasInfos);
      }
      return null;
    }

    let headingEnd = colonOffset + 1;
    if (valCst && Array.isArray(valCst.props)) {
      for (const p of valCst.props) {
        const ps = getCstStart(p);
        const pe = getCstEnd(p);
        const pText = sourceText.slice(ps, pe);
        if (pText.startsWith('&') || pText.startsWith('!')) {
          if (pe > headingEnd) {
            headingEnd = pe;
          }
        }
      }
    }
    headingEnd = this.trimTrailingWhitespaceAndComments(sourceText, pairStart, headingEnd);

    const totalRange = new vscode.Range(document.positionAt(pairStart), document.positionAt(pairEnd));
    const headingRange = new vscode.Range(document.positionAt(pairStart), document.positionAt(headingEnd));
    const bodyRange = new vscode.Range(document.positionAt(headingEnd), document.positionAt(pairEnd));
    const defPos = document.positionAt(pairStart);

    let identityName: string;
    if (!pair.key || !keyItem) {
      identityName = 'key:""';
    } else {
      const keyRange = new vscode.Range(
        document.positionAt(getCstStart(keyItem.range)),
        document.positionAt(getCstEnd(keyItem.range))
      );
      const originalLexeme = document.getText(keyRange);
      identityName = 'key:' + JSON.stringify(originalLexeme);
    }

    const displayKind = pair.value instanceof YAMLMap ? 'YAML mapping' : 'YAML sequence';
    const symbolKindNumber = pair.value instanceof YAMLMap ? vscode.SymbolKind.Object : vscode.SymbolKind.Array;

    let path: SymbolPathEntry[] | null = null;
    if (isSingleDoc && (parent === null || parent.path !== null)) {
      path = [...(parent?.path ?? []), { name: identityName, kind: symbolKindNumber }];
    }

    const desc: ContainerDescriptor = {
      id: nextId(),
      astNode: pair.value,
      cstNode: valCst,
      headingRange,
      bodyRange,
      totalRange,
      definitionPosition: defPos,
      displayKind,
      symbolKindNumber,
      identityName,
      path,
      parent,
      children: []
    };

    allDescriptors.push(desc);
    astToDescriptor.set(pair.value, desc);

    if (pair.key) {
      astToDescriptor.set(pair.key, desc);
    }

    if (pair.value instanceof YAMLMap) {
      desc.children = this.indexMapEntries(
        document,
        pair.value,
        desc,
        isSingleDoc,
        allDescriptors,
        astToDescriptor,
        aliasInfos,
        nextId
      );
    } else if (pair.value instanceof YAMLSeq) {
      desc.children = this.indexSeqItems(
        document,
        pair.value,
        desc,
        allDescriptors,
        astToDescriptor,
        aliasInfos,
        nextId
      );
    }

    return desc;
  }

  private indexSeqItems(
    document: vscode.TextDocument,
    seq: YAMLSeq,
    parent: ContainerDescriptor | null,
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    aliasInfos: AliasInfo[],
    nextId: () => number
  ): ContainerDescriptor[] {
    const containerItems: ContainerDescriptor[] = [];
    const cstSeq = seq.cstNode;
    if (!cstSeq) return containerItems;

    const sourceText = document.getText();
    const items = seq.items;

    if (cstSeq.type === 'SEQ') {
      const cstItems = (cstSeq as CST.Seq).items;
      let cstIdx = 0;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        while (cstIdx < cstItems.length && (cstItems[cstIdx].type === 'BLANK_LINE' || cstItems[cstIdx].type === 'COMMENT')) {
          cstIdx++;
        }
        if (cstIdx >= cstItems.length) break;
        const seqItem = cstItems[cstIdx++] as CST.SeqItem;

        const isContainer = (item instanceof YAMLMap || item instanceof YAMLSeq);
        if (!isContainer) {
          if (item instanceof Alias) {
            this.recordAlias(document, item, aliasInfos);
          }
          continue;
        }

        const itemStart = getCstStart(seqItem.range);
        const itemEnd = getCstEnd(seqItem.range);
        const totalRange = new vscode.Range(document.positionAt(itemStart), document.positionAt(itemEnd));
        const defPos = document.positionAt(itemStart);

        // Heading: first physical source line, capped at itemEnd, trimmed
        let lineEnd = sourceText.indexOf('\n', itemStart);
        if (lineEnd === -1 || lineEnd > itemEnd) {
          lineEnd = itemEnd;
        }
        const headingEnd = this.trimTrailingWhitespaceAndComments(sourceText, itemStart, lineEnd);
        const headingRange = new vscode.Range(document.positionAt(itemStart), document.positionAt(headingEnd));

        // Body: complete collection value
        const valCst = seqItem.node;
        const bodyStart = valCst?.range ? getCstStart(valCst.range) : headingEnd;
        const bodyRange = new vscode.Range(document.positionAt(bodyStart), document.positionAt(itemEnd));

        const displayKind = item instanceof YAMLMap
          ? `YAML mapping item [${i}]`
          : `YAML sequence item [${i}]`;
        const symbolKindNumber = item instanceof YAMLMap
          ? vscode.SymbolKind.Object
          : vscode.SymbolKind.Array;

        const desc: ContainerDescriptor = {
          id: nextId(),
          astNode: item,
          cstNode: valCst ?? undefined,
          headingRange,
          bodyRange,
          totalRange,
          definitionPosition: defPos,
          displayKind,
          symbolKindNumber,
          identityName: `item:[${i}]`,
          path: null,
          parent,
          children: []
        };

        allDescriptors.push(desc);
        astToDescriptor.set(item, desc);
        containerItems.push(desc);

        if (item instanceof YAMLMap) {
          desc.children = this.indexMapEntries(
            document,
            item,
            desc,
            false,
            allDescriptors,
            astToDescriptor,
            aliasInfos,
            nextId
          );
        } else if (item instanceof YAMLSeq) {
          desc.children = this.indexSeqItems(
            document,
            item,
            desc,
            allDescriptors,
            astToDescriptor,
            aliasInfos,
            nextId
          );
        }
      }
    } else if (cstSeq.type === 'FLOW_SEQ') {
      const flowItems = (cstSeq as CST.FlowSeq).items;
      let cstIdx = 0;
      if (cstIdx < flowItems.length && (flowItems[cstIdx] as CST.FlowChar).char === '[') {
        cstIdx++;
      }

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        while (cstIdx < flowItems.length && (
          (flowItems[cstIdx] as CST.Node).type === 'BLANK_LINE' ||
          (flowItems[cstIdx] as CST.Node).type === 'COMMENT' ||
          (flowItems[cstIdx] as CST.FlowChar).char === ','
        )) {
          cstIdx++;
        }
        if (cstIdx >= flowItems.length) break;
        const itemNode = flowItems[cstIdx++] as CST.Node;

        const isContainer = (item instanceof YAMLMap || item instanceof YAMLSeq);
        if (!isContainer) {
          if (item instanceof Alias) {
            this.recordAlias(document, item, aliasInfos);
          }
          continue;
        }

        const itemStart = getCstStart(itemNode.range);
        const itemEnd = getCstEnd(itemNode.range);
        const totalRange = new vscode.Range(document.positionAt(itemStart), document.positionAt(itemEnd));
        const defPos = document.positionAt(itemStart);

        let lineEnd = sourceText.indexOf('\n', itemStart);
        if (lineEnd === -1 || lineEnd > itemEnd) {
          lineEnd = itemEnd;
        }
        const headingEnd = this.trimTrailingWhitespaceAndComments(sourceText, itemStart, lineEnd);
        const headingRange = new vscode.Range(document.positionAt(itemStart), document.positionAt(headingEnd));
        const bodyRange = totalRange;

        const displayKind = item instanceof YAMLMap
          ? `YAML mapping item [${i}]`
          : `YAML sequence item [${i}]`;
        const symbolKindNumber = item instanceof YAMLMap
          ? vscode.SymbolKind.Object
          : vscode.SymbolKind.Array;

        const desc: ContainerDescriptor = {
          id: nextId(),
          astNode: item,
          cstNode: itemNode,
          headingRange,
          bodyRange,
          totalRange,
          definitionPosition: defPos,
          displayKind,
          symbolKindNumber,
          identityName: `item:[${i}]`,
          path: null,
          parent,
          children: []
        };

        allDescriptors.push(desc);
        astToDescriptor.set(item, desc);
        containerItems.push(desc);

        if (item instanceof YAMLMap) {
          desc.children = this.indexMapEntries(
            document,
            item,
            desc,
            false,
            allDescriptors,
            astToDescriptor,
            aliasInfos,
            nextId
          );
        } else if (item instanceof YAMLSeq) {
          desc.children = this.indexSeqItems(
            document,
            item,
            desc,
            allDescriptors,
            astToDescriptor,
            aliasInfos,
            nextId
          );
        }
      }
    }

    return containerItems;
  }

  private trimTrailingWhitespaceAndComments(sourceText: string, lineStart: number, lineEnd: number): number {
    let text = sourceText.slice(lineStart, lineEnd);
    if (text.endsWith('\r')) text = text.slice(0, -1);

    // Look for comments on the line outside strings
    let inSingle = false;
    let inDouble = false;
    let commentIdx = -1;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "'" && !inDouble) inSingle = !inSingle;
      else if (ch === '"' && !inSingle && (i === 0 || text[i - 1] !== '\\')) inDouble = !inDouble;
      else if (ch === '#' && !inSingle && !inDouble) {
        commentIdx = i;
        break;
      }
    }

    if (commentIdx !== -1) {
      text = text.slice(0, commentIdx);
    }

    // Trim trailing whitespace
    while (text.length > 0 && (text.endsWith(' ') || text.endsWith('\t'))) {
      text = text.slice(0, -1);
    }

    return lineStart + text.length;
  }

  private checkRootAnchor(
    document: vscode.TextDocument,
    contents: YAMLMap | YAMLSeq,
    rootChildren: ContainerDescriptor[],
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    anchorInfos: AnchorInfo[],
    nextId: () => number
  ): void {
    const cstNode = contents.cstNode;
    if (!cstNode || !Array.isArray(cstNode.props)) return;

    for (const p of cstNode.props) {
      const ps = getCstStart(p);
      const pe = getCstEnd(p);
      const text = document.getText().slice(ps, pe);
      if (text.startsWith('&')) {
        const name = text.slice(1);
        const tokenRange = new vscode.Range(document.positionAt(ps), document.positionAt(pe));
        const rootEnd = getCstEnd(cstNode.range);
        const totalRange = new vscode.Range(tokenRange.start, document.positionAt(rootEnd));
        const bodyRange = new vscode.Range(tokenRange.end, document.positionAt(rootEnd));

        const displayKind = contents instanceof YAMLMap ? 'YAML mapping' : 'YAML sequence';
        const symbolKindNumber = contents instanceof YAMLMap ? vscode.SymbolKind.Object : vscode.SymbolKind.Array;

        const desc: ContainerDescriptor = {
          id: nextId(),
          astNode: contents,
          cstNode,
          headingRange: tokenRange,
          bodyRange,
          totalRange,
          definitionPosition: tokenRange.start,
          displayKind,
          symbolKindNumber,
          identityName: `anchor:${name}`,
          path: null,
          parent: null,
          children: rootChildren,
          isOnDemandAnchor: true,
          isRootAnchor: true
        };

        allDescriptors.push(desc);
        astToDescriptor.set(contents, desc);
        anchorInfos.push({
          name,
          tokenRange,
          startOffset: ps,
          endOffset: pe,
          targetDescriptor: desc
        });
      }
    }
  }

  private collectScalarAnchorAndAliases(
    document: vscode.TextDocument,
    scalar: Scalar,
    parent: ContainerDescriptor | null,
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    anchorInfos: AnchorInfo[],
    aliasInfos: AliasInfo[],
    nextId: () => number
  ): void {
    const cstNode = scalar.cstNode;
    if (!cstNode) return;

    if (Array.isArray(cstNode.props)) {
      for (const p of cstNode.props) {
        const ps = getCstStart(p);
        const pe = getCstEnd(p);
        const text = document.getText().slice(ps, pe);
        if (text.startsWith('&')) {
          const name = text.slice(1);
          const tokenRange = new vscode.Range(document.positionAt(ps), document.positionAt(pe));
          const scalarEnd = getCstEnd(cstNode.range);
          const isEmpty = (scalar.value === null || scalar.value === undefined);

          const totalRange = isEmpty
            ? tokenRange
            : new vscode.Range(tokenRange.start, document.positionAt(scalarEnd));
          const bodyRange = isEmpty
            ? new vscode.Range(tokenRange.end, tokenRange.end)
            : new vscode.Range(tokenRange.end, document.positionAt(scalarEnd));

          const desc: ContainerDescriptor = {
            id: nextId(),
            astNode: scalar,
            cstNode,
            headingRange: tokenRange,
            bodyRange,
            totalRange,
            definitionPosition: tokenRange.start,
            displayKind: 'YAML scalar anchor',
            symbolKindNumber: vscode.SymbolKind.Variable,
            identityName: `anchor:${name}`,
            path: null,
            parent,
            children: [],
            isOnDemandAnchor: true,
            isRootAnchor: false
          };

          allDescriptors.push(desc);
          astToDescriptor.set(scalar, desc);
          anchorInfos.push({
            name,
            tokenRange,
            startOffset: ps,
            endOffset: pe,
            targetDescriptor: desc
          });
        }
      }
    }
  }

  private recordAlias(document: vscode.TextDocument, alias: Alias, aliasInfos: AliasInfo[]): void {
    const cstNode = alias.cstNode;
    if (!cstNode?.range) return;
    const start = getCstStart(cstNode.range);
    const end = getCstEnd(cstNode.range);
    const cstRange = new vscode.Range(document.positionAt(start), document.positionAt(end));
    aliasInfos.push({
      cstRange,
      startOffset: start,
      endOffset: end,
      targetAstNode: alias.source
    });
  }

  private collectAllAnchorInfos(
    document: vscode.TextDocument,
    cst: CST.Document[],
    allDescriptors: ContainerDescriptor[],
    astToDescriptor: Map<unknown, ContainerDescriptor>,
    anchorInfos: AnchorInfo[],
    nextId: () => number,
    sourceText: string
  ): void {
    const traverse = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      const n = node as {
        range?: CST.Range;
        props?: CST.Range[];
        directives?: unknown[];
        contents?: unknown[];
        items?: unknown[];
        node?: unknown;
        resolved?: unknown;
      };

      if (Array.isArray(n.props)) {
        for (const p of n.props) {
          const ps = getCstStart(p);
          const pe = getCstEnd(p);
          const text = sourceText.slice(ps, pe);
          if (text.startsWith('&')) {
            const name = text.slice(1);
            const tokenRange = new vscode.Range(document.positionAt(ps), document.positionAt(pe));

            // Check if already in anchorInfos
            if (anchorInfos.some(a => a.name === name && a.tokenRange.isEqual(tokenRange))) {
              continue;
            }

            // Find target descriptor:
            // 1) Resolved AST node mapped in astToDescriptor?
            let target = n.resolved ? astToDescriptor.get(n.resolved) : undefined;
            if (!target) {
              // 2) Check if start collides with an existing container declaration
              const collides = allDescriptors.find(d =>
                !d.isOnDemandAnchor && d.totalRange.start.isEqual(tokenRange.start)
              );
              if (collides) {
                target = collides;
              } else {
                // 3) Create on-demand scalar anchor descriptor
                const nodeEnd = n.range ? getCstEnd(n.range) : pe;
                const totalRange = new vscode.Range(tokenRange.start, document.positionAt(nodeEnd));
                const bodyRange = new vscode.Range(tokenRange.end, document.positionAt(nodeEnd));

                target = {
                  id: nextId(),
                  astNode: (n.resolved as Scalar | YAMLMap | YAMLSeq) ?? null,
                  cstNode: n as CST.Node,
                  headingRange: tokenRange,
                  bodyRange,
                  totalRange,
                  definitionPosition: tokenRange.start,
                  displayKind: 'YAML scalar anchor',
                  symbolKindNumber: vscode.SymbolKind.Variable,
                  identityName: `anchor:${name}`,
                  path: null,
                  parent: null,
                  children: [],
                  isOnDemandAnchor: true,
                  isRootAnchor: false
                };
                allDescriptors.push(target);
                if (n.resolved) {
                  astToDescriptor.set(n.resolved, target);
                }
              }
            }

            anchorInfos.push({
              name,
              tokenRange,
              startOffset: ps,
              endOffset: pe,
              targetDescriptor: target
            });
          }
        }
      }

      if (Array.isArray(n.directives)) for (const d of n.directives) traverse(d);
      if (Array.isArray(n.contents)) for (const c of n.contents) traverse(c);
      if (Array.isArray(n.items)) for (const it of n.items) traverse(it);
      if (n.node) traverse(n.node);
    };

    for (const doc of cst) {
      traverse(doc);
    }
  }

  private createOutlineFile(document: vscode.TextDocument, snapshot: YamlDocumentSnapshot): Outline.File {
    const file = new Outline.File();
    file.language = 'yaml';
    file.uri = document.uri.toString();
    file.displayTextRange = new vscode.Range(0, 0, 0, 0);
    file.totalRange = null;
    file.sourceReference = {
      type: 'file',
      uri: document.uri.toString(),
      language: 'yaml',
      documentHash: snapshot.hash,
      symbol: null
    };

    const docStart = document.positionAt(0);
    const docEnd = document.positionAt(document.getText().length);
    file.parts = this.partitionInterval(
      document,
      new vscode.Range(docStart, docEnd),
      snapshot.rootContainers,
      snapshot.comments,
      snapshot
    );

    file.commentRanges = snapshot.comments.map(c => ({ range: c.range, kind: 'comment' as const }));
    return file;
  }

  private createOutlineSymbol(
    document: vscode.TextDocument,
    desc: ContainerDescriptor,
    snapshot: YamlDocumentSnapshot
  ): Outline.Symbol {
    const symbol = new Outline.Symbol();
    symbol.language = 'yaml';
    symbol.uri = document.uri.toString();
    symbol.displayTextRange = desc.headingRange;
    symbol.totalRange = desc.totalRange;
    symbol.definitionPosition = desc.definitionPosition;
    symbol.kind = desc.displayKind;
    symbol.declarationOnly = false;
    symbol.sourceReference = {
      type: 'symbol',
      uri: document.uri.toString(),
      language: 'yaml',
      documentHash: snapshot.hash,
      symbol: {
        name: desc.identityName,
        kind: desc.symbolKindNumber,
        path: desc.path ? [...desc.path] : null,
        selection: toSavedRange(desc.headingRange),
        declaration: toSavedRange(desc.totalRange)
      }
    };

    symbol.parts = this.partitionInterval(
      document,
      desc.bodyRange,
      desc.children,
      snapshot.comments,
      snapshot
    );

    // Attach comments intersecting symbol declaration
    symbol.commentRanges = this.filterIntersectingComments(desc.totalRange, snapshot.comments);
    return symbol;
  }

  private partitionInterval(
    document: vscode.TextDocument,
    interval: vscode.Range,
    directChildren: ContainerDescriptor[],
    allComments: CommentInfo[],
    snapshot: YamlDocumentSnapshot
  ): Array<Outline.OutlineRange | Outline.Text> {
    const parts: Array<Outline.OutlineRange | Outline.Text> = [];
    const intervalStart = interval.start;
    const intervalEnd = interval.end;

    // Filter and sort children
    const sortedChildren = [...directChildren].sort((a, b) => {
      if (a.totalRange.start.line !== b.totalRange.start.line) {
        return a.totalRange.start.line - b.totalRange.start.line;
      }
      return a.totalRange.start.character - b.totalRange.start.character;
    });

    // Validate ordering, containment, and non-overlapping
    for (let i = 0; i < sortedChildren.length; i++) {
      const child = sortedChildren[i];
      if (child.totalRange.start.isBefore(intervalStart) || intervalEnd.isBefore(child.totalRange.end)) {
        throw new Error('YAML source mapping failed: child container range is outside the parent interval');
      }
      if (i > 0) {
        const prev = sortedChildren[i - 1];
        if (prev.totalRange.start.isEqual(child.totalRange.start)) {
          throw new Error('YAML source mapping failed: child containers have identical starts');
        }
        if (child.totalRange.start.isBefore(prev.totalRange.end)) {
          throw new Error('YAML source mapping failed: child container ranges overlap or cross');
        }
      }
    }

    let cursor = intervalStart;

    for (const child of sortedChildren) {
      if (cursor.isBefore(child.totalRange.start)) {
        const gapRange = new vscode.Range(cursor, child.totalRange.start);
        const text = new Outline.Text();
        text.language = 'yaml';
        text.uri = document.uri.toString();
        text.displayTextRange = gapRange;
        text.commentRanges = this.filterIntersectingComments(gapRange, allComments);
        parts.push(text);
      }

      const childSymbol = this.createOutlineSymbol(document, child, snapshot);
      parts.push(childSymbol);
      cursor = child.totalRange.end;
    }

    if (cursor.isBefore(intervalEnd)) {
      const gapRange = new vscode.Range(cursor, intervalEnd);
      const text = new Outline.Text();
      text.language = 'yaml';
      text.uri = document.uri.toString();
      text.displayTextRange = gapRange;
      text.commentRanges = this.filterIntersectingComments(gapRange, allComments);
      parts.push(text);
    }

    return parts;
  }

  private filterIntersectingComments(range: vscode.Range, comments: CommentInfo[]): Outline.CommentRange[] {
    const result: Outline.CommentRange[] = [];
    for (const c of comments) {
      // Overlaps if not completely before and not completely after
      const cStart = c.range.start;
      const cEnd = c.range.end;
      const isBefore = cEnd.isBefore(range.start) || cEnd.isEqual(range.start);
      const isAfter = range.end.isBefore(cStart) || range.end.isEqual(cStart);
      if (!isBefore && !isAfter) {
        result.push({
          range: c.range,
          kind: 'comment'
        });
      }
    }
    return result;
  }
}
