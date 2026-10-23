import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  mock,
  spyOn
} from 'bun:test';
import axios from 'axios';
import { createApp } from '../src/app';
import { newsApiArticle } from './fixtures';
import { startTestServer, type TestServer } from './helpers';

let server: TestServer;
let html: string;

beforeAll(async () => {
  server = await startTestServer(createApp());
  html = await (await fetch(`${server.url}/`)).text();
});

afterEach(() => mock.restore());

afterAll(() => server.close());

// The policy from SPEC-security-headers, written out in full so a change to
// the middleware has to be a deliberate change to this test too.
const expected: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' https:",
    "media-src 'self'",
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '),
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin'
};

const stylesheet = (): string => {
  const href = html.match(
    /href="(\/static\/css\/main\.css\?v=[0-9a-f]+)"/
  )?.[1];
  if (!href) throw new Error('main.css link not found');
  return href;
};

describe('security headers', () => {
  it.each([
    ['the landing page', () => '/'],
    ['the health check', () => '/healthz'],
    ['a hashed static asset', stylesheet],
    ['a 404', () => '/does-not-exist']
  ])('are set on %s', async (_label, path) => {
    const res = await fetch(`${server.url}${path()}`);
    for (const [name, value] of Object.entries(expected)) {
      expect(res.headers.get(name)).toBe(value);
    }
    expect(res.headers.get('x-powered-by')).toBeNull();
  });

  it('are set on the JSON API', async () => {
    spyOn(axios, 'get').mockResolvedValue({
      data: { articles: [newsApiArticle] }
    });
    const res = await fetch(`${server.url}/api`);
    expect(res.status).toBe(200);
    for (const [name, value] of Object.entries(expected)) {
      expect(res.headers.get(name)).toBe(value);
    }
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});
