import type { Express } from 'express';
import type { AddressInfo } from 'node:net';

export interface TestServer {
  url: string;
  close: () => Promise<void>;
}

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
