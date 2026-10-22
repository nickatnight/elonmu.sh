import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { startTestServer, type TestServer } from './helpers';

let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(createApp());
});

afterAll(() => server.close());

describe('GET /', () => {
  it('renders the landing page', async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain(
      '<title>MaaS | Musk as a Service</title>'
    );
  });
});

describe('unknown routes', () => {
  it('returns the 404 message', async () => {
    const res = await fetch(`${server.url}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('does not compute...');
  });
});
