/**
 * Provides outlining information based on Language Service Providers
 *                                ( = no language specific code here )
 * The ultimate goal is to keep language specific code as small as possible for parsing
 **/

import * as Outline from '../SymbolDefinition';
import * as vscode from 'vscode'
import * as utils from '../../utils';
import { VpOutlineProvider } from '../outlineprovider';
import { VpLspExtenderProvider } from '../lspextenderprovider';
import { DocumentSymbolX } from './documentsymbolx';

export class OutlineUtils {
  private static readonly symbolParents = new WeakMap<vscode.DocumentSymbol, vscode.DocumentSymbol>();


  /**
   * Calls "vscode.executeDefinitionProvider" and smoothens out the
   * return type (because "vscode.executeDefinitionProvider" itself has
   * 5 different return types
   **/
  public static async vscode_executeDefinitionProvider (uri: vscode.Uri, position: vscode.Position)
  : Promise <vscode.Location[]>
  {
    let result = await vscode.commands.executeCommand (
      "vscode.executeDefinitionProvider", uri, position);

    if (undefined == result || null == result)
      return [];

    if (result instanceof vscode.Location)
      return [result];

    if (Array.isArray(result))
    {
      if (0 == result.length)
        return result;

      let elem = result[0];
      if (elem instanceof vscode.Location)
      {
        return result;
      }
      // vscode does not understand the type vscode.LocationLink
      // even though, that's the one returned to us, so we try
      //  to catch it by this else case here
      else
      {
        let locArray = this.convert_LocationLinkArray_to_LocationArray (result);
        return locArray;
      }
    }

    return [];
  }


  private static convert_LocationLinkArray_to_LocationArray (locationLinkArray: vscode.LocationLink[])
    : vscode.Location[]
  {
    let ret: vscode.Location[] = [];
    for (let i = 0; i < locationLinkArray.length; ++i)
    {
      let e = locationLinkArray[i];
      const range = e.targetSelectionRange ?? e.targetRange;

      let loc = new vscode.Location (e.targetUri, range);
      ret.push (loc);
    }
    return ret;
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
                      position: vscode.Position)
                      : Promise<null | DocumentSymbolX[]>
  {
    // NOTE: keep `provider` in interface, in case we find out,
    //       that we need it for this processing here!

    let locations = await this.vscode_executeDefinitionProvider (uri, position);

    let documentSymbolLocations: DocumentSymbolX[] = []
    for (let i = 0; i<locations.length; ++i)
    {
      let location = locations[i];
      let uri = location.uri;
      let docSym = await this.getDocumentSymbolAtPosition (uri, location.range.start);
      if (null == docSym)
        continue;

      let docSymX = new DocumentSymbolX (docSym, uri);
      documentSymbolLocations.push (docSymX);
    }
    return documentSymbolLocations;
  }



  /**
   * @param definitionLocation: always surrounds only one single symbol and
   *         nothing else
   **/
  private static async _provideSymbolDefinitionOutline (
                document: vscode.TextDocument,
                documentSymbolX: DocumentSymbolX,
                provider: VpLspExtenderProvider)
                : Promise<Outline.Symbol | null>
  {
    // Outline that range (Result: one outlined symbol)

    let filepath = documentSymbolX.uri.toString ()
    let symbol: Outline.Symbol
        = this.documentSymbol2outlineSymbol (document, documentSymbolX, provider);

    symbol.uri = filepath ;

    return symbol;
  }



  /**
   *
   *
   **/
  private static _provideOutlineForRange(document: vscode.TextDocument,
                                        range: vscode.Range,
                                        documentSymbolsInRange: vscode.DocumentSymbol[],
                                        provider: VpLspExtenderProvider)
    : Outline.OutlineRange[]
  {
    const children = documentSymbolsInRange.slice().sort((a, b) =>
      a.range.start.compareTo(b.range.start) || a.range.end.compareTo(b.range.end));
    const parts: Outline.OutlineRange[] = [];
    let cursor = range.start;
    const addText = (end: vscode.Position) => {
      if (cursor.isEqual(end)) { return; }
      const text = new Outline.Text();
      text.language = provider.getLanguageStr();
      text.uri = document.uri.toString();
      text.displayTextRange = new vscode.Range(cursor, end);
      if (this._shouldAddTextOutline(document, text)) { parts.push(text); }
    };
    for (const child of children) {
      // These symbols remain ordinary source, as in the generic adapter.
      if (child.kind === vscode.SymbolKind.Property
          || child.kind === vscode.SymbolKind.Field
          || child.kind === vscode.SymbolKind.Variable
          || child.kind === vscode.SymbolKind.Constant
          || child.kind === vscode.SymbolKind.String
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
      if (child.range.end.isBeforeOrEqual(range.start) || child.range.start.isAfterOrEqual(range.end)) {
        continue;
      }
      if (!range.contains(child.range) || child.range.start.isBefore(cursor)) {
        throw new Error('Overlapping or out-of-bounds declaration ranges cannot be displayed safely.');
      }
      addText(child.range.start);
      parts.push(this.documentSymbol2outlineSymbol(document, new DocumentSymbolX(child, document.uri), provider));
      cursor = child.range.end;
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

    let documentSymbols = await this.getDocumentSymbols (document.uri);
    if (!documentSymbols) documentSymbols = [];

    filesymbol.parts = this._provideOutlineForRange (
                      document,
                      utils.document_getRange (document),
                      documentSymbols,
                      provider);

    return filesymbol;
  }



  public static async provideDefinitionOutline(
                  provider: VpLspExtenderProvider,
                  document: vscode.TextDocument,
                  position: vscode.Position)
                : Promise<Outline.Symbol[]>
  {
    let symbols: Outline.Symbol[] = [];

    // let LSP provide range of possible functions
    let docSymbolXArr: null | DocumentSymbolX[];
    docSymbolXArr  = await OutlineUtils._getDefinitionRanges (provider, document.uri, position);



    // 2) Outline all found definitions
    if (docSymbolXArr)
    {
      // array.forEach-function does not work here! It would cause symbols to be empty
      for (let i=0; i<docSymbolXArr.length; ++i){
        let docSymX: DocumentSymbolX = docSymbolXArr[i];
        let document = await vscode.workspace.openTextDocument (docSymX.uri);
        if (!document)
          throw new Error ("The following document could not be opened:\n" + docSymX.uri);

        let symbol = await this._provideSymbolDefinitionOutline(document, docSymX, provider);
        if (symbol)
          symbols.push (symbol);
      }
    }

    return symbols;
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
    const ancestors: vscode.DocumentSymbol[] = [];
    for (let parent = this.symbolParents.get(docSymbol); parent; parent = this.symbolParents.get(parent)) {
      ancestors.push(parent);
    }
    const information = provider.getLanguageSpecificSymbolInformation(document, docSymbol, {ancestors});
    symbol.totalRange = information.rangeDeclaration ?? docSymbol.range;
    symbol.displayTextRange = information.rangeHead;
    symbol.attributes = information.attributes;
    symbol.declarationOnly = information.declarationOnly;
    symbol.parts = information.rangeBody === null || information.rangeBody.isEmpty
      ? []
      : this._provideOutlineForRange(
          document, information.rangeBody, docSymbol.children, provider);

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

}