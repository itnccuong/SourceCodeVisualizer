import * as vscode from 'vscode';
import * as path from 'path';

import * as Outline from './SymbolDefinition';
import {DocumentSymbolX} from './utils/documentsymbolx'

export interface LanguageSpecificSymbolInformation {
  rangeHead: vscode.Range;
  rangeBody: vscode.Range | null; // null = no body; empty range = empty body
  attributes: Outline.Attribute[];
  declarationOnly: boolean;
  rangeDeclaration?: vscode.Range; // syntax-backed Python assignment or JavaScript RHS-only assignment
  children?: readonly vscode.DocumentSymbol[]; // display projection; absent keeps the provider's children
  definitionPosition?: vscode.Position; // callable lookup may differ from an assignment heading's receiver
  isCallable?: boolean;
}

export interface SymbolExtractionContext {
  ancestors: readonly vscode.DocumentSymbol[]; // nearest parent first
}


/**
 * Interface for implementing an Outliner with
 *  minimal effort.
 **/
export interface VpLspExtenderProvider
{
  /**
   * Returns a lowercase string stating the
   *  programming language used
   **/
  getLanguageStr(): string;

  /**
   * Check, if the given `position` in `doc` is
   *  already a location with a definition
   *
   * Background:
   *   If cursor is already on a definition, dont use
   *   executeDefinitionProvider because it might bring
   *   you to its parent's definition
   **/
   isDefinition(doc:      vscode.TextDocument,
              position: vscode.Position): boolean;

  /**
   * VSCode's LSP does not differentiate between entity head
   * and entity body (entity ∈ {namespace, class, method, ....}).
   *
   * This function will find the range for head and body
   *
   * A null body denotes a declaration without a body.
   **/
  getLanguageSpecificSymbolInformation(
    document: vscode.TextDocument,
    docSymbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): LanguageSpecificSymbolInformation;

  getDefinitionSymbol?(
    document: vscode.TextDocument,
    position: vscode.Position,
    context?: SymbolExtractionContext
  ): vscode.DocumentSymbol | undefined;

  /**
   * Opt a variable, constant, property, or field into declaration rendering.
   * Other symbol kinds retain the shared traversal's existing inclusion rules.
   **/
  isDeclarationSymbol?(
    document: vscode.TextDocument,
    symbol: vscode.DocumentSymbol,
    context?: SymbolExtractionContext
  ): boolean;

  getCommentRanges?(
    document: vscode.TextDocument
  ): readonly Outline.CommentRange[];



  /**
   * Provide full-depths outline of range
   *
   * @param code: TODO: should be an object where lines can be fetched; something like a vscode.document
   *              Should not be vscode.TextDocument, because it then becomes
   *              untestable.
   * @return
   *
   **/
   provideOutlineForRange(document: vscode.TextDocument,
                          range: vscode.Range)
    : Promise<Array<Outline.Symbol | Outline.Text>>;
}