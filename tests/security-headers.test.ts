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
import { sampleJet } from './jet/fakes';

let server: TestServer;
let html: string;

beforeAll(async () => {
  server = await startTestServer(createApp({ jet: sampleJet() }));
  html = await (await fetch(`${server.url}/`)).text();
});

afterEach(() => mock.restore());

afterAll(() => server.close());

const expected: Record<string, string> = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    // The three exact <style> blocks the vendored globe.gl 2.46.2 injects on
    // /jet (scene cursor, tooltip, nav hint), plus the empty string: it
    // inserts each element empty before filling it. Recompute when bumping.
    "style-src 'self' 'sha256-GRFgt45UbKYCV14/Fqy6H9EB3zlAwSnH4xbsYt03Q6M=' 'sha256-9xjtvxMT1ApHlgn9ohbh2FNfvK5Tqtzy94BjfXBeMSY=' 'sha256-yfc2FhpkFR0EAy3T+zDsaAFGXSP9B3ELNvaJKDzNhkk=' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
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

const expectSecurityHeaders = (res: Response): void => {
  for (const [name, value] of Object.entries(expected)) {
    expect(res.headers.get(name)).toBe(value);
  }
  expect(res.headers.get('x-powered-by')).toBeNull();
};

describe('security headers', () => {
  it.each([
    ['the landing page', () => '/'],
    ['the jet tracker', () => '/jet'],
    ['the health check', () => '/healthz'],
    ['a hashed static asset', stylesheet],
    ['a 404', () => '/does-not-exist']
  ])('are set on %s', async (_label, path) => {
    expectSecurityHeaders(await fetch(`${server.url}${path()}`));
  });

  it('are set on the JSON API', async () => {
    spyOn(axios, 'get').mockResolvedValue({
      data: { articles: [newsApiArticle] }
    });
    const res = await fetch(`${server.url}/api/news`);
    expect(res.status).toBe(200);
    expectSecurityHeaders(res);
  });
});

// The CSP blocks inline code, which browsers would drop silently. Catch it in
// CI instead: everything must load from files under /static.
describe('page markup vs the CSP', () => {
  it.each([
    ['inline <script> elements', /<script(?![^>]*\ssrc=)[^>]*>/i],
    ['<style> blocks', /<style[\s>]/i],
    ['on* event handler attributes', /<[a-z][^>]*\son[a-z]+\s*=/i],
    ['javascript: URLs', /\b(?:href|src|action)\s*=\s*["']?\s*javascript:/i]
  ])(
    'the pages have no %s, which the CSP would block',
    async (_label, pattern) => {
      const jet = await (await fetch(`${server.url}/jet`)).text();
      expect(html).not.toMatch(pattern);
      expect(jet).not.toMatch(pattern);
    }
  );
});
