export interface Clock {
  now(): Date;
}

export type HttpGet = <T>(url: string) => Promise<T>;

export interface Logger {
  warn(msg: string, meta?: object): void;
}
