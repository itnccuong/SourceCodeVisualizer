export interface Settings {
  port: number;
  host?: string;
  nested?: {value?: number};
}

declare function tracked(value: unknown, context: unknown): void;

export function keep<const T>(value: T) { return value; }

export const config = {port: 8080} satisfies Settings;

@tracked
export class Cache {
  static ready = false;
  static {
    // Static initialization is parsed, never executed by these tests.
    Cache.ready = true;
  }

  #value = 1;

  @tracked
  get value(): number { return this.#value; }

  @tracked
  method<const T extends {port: number}>(input: T): T {
    return input;
  }

  arrow = (input: number) => ({value: input ?? this.#value});
}

export function build(): Promise<string> {
  return new Promise<string>((resolve) => {
    const done = (value: string) => value.trim();
    [" ready "].forEach((value) => {
      resolve(done(value));
    });
  });
}

declare const settings: Settings & {nested: {value: number}; extra: string};
export const {port = 8080, host: server = "localhost", nested: {value: renamed = 1}, ...rest} = settings;
export const selected = settings?.nested?.value ?? 0;
