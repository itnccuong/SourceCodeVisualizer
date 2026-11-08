import * as crypto from 'crypto';

export type SavedPosition = { line: number; character: number };
export type SavedRange = [SavedPosition, SavedPosition];
export type SymbolPathEntry = { name: string; kind: number };

export type SourceReference = {
  type: 'file' | 'symbol';
  uri: string;
  language: string;
  documentHash: string;
  symbol: null | {
    name: string;
    kind: number;
    path: SymbolPathEntry[] | null;
    selection: SavedRange;
    declaration: SavedRange;
  };
};

export function computeDocumentHash(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex').toLowerCase();
}
