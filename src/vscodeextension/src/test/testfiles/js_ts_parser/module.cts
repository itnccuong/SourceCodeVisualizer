import legacy = require('./legacy.cjs');

declare function acquire(): Disposable;
declare function acquireAsync(): Promise<AsyncDisposable>;

export const fallback = legacy?.run(1) ?? 0;
export function keep<const T>(value: T): T { return value; }

export async function resources() {
  using resource = acquire();
  await using pending = acquireAsync();
  return {resource, pending};
}
