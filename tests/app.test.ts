import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { startTestServer, type TestServer } from './helpers';

let server: TestServer;
let html: string;

beforeAll(async () => {
  server = await startTestServer(createApp());
  html = await (await fetch(`${server.url}/`)).text();
});

afterAll(() => server.close());

describe('GET /', () => {
  it('renders the landing page', async () => {
    const res = await fetch(`${server.url}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<title>MaaS | Musk as a Service</title>');
  });

  it('has a heading and the page landmarks', () => {
    expect(html).toMatch(/<h1[\s>]/);
    for (const tag of ['header', 'main', 'footer']) {
      expect(html).toContain(`<${tag}`);
    }
  });

  it('keeps the canonical URL and the share tags', () => {
    expect(html).toContain('<link rel="canonical" href="https://elonmu.sh/"');
    expect(html).toContain('<meta name="description"');
    for (const tag of [
      'property="og:url" content="https://elonmu.sh/"',
      'property="og:title"',
      'property="og:image"',
      'name="twitter:card"',
      'name="twitter:image"'
    ]) {
      expect(html).toContain(tag);
    }
  });

  it('links the local favicons and the web manifest', () => {
    for (const href of [
      '/favicon.ico',
      '/favicon-32x32.png',
      '/favicon-16x16.png',
      '/apple-touch-icon.png',
      '/site.webmanifest'
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it('has no Unicorn Platform leftovers', () => {
    expect(html.toLowerCase()).not.toContain('unicorn');
  });

  it('links the social icons to their videos', () => {
    expect(html).toContain(
      'href="https://www.youtube.com/watch?v=Aq5WXmQQooo"'
    );
    expect(html).toContain(
      'href="https://www.youtube.com/watch?v=CdEpmU9pRaE"'
    );
  });

  it('versions the stylesheet URL with a content hash', () => {
    expect(html).toMatch(/href="\/static\/css\/main\.css\?v=[0-9a-f]+"/);
  });

  it('loads the script deferred, with a content hash', () => {
    expect(html).toMatch(
      /<script src="\/static\/js\/main\.js\?v=[0-9a-f]+" defer><\/script>/
    );
  });

  it('renders the console send button hidden until the script runs', () => {
    expect(html).toMatch(/<button[^>]*class="console__send[^"]*"[^>]*hidden/);
  });

  it('documents a response example with the real /api keys', () => {
    const block = html.match(/data-example="response"[^>]*>([\s\S]*?)<\/pre>/);
    expect(block).not.toBeNull();
    const text = (block?.[1] ?? '')
      .replace(/<[^>]+>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&');
    expect(Object.keys(JSON.parse(text))).toEqual([
      'source',
      'title',
      'description',
      'url',
      'urlImage',
      'publishDate'
    ]);
  });

  it('renders copy buttons hidden until the script runs', () => {
    const buttons = html.match(/<button[^>]*class="copy"[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    for (const button of buttons) expect(button).toContain('hidden');
  });

  it('has a testimonials section that says its people are fictional', () => {
    expect(html).toContain('id="testimonials"');
    expect(html.match(/<blockquote/g)?.length).toBe(3);
    expect(html).toContain('AI-generated');
  });

  it('announces console results politely', () => {
    expect(html).toContain('aria-live="polite"');
  });

  it('serves every local asset the page references', async () => {
    const urls = [...html.matchAll(/(?:href|src)="(\/[^/"][^"]*)"/g)]
      .map(([, url]) => url)
      .filter((url) => url !== '/' && url !== '/api');
    expect(urls.length).toBeGreaterThan(0);
    for (const url of new Set(urls)) {
      const res = await fetch(`${server.url}${url}`);
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });
});

describe('unknown routes', () => {
  it('returns the 404 message', async () => {
    const res = await fetch(`${server.url}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('does not compute...');
  });
});
