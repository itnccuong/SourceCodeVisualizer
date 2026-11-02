import * as vscode from 'vscode';
import type * as TypeScript from 'typescript';
import type {LanguageSpecificSymbolInformation, SymbolExtractionContext} from '../outlineproviderAPI/lspextenderprovider';
import * as Outline from '../outlineproviderAPI/SymbolDefinition';
import {VpLspExtenderCurlyBraces} from './lspextender_curlyBraces';

interface ParsedTypeScriptDeclaration {
  version: number;
  language: string;
  start: number;
  end: number;
  text: string;
  tree: TypeScript.SourceFile;
  prefixLength: number;
  diagnostics: readonly TypeScript.Diagnostic[];
}

type Declaration = TypeScript.FunctionDeclaration | TypeScript.MethodDeclaration
  | TypeScript.MethodSignature | TypeScript.ConstructorDeclaration
  | TypeScript.GetAccessorDeclaration | TypeScript.SetAccessorDeclaration
  | TypeScript.VariableDeclaration | TypeScript.PropertyDeclaration
  | TypeScript.PropertySignature | TypeScript.PropertyAssignment
  | TypeScript.ShorthandPropertyAssignment | TypeScript.EnumMember
  | TypeScript.ClassDeclaration | TypeScript.InterfaceDeclaration
  | TypeScript.EnumDeclaration | TypeScript.ModuleDeclaration | TypeScript.TypeAliasDeclaration;

export class VpLspExtenderTypeScript extends VpLspExtenderCurlyBraces {
  private readonly declarations = new WeakMap<vscode.TextDocument, ParsedTypeScriptDeclaration>();

  public constructor(language: 'typescript' | 'typescriptreact') {
    super(language);
  }

  public getLanguageSpecificSymbolInformation(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): LanguageSpecificSymbolInformation {
    const fail = (): never => {
      throw new Error('Cannot determine declaration boundaries for "' + docSymbol.name + '".');
    };
    const validRange = (range: vscode.Range) => {
      for (const position of [range.start, range.end]) {
        if (!document.positionAt(document.offsetAt(position)).isEqual(position)) { return false; }
      }
      return !range.isEmpty;
    };
    if (!validRange(docSymbol.range) || !docSymbol.range.contains(docSymbol.selectionRange)
        || !document.positionAt(document.offsetAt(docSymbol.selectionRange.start)).isEqual(docSymbol.selectionRange.start)
        || !document.positionAt(document.offsetAt(docSymbol.selectionRange.end)).isEqual(docSymbol.selectionRange.end)) {
      return fail();
    }
    // Type-only imports keep the compiler off the extension activation path.
    const ts: typeof TypeScript = require('typescript');
    const start = document.offsetAt(docSymbol.range.start);
    const end = document.offsetAt(docSymbol.range.end);
    const selectionOffset = document.offsetAt(docSymbol.selectionRange.start);
    const parse = (symbol: vscode.DocumentSymbol, ancestors: readonly vscode.DocumentSymbol[]) => {
      const text = document.getText(symbol.range);
      const jsx = document.languageId === 'typescriptreact';
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, true,
        jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard, text);
      const first = scanner.scan();
      const topLevel = first === ts.SyntaxKind.ConstKeyword || first === ts.SyntaxKind.LetKeyword
        || first === ts.SyntaxKind.VarKeyword || first === ts.SyntaxKind.FunctionKeyword
        || first === ts.SyntaxKind.ClassKeyword || first === ts.SyntaxKind.InterfaceKeyword
        || first === ts.SyntaxKind.EnumKeyword || first === ts.SyntaxKind.NamespaceKeyword
        || first === ts.SyntaxKind.ModuleKeyword || first === ts.SyntaxKind.TypeKeyword
        || first === ts.SyntaxKind.ExportKeyword || first === ts.SyntaxKind.DeclareKeyword;
      const parent = ancestors[0];
      const classProperty = parent && (parent.kind === vscode.SymbolKind.Class || parent.kind === vscode.SymbolKind.Interface);
      let prefix = '';
      let suffix = '';
      if (!topLevel) {
        if (symbol.kind === vscode.SymbolKind.EnumMember) {
          prefix = 'enum __RangeScope {\n'; suffix = '\n}';
        } else if (symbol.kind === vscode.SymbolKind.Method || symbol.kind === vscode.SymbolKind.Constructor
            || symbol.kind === vscode.SymbolKind.Field || symbol.kind === vscode.SymbolKind.Property && classProperty
            || first === ts.SyntaxKind.GetKeyword || first === ts.SyntaxKind.SetKeyword
            || first === ts.SyntaxKind.ConstructorKeyword) {
          prefix = 'class __RangeScope {\n'; suffix = '\n}';
        } else if (symbol.kind === vscode.SymbolKind.Variable || symbol.kind === vscode.SymbolKind.Constant
            || symbol.kind === vscode.SymbolKind.Function && first !== ts.SyntaxKind.AsyncKeyword) {
          prefix = 'const ';
        } else if (symbol.kind === vscode.SymbolKind.Property) {
          // A colon can introduce an object value or a class/interface type.
          return null;
        }
      }
      const input = prefix + text + suffix;
      const fileName = jsx ? '__range.tsx' : '__range.ts';
      const tree = ts.createSourceFile(fileName, input, ts.ScriptTarget.Latest, true,
        jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const host: TypeScript.CompilerHost = {
        getSourceFile: name => name === fileName ? tree : undefined,
        getDefaultLibFileName: () => '', writeFile: () => {},
        getCurrentDirectory: () => '', getDirectories: () => [],
        fileExists: name => name === fileName,
        readFile: name => name === fileName ? input : undefined,
        getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n'
      };
      const program = ts.createProgram([fileName], {noResolve: true, noLib: true}, host);
      const result: ParsedTypeScriptDeclaration = {
        version: document.version, language: document.languageId,
        start: document.offsetAt(symbol.range.start), end: document.offsetAt(symbol.range.end), text,
        tree, prefixLength: prefix.length, diagnostics: program.getSyntacticDiagnostics(tree)
      };
      this.declarations.set(document, result);
      return result;
    };
    let parsed = this.declarations.get(document);
    if (!parsed || parsed.version !== document.version || parsed.language !== document.languageId
        || parsed.start > start || parsed.end < end) {
      parsed = parse(docSymbol, context?.ancestors || []) || undefined;
      if (!parsed) {
        const ancestors = context?.ancestors || [];
        for (let i = 0; i < ancestors.length; ++i) {
          const ancestor = ancestors[i];
          if (!validRange(ancestor.range) || !ancestor.range.contains(docSymbol.range)
              || ancestor.range.isEqual(docSymbol.range)) { continue; }
          parsed = parse(ancestor, ancestors.slice(i + 1)) || undefined;
          if (parsed) { break; }
        }
      }
    }
    if (!parsed) { return fail(); }
    const fragment = parsed;
    const tree = fragment.tree;
    const selection = selectionOffset - fragment.start + fragment.prefixLength;
    const toDocument = (offset: number) => fragment.start + offset - fragment.prefixLength;
    const isDeclaration = (node: TypeScript.Node): node is Declaration =>
      ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
      || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
      || ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)
      || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isEnumMember(node)
      || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)
      || ts.isModuleDeclaration(node) || ts.isTypeAliasDeclaration(node);
    const nameContains = (name: TypeScript.DeclarationName): boolean => {
      if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        return name.elements.some(element => ts.isBindingElement(element) && nameContains(element.name));
      }
      if (ts.isComputedPropertyName(name)) { return selection === name.getStart(tree); }
      return name.getStart(tree) <= selection && selection < name.end;
    };
    const matches: Declaration[] = [];
    const visit = (node: TypeScript.Node) => {
      if (node.pos > selection || node.end < selection) { return; }
      if (isDeclaration(node)) {
        const nodeStart = node.getStart(tree);
        let matchesSelection = selection === nodeStart;
        if ('name' in node && node.name) {
          matchesSelection = matchesSelection || nameContains(node.name);
        }
        if (ts.isConstructorDeclaration(node)) {
          matchesSelection = matchesSelection || node.getChildren(tree).some(token =>
            token.kind === ts.SyntaxKind.ConstructorKeyword && token.getStart(tree) <= selection && selection < token.end);
        }
        if (ts.isVariableDeclaration(node) && ts.isVariableDeclarationList(node.parent)
            && node.parent.declarations.length === 1 && ts.isVariableStatement(node.parent.parent)) {
          matchesSelection = matchesSelection || selection === node.parent.parent.getStart(tree);
        }
        if (matchesSelection && toDocument(nodeStart) >= start && toDocument(node.end) <= end) {
          matches.push(node);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    if (matches.length !== 1) { return fail(); }
    const declaration = matches[0];
    const declarationStart = declaration.getStart(tree);
    const fragmentEnd = fragment.prefixLength + fragment.text.trimEnd().length;
    for (const diagnostic of fragment.diagnostics) {
      if (diagnostic.start === undefined) { return fail(); }
      const errorEnd = diagnostic.start + (diagnostic.length || 0);
      if (diagnostic.start <= declaration.end && errorEnd >= declarationStart
          || declaration.end >= fragmentEnd && diagnostic.start >= fragmentEnd) {
        return fail();
      }
    }
    const source = (from: number, to: number) => tree.text.slice(from, to);
    const range = (from: number, to: number): vscode.Range => {
      const a = toDocument(from);
      const b = toDocument(to);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < start || b > end || a > b) { return fail(); }
      return new vscode.Range(document.positionAt(a), document.positionAt(b));
    };
    const heading = (from: number, to: number) => {
      const text = source(from, to).replace(/;\s*$/, '').trimEnd();
      return range(from, from + text.length);
    };
    const bodyRange = (from: number, to: number) => {
      if (from > to) { return fail(); }
      const text = source(from, to);
      const blankLines = text.match(/^(?:[\t ]*\r?\n)+/);
      const leading = blankLines ? blankLines[0].length : text.length - text.trimStart().length;
      const trailing = text.length - text.trimEnd().length;
      // Whitespace-only block interiors are empty bodies, not absent bodies.
      if (leading + trailing >= text.length) { return range(from, from); }
      return range(from + leading, to - trailing);
    };
    const attributes: Outline.Attribute[] = [];
    const modifiers = declaration.modifiers || (ts.isVariableDeclaration(declaration)
      && ts.isVariableStatement(declaration.parent.parent) ? declaration.parent.parent.modifiers : undefined);
    if (modifiers) {
      for (const modifier of modifiers) {
        const from = modifier.getStart(tree);
        if (toDocument(from) < start || toDocument(modifier.end) > end) { continue; }
        const attribute = new Outline.Attribute();
        attribute.kind = source(from, modifier.end);
        attribute.displayTextRange = range(from, modifier.end);
        attribute.language = document.languageId;
        attribute.uri = document.uri.toString();
        attributes.push(attribute);
      }
    }
    let headStart = 'name' in declaration && declaration.name
      ? declaration.name.getStart(tree) : declarationStart;
    let rangeHead: vscode.Range;
    let rangeBody: vscode.Range | null = null;
    let declarationOnly = false;
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)
        || ts.isMethodSignature(declaration) || ts.isConstructorDeclaration(declaration)
        || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration)) {
      if (ts.isConstructorDeclaration(declaration)) {
        const keyword = declaration.getChildren(tree).find(t => t.kind === ts.SyntaxKind.ConstructorKeyword);
        if (!keyword) { return fail(); }
        headStart = keyword.getStart(tree);
      }
      const body = 'body' in declaration ? declaration.body : undefined;
      if (body) {
        const opening = body.getStart(tree);
        rangeHead = heading(headStart, opening);
        rangeBody = bodyRange(opening + 1, body.end - 1);
      } else {
        rangeHead = heading(headStart, declaration.end);
        declarationOnly = true;
      }
    } else if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)
        || ts.isPropertyAssignment(declaration) || ts.isEnumMember(declaration)) {
      const value = declaration.initializer;
      if (!value) {
        rangeHead = heading(headStart, declaration.end);
      } else if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        const body = value.body;
        const opening = body.getStart(tree);
        rangeHead = heading(headStart, opening);
        rangeBody = ts.isBlock(body) ? bodyRange(opening + 1, body.end - 1) : range(opening, body.end);
      } else {
        rangeHead = heading(headStart, value.getStart(tree));
        rangeBody = range(value.getStart(tree), value.end);
      }
    } else if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)
        || ts.isEnumDeclaration(declaration) || ts.isModuleDeclaration(declaration)) {
      const container = ts.isModuleDeclaration(declaration) ? declaration.body : declaration;
      if (!container) { return fail(); }
      const tokens = container.getChildren(tree);
      const opening = tokens.find(t => t.kind === ts.SyntaxKind.OpenBraceToken);
      const closing = tokens.find(t => t.kind === ts.SyntaxKind.CloseBraceToken);
      if (!opening || !closing) { return fail(); }
      rangeHead = heading(headStart, opening.getStart(tree));
      rangeBody = bodyRange(opening.end, closing.getStart(tree));
    } else {
      // Type aliases and valueless fields are headings, not bodyless methods.
      rangeHead = heading(declarationStart, declaration.end);
    }
    return {rangeHead, rangeBody, attributes, declarationOnly};
  }
}
