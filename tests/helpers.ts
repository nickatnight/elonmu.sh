import type { AddressInfo } from 'node:net';
import type { Express } from 'express';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

export const metaContent = (page: string, attr: string): string =>
  (
    page.match(new RegExp(`<meta\\s+${attr}\\s+content="([^"]*)"`))?.[1] ?? ''
  ).replace(/\s+/g, ' ');

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
