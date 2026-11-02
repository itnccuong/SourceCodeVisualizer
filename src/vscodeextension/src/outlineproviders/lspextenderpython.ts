import * as vscode from 'vscode';
import {LanguageSpecificSymbolInformation, SymbolExtractionContext, VpLspExtenderProvider} from '../outlineproviderAPI/lspextenderprovider';
import * as Outline from '../outlineproviderAPI/SymbolDefinition';
import {OutlineUtils} from '../outlineproviderAPI/utils/outlineutils';
import type {SyntaxNode, Tree} from '@lezer/common';
import type * as Python from '@lezer/python';

interface ParsedPythonDeclaration {
  version: number;
  language: string;
  start: number;
  end: number;
  text: string;
  tree: Tree;
  prefixLength: number;
}


export class VpLspExtenderPython
implements VpLspExtenderProvider
{
  private readonly declarations = new WeakMap<vscode.TextDocument, ParsedPythonDeclaration>();

  private parseDeclaration(document: vscode.TextDocument, range: vscode.Range): ParsedPythonDeclaration {
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    const cached = this.declarations.get(document);
    if (cached && cached.version === document.version && cached.language === document.languageId
        && cached.start <= start && cached.end >= end) {
      return cached;
    }
    const text = document.getText(range);
    const before = document.lineAt(range.start.line).text.slice(0, range.start.character);
    const indentation = /^[\t ]*$/.test(before) ? before : "";
    const prefix = /^[\t ]+/.test(indentation + text) ? "if True:\n" + indentation : "";
    const parser: typeof Python.parser = require('@lezer/python').parser;
    const parsed = {
      version: document.version, language: document.languageId, start, end, text,
      tree: parser.parse(prefix + text), prefixLength: prefix.length
    };
    this.declarations.set(document, parsed);
    return parsed;
  }

  private resolveVariableRange(document: vscode.TextDocument, symbol: vscode.DocumentSymbol,
                               context?: SymbolExtractionContext): vscode.Range {
    const selection = document.offsetAt(symbol.selectionRange.start);
    const assignmentAt = (fragment: ParsedPythonDeclaration): SyntaxNode | null => {
      const offset = selection - fragment.start + fragment.prefixLength;
      let node: SyntaxNode | null = fragment.tree.resolveInner(offset, 1);
      while (node && node.name !== "AssignStatement" && node.name !== "UpdateStatement"
             && node.name !== "TypeDefinition") { node = node.parent; }
      return node;
    };
    // Missing tokens at the fragment's end may be completed by another line.
    const syntaxState = (node: SyntaxNode, fragmentEnd: number): "valid" | "incomplete" | "invalid" => {
      let state: "valid" | "incomplete" | "invalid" = "valid";
      const visit = (child: SyntaxNode) => {
        if (child.type.isError) {
          state = child.from === fragmentEnd && child.to === fragmentEnd ? "incomplete" : "invalid";
        }
        for (let next = child.firstChild; next && state !== "invalid"; next = next.nextSibling) { visit(next); }
      };
      visit(node);
      return state;
    };
    const rangeOf = (fragment: ParsedPythonDeclaration, node: SyntaxNode) => {
      const start = fragment.start + node.from - fragment.prefixLength;
      let end = fragment.start + node.to - fragment.prefixLength;
      end -= fragment.text.slice(node.from - fragment.prefixLength,
        node.to - fragment.prefixLength).match(/\s*$/)![0].length;
      if (start < fragment.start || end > fragment.end || start > selection
          || end < document.offsetAt(symbol.range.end)) {
        throw new Error('Cannot determine declaration boundaries for "' + symbol.name + '".');
      }
      return new vscode.Range(document.positionAt(start), document.positionAt(end));
    };
    // A parent already parsed by traversal contains the original target context.
    let fragment = this.declarations.get(document);
    if (fragment && fragment.version === document.version && fragment.language === document.languageId
        && fragment.start <= selection && fragment.end >= document.offsetAt(symbol.range.end)) {
      const node = assignmentAt(fragment);
      if (node && syntaxState(node, fragment.prefixLength + fragment.text.length) === "valid") {
        return rangeOf(fragment, node);
      }
    }
    for (const ancestor of context?.ancestors ?? []) {
      if (!ancestor.range.contains(symbol.range) || ancestor.range.isEqual(symbol.range)) { continue; }
      fragment = this.parseDeclaration(document, ancestor.range);
      const node = assignmentAt(fragment);
      if (node && syntaxState(node, fragment.prefixLength + fragment.text.length) === "valid") {
        return rangeOf(fragment, node);
      }
    }
    const firstLine = symbol.range.start.line;
    let lineCount = 1;
    for (;;) {
      const lastLine = Math.min(document.lineCount - 1, firstLine + lineCount - 1);
      fragment = this.parseDeclaration(document,
        new vscode.Range(new vscode.Position(firstLine, 0), document.lineAt(lastLine).rangeIncludingLineBreak.end));
      const node = assignmentAt(fragment);
      if (!node) { break; }
      const state = syntaxState(node, fragment.prefixLength + fragment.text.length);
      if (state === "valid") { return rangeOf(fragment, node); }
      if (lastLine === document.lineCount - 1 || state !== "incomplete") { break; }
      lineCount *= 2;
    }
    throw new Error('Cannot determine declaration boundaries for "' + symbol.name + '".');
  }

  public getLanguageStr(): string{
    return "python";
  }

  public isDefinition(doc:      vscode.TextDocument,
                      position: vscode.Position): boolean
  {
    return false;
  }


  public getLanguageSpecificSymbolInformation(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): LanguageSpecificSymbolInformation {
    const fail = (): never => {
      throw new Error('Cannot determine declaration boundaries for "' + docSymbol.name + '".');
    };
    for (const position of [docSymbol.range.start, docSymbol.range.end,
                            docSymbol.selectionRange.start, docSymbol.selectionRange.end]) {
      if (!document.positionAt(document.offsetAt(position)).isEqual(position)) {
        fail();
      }
    }
    if (!docSymbol.range.contains(docSymbol.selectionRange) || docSymbol.range.isEmpty) {
      fail();
    }
    const isVariable = [vscode.SymbolKind.Variable, vscode.SymbolKind.Constant,
      vscode.SymbolKind.Field, vscode.SymbolKind.Property].includes(docSymbol.kind);
    const nameOnly = isVariable && docSymbol.range.isEqual(docSymbol.selectionRange)
      && document.getText(docSymbol.range) === docSymbol.name;
    const declarationRange = nameOnly
      ? this.resolveVariableRange(document, docSymbol, context) : docSymbol.range;
    const start = document.offsetAt(declarationRange.start);
    const end = document.offsetAt(declarationRange.end);
    const fragment = this.parseDeclaration(document, declarationRange);
    const toDocument = (offset: number) => fragment.start + offset - fragment.prefixLength;
    const source = (from: number, to: number) =>
      fragment.text.slice(from - fragment.prefixLength, to - fragment.prefixLength);
    const trimEnd = (from: number, to: number) => to - source(from, to).match(/\s*$/)![0].length;
    const selection = document.offsetAt(docSymbol.selectionRange.start)
      - fragment.start + fragment.prefixLength;
    const contains = (node: SyntaxNode) => node.from <= selection && selection < node.to;
    const targetContains = (node: SyntaxNode): boolean => {
      if (!contains(node) || node.name === "TypeDef") {
        return false;
      }
      if (node.name === "VariableName" || node.name === "PropertyName") {
        return true;
      }
      if (node.name === "MemberExpression") {
        // Index expressions are references, not declared targets.
        return node.firstChild !== null && targetContains(node.firstChild)
          || node.getChildren("PropertyName").some(contains);
      }
      if (node.name === "TupleExpression" || node.name === "ArrayExpression"
          || node.name === "ParenthesizedExpression") {
        for (let child = node.firstChild; child; child = child.nextSibling) {
          if (targetContains(child)) { return true; }
        }
      }
      return false;
    };
    const matches: SyntaxNode[] = [];
    const visit = (node: SyntaxNode) => {
      const decorated = node.parent?.name === "DecoratedStatement" ? node.parent : node;
      if (decorated.from > selection || node.to < selection) { return; }
      const isFunction = node.name === "FunctionDefinition" || node.name === "ClassDefinition";
      const isAssignment = node.name === "AssignStatement" || node.name === "UpdateStatement";
      if (isFunction || isAssignment || node.name === "TypeDefinition") {
        let matchesSelection = selection === node.from || selection === decorated.from;
        if (isFunction || node.name === "TypeDefinition") {
          const name = node.getChild("VariableName");
          matchesSelection = matchesSelection || name !== null && contains(name);
        } else {
          let finalOperator: SyntaxNode | null = null;
          for (let child = node.firstChild; child; child = child.nextSibling) {
            if (child.name === "AssignOp" || child.name === "UpdateOp") { finalOperator = child; }
          }
          for (let child = node.firstChild; child && child !== finalOperator; child = child.nextSibling) {
            if (targetContains(child)) { matchesSelection = true; }
          }
        }
        if (matchesSelection && toDocument(node.from) >= start
            && toDocument(trimEnd(node.from, node.to)) <= end) {
          matches.push(node);
        }
      }
      for (let child = node.firstChild; child; child = child.nextSibling) { visit(child); }
    };
    visit(fragment.tree.topNode);
    if (matches.length !== 1) { fail(); }
    const declaration = matches[0];
    const selected = declaration.parent?.name === "DecoratedStatement" ? declaration.parent : declaration;
    const checkErrors = (node: SyntaxNode) => {
      if (node.to < selected.from || node.from > selected.to) { return; }
      if (node.type.isError) { fail(); }
      for (let child = node.firstChild; child; child = child.nextSibling) { checkErrors(child); }
    };
    checkErrors(fragment.tree.topNode);
    const range = (from: number, to: number): vscode.Range => {
      const a = toDocument(from);
      const b = toDocument(to);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < start || b > end || a > b) {
        return fail();
      }
      return new vscode.Range(document.positionAt(a), document.positionAt(b));
    };
    const attributes: Outline.Attribute[] = [];
    const addAttribute = (node: SyntaxNode) => {
      if (toDocument(node.from) < start || toDocument(node.to) > end) { return; }
      const attribute = new Outline.Attribute();
      const attributeEnd = trimEnd(node.from, node.to);
      attribute.kind = source(node.from, attributeEnd);
      attribute.displayTextRange = range(node.from, attributeEnd);
      attribute.language = document.languageId;
      attribute.uri = document.uri.toString();
      attributes.push(attribute);
    };
    if (selected !== declaration) {
      selected.getChildren("Decorator").forEach(addAttribute);
    }
    const asyncKeyword = declaration.getChild("async");
    if (asyncKeyword) { addAttribute(asyncKeyword); }

    let rangeHead: vscode.Range;
    let rangeBody: vscode.Range | null = null;
    if (declaration.name === "FunctionDefinition" || declaration.name === "ClassDefinition") {
      const name = declaration.getChild("VariableName");
      const body = declaration.getChild("Body");
      const colon = body?.getChild(":");
      if (!name || !body || !colon) { return fail(); }
      rangeHead = range(name.from, trimEnd(name.from, colon.from));
      const bodyEnd = end - fragment.start + fragment.prefixLength;
      let bodyStart = colon.to;
      // Drop blank edge lines, but retain indentation on the first source line.
      const blankLines = source(bodyStart, bodyEnd).match(/^(?:[\t ]*\r?\n)+/);
      if (blankLines) { bodyStart += blankLines[0].length; }
      const trimmedEnd = trimEnd(bodyStart, bodyEnd);
      rangeBody = range(bodyStart, Math.max(bodyStart, trimmedEnd));
    } else {
      let operator: SyntaxNode | null = null;
      if (declaration.name !== "TypeDefinition") {
        for (let child = declaration.firstChild; child; child = child.nextSibling) {
          if (child.name === "AssignOp" || child.name === "UpdateOp") { operator = child; }
        }
      }
      if (operator) {
        const value = operator.nextSibling;
        if (!value) { return fail(); }
        rangeHead = range(declaration.from, operator.to);
        rangeBody = range(value.from, trimEnd(value.from, declaration.to));
      } else {
        rangeHead = range(declaration.from, trimEnd(declaration.from, declaration.to));
      }
    }
    return {rangeHead, rangeBody, attributes, declarationOnly: false,
      rangeDeclaration: nameOnly ? declarationRange : undefined};
  }


  public async provideOutlineForRange(document: vscode.TextDocument,
                                      symbolRange: vscode.Range)
   : Promise<Array<Outline.Symbol | Outline.Text>>
  {
    let ret:any = [];
    let symbolsInRange = OutlineUtils.getDocumentSymbolsInRange (document.uri, symbolRange);

    throw new Error ("outlines for ranges are not yet implemented");
    return ret;
  }


}