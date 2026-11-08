/**
 * Provides outlining information based on Language Service Providers
 *                                ( = no language specific code here )
 * The ultimate goal is to keep language specific code as small as possible for parsing
 **/

import * as Outline from '../SymbolDefinition';
import * as vscode from 'vscode'
import * as utils from '../../utils';
import type {DefinitionTarget, DefinitionTargetChooser, DefinitionOutlineResult} from '../outlineprovider';
import { SymbolExtractionContext, VpLspExtenderProvider } from '../lspextenderprovider';
import { DocumentSymbolX } from './documentsymbolx';
import {SavedRange, SymbolPathEntry, SourceReference, computeDocumentHash} from '../source_reference';

export class OutlineUtils {
  private static readonly symbolParents = new WeakMap<vscode.DocumentSymbol, vscode.DocumentSymbol>();
  private static readonly providerSymbols = new WeakSet<vscode.DocumentSymbol>();

  private static _getSymbolExtractionContext(symbol: vscode.DocumentSymbol): SymbolExtractionContext {
    const ancestors: vscode.DocumentSymbol[] = [];
    for (let parent = this.symbolParents.get(symbol); parent; parent = this.symbolParents.get(parent)) {
      ancestors.push(parent);
    }
    return {ancestors};
  }
  private static _commentRangesCache = new WeakMap<vscode.TextDocument, {
    version: number;
    ranges: readonly Outline.CommentRange[] | null;
    error?: string;
  }>();

  private static _getCommentClassification(document: vscode.TextDocument, provider: VpLspExtenderProvider): {
    version: number;
    ranges: readonly Outline.CommentRange[] | null;
    error?: string;
  } {
    const cached = this._commentRangesCache.get(document);
    if (cached && cached.version === document.version) {
      return cached;
    }
    if (typeof provider.getCommentRanges !== 'function') {
      const res = { version: document.version, ranges: null };
      this._commentRangesCache.set(document, res);
      return res;
    }
    try {
      const ranges = provider.getCommentRanges(document);
      const res = { version: document.version, ranges };
      this._commentRangesCache.set(document, res);
      return res;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const res = { version: document.version, ranges: [] as readonly Outline.CommentRange[], error: reason };
      this._commentRangesCache.set(document, res);
      return res;
    }
  }

  private static _attachCommentRanges(rangeOwner: Outline.OutlineRange, document: vscode.TextDocument, provider: VpLspExtenderProvider, targetRange: vscode.Range | null) {
    const classification = this._getCommentClassification(document, provider);
    if (classification.error) {
      rangeOwner.commentHidingError = classification.error;
    }
    if (classification.ranges === null) {
      return;
    }
    if (!targetRange) {
      rangeOwner.commentRanges = [];
      return;
    }
    const intersected: Outline.CommentRange[] = [];
    for (const c of classification.ranges) {
      const start = c.range.start.isAfter(targetRange.start) ? c.range.start : targetRange.start;
      const end = c.range.end.isBefore(targetRange.end) ? c.range.end : targetRange.end;
      if (start.isBefore(end)) {
        intersected.push({ range: new vscode.Range(start, end), kind: c.kind });
      }
    }
    rangeOwner.commentRanges = intersected;
  }



  /**
   * Calls "vscode.executeDefinitionProvider" and smoothens out the
   * return type (because "vscode.executeDefinitionProvider" itself has
   * 5 different return types
   **/
  public static async vscode_executeDefinitionProvider(uri: vscode.Uri, position: vscode.Position)
    : Promise<DefinitionTarget[]>
  {
    position = new vscode.Position(position.line, position.character);
    const result = await vscode.commands.executeCommand<vscode.Location | Array<vscode.Location | vscode.LocationLink>>(
      'vscode.executeDefinitionProvider', uri, position);
    const entries = result == null ? [] : Array.isArray(result) ? result : [result];
    const targets: DefinitionTarget[] = [];
    const seen = new Set<string>();
    for (const entry of entries) {
      const target: DefinitionTarget = 'targetUri' in entry
        ? {uri: entry.targetUri, range: entry.targetRange,
          selectionRange: entry.targetSelectionRange ?? entry.targetRange,
          originSelectionRange: entry.originSelectionRange}
        : {uri: entry.uri, range: entry.range, selectionRange: entry.range};
      const {start, end} = target.selectionRange;
      const key = JSON.stringify([target.uri.toString(), start.line, start.character, end.line, end.character]);
      if (!seen.has(key)) { seen.add(key); targets.push(target); }
    }
    return targets;
  }



  public static getDocumentSymbols(uri: vscode.Uri)
  {
    let documentSymbols = vscode.commands.executeCommand<vscode.DocumentSymbol[]> (
                            "vscode.executeDocumentSymbolProvider", uri);
    return documentSymbols;
  }



  public static async getDocumentSymbolsInRange (uri:   vscode.Uri,
                                          range: vscode.Range)
  {
    // setup
    const symbols = await OutlineUtils.getDocumentSymbols (uri);
    let symbolsInRange: vscode.DocumentSymbol[] = [];

    // run
    if(Array.isArray (symbols))
    {
      symbols.forEach (symbol =>
      {
        if (utils.check_rangeIntersect (range, symbol.range))
          symbolsInRange.push (symbol);
      });
    }

    // finish
    return symbolsInRange;
  }



  private static async _getFlatDocumentSymbols(uri: vscode.Uri)
  {
    const symbols = await OutlineUtils.getDocumentSymbols(uri);
    const flatSymbolList: vscode.DocumentSymbol[] = [];
    const visit = (symbol: vscode.DocumentSymbol, parent?: vscode.DocumentSymbol) => {
      if (parent) {
        this.symbolParents.set(symbol, parent);
      } else {
        this.symbolParents.delete(symbol);
      }
      this.providerSymbols.add(symbol);
      flatSymbolList.push(symbol);
      for (const child of symbol.children) { visit(child, symbol); }
    };
    if (Array.isArray(symbols)) {
      for (const symbol of symbols) { visit(symbol); }
    }
    return flatSymbolList;
  }



  public static async getDocumentSymbolAtPosition(uri: vscode.Uri, startPos: vscode.Position)
               : Promise<vscode.DocumentSymbol | null>
  {
    const symbols = await this._getFlatDocumentSymbols(uri);
    const document = await vscode.workspace.openTextDocument(uri);
    let selected: vscode.DocumentSymbol | null = null;
    let enclosing: vscode.DocumentSymbol | null = null;
    let selectedSize = Infinity;
    let enclosingSize = Infinity;
    for (const symbol of symbols) {
      for (const selection of [true, false]) {
        const range = selection ? symbol.selectionRange : symbol.range;
        if (range.start.isAfter(startPos) || !startPos.isBefore(range.end)) { continue; }
        const size = document.offsetAt(range.end) - document.offsetAt(range.start);
        if (selection && size < selectedSize) {
          selected = symbol;
          selectedSize = size;
        } else if (!selection && size < enclosingSize) {
          enclosing = symbol;
          enclosingSize = size;
        }
      }
    }
    return selected ?? enclosing;
  }



  public static async provideRangeOutline(provider: VpLspExtenderProvider,
                                          document: vscode.TextDocument,
                                          range:    vscode.Range | null)
               : Promise<Array<Outline.Symbol | Outline.Text>>
  {
    if(range == null){
      let idxLastLine = document.lineCount-1;
      range = utils.range_new (0, 0, idxLastLine, document.lineAt (idxLastLine).text.length-1);
    }
    let tmp = await provider.provideOutlineForRange (document, range);
    return tmp;
  }



  /**
   * Retrieve the ranges of the definition, that belogs to the
   *  function at location `uri::position`
   *
   * Returns:
   *  - null <=> Nothing found
   *  - Location with range around the whole block:
   *
   *  ▸function asdf(){
   *
   *  }◂
   *
   **/
  private static async _getDefinitionRanges(
                      provider: VpLspExtenderProvider,
                      uri:      vscode.Uri,
                      position: vscode.Position,
                      chooseTarget?: DefinitionTargetChooser)
                      : Promise<DefinitionOutlineResult>
  {
    // Messages from the webview contain structural positions, not API instances.
    position = new vscode.Position(position.line, position.character);
    // JavaScript assignment symbols can select the RHS callable rather than
    // their displayed receiver. An exact declaration selection is already the
    // destination; asking for its definition can redirect to the receiver local.
    if (provider.getLanguageStr() === 'javascript') {
      const symbols = await this._getFlatDocumentSymbols(uri);
      const document = await vscode.workspace.openTextDocument(uri);
      const candidates = symbols.filter(symbol => symbol.range.start.compareTo(position) <= 0
          && symbol.range.end.compareTo(position) > 0)
        .sort((a, b) => (document.offsetAt(a.range.end) - document.offsetAt(a.range.start))
          - (document.offsetAt(b.range.end) - document.offsetAt(b.range.start)));
      for (const declaration of candidates) {
        if (declaration.selectionRange.start.isEqual(position) || declaration.range.start.isEqual(position)) {
          return [this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(declaration, uri), provider)];
        }
        const information = provider.getLanguageSpecificSymbolInformation(
          document, declaration, this._getSymbolExtractionContext(declaration));
        if (information.definitionPosition?.isEqual(position)) {
          return [this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(declaration, uri), provider)];
        }
      }
    }
    const targets = await this.vscode_executeDefinitionProvider(uri, position);
    if (targets.length === 0) { return []; }
    let target = targets[0];
    if (targets.length > 1) {
      if (!chooseTarget) { throw new Error('Multiple definition targets require selection.'); }
      const selected = await chooseTarget(targets);
      if (!selected) { return null; }
      target = selected;
    }
    const origin = await vscode.workspace.openTextDocument(uri);
    const document = await vscode.workspace.openTextDocument(target.uri);
    if (document.languageId !== origin.languageId) {
      throw new Error('The resolved target uses an unsupported language for this navigation: ' + document.languageId + '.');
    }
    const root = target.selectionRange.isEmpty
      && target.selectionRange.start.line === 0 && target.selectionRange.start.character === 0;
    if (root) { return [await this.provideDocumentOutline(provider, document)]; }
    const symbols = await this._getFlatDocumentSymbols(target.uri);
    const exactRange = symbols.find(symbol => symbol.range.isEqual(target.range));
    if (!exactRange && target.range.isEqual(target.selectionRange)
        && target.range.isEqual(utils.document_getRange(document))) {
      return [await this.provideDocumentOutline(provider, document)];
    }
    let declaration = await this.getDocumentSymbolAtPosition(target.uri, target.selectionRange.start);
    const exactSelection = declaration && declaration.selectionRange.contains(target.selectionRange)
      && target.selectionRange.start.isBefore(declaration.selectionRange.end);
    if (exactRange) { declaration = exactRange; }
    if (provider.getLanguageStr() === 'python'
        && (!exactSelection && !exactRange || declaration
          && [vscode.SymbolKind.Variable, vscode.SymbolKind.Field, vscode.SymbolKind.Property,
              vscode.SymbolKind.Constant].includes(declaration.kind))) {
      const ancestors = declaration
        ? [declaration, ...this._getSymbolExtractionContext(declaration).ancestors] : [];
      const syntax = provider.getDefinitionSymbol?.(document, target.selectionRange.start, {ancestors});
      if (syntax && declaration && syntax !== declaration && declaration.range.contains(syntax.range)) {
        this.symbolParents.set(syntax, declaration);
      }
      declaration = syntax ?? (exactSelection || exactRange ? declaration : null);
    }
    if (!declaration) {
      throw new Error('No source declaration could be mapped at the resolved location.');
    }
    return [this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(declaration, target.uri), provider)];
  }






  /**
   *
   *
   **/
  private static _provideOutlineForRange(document: vscode.TextDocument,
                                        range: vscode.Range,
                                        documentSymbolsInRange: readonly vscode.DocumentSymbol[],
                                        provider: VpLspExtenderProvider,
                                        preserveSourceGaps = false)
    : Outline.OutlineRange[]
  {
    const children = documentSymbolsInRange.slice().sort((a, b) =>
      a.range.start.compareTo(b.range.start) || a.range.end.compareTo(b.range.end));
    const included: vscode.DocumentSymbol[] = [];
    let rawCursor = range.start;
    for (const child of children) {
      if (child.range.end.isBeforeOrEqual(range.start) || child.range.start.isAfterOrEqual(range.end)) {
        continue;
      }
      if ((child.kind === vscode.SymbolKind.Property
          || child.kind === vscode.SymbolKind.Field
          || child.kind === vscode.SymbolKind.Variable
          || child.kind === vscode.SymbolKind.Constant)
          && !provider.isDeclarationSymbol?.(document, child, this._getSymbolExtractionContext(child))) {
        continue;
      }
      if (child.kind === vscode.SymbolKind.String
          || child.kind === vscode.SymbolKind.Number
          || child.kind === vscode.SymbolKind.Boolean
          || child.kind === vscode.SymbolKind.Array
          || child.kind === vscode.SymbolKind.Object
          || child.kind === vscode.SymbolKind.Key
          || child.kind === vscode.SymbolKind.Null
          || child.kind === vscode.SymbolKind.EnumMember
          || child.kind === vscode.SymbolKind.Event
          || child.kind === vscode.SymbolKind.Operator
          || child.kind === vscode.SymbolKind.TypeParameter
          || child.kind === vscode.SymbolKind.Function && child.name.indexOf(") callback") > -1) {
        continue;
      }
      if (!range.contains(child.range) || child.range.start.isBefore(rawCursor)) {
        throw new Error('Overlapping or out-of-bounds declaration ranges cannot be displayed safely.');
      }
      included.push(child);
      rawCursor = child.range.end;
    }
    // Validate raw provider ranges before extraction can expand a displayed declaration.
    const outlines = included.map(child =>
      this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(child, document.uri), provider));
    outlines.sort((a, b) => a.totalRange!.start.compareTo(b.totalRange!.start)
      || a.totalRange!.end.compareTo(b.totalRange!.end));
    const parts: Outline.OutlineRange[] = [];
    let cursor = range.start;
    const addText = (end: vscode.Position) => {
      if (cursor.isEqual(end)) { return; }
      const text = new Outline.Text();
      text.language = provider.getLanguageStr();
      text.uri = document.uri.toString();
      text.displayTextRange = new vscode.Range(cursor, end);
      this._attachCommentRanges(text, document, provider, text.displayTextRange);
      if (preserveSourceGaps || this._shouldAddTextOutline(document, text)) { parts.push(text); }
    };
    for (const outline of outlines) {
      const childRange = outline.totalRange!;
      if (!range.contains(childRange) || childRange.start.isBefore(cursor)) {
        throw new Error('Overlapping or out-of-bounds declaration ranges cannot be displayed safely.');
      }
      addText(childRange.start);
      parts.push(outline);
      cursor = childRange.end;
    }
    addText(range.end);
    return parts;
  }



  public static async provideDocumentOutline(
                  provider: VpLspExtenderProvider,
                  document: vscode.TextDocument)
                : Promise <Outline.File>
  {
    // prepare return value
    let filesymbol: Outline.File = new Outline.File ();
    filesymbol.uri = document.uri.toString ();
    filesymbol.language = provider.getLanguageStr();
    filesymbol.displayTextRange = new vscode.Range(0, 0, 0, 0);
    filesymbol.sourceReference = {
      type: 'file',
      uri: filesymbol.uri,
      language: filesymbol.language,
      documentHash: '',
      symbol: null
    };
    this._attachCommentRanges(filesymbol, document, provider, utils.document_getRange(document));
    let documentSymbols = await this.getDocumentSymbols (document.uri);
    if (!documentSymbols) documentSymbols = [];

    filesymbol.parts = this._provideOutlineForRange (
                      document,
                      utils.document_getRange (document),
                      documentSymbols,
                      provider, true);

    return filesymbol;
  }



  public static async provideDefinitionOutline(
                  provider: VpLspExtenderProvider,
                  document: vscode.TextDocument,
                  position: vscode.Position,
                  chooseTarget?: DefinitionTargetChooser)
                : Promise<DefinitionOutlineResult>
  {
    return this._getDefinitionRanges(provider, document.uri, position, chooseTarget);
  }



  public static _getParentSymbolRecursive (parents: vscode.DocumentSymbol[],
                                           children: vscode.DocumentSymbol[],
                                           position: vscode.Position): any
  {
    for (let i=0; i<children.length; ++i)
    {
      let child = children[i];
      if (parents.length > 0) { this.symbolParents.set(child, parents[parents.length - 1]); }
      if (utils.range_contains (child.range, position))
      {
        parents.push (child);
        return this._getParentSymbolRecursive (parents, child.children, position);
      }
    }

    const levelsReturn = 2;
    if (parents.length < levelsReturn)
      return null;
    return parents[parents.length-levelsReturn];
  }



  public static async provideLocationDefiner(
    provider: VpLspExtenderProvider,
    document: vscode.TextDocument,
    position: vscode.Position)
  : Promise <Outline.OutlineRange[]>
  {
    let symbols = await this.getDocumentSymbols (document.uri);

    // no symbols? return whole file, because then it must be
    //             raw text
    if (!symbols)
      return [await this.provideDocumentOutline (provider, document)];

    let parent = this._getParentSymbolRecursive ([], symbols, position);

    // if no parent was set, the file itself is the parent
    if (!parent)
      return [await this.provideDocumentOutline (provider, document)];

    let parentX = new DocumentSymbolX (parent, document.uri);
    return [this.documentSymbol2outlineSymbol (document, parentX, provider)];
  }



  /**
   * Create a Outline.Symbol from a vscode.DocumentSymbol
   **/
  public static documentSymbol2outlineSymbol(document: vscode.TextDocument,
                                            docSymX: DocumentSymbolX,
                                            provider: VpLspExtenderProvider)
                                              : Outline.Symbol
  {
    let docSymbol = docSymX.documentSymbol;
    let uri = docSymX.uri;

    if (uri.toString () != document.uri.toString ())
      throw new Error ("Programming error: documentSymbol2outlineSymbol(): \n" +
                       "document uri and document symbol uri do not match");

    let symbol: Outline.Symbol = new Outline.Symbol ();

    symbol.language = provider.getLanguageStr ();
    symbol.kind = utils.vscodeSymbolKind2String (docSymbol.kind);
    symbol.uri = uri.toString ();

    for (const child of docSymbol.children) { this.symbolParents.set(child, docSymbol); }
    const information = provider.getLanguageSpecificSymbolInformation(
      document, docSymbol, this._getSymbolExtractionContext(docSymbol));
    const children = information.children ?? docSymbol.children;
    for (const child of children) { this.symbolParents.set(child, docSymbol); }
    symbol.totalRange = information.rangeDeclaration ?? docSymbol.range;
    symbol.displayTextRange = information.rangeHead;
    symbol.attributes = information.attributes;
    symbol.declarationOnly = information.declarationOnly;
    symbol.definitionPosition = information.definitionPosition;
    symbol.isCallable = information.isCallable !== undefined
      ? information.isCallable
      : (docSymbol.kind === vscode.SymbolKind.Function
        || docSymbol.kind === vscode.SymbolKind.Method
        || docSymbol.kind === vscode.SymbolKind.Constructor);
    this._attachCommentRanges(symbol, document, provider, symbol.displayTextRange);
    for (const attribute of symbol.attributes) {
      this._attachCommentRanges(attribute, document, provider, attribute.displayTextRange);
    }

    const toSavedRange = (r: vscode.Range): SavedRange => [
      { line: r.start.line, character: r.start.character },
      { line: r.end.line, character: r.end.character }
    ];

    let path: SymbolPathEntry[] | null = null;
    if (this.providerSymbols.has(docSymbol)) {
      const ancestry: SymbolPathEntry[] = [];
      let curr: vscode.DocumentSymbol | undefined = docSymbol;
      while (curr) {
        ancestry.unshift({ name: curr.name, kind: curr.kind });
        curr = this.symbolParents.get(curr);
      }
      path = ancestry;
    }

    symbol.sourceReference = {
      type: 'symbol',
      uri: symbol.uri,
      language: symbol.language,
      documentHash: '',
      symbol: {
        name: docSymbol.name,
        kind: docSymbol.kind,
        path,
        selection: toSavedRange(docSymbol.selectionRange),
        declaration: toSavedRange(symbol.totalRange ?? docSymbol.range)
      }
    };

    symbol.parts = information.rangeBody === null || information.rangeBody.isEmpty
      ? []
      : this._provideOutlineForRange(
          document, information.rangeBody, children, provider);

    return symbol;
  }



  /**
   * Decide whether or not a Text Outline is worth adding to the model.
   *  (e.g. completely empty passages might not be worth adding)
   **/
  private static _shouldAddTextOutline (document: vscode.TextDocument,
                                      textoutline: Outline.Text): boolean
  {
    if (!textoutline.displayTextRange) {
      return false;
    }

    let codeBlock = document.getText (textoutline.displayTextRange).replace ("\n", "");
    return (codeBlock.trim() != "");
  }

  public static async provideSavedOutline(
    document: vscode.TextDocument,
    reference: SourceReference,
    provider: VpLspExtenderProvider
  ): Promise<Outline.File | Outline.Symbol> {
    if (document.languageId !== reference.language) {
      throw new Error(`Language changed from ${reference.language} to ${document.languageId}`);
    }

    if (reference.type === 'file') {
      return this.provideDocumentOutline(provider, document);
    }

    const symRef = reference.symbol;
    if (!symRef) {
      throw new Error('Missing symbol reference');
    }

    const currentHash = computeDocumentHash(document.getText());
    const hashUnchanged = (currentHash === reference.documentHash);
    const flatSymbols = await this._getFlatDocumentSymbols(document.uri);

    const matchesAncestry = (sym: vscode.DocumentSymbol, targetPath: SymbolPathEntry[] | null): boolean => {
      if (!targetPath) return false;
      const ancestry: SymbolPathEntry[] = [];
      let curr: vscode.DocumentSymbol | undefined = sym;
      while (curr) {
        ancestry.unshift({ name: curr.name, kind: curr.kind });
        curr = this.symbolParents.get(curr);
      }
      if (ancestry.length !== targetPath.length) return false;
      return ancestry.every((entry, i) => entry.name === targetPath[i].name && entry.kind === targetPath[i].kind);
    };

    if (hashUnchanged) {
      for (const sym of flatSymbols) {
        if (
          sym.name === symRef.name &&
          sym.kind === symRef.kind &&
          sym.selectionRange.start.line === symRef.selection[0].line &&
          sym.selectionRange.start.character === symRef.selection[0].character &&
          sym.selectionRange.end.line === symRef.selection[1].line &&
          sym.selectionRange.end.character === symRef.selection[1].character
        ) {
          if (symRef.path && !matchesAncestry(sym, symRef.path)) {
            continue;
          }
          const outline = this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(sym, document.uri), provider);
          const decl = outline.totalRange ?? sym.range;
          if (
            decl.start.line === symRef.declaration[0].line &&
            decl.start.character === symRef.declaration[0].character &&
            decl.end.line === symRef.declaration[1].line &&
            decl.end.character === symRef.declaration[1].character
          ) {
            return outline;
          }
        }
      }

      if (symRef.path === null && typeof provider.getDefinitionSymbol === 'function') {
        const pos = new vscode.Position(symRef.selection[0].line, symRef.selection[0].character);
        const enclosing = flatSymbols.filter(s => s.range.contains(pos));
        const syntaxSym = provider.getDefinitionSymbol(document, pos, { ancestors: enclosing });
        if (syntaxSym && syntaxSym.name === symRef.name && syntaxSym.kind === symRef.kind) {
          const outline = this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(syntaxSym, document.uri), provider);
          const decl = outline.totalRange ?? syntaxSym.range;
          if (
            decl.start.line === symRef.declaration[0].line &&
            decl.start.character === symRef.declaration[0].character &&
            decl.end.line === symRef.declaration[1].line &&
            decl.end.character === symRef.declaration[1].character
          ) {
            return outline;
          }
        }
      }

      throw new Error(`Declaration "${symRef.name}" could not be resolved at saved coordinates`);
    }

    if (!symRef.path || symRef.path.length === 0) {
      throw new Error(`Cannot locate declaration "${symRef.name}": document modified and symbol has no ancestry path`);
    }

    const candidates = flatSymbols.filter(sym => matchesAncestry(sym, symRef.path));
    if (candidates.length === 0) {
      throw new Error(`Symbol "${symRef.name}" not found in modified document`);
    }
    if (candidates.length > 1) {
      throw new Error(`Ambiguous symbol: multiple declarations match ancestry path for "${symRef.name}"`);
    }

    return this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(candidates[0], document.uri), provider);
  }

}