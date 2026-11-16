export declare function lookup(value: string): string;
export declare function lookup(value: number): number;

export interface Reader {
  (value: string): string;
  new (value: string): Reader;
  [key: string]: unknown;
  read(value: string): string;
}

export type Result<T> = {value: T};
