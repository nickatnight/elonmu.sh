import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

// The content of the <meta> with the given attribute, e.g. 'property="og:url"',
// with whitespace collapsed (templates may wrap long values). '' if missing.
export const metaContent = (page: string, attr: string): string =>
  (
    page.match(new RegExp(`<meta\\s+${attr}\\s+content="([^"]*)"`))?.[1] ?? ''
  ).replace(/\s+/g, ' ');

// Port 0 lets the OS pick a free port, so test files can run in parallel.
export const startTestServer = (app: Express): Promise<TestServer> =>
  new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://localhost:${port}`,
        close: () =>
          new Promise<void>((done, fail) =>
            server.close((err) => (err ? fail(err) : done()))
          )
      });
    });
  });
