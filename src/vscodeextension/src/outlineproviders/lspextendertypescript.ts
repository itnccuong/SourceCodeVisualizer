import * as vscode from 'vscode';
import type * as TypeScript from 'typescript-parser';
import type {LanguageSpecificSymbolInformation, SymbolExtractionContext} from '../outlineproviderAPI/lspextenderprovider';
import * as Outline from '../outlineproviderAPI/SymbolDefinition';
import {VpLspExtenderCurlyBraces} from './lspextender_curlyBraces';

interface ParsedTypeScriptDocument {
  version: number;
  language: string;
  fileName: string;
  tree: TypeScript.SourceFile;
  diagnostics: readonly TypeScript.Diagnostic[];
  declarationsByStart: Map<number, Declaration[]>;
  commentRanges?: readonly Outline.CommentRange[];
}

type Callable = TypeScript.FunctionExpression | TypeScript.ArrowFunction;
type Declaration = TypeScript.FunctionDeclaration | TypeScript.MethodDeclaration
  | TypeScript.MethodSignature | TypeScript.ConstructorDeclaration
  | TypeScript.GetAccessorDeclaration | TypeScript.SetAccessorDeclaration
  | TypeScript.CallSignatureDeclaration | TypeScript.ConstructSignatureDeclaration
  | TypeScript.IndexSignatureDeclaration | TypeScript.ClassStaticBlockDeclaration
  | TypeScript.VariableDeclaration | TypeScript.ParameterDeclaration | TypeScript.PropertyDeclaration
  | TypeScript.PropertySignature | TypeScript.PropertyAssignment
  | TypeScript.ShorthandPropertyAssignment | TypeScript.EnumMember
  | TypeScript.ClassDeclaration | TypeScript.ClassExpression | TypeScript.InterfaceDeclaration
  | TypeScript.EnumDeclaration | TypeScript.ModuleDeclaration | TypeScript.TypeAliasDeclaration
  | TypeScript.BinaryExpression | Callable;

interface SelectedTypeScriptDeclaration {
  parsed: ParsedTypeScriptDocument;
  declaration: Declaration;
  rangeDeclaration?: vscode.Range;
}

export class VpLspExtenderTypeScript extends VpLspExtenderCurlyBraces {
  private readonly documents = new WeakMap<vscode.TextDocument, ParsedTypeScriptDocument>();

  public constructor(language: 'typescript' | 'typescriptreact' | 'javascript') {
    super(language);
  }

  private wrappedExpression(ts: typeof TypeScript, node: TypeScript.Node): TypeScript.Expression | undefined {
    return ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
      || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node) ? node.expression : undefined;
  }

  private callableChain(ts: typeof TypeScript, declaration: Declaration): TypeScript.Expression[] {
    let value: TypeScript.Expression | undefined;
    if (ts.isBinaryExpression(declaration)) {
      value = declaration.right;
    } else if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)
        || ts.isPropertyAssignment(declaration)) {
      value = declaration.initializer;
    } else if (ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration)) {
      value = declaration;
    }
    const chain: TypeScript.Expression[] = [];
    while (value) {
      chain.push(value);
      if (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) { return chain; }
      value = this.wrappedExpression(ts, value);
    }
    return [];
  }

  private callable(ts: typeof TypeScript, declaration: Declaration): Callable | undefined {
    const chain = this.callableChain(ts, declaration);
    return chain.length ? chain[chain.length - 1] as Callable : undefined;
  }

  private expressionStatement(
    ts: typeof TypeScript, node: TypeScript.Expression
  ): TypeScript.ExpressionStatement | undefined {
    let expression = node;
    while (expression.parent && this.wrappedExpression(ts, expression.parent) === expression) {
      expression = expression.parent as TypeScript.Expression;
    }
    return expression.parent && ts.isExpressionStatement(expression.parent) ? expression.parent : undefined;
  }

  private isCallableAssignment(ts: typeof TypeScript, node: TypeScript.BinaryExpression): boolean {
    if (node.operatorToken.kind !== ts.SyntaxKind.EqualsToken
        || !(ts.isIdentifier(node.left) || ts.isPropertyAccessExpression(node.left)
          || ts.isElementAccessExpression(node.left)) || !this.callable(ts, node)) { return false; }
    return !!this.expressionStatement(ts, node);
  }

  private callableOwner(ts: typeof TypeScript, node: Callable): Declaration | undefined {
    let expression: TypeScript.Expression = node;
    while (expression.parent && this.wrappedExpression(ts, expression.parent) === expression) {
      expression = expression.parent as TypeScript.Expression;
    }
    const parent = expression.parent;
    if (!parent) { return undefined; }
    if ((ts.isVariableDeclaration(parent) || ts.isPropertyDeclaration(parent) || ts.isPropertyAssignment(parent))
        && parent.initializer === expression) { return parent; }
    return ts.isBinaryExpression(parent) && parent.right === expression && this.isCallableAssignment(ts, parent)
      ? parent : undefined;
  }

  private isDeclaration(ts: typeof TypeScript, node: TypeScript.Node): node is Declaration {
    return ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
      || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
      || ts.isCallSignatureDeclaration(node) || ts.isConstructSignatureDeclaration(node)
      || ts.isIndexSignatureDeclaration(node) || ts.isClassStaticBlockDeclaration(node)
      || ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isPropertyDeclaration(node)
      || ts.isPropertySignature(node) || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)
      || ts.isEnumMember(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)
      || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)
      || ts.isTypeAliasDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)
      || ts.isBinaryExpression(node) && this.isCallableAssignment(ts, node);
  }

  private names(ts: typeof TypeScript, declaration: Declaration): TypeScript.Node[] {
    const names: TypeScript.Node[] = [];
    const add = (name: TypeScript.DeclarationName) => {
      names.push(name);
      if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) { add(element.name); }
        }
      }
    };
    if ('name' in declaration && declaration.name) { add(declaration.name); }
    if (ts.isBinaryExpression(declaration)) {
      names.push(declaration.left);
      if (ts.isPropertyAccessExpression(declaration.left)) { names.push(declaration.left.name); }
      if (ts.isElementAccessExpression(declaration.left)) {
        const argument = declaration.left.argumentExpression;
        if (ts.isStringLiteral(argument) || ts.isNumericLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
          names.push(argument);
        }
      }
    }
    return names;
  }

  private keyword(ts: typeof TypeScript, declaration: Declaration, tree: TypeScript.SourceFile) {
    const kind = ts.isConstructorDeclaration(declaration) ? ts.SyntaxKind.ConstructorKeyword
      : ts.isClassStaticBlockDeclaration(declaration) ? ts.SyntaxKind.StaticKeyword : undefined;
    return kind === undefined ? undefined : declaration.getChildren(tree).find(child => child.kind === kind);
  }

  private variableStatement(ts: typeof TypeScript, declaration: Declaration): TypeScript.VariableStatement | undefined {
    return ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)
      && declaration.parent.declarations.length === 1 && ts.isVariableStatement(declaration.parent.parent)
      ? declaration.parent.parent : undefined;
  }

  private declarationRange(ts: typeof TypeScript, declaration: Declaration, tree: TypeScript.SourceFile) {
    const statement = this.variableStatement(ts, declaration)
      || (ts.isBinaryExpression(declaration) ? this.expressionStatement(ts, declaration) : undefined);
    return {start: (statement || declaration).getStart(tree), end: (statement || declaration).end};
  }

  private navigationOffset(ts: typeof TypeScript, callable: Callable, tree: TypeScript.SourceFile): number {
    // A single-parameter arrow starts at its parameter's binding. Its arrow token
    // is an unambiguous callable lookup point without stealing that binding.
    return ts.isArrowFunction(callable) ? callable.equalsGreaterThanToken.getStart(tree) : callable.getStart(tree);
  }

  private parseDocument(document: vscode.TextDocument, ts: typeof TypeScript): ParsedTypeScriptDocument {
    const cached = this.documents.get(document);
    if (cached && cached.version === document.version && cached.language === document.languageId
        && cached.fileName === document.fileName) { return cached; }
    const javascript = this.getLanguageStr() === 'javascript';
    const jsx = this.getLanguageStr() === 'typescriptreact';
    const scriptKind = javascript ? ts.ScriptKind.JS : jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const input = document.getText();
    const fileName = document.fileName;
    const tree = ts.createSourceFile(fileName, input, ts.ScriptTarget.Latest, true, scriptKind);
    const host: TypeScript.CompilerHost = {
      getSourceFile: name => name === fileName ? tree : undefined,
      getDefaultLibFileName: () => '', writeFile: () => {},
      getCurrentDirectory: () => '', getDirectories: () => [],
      fileExists: name => name === fileName,
      readFile: name => name === fileName ? input : undefined,
      getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n'
    };
    const program = ts.createProgram([fileName], {
      noResolve: true, noLib: true, noEmit: true, allowJs: javascript,
      target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext,
      ...(jsx ? {jsx: ts.JsxEmit.Preserve} : {})
    }, host);
    const parsed: ParsedTypeScriptDocument = {
      version: document.version, language: document.languageId, fileName, tree,
      diagnostics: program.getSyntacticDiagnostics(tree), declarationsByStart: new Map()
    };
    const index = (offset: number, declaration: Declaration) => {
      const entries = parsed.declarationsByStart.get(offset);
      if (!entries) { parsed.declarationsByStart.set(offset, [declaration]); }
      else if (!entries.includes(declaration)) { entries.push(declaration); }
    };
    const visit = (node: TypeScript.Node) => {
      if (this.isDeclaration(ts, node)) {
        const owned = (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) && this.callableOwner(ts, node);
        // Owned expressions are indexed through their owner. A named function
        // expression's internal binding still belongs to that expression.
        if (!owned) {
          index(node.getStart(tree), node);
          index(this.declarationRange(ts, node, tree).start, node);
          const keyword = this.keyword(ts, node, tree);
          if (keyword) { index(keyword.getStart(tree), node); }
          const chain = this.callableChain(ts, node);
          for (const expression of chain) { index(expression.getStart(tree), node); }
          const callable = this.callable(ts, node);
          if (callable) { index(this.navigationOffset(ts, callable, tree), node); }
        }
        for (const name of this.names(ts, node)) { index(name.getStart(tree), node); }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
    this.documents.set(document, parsed);
    return parsed;
  }

  private fail(document: vscode.TextDocument, symbol: vscode.DocumentSymbol, reason: string): never {
    throw new Error('Cannot determine declaration boundaries for "' + symbol.name + '". '
      + document.uri.toString() + ':' + (symbol.selectionRange.start.line + 1) + ':'
      + (symbol.selectionRange.start.character + 1) + ': ' + reason);
  }

  private validRange(document: vscode.TextDocument, range: vscode.Range): boolean {
    return [range.start, range.end].every(position =>
      document.positionAt(document.offsetAt(position)).isEqual(position));
  }

  private attributes(ts: typeof TypeScript, declaration: Declaration): readonly TypeScript.Node[] {
    const owner = ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)
      && ts.isVariableStatement(declaration.parent.parent) ? declaration.parent.parent : declaration;
    return [
      ...(ts.canHaveModifiers(owner) ? ts.getModifiers(owner) || [] : []),
      ...(ts.canHaveDecorators(owner) ? ts.getDecorators(owner) || [] : [])
    ].sort((a, b) => a.getStart() - b.getStart());
  }

  private mandatoryStart(ts: typeof TypeScript, declaration: Declaration, tree: TypeScript.SourceFile): number {
    const attributes = this.attributes(ts, declaration);
    if (!attributes.length || ts.isVariableDeclaration(declaration)) { return declaration.getStart(tree); }
    const after = attributes[attributes.length - 1].end;
    const token = declaration.getChildren(tree).find(child => child.getStart(tree) >= after);
    return token ? token.getStart(tree) : declaration.getStart(tree);
  }

  private checkDiagnostics(
    document: vscode.TextDocument, symbol: vscode.DocumentSymbol, parsed: ParsedTypeScriptDocument,
    declaration: Declaration, ts: typeof TypeScript
  ): void {
    const start = this.declarationRange(ts, declaration, parsed.tree).start;
    for (const diagnostic of parsed.diagnostics) {
      const at = diagnostic.start;
      const length = diagnostic.length || 0;
      const intersects = at === undefined || (length === 0
        ? at >= start && at <= declaration.end : at < declaration.end && at + length > start);
      if (intersects) {
        this.fail(document, symbol, ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
      }
    }
  }

  private matchDeclaration(
    document: vscode.TextDocument, symbol: vscode.DocumentSymbol, parsed: ParsedTypeScriptDocument,
    declaration: Declaration, ts: typeof TypeScript
  ): {rangeDeclaration?: vscode.Range; exact: boolean; rhs: boolean} | 'truncated' | undefined {
    const tree = parsed.tree;
    const start = document.offsetAt(symbol.range.start);
    const end = document.offsetAt(symbol.range.end);
    const selection = document.offsetAt(symbol.selectionRange.start);
    const selectionEnd = document.offsetAt(symbol.selectionRange.end);
    const exactSelection = (node: TypeScript.Node) =>
      selection === node.getStart(tree) && (selectionEnd === node.end || selectionEnd === selection);
    const exactRange = (node: TypeScript.Node) => start === node.getStart(tree) && end === node.end;
    const nodeStart = declaration.getStart(tree);
    const full = this.declarationRange(ts, declaration, tree);
    const names = this.names(ts, declaration);
    const namedSelection = names.some(exactSelection);
    const keyword = this.keyword(ts, declaration, tree);
    const chain = this.callableChain(ts, declaration);
    const owned = !(ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration));
    const rhsOnly = owned && chain.some(exactRange);
    const expressionSelection = chain.some(expression => exactSelection(expression) && selectionEnd === expression.end);
    const atStart = selection === nodeStart || selection === full.start;
    if (!(namedSelection || atStart || keyword && exactSelection(keyword)
        || rhsOnly && expressionSelection)) { return undefined; }
    if (!symbol.range.contains(symbol.selectionRange) && !(rhsOnly && namedSelection)) { return undefined; }
    const contained = this.mandatoryStart(ts, declaration, tree) >= start && declaration.end <= end;
    // Only exact binding/member/parameter names and owned RHS expressions may
    // expand. A provider that cut off an executable body cannot be repaired.
    const nameOnly = names.some(name => exactRange(name) && exactSelection(name))
      || !!keyword && exactRange(keyword) && exactSelection(keyword);
    if (!contained && !nameOnly && !rhsOnly) { return 'truncated'; }
    return {
      rangeDeclaration: !contained
        ? new vscode.Range(document.positionAt(full.start), document.positionAt(full.end)) : undefined,
      exact: start === full.start && end === full.end || start === nodeStart && end === declaration.end,
      rhs: rhsOnly
    };
  }

  private selectDeclaration(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    _context?: SymbolExtractionContext,
    requireCallable = false
  ): SelectedTypeScriptDeclaration | null {
    if (!this.validRange(document, docSymbol.range) || docSymbol.range.isEmpty
        || !this.validRange(document, docSymbol.selectionRange)) {
      return this.fail(document, docSymbol, 'invalid provider range');
    }
    // Keep the runtime compiler off the extension's activation path.
    const ts: typeof TypeScript = require('typescript-parser');
    const parsed = this.parseDocument(document, ts);
    const start = document.offsetAt(docSymbol.range.start);
    const selection = document.offsetAt(docSymbol.selectionRange.start);
    const matches: Array<SelectedTypeScriptDeclaration & {exact: boolean; rhs: boolean}> = [];
    const candidates = new Set([
      ...(parsed.declarationsByStart.get(selection) || []),
      ...(parsed.declarationsByStart.get(start) || [])
    ]);
    let truncated = false;
    for (const declaration of candidates) {
      if (requireCallable && (ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration)
          || !this.callable(ts, declaration))) { continue; }
      const match = this.matchDeclaration(document, docSymbol, parsed, declaration, ts);
      if (match === 'truncated') { truncated = true; }
      else if (match) { matches.push({parsed, declaration, ...match}); }
    }
    const exact = matches.filter(match => match.exact);
    const rhs = matches.filter(match => match.rhs);
    const preferred = exact.length ? exact : rhs.length ? rhs : matches;
    if (preferred.length > 1) { return this.fail(document, docSymbol, 'ambiguous declaration'); }
    if (!preferred.length) {
      if (requireCallable) { return null; }
      return this.fail(document, docSymbol, truncated ? 'truncated declaration' : 'no matching declaration');
    }
    const selected = preferred[0];
    this.checkDiagnostics(document, docSymbol, parsed, selected.declaration, ts);
    return selected;
  }

  public isDeclarationSymbol(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): boolean {
    if (![vscode.SymbolKind.Variable, vscode.SymbolKind.Constant, vscode.SymbolKind.Field,
      vscode.SymbolKind.Property].includes(symbol.kind)) { return false; }
    return !!this.selectDeclaration(document, symbol, context, true);
  }

  public getLanguageSpecificSymbolInformation(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): LanguageSpecificSymbolInformation {
    const selected = this.selectDeclaration(document, docSymbol, context);
    if (!selected) { return this.fail(document, docSymbol, 'no matching declaration'); }
    const ts: typeof TypeScript = require('typescript-parser');
    const {parsed, declaration, rangeDeclaration} = selected;
    const tree = parsed.tree;
    const start = document.offsetAt((rangeDeclaration || docSymbol.range).start);
    const end = document.offsetAt((rangeDeclaration || docSymbol.range).end);
    const declarationStart = declaration.getStart(tree);
    const source = (from: number, to: number) => tree.text.slice(from, to);
    const range = (from: number, to: number): vscode.Range => {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from < start || to > end || from > to) {
        return this.fail(document, docSymbol, 'truncated declaration');
      }
      return new vscode.Range(document.positionAt(from), document.positionAt(to));
    };
    const heading = (from: number, to: number) => {
      const text = source(from, to).replace(/;\s*$/, '').trimEnd();
      return range(from, from + text.length);
    };
    const bodyRange = (from: number, to: number) => {
      if (from > to) { return this.fail(document, docSymbol, 'truncated declaration'); }
      const text = source(from, to);
      const blankLines = text.match(/^(?:[\t ]*\r?\n)+/);
      const leading = blankLines ? blankLines[0].length : text.length - text.trimStart().length;
      const trailing = text.length - text.trimEnd().length;
      return leading + trailing >= text.length ? range(from, from) : range(from + leading, to - trailing);
    };
    const attributes: Outline.Attribute[] = [];
    for (const modifier of this.attributes(ts, declaration)) {
      const from = modifier.getStart(tree);
      if (from < start || modifier.end > end) { continue; }
      const attribute = new Outline.Attribute();
      attribute.kind = source(from, modifier.end);
      attribute.displayTextRange = range(from, modifier.end);
      attribute.language = document.languageId;
      attribute.uri = document.uri.toString();
      attributes.push(attribute);
    }
    const callable = this.callable(ts, declaration);
    let headStart = 'name' in declaration && declaration.name
      && !ts.isFunctionExpression(declaration) ? declaration.name.getStart(tree) : declarationStart;
    let rangeHead: vscode.Range;
    let rangeBody: vscode.Range | null = null;
    let declarationOnly = false;
    if (ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)
        || ts.isMethodSignature(declaration) || ts.isConstructorDeclaration(declaration)
        || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration)
        || ts.isCallSignatureDeclaration(declaration) || ts.isConstructSignatureDeclaration(declaration)
        || ts.isIndexSignatureDeclaration(declaration) || ts.isClassStaticBlockDeclaration(declaration)) {
      const keyword = this.keyword(ts, declaration, tree);
      if (keyword) { headStart = keyword.getStart(tree); }
      // Signatures have no body even if a neighboring overload has one.
      const body = 'body' in declaration ? declaration.body : undefined;
      if (body) {
        const opening = body.getFirstToken(tree);
        const closing = body.getLastToken(tree);
        if (!opening || !closing || opening.kind !== ts.SyntaxKind.OpenBraceToken
            || closing.kind !== ts.SyntaxKind.CloseBraceToken) {
          return this.fail(document, docSymbol, 'truncated declaration');
        }
        rangeHead = heading(headStart, opening.getStart(tree));
        rangeBody = bodyRange(opening.end, closing.getStart(tree));
      } else {
        rangeHead = heading(Math.max(headStart, start), declaration.end);
        declarationOnly = true;
      }
    } else if (callable) {
      const body = callable.body;
      const opening = body.getStart(tree);
      rangeHead = heading(headStart, opening);
      if (ts.isBlock(body)) {
        const closing = body.getLastToken(tree);
        if (!closing || closing.kind !== ts.SyntaxKind.CloseBraceToken) {
          return this.fail(document, docSymbol, 'truncated declaration');
        }
        rangeBody = bodyRange(opening + 1, closing.getStart(tree));
      } else {
        rangeBody = range(opening, body.end);
      }
    } else if (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)
        || ts.isPropertyDeclaration(declaration) || ts.isPropertyAssignment(declaration) || ts.isEnumMember(declaration)) {
      const value = declaration.initializer;
      if (ts.isParameter(declaration) && declaration.dotDotDotToken) {
        headStart = declaration.dotDotDotToken.getStart(tree);
      }
      rangeHead = heading(headStart, value ? value.getStart(tree) : declaration.end);
      if (value) { rangeBody = range(value.getStart(tree), value.end); }
    } else if (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration)
        || ts.isInterfaceDeclaration(declaration) || ts.isEnumDeclaration(declaration) || ts.isModuleDeclaration(declaration)) {
      let container: TypeScript.Node | undefined = declaration;
      while (container && ts.isModuleDeclaration(container)) { container = container.body; }
      if (!container) {
        rangeHead = heading(headStart, declaration.end);
      } else {
        const tokens = container.getChildren(tree);
        const opening = tokens.find(token => token.kind === ts.SyntaxKind.OpenBraceToken);
        const closing = tokens.find(token => token.kind === ts.SyntaxKind.CloseBraceToken);
        if (!opening || !closing) { return this.fail(document, docSymbol, 'truncated declaration'); }
        rangeHead = heading(headStart, opening.getStart(tree));
        rangeBody = bodyRange(opening.end, closing.getStart(tree));
      }
    } else {
      // Type aliases and valueless properties keep their no-value presentation.
      rangeHead = heading(Math.max(declarationStart, start), declaration.end);
    }
    let children: readonly vscode.DocumentSymbol[] | undefined;
    const owned = !(ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration));
    if (owned && callable) {
      const implementationRanges = this.callableChain(ts, declaration).map(expression =>
        new vscode.Range(document.positionAt(expression.getStart(tree)), document.positionAt(expression.end)));
      const wrappers = docSymbol.children.filter(child =>
        implementationRanges.some(implementationRange => implementationRange.isEqual(child.range)));
      if (wrappers.length > 1) { return this.fail(document, docSymbol, 'ambiguous declaration'); }
      if (wrappers.length) {
        const projected: vscode.DocumentSymbol[] = [];
        for (const child of docSymbol.children) {
          if (child === wrappers[0]) { projected.push(...child.children); }
          else { projected.push(child); }
        }
        children = projected;
      }
    }
    const definitionPosition = callable ? document.positionAt(
      ts.isFunctionExpression(declaration) && declaration.name && this.callableOwner(ts, declaration)
        ? declaration.name.getStart(tree) : this.navigationOffset(ts, callable, tree)) : undefined;
    const isCallable = !!callable || ts.isFunctionDeclaration(declaration) || ts.isMethodDeclaration(declaration)
      || ts.isMethodSignature(declaration) || ts.isConstructorDeclaration(declaration)
      || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration)
      || ts.isCallSignatureDeclaration(declaration) || ts.isConstructSignatureDeclaration(declaration)
      || ts.isIndexSignatureDeclaration(declaration);
    return {rangeHead, rangeBody, attributes, declarationOnly, rangeDeclaration, children, definitionPosition, isCallable};
  }

  private symbolKind(ts: typeof TypeScript, declaration: Declaration): vscode.SymbolKind {
    if (ts.isFunctionDeclaration(declaration) || ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration)) {
      return vscode.SymbolKind.Function;
    }
    if (ts.isConstructorDeclaration(declaration)) { return vscode.SymbolKind.Constructor; }
    if (ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration)
        || ts.isGetAccessorDeclaration(declaration) || ts.isSetAccessorDeclaration(declaration)
        || ts.isCallSignatureDeclaration(declaration) || ts.isConstructSignatureDeclaration(declaration)
        || ts.isIndexSignatureDeclaration(declaration)) { return vscode.SymbolKind.Method; }
    if (ts.isClassDeclaration(declaration) || ts.isClassExpression(declaration) || ts.isTypeAliasDeclaration(declaration)) {
      return vscode.SymbolKind.Class;
    }
    if (ts.isInterfaceDeclaration(declaration)) { return vscode.SymbolKind.Interface; }
    if (ts.isEnumDeclaration(declaration)) { return vscode.SymbolKind.Enum; }
    if (ts.isEnumMember(declaration)) { return vscode.SymbolKind.EnumMember; }
    if (ts.isModuleDeclaration(declaration) || ts.isClassStaticBlockDeclaration(declaration)) {
      return vscode.SymbolKind.Namespace;
    }
    if (ts.isPropertyDeclaration(declaration)) { return vscode.SymbolKind.Field; }
    if (ts.isPropertySignature(declaration) || ts.isPropertyAssignment(declaration)
        || ts.isShorthandPropertyAssignment(declaration)) { return vscode.SymbolKind.Property; }
    if (ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)
        && (declaration.parent.flags & (ts.NodeFlags.Const | ts.NodeFlags.Using)) !== 0) {
      return vscode.SymbolKind.Constant;
    }
    return vscode.SymbolKind.Variable;
  }

  private emitsDeclaration(ts: typeof TypeScript, declaration: Declaration): boolean {
    if (ts.isParameter(declaration) || ts.isEnumMember(declaration) || ts.isShorthandPropertyAssignment(declaration)) {
      return false;
    }
    if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)
        || ts.isPropertyAssignment(declaration) || ts.isPropertySignature(declaration)) {
      return !!this.callable(ts, declaration);
    }
    return !(ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration))
      || !this.callableOwner(ts, declaration);
  }

  public getDefinitionSymbol(
    document: vscode.TextDocument, position: vscode.Position, context?: SymbolExtractionContext
  ): vscode.DocumentSymbol | undefined {
    const offset = document.offsetAt(position);
    if (!document.positionAt(offset).isEqual(position)) { return undefined; }
    const ts: typeof TypeScript = require('typescript-parser');
    const parsed = this.parseDocument(document, ts);
    const tree = parsed.tree;
    const candidates = (parsed.declarationsByStart.get(offset) || []).filter(declaration => {
      if (!ts.isBinaryExpression(declaration) || ts.isIdentifier(declaration.left)
          || declaration.left.getStart(tree) !== offset) { return true; }
      // The receiver of a property assignment is a reference, not a binding.
      // Only an exact provider selection of the complete target certifies this
      // otherwise ambiguous declaration-start position.
      return (context?.ancestors || []).some(symbol => {
        if (!this.validRange(document, symbol.range) || symbol.range.isEmpty
            || !this.validRange(document, symbol.selectionRange)
            || document.offsetAt(symbol.selectionRange.start) !== offset
            || document.offsetAt(symbol.selectionRange.end) !== declaration.left.end) { return false; }
        const match = this.matchDeclaration(document, symbol, parsed, declaration, ts);
        return !!match && match !== 'truncated';
      });
    });
    // A binding wins over a callable-expression start at the same offset. Arrow
    // reopening uses the separate, indexed arrow-token lookup point.
    const bindings = candidates.filter(declaration => this.names(ts, declaration).some(name =>
      name.getStart(tree) === offset));
    const matches = bindings.length ? bindings : candidates;
    if (!matches.length) { return undefined; }
    if (matches.length > 1) {
      const ambiguous = new vscode.DocumentSymbol('<function>', '', vscode.SymbolKind.Function,
        new vscode.Range(position, position), new vscode.Range(position, position));
      return this.fail(document, ambiguous, 'ambiguous declaration');
    }
    const declaration = matches[0];
    const providers = new Map<Declaration, Array<{symbol: vscode.DocumentSymbol; rank: number}>>();
    const visited = new Set<vscode.DocumentSymbol>();
    const collectProviders = (symbol: vscode.DocumentSymbol) => {
      if (visited.has(symbol)) { return; }
      visited.add(symbol);
      // Match identities without extracting unrelated declarations or catching
      // their errors. Only the selected target is diagnostically validated.
      if (this.validRange(document, symbol.range) && !symbol.range.isEmpty
          && this.validRange(document, symbol.selectionRange)) {
        const candidates = new Set([
          ...(parsed.declarationsByStart.get(document.offsetAt(symbol.selectionRange.start)) || []),
          ...(parsed.declarationsByStart.get(document.offsetAt(symbol.range.start)) || [])
        ]);
        const matches: Array<{declaration: Declaration; exact: boolean; rhs: boolean; rank: number}> = [];
        for (const declaration of candidates) {
          const match = this.matchDeclaration(document, symbol, parsed, declaration, ts);
          if (match && match !== 'truncated') {
            matches.push({
              declaration, exact: match.exact, rhs: match.rhs,
              rank: match.exact ? 3 : !match.rangeDeclaration ? 2 : match.rhs ? 0 : 1
            });
          }
        }
        const exact = matches.filter(match => match.exact);
        const rhs = matches.filter(match => match.rhs);
        const preferred = exact.length ? exact : rhs.length ? rhs : matches;
        if (preferred.length === 1) {
          const match = preferred[0];
          const entries = providers.get(match.declaration) || [];
          entries.push({symbol, rank: match.rank});
          providers.set(match.declaration, entries);
        }
      }
      for (const child of symbol.children) { collectProviders(child); }
    };
    for (const ancestor of context?.ancestors || []) { collectProviders(ancestor); }
    const makeSymbol = (node: Declaration, selectedOffset?: number, reuseProvider = false): vscode.DocumentSymbol => {
      const names = this.names(ts, node);
      const bindingNames = names.filter(name => !(ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)));
      const named = bindingNames.find(name => name.getStart(tree) === selectedOffset)
        || (ts.isBinaryExpression(node) ? bindingNames[bindingNames.length - 1] : bindingNames[0]) || names[0];
      let entries = providers.get(node) || [];
      if ((ts.isVariableDeclaration(node) || ts.isParameter(node))
          && !ts.isIdentifier(node.name) && named) {
        // Distinct destructured leaves share one declaration, not one identity.
        entries = entries.filter(entry => document.offsetAt(entry.symbol.selectionRange.start) === named.getStart(tree)
          && document.offsetAt(entry.symbol.selectionRange.end) === named.end);
      }
      const rank = Math.max(...entries.map(entry => entry.rank));
      const existing = entries.filter(entry => entry.rank === rank);
      const provider = existing.length === 1 ? existing[0].symbol : undefined;
      if (provider && reuseProvider) {
        this.checkDiagnostics(document, provider, parsed, node, ts);
        return provider;
      }
      const keyword = this.keyword(ts, node, tree);
      const fallback = ts.isClassDeclaration(node) || ts.isClassExpression(node) ? '<class>'
        : ts.isConstructorDeclaration(node) ? 'constructor'
        : ts.isClassStaticBlockDeclaration(node) ? 'static'
        : ts.isCallSignatureDeclaration(node) ? '<call>'
        : ts.isConstructSignatureDeclaration(node) ? '<construct>'
        : ts.isIndexSignatureDeclaration(node) ? '<index>' : '<function>';
      const name = named ? named.getText(tree) : fallback;
      const full = this.declarationRange(ts, node, tree);
      const selectionNode = named || keyword || (ts.isFunctionExpression(node) || ts.isArrowFunction(node)
        || ts.isClassExpression(node) ? node : node.getFirstToken(tree) || node);
      // A synthetic parent must not reparent live provider children: that would
      // manufacture provider ancestry for a source reference whose path is null.
      // Copies retain exact provider identity but remain syntactic source nodes.
      const match = provider ? this.matchDeclaration(document, provider, parsed, node, ts) : undefined;
      const declarationRange = provider && match && match !== 'truncated'
        ? match.rangeDeclaration || provider.range
        : new vscode.Range(document.positionAt(full.start), document.positionAt(full.end));
      const symbol = new vscode.DocumentSymbol(provider?.name || name, provider?.detail || '',
        provider?.kind ?? this.symbolKind(ts, node), declarationRange,
        provider?.selectionRange || new vscode.Range(
          document.positionAt(selectionNode.getStart(tree)), document.positionAt(selectionNode.end)));
      if (existing.length > 1) { return this.fail(document, symbol, 'ambiguous declaration'); }
      const information = this.getLanguageSpecificSymbolInformation(document, symbol);
      if (information.rangeBody && !information.rangeBody.isEmpty) {
        const bodyStart = document.offsetAt(information.rangeBody.start);
        const bodyEnd = document.offsetAt(information.rangeBody.end);
        const children: vscode.DocumentSymbol[] = [];
        const visit = (child: TypeScript.Node) => {
          if (child.end <= bodyStart || child.getStart(tree) >= bodyEnd) { return; }
          if (this.isDeclaration(ts, child) && child.getStart(tree) >= bodyStart && child.end <= bodyEnd
              && this.emitsDeclaration(ts, child)) {
            children.push(makeSymbol(child));
            return;
          }
          ts.forEachChild(child, visit);
        };
        ts.forEachChild(node, visit);
        symbol.children = children;
      }
      return symbol;
    };
    return makeSymbol(declaration, offset, true);
  }

  public getCommentRanges(document: vscode.TextDocument): readonly Outline.CommentRange[] {
    const ts: typeof TypeScript = require('typescript-parser');
    const parsed = this.parseDocument(document, ts);
    if (parsed.commentRanges) { return parsed.commentRanges; }
    const sourceFile = parsed.tree;
    const code = sourceFile.text;
    const tokens: { start: number; end: number }[] = [];
    const collectTokens = (node: TypeScript.Node) => {
      if (ts.isJSDoc(node)) { return; }
      if (ts.isJsxText(node)) {
        tokens.push({start: node.pos, end: node.end});
        return;
      }
      const children = node.getChildren(sourceFile);
      if (!children.length) {
        const start = node.getStart(sourceFile);
        if (node.end > start) { tokens.push({start, end: node.end}); }
      } else {
        for (const child of children) { collectTokens(child); }
      }
    };
    collectTokens(sourceFile);
    tokens.sort((a, b) => a.start - b.start);
    const merged: { start: number; end: number }[] = [];
    for (const token of tokens) {
      const previous = merged[merged.length - 1];
      if (previous && token.start <= previous.end) { previous.end = Math.max(previous.end, token.end); }
      else { merged.push({start: token.start, end: token.end}); }
    }
    const gaps: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const token of merged) {
      if (token.start > cursor) { gaps.push({start: cursor, end: token.start}); }
      cursor = Math.max(cursor, token.end);
    }
    if (cursor < code.length) { gaps.push({start: cursor, end: code.length}); }
    const languageVariant = this.getLanguageStr() === 'typescriptreact'
      ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
    const ranges: Outline.CommentRange[] = [];
    for (const gap of gaps) {
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, languageVariant, code.slice(gap.start, gap.end));
      for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
        if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
          ranges.push({
            range: new vscode.Range(document.positionAt(gap.start + scanner.getTokenPos()),
              document.positionAt(gap.start + scanner.getTextPos())),
            kind: 'comment'
          });
        }
      }
    }
    ranges.sort((a, b) => a.range.start.compareTo(b.range.start));
    parsed.commentRanges = ranges;
    return ranges;
  }
}
