import * as vscode from 'vscode';
import * as Outline from '../outlineproviderAPI/SymbolDefinition';
import {computeDocumentHash} from '../outlineproviderAPI/source_reference';
import * as utils from '../utils';

export async function translateOutlineRanges(
  outlineRanges: Outline.OutlineRange[]
): Promise<Outline.OutlineRange[]> {
  const documentCache = new Map<string, { doc: vscode.TextDocument; version: number; hash: string }>();

  for (let i = 0; i < outlineRanges.length; ++i) {
    const outlineRange = outlineRanges[i];
    const uriKey = outlineRange.uri;
    let entry = documentCache.get(uriKey);
    if (!entry) {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(outlineRange.uri));
      const hash = computeDocumentHash(doc.getText());
      entry = { doc, version: doc.version, hash };
      documentCache.set(uriKey, entry);
    }
    if (entry.doc.version !== entry.version) throw new Error('Source changed during restore');
    _outlineRange2outlineEntity(outlineRange, entry.doc, entry.hash);
  }
  for (const entry of documentCache.values()) {
    if (entry.doc.version !== entry.version) throw new Error('Source changed during restore');
  }
  return outlineRanges;

  function _outlineRange2outlineEntity(
    outlineRange: Outline.OutlineRange,
    doc: vscode.TextDocument,
    hash: string
  ) {
    // VS Code command results can be plain objects whose Range.toJSON() is a tuple.
    // Reconstitute ranges before getText; never treat their absence as whole-file text.
    const normalizeRange = (value: unknown): vscode.Range | null => {
      if (value === null || value === undefined) return null;
      const raw = value as { start?: vscode.Position; end?: vscode.Position; [index: number]: vscode.Position };
      const start = raw[0] ?? raw.start, end = raw[1] ?? raw.end;
      if (!start || !end || ![start.line, start.character, end.line, end.character].every(n => Number.isSafeInteger(n) && n >= 0)
          || start.line > end.line || (start.line === end.line && start.character > end.character)) {
        throw new Error('Invalid source range returned by outline provider');
      }
      const result = new vscode.Range(start.line, start.character, end.line, end.character);
      if (!doc.validateRange(result).isEqual(result)) throw new Error('Source range is outside the current document');
      return result;
    };
    outlineRange.displayTextRange = normalizeRange(outlineRange.displayTextRange);
    if (outlineRange.totalRange) outlineRange.totalRange = normalizeRange(outlineRange.totalRange);
    if (outlineRange.definitionRange) outlineRange.definitionRange = normalizeRange(outlineRange.definitionRange);
    if (outlineRange.commentRanges) {
      for (const comment of outlineRange.commentRanges) {
        const range = normalizeRange(comment.range);
        if (!range) throw new Error('Missing comment source range returned by outline provider');
        comment.range = range;
      }
    }
    if (outlineRange.sourceReference) {
      outlineRange.sourceReference.documentHash = hash;
    }

    if (outlineRange.CLASS_TYPE === 'Symbol') {
      const symbol = outlineRange as Outline.Symbol;
      if (outlineRange.displayTextRange) {
        outlineRange.displayText = doc.getText(outlineRange.displayTextRange);
      } else {
        outlineRange.displayText = '<UNKNOWN>';
      }
      if (
        /\.pyi$/i.test(doc.uri.path) &&
        !symbol.attributes.some(attribute => attribute.kind === 'Type stub — declaration only')
      ) {
        const attribute = new Outline.Attribute();
        attribute.kind = 'Type stub — declaration only';
        attribute.uri = outlineRange.uri;
        attribute.language = outlineRange.language;
        symbol.attributes.push(attribute);
      }
      for (const attribute of symbol.attributes) {
        _outlineRange2outlineEntity(attribute, doc, hash);
      }
    } else if (outlineRange.CLASS_TYPE === 'File') {
      outlineRange.displayText = utils.path_getFilename(outlineRange.uri);
      if (!outlineRange.sourceReference) {
        outlineRange.sourceReference = {
          type: 'file',
          uri: outlineRange.uri,
          language: outlineRange.language,
          documentHash: hash,
          symbol: null
        };
      }
    } else if (outlineRange.CLASS_TYPE === 'Text' || outlineRange.CLASS_TYPE === 'Attribute') {
      outlineRange.displayText = '<UNKNOWN>';
      if (outlineRange.displayTextRange) {
        outlineRange.displayText = doc.getText(outlineRange.displayTextRange);
      }
    }

    for (let i = 0; i < outlineRange.parts.length; ++i) {
      _outlineRange2outlineEntity(outlineRange.parts[i], doc, hash);
    }
  }
}
