declare namespace cjsApi {
  function lookup(value: string): string;
  function lookup(value: number): number;
  interface Reader { read(): string; }
  type Result = {value: string};
}
export = cjsApi;
