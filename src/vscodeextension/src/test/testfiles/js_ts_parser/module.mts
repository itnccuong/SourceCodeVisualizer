import data from './settings.json' with {type: 'json'};

declare function acquire(): Disposable;
declare function acquireAsync(): Promise<AsyncDisposable>;

export const settings = data satisfies {port: number};
export function read<const T>(value: T): T { return value; }

export async function resources() {
  using resource = acquire();
  await using pending = acquireAsync();
  return {resource, pending};
}
