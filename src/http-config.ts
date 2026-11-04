export type HttpConfig = {
  timeout: number;
  maxRedirects: 0;
  maxContentLength?: number;
  headers?: Record<string, string>;
};

export type GetJson = (
  url: string,
  config: HttpConfig
) => Promise<{ data: unknown }>;
