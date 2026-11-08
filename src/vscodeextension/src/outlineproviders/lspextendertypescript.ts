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
  | TypeScript.EnumDeclaration | TypeScript.ModuleDeclaration | TypeScript.TypeAliasDeclaration
  | TypeScript.BinaryExpression | TypeScript.FunctionExpression | TypeScript.ArrowFunction;

interface SelectedTypeScriptDeclaration {
  fragment: ParsedTypeScriptDeclaration;
  declaration: Declaration;
  rangeDeclaration?: vscode.Range;
}

export class VpLspExtenderTypeScript extends VpLspExtenderCurlyBraces {
  private readonly declarations = new WeakMap<vscode.TextDocument, ParsedTypeScriptDeclaration>();
  private readonly commentRangesCache = new WeakMap<vscode.TextDocument, { version: number; ranges: readonly Outline.CommentRange[] }>();
  public constructor(language: 'typescript' | 'typescriptreact' | 'javascript') {
    super(language);
  }

  private callable(ts: typeof TypeScript, declaration: Declaration, javascript: boolean) {
    let value: TypeScript.Expression | undefined;
    if (ts.isBinaryExpression(declaration)) {
      value = declaration.right;
    } else if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)
        || ts.isPropertyAssignment(declaration) || ts.isEnumMember(declaration)) {
      value = declaration.initializer;
    } else if (ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration)) {
      value = declaration;
    }
    if (javascript) {
      while (value && ts.isParenthesizedExpression(value)) { value = value.expression; }
    }
    return value && (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) ? value : undefined;
  }

  private parseDeclaration(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    ancestors: readonly vscode.DocumentSymbol[],
    ts: typeof TypeScript,
    rawJavaScript: boolean
  ): ParsedTypeScriptDeclaration | null {
    const text = document.getText(symbol.range);
    const jsx = document.languageId === 'typescriptreact';
    const javascript = this.getLanguageStr() === 'javascript';
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
    if (!rawJavaScript && !topLevel) {
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
        return null;
      }
    }
    const fileName = javascript ? '__range.js' : jsx ? '__range.tsx' : '__range.ts';
    const scriptKind = javascript ? ts.ScriptKind.JS : jsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    let input = prefix + text + suffix;
    let tree = ts.createSourceFile(fileName, input, ts.ScriptTarget.Latest, true, scriptKind);
    if (rawJavaScript && tree.statements.some(statement =>
      ts.isFunctionDeclaration(statement) && (!statement.name || !statement.name.text))) {
      // An anonymous function is an expression, not an invalid named declaration.
      prefix = '('; suffix = ')';
      input = prefix + text + suffix;
      tree = ts.createSourceFile(fileName, input, ts.ScriptTarget.Latest, true, scriptKind);
    }
    const host: TypeScript.CompilerHost = {
      getSourceFile: name => name === fileName ? tree : undefined,
      getDefaultLibFileName: () => '', writeFile: () => {},
      getCurrentDirectory: () => '', getDirectories: () => [],
      fileExists: name => name === fileName,
      readFile: name => name === fileName ? input : undefined,
      getCanonicalFileName: name => name, useCaseSensitiveFileNames: () => true,
      getNewLine: () => '\n'
    };
    const program = ts.createProgram([fileName], {noResolve: true, noLib: true, allowJs: javascript}, host);
    const result: ParsedTypeScriptDeclaration = {
      version: document.version, language: document.languageId,
      start: document.offsetAt(symbol.range.start), end: document.offsetAt(symbol.range.end), text,
      tree, prefixLength: prefix.length, diagnostics: program.getSyntacticDiagnostics(tree)
    };
    this.declarations.set(document, result);
    return result;
  }

  private selectDeclaration(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext,
    requireCallable = false
  ): SelectedTypeScriptDeclaration | null {
    const fail = (): never => {
      throw new Error('Cannot determine declaration boundaries for "' + docSymbol.name + '".');
    };
    const validRange = (range: vscode.Range) => [range.start, range.end].every(position =>
      document.positionAt(document.offsetAt(position)).isEqual(position));
    const javascript = this.getLanguageStr() === 'javascript';
    if (!validRange(docSymbol.range) || docSymbol.range.isEmpty || !validRange(docSymbol.selectionRange)
        || !javascript && !docSymbol.range.contains(docSymbol.selectionRange)) { return fail(); }
    // Type-only imports keep the compiler off the extension activation path.
    const ts: typeof TypeScript = require('typescript');
    const start = document.offsetAt(docSymbol.range.start);
    const end = document.offsetAt(docSymbol.range.end);
    const selectionStart = document.offsetAt(docSymbol.selectionRange.start);
    const selectionEnd = document.offsetAt(docSymbol.selectionRange.end);
    const select = (fragment: ParsedTypeScriptDeclaration): SelectedTypeScriptDeclaration | null => {
      const tree = fragment.tree;
      const selection = selectionStart - fragment.start + fragment.prefixLength;
      const selectionTo = selectionEnd - fragment.start + fragment.prefixLength;
      const toDocument = (offset: number) => fragment.start + offset - fragment.prefixLength;
      const exactRange = (node: TypeScript.Node, from: number, to: number) =>
        toDocument(node.getStart(tree)) === from && toDocument(node.end) === to;
      const exactSelection = (node: TypeScript.Node) =>
        selection === node.getStart(tree) && (selectionTo === node.end || selectionTo === selection);
      const targetMatches = (target: TypeScript.Node): boolean => {
        if (exactSelection(target)) { return true; }
        return ts.isPropertyAccessExpression(target) && exactSelection(target.name)
          || ts.isElementAccessExpression(target) && !!target.argumentExpression && exactSelection(target.argumentExpression);
      };
      const nameContains = (name: TypeScript.DeclarationName): boolean => {
        if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
          return name.elements.some(element => ts.isBindingElement(element) && nameContains(element.name));
        }
        if (javascript) { return exactSelection(name); }
        if (ts.isComputedPropertyName(name)) { return selection === name.getStart(tree); }
        return name.getStart(tree) <= selection && selection < name.end;
      };
      const callableChain = (node: Declaration): TypeScript.Expression[] => {
        let value: TypeScript.Expression | undefined;
        if (ts.isBinaryExpression(node)) { value = node.right; }
        else if (ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)
            || ts.isPropertyAssignment(node) || ts.isEnumMember(node)) { value = node.initializer; }
        else if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) { value = node; }
        const chain: TypeScript.Expression[] = [];
        while (value) {
          chain.push(value);
          if (!ts.isParenthesizedExpression(value)) { break; }
          value = value.expression;
        }
        return value && (ts.isFunctionExpression(value) || ts.isArrowFunction(value)) ? chain : [];
      };
      const ownsCallable = (node: TypeScript.FunctionExpression | TypeScript.ArrowFunction) => {
        let expression: TypeScript.Expression = node;
        while (ts.isParenthesizedExpression(expression.parent)) { expression = expression.parent; }
        const parent = expression.parent;
        return ts.isVariableDeclaration(parent) && parent.initializer === expression
          || ts.isPropertyDeclaration(parent) && parent.initializer === expression
          || ts.isPropertyAssignment(parent) && parent.initializer === expression
          || ts.isBinaryExpression(parent) && parent.right === expression
            && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken;
      };
      const matches: SelectedTypeScriptDeclaration[] = [];
      const visit = (node: TypeScript.Node) => {
        const ordinary = ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isMethodSignature(node)
          || ts.isConstructorDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)
          || ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)
          || ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node) || ts.isEnumMember(node)
          || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isEnumDeclaration(node)
          || ts.isModuleDeclaration(node) || ts.isTypeAliasDeclaration(node);
        let assignment = false;
        if (javascript && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
            && (ts.isIdentifier(node.left) || ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))) {
          let expression: TypeScript.Expression = node;
          while (ts.isParenthesizedExpression(expression.parent)) { expression = expression.parent; }
          assignment = ts.isExpressionStatement(expression.parent) && !!this.callable(ts, node, true);
        }
        const anonymous = javascript && (ts.isFunctionExpression(node) || ts.isArrowFunction(node))
          && !ownsCallable(node);
        if (ordinary || assignment || anonymous) {
          const declaration = node as Declaration;
          const nodeStart = node.getStart(tree);
          let matchesSelection = selection === nodeStart;
          let certifiedTarget = false;
          if ('name' in declaration && declaration.name) {
            certifiedTarget = nameContains(declaration.name);
            matchesSelection = matchesSelection || certifiedTarget;
          }
          if (assignment && ts.isBinaryExpression(declaration)) {
            certifiedTarget = targetMatches(declaration.left);
            matchesSelection = matchesSelection || certifiedTarget;
          }
          if (ts.isConstructorDeclaration(declaration)) {
            matchesSelection = matchesSelection || declaration.getChildren(tree).some(token =>
              token.kind === ts.SyntaxKind.ConstructorKeyword && token.getStart(tree) <= selection && selection < token.end);
          }
          if (ts.isVariableDeclaration(declaration) && ts.isVariableDeclarationList(declaration.parent)
              && declaration.parent.declarations.length === 1 && ts.isVariableStatement(declaration.parent.parent)) {
            matchesSelection = matchesSelection || selection === declaration.parent.parent.getStart(tree);
          }
          const chain = javascript ? callableChain(declaration) : [];
          const rhsOnly = chain.some(value => exactRange(value, start, end));
          const selectedCallable = chain.some(value => exactSelection(value)
            && selectionTo === value.end);
          matchesSelection = matchesSelection || rhsOnly && selectedCallable;
          const contained = toDocument(nodeStart) >= start && toDocument(node.end) <= end;
          // Expanding a provider RHS requires the exact initializer node in real ancestor syntax.
          const expanded = rhsOnly && !contained && (fragment.start < start || fragment.end > end);
          const externalSelection = !docSymbol.range.contains(docSymbol.selectionRange);
          if (matchesSelection && (contained || expanded)
              && (!externalSelection || expanded && certifiedTarget)) {
            const rangeDeclaration = expanded
              ? new vscode.Range(document.positionAt(toDocument(nodeStart)), document.positionAt(toDocument(node.end)))
              : undefined;
            matches.push({fragment, declaration, rangeDeclaration});
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(tree);
      if (matches.length > 1) { return fail(); }
      if (!matches.length) { return null; }
      const selected = matches[0];
      if (requireCallable && !this.callable(ts, selected.declaration, javascript)) { return null; }
      const declarationStart = selected.declaration.getStart(tree);
      const fragmentEnd = fragment.prefixLength + fragment.text.trimEnd().length;
      for (const diagnostic of fragment.diagnostics) {
        if (diagnostic.start === undefined) { return fail(); }
        const errorEnd = diagnostic.start + (diagnostic.length || 0);
        if (diagnostic.start <= selected.declaration.end && errorEnd >= declarationStart
            || selected.declaration.end >= fragmentEnd && diagnostic.start >= fragmentEnd) { return fail(); }
      }
      return selected;
    };
    const cached = this.declarations.get(document);
    const reusable = cached && cached.version === document.version && cached.language === document.languageId
      && cached.start <= start && cached.end >= end;
    if (cached && reusable) {
      const selected = select(cached);
      if (selected || !javascript) { return selected; }
    }
    const ancestors = context?.ancestors || [];
    const fromAncestors = () => {
      for (let i = 0; i < ancestors.length; ++i) {
        const ancestor = ancestors[i];
        if (!validRange(ancestor.range) || ancestor.range.isEmpty || !ancestor.range.contains(docSymbol.range)
            || ancestor.range.isEqual(docSymbol.range)
            || cached && reusable && cached.start === document.offsetAt(ancestor.range.start)
              && cached.end === document.offsetAt(ancestor.range.end)) { continue; }
        const parsed = this.parseDeclaration(document, ancestor, ancestors.slice(i + 1), ts, javascript);
        if (parsed) {
          const selected = select(parsed);
          if (selected) { return selected; }
          if (!javascript) { return null; }
        }
      }
      return null;
    };
    if (javascript) {
      const selected = fromAncestors();
      if (selected) { return selected; }
    }
    const parsed = this.parseDeclaration(document, docSymbol, ancestors, ts, javascript);
    if (parsed) {
      const selected = select(parsed);
      if (selected || !javascript) { return selected; }
      if (!parsed.diagnostics.length) { return null; }
    }
    if (!javascript) { return fromAncestors(); }
    // Raw JavaScript assignments take precedence over method/field parser wrappers.
    const wrapped = this.parseDeclaration(document, docSymbol, ancestors, ts, false);
    return wrapped ? select(wrapped) : null;
  }

  public isDeclarationSymbol(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): boolean {
    return this.getLanguageStr() === 'javascript' && !!this.selectDeclaration(document, symbol, context, true);
  }

  public getLanguageSpecificSymbolInformation(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): LanguageSpecificSymbolInformation {
    const fail = (): never => {
      throw new Error('Cannot determine declaration boundaries for "' + docSymbol.name + '".');
    };
    const selected = this.selectDeclaration(document, docSymbol, context);
    if (!selected) { return fail(); }
    const ts: typeof TypeScript = require('typescript');
    const {fragment, declaration, rangeDeclaration} = selected;
    const tree = fragment.tree;
    const start = document.offsetAt((rangeDeclaration || docSymbol.range).start);
    const end = document.offsetAt((rangeDeclaration || docSymbol.range).end);
    const declarationStart = declaration.getStart(tree);
    const toDocument = (offset: number) => fragment.start + offset - fragment.prefixLength;
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
    const javascript = this.getLanguageStr() === 'javascript';
    const callable = this.callable(ts, declaration, javascript);
    let headStart = 'name' in declaration && declaration.name
      && !ts.isFunctionExpression(declaration) ? declaration.name.getStart(tree) : declarationStart;
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
    } else if (callable) {
      const body = callable.body;
      const opening = body.getStart(tree);
      rangeHead = heading(headStart, opening);
      rangeBody = ts.isBlock(body) ? bodyRange(opening + 1, body.end - 1) : range(opening, body.end);
    } else if (ts.isVariableDeclaration(declaration) || ts.isPropertyDeclaration(declaration)
        || ts.isPropertyAssignment(declaration) || ts.isEnumMember(declaration)) {
      const value = declaration.initializer;
      if (!value) {
        rangeHead = heading(headStart, declaration.end);
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
    let children: readonly vscode.DocumentSymbol[] | undefined;
    if (javascript && callable) {
      const implementationRanges: vscode.Range[] = [];
      let implementation: TypeScript.Expression = callable;
      for (;;) {
        const from = toDocument(implementation.getStart(tree));
        const to = toDocument(implementation.end);
        if (from >= start && to <= end) {
          implementationRanges.push(new vscode.Range(document.positionAt(from), document.positionAt(to)));
        }
        if (!ts.isParenthesizedExpression(implementation.parent)) { break; }
        implementation = implementation.parent;
      }
      const wrappers = docSymbol.children.filter(child =>
        implementationRanges.some(implementationRange => implementationRange.isEqual(child.range)));
      if (wrappers.length > 1) { return fail(); }
      if (wrappers.length) {
        // Project only a proven syntax wrapper; never modify the provider's tree.
        const projected: vscode.DocumentSymbol[] = [];
        for (const child of docSymbol.children) {
          if (child === wrappers[0]) { projected.push(...child.children); }
          else { projected.push(child); }
        }
        children = projected;
      }
    }
    // Use the syntax identity, not provider selections that can differ between
    // symbol requests (assignment target versus the entire RHS function).
    const definitionPosition = javascript && ts.isBinaryExpression(declaration) && callable
      ? document.positionAt(toDocument(callable.getStart(tree))) : undefined;
    const isCallable = !!callable || ts.isFunctionDeclaration(declaration)
      || ts.isMethodDeclaration(declaration) || ts.isConstructorDeclaration(declaration);
    return {rangeHead, rangeBody, attributes, declarationOnly, rangeDeclaration, children, definitionPosition, isCallable};
  }

  public getCommentRanges(document: vscode.TextDocument): readonly Outline.CommentRange[] {
    const cached = this.commentRangesCache.get(document);
    if (cached && cached.version === document.version) {
      return cached.ranges;
    }

    const ts: typeof TypeScript = require('typescript');
    const isTsx = this.getLanguageStr() === 'typescriptreact' || document.fileName.endsWith('.tsx');
    const isJsx = document.fileName.endsWith('.jsx');
    const isJs = this.getLanguageStr() === 'javascript' || isJsx;
    const scriptKind = isTsx ? ts.ScriptKind.TSX : (isJsx ? ts.ScriptKind.JSX : (isJs ? ts.ScriptKind.JS : ts.ScriptKind.TS));
    const code = document.getText();
    const sourceFile = ts.createSourceFile(document.fileName, code, ts.ScriptTarget.Latest, true, scriptKind);

    const tokens: { start: number; end: number }[] = [];
    const collectTokens = (node: TypeScript.Node) => {
      if (ts.isJSDoc(node)) return;
      if (ts.isJsxText(node)) {
        tokens.push({ start: node.pos, end: node.end });
        return;
      }
      const children = node.getChildren(sourceFile);
      if (children.length === 0) {
        const start = node.getStart(sourceFile);
        const end = node.end;
        if (end > start) tokens.push({ start, end });
      } else {
        for (const child of children) collectTokens(child);
      }
    };
    collectTokens(sourceFile);
    tokens.sort((a, b) => a.start - b.start);

    const merged: { start: number; end: number }[] = [];
    for (const t of tokens) {
      if (merged.length > 0 && t.start <= merged[merged.length - 1].end) {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, t.end);
      } else {
        merged.push({ start: t.start, end: t.end });
      }
    }

    const gaps: { start: number; end: number }[] = [];
    let cursor = 0;
    for (const m of merged) {
      if (m.start > cursor) {
        gaps.push({ start: cursor, end: m.start });
      }
      cursor = Math.max(cursor, m.end);
    }
    if (cursor < code.length) {
      gaps.push({ start: cursor, end: code.length });
    }

    const languageVariant = (isTsx || isJsx) ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard;
    const ranges: Outline.CommentRange[] = [];
    for (const gap of gaps) {
      const gapText = code.slice(gap.start, gap.end);
      const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, languageVariant, gapText);
      let tok = scanner.scan();
      while (tok !== ts.SyntaxKind.EndOfFileToken) {
        if (tok === ts.SyntaxKind.SingleLineCommentTrivia || tok === ts.SyntaxKind.MultiLineCommentTrivia) {
          const cStart = gap.start + scanner.getTokenPos();
          const cEnd = gap.start + scanner.getTextPos();
          ranges.push({
            range: new vscode.Range(document.positionAt(cStart), document.positionAt(cEnd)),
            kind: 'comment'
          });
        }
        tok = scanner.scan();
      }
    }

    ranges.sort((a, b) => a.range.start.compareTo(b.range.start));
    this.commentRangesCache.set(document, { version: document.version, ranges });
    return ranges;
  }
}
