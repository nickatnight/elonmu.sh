import type { Clock, HttpGet, Logger } from '../src/ports';

export class FakeClock implements Clock {
  private at: number;

  constructor(iso: string) {
    this.at = Date.parse(iso);
  }

  now(): Date {
    return new Date(this.at);
  }

  set(iso: string): void {
    this.at = Date.parse(iso);
  }

  advance(ms: number): void {
    this.at += ms;
  }
}

export class FakeLogger implements Logger {
  readonly warnings: { msg: string; meta?: object }[] = [];

  warn(msg: string, meta?: object): void {
    this.warnings.push({ msg, meta });
  }
}

export const fakeHttpGet = (
  responses: Record<string, unknown>
): { get: HttpGet; calls: string[] } => {
  const calls: string[] = [];
  const get = async <T>(url: string): Promise<T> => {
    calls.push(url);
    if (!(url in responses))
      throw new Error(`fakeHttpGet: no response for ${url}`);
    return responses[url] as T;
  };
  return { get, calls };
};
