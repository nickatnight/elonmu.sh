import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../../src/app';
import { metaContent, startTestServer, type TestServer } from '../helpers';
import { sampleJet } from '../jet/fakes';
import { article, failingNews, sampleNews } from './fakes';

const servers: Record<'ok' | 'down' | 'hostile', TestServer> = {} as never;
const res: Record<keyof typeof servers, Response> = {} as never;
const html: Record<keyof typeof servers, string> = {} as never;

beforeAll(async () => {
  const fakes = {
    ok: sampleNews([
      article({
        source: 'Example Daily',
        title: 'Musk announces plan to announce a plan',
        description: 'Sources close to the announcement say soon.',
        url: 'https://example.com/plan',
        urlImage: 'https://example.com/plan.jpg',
        publishDate: '2026-10-22T09:00:00Z'
      })
    ]),
    down: failingNews(),
    hostile: sampleNews([
      article({
        title: '<script>alert(1)</script> & co',
        url: 'javascript:alert(1)',
        urlImage: 'http://example.com/plain.jpg'
      })
    ])
  };
  for (const [name, news] of Object.entries(fakes)) {
    const key = name as keyof typeof servers;
    servers[key] = await startTestServer(createApp({ jet: sampleJet(), news }));
    res[key] = await fetch(`${servers[key].url}/news`);
    html[key] = await res[key].text();
  }
});

afterAll(async () => {
  for (const server of Object.values(servers)) await server.close();
});

const card = (page: string): string =>
  page.match(/<article class="card[^"]*"[\s\S]*?<\/article>/)?.[0] ?? '';

const text = (fragment: string): string =>
  fragment
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

describe('GET /news', () => {
  it('renders an HTML page with the approved title, heading and description', () => {
    expect(res.ok.status).toBe(200);
    expect(res.ok.headers.get('content-type')).toContain('text/html');
    expect(html.ok).toContain('<title>News roulette | elonmu.sh</title>');
    expect(text(html.ok.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? '')).toBe(
      'News roulette'
    );
    expect(metaContent(html.ok, 'name="description"')).toBe(
      'One random news article about Elon Musk, picked from the latest headlines. Also available as JSON.'
    );
  });

  it('carries the description in the meta tag without repeating it on the page', () => {
    const description =
      'One random news article about Elon Musk, picked from the latest headlines. Also available as JSON.';
    const body = text(html.ok.match(/<body>[\s\S]*<\/body>/)?.[0] ?? '');
    expect(metaContent(html.ok, 'name="description"')).toBe(description);
    expect(body).toContain('News roulette');
    expect(body).not.toContain(description);
  });

  it('has its own canonical URL and share tags', () => {
    expect(html.ok).toContain(
      '<link rel="canonical" href="https://elonmu.sh/news" />'
    );
    expect(metaContent(html.ok, 'property="og:url"')).toBe(
      'https://elonmu.sh/news'
    );
  });

  it('has a skip link, the topbar and one main landmark', () => {
    expect(html.ok).toContain('<a class="skip" href="#main">');
    expect(html.ok).toContain('<header class="topbar">');
    expect(html.ok.match(/<main\b[^>]*id="main"/g)).toHaveLength(1);
  });

  it('renders the article on the server: source, date, title, description', () => {
    const article = card(html.ok);
    expect(text(article)).toContain('Example Daily · Oct 22, 2026');
    expect(article).toContain('<time datetime="2026-10-22T09:00:00Z">');
    expect(article).toMatch(
      /<h2 class="card__title">Musk announces plan to announce a plan<\/h2>/
    );
    expect(text(article)).toContain(
      'Sources close to the announcement say soon.'
    );
  });

  it('shows the image without sending a referrer', () => {
    const img = card(html.ok).match(/<img [^>]*>/)?.[0] ?? '';
    expect(img).toContain('src="https://example.com/plan.jpg"');
    expect(img).toContain('referrerpolicy="no-referrer"');
    expect(img).toContain('alt=""');
  });

  it('opens the article in a new tab, safely, and says so to screen readers', () => {
    const link =
      card(html.ok).match(/<a [^>]*class="card__link"[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(link).toContain('href="https://example.com/plan"');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(text(link)).toBe('Read article → (opens in a new tab)');
  });

  it('spins again with a plain link back to /news, so it works without JS', () => {
    expect(html.ok).toMatch(/<a [^>]*href="\/news"[^>]*>Another one<\/a>/);
  });

  it('links to its block on /docs', () => {
    expect(html.ok).toMatch(/<a [^>]*href="\/docs#news-api"/);
  });

  it('is never cached, because each request picks another article', () => {
    expect(res.ok.headers.get('cache-control')).toBe('no-store');
    expect(res.down.headers.get('cache-control')).toBe('no-store');
  });

  it('loads no script', () => {
    expect(html.ok).not.toMatch(/<script\b/);
  });

  it('puts no inline style attributes on the page', () => {
    expect(html.ok).not.toMatch(/\sstyle=/);
  });

  it('stays within 60 KB of HTML', () => {
    expect(new TextEncoder().encode(html.ok).byteLength).toBeLessThanOrEqual(
      60 * 1024
    );
  });

  it('serves every local asset the page references', async () => {
    const urls = [...html.ok.matchAll(/(?:href|src)="(\/[^/"][^"]*)"/g)]
      .map(([, url]) => url)
      .filter((url) => !/^\/[a-z]*(#[\w-]+)?$/.test(url));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of new Set(urls)) {
      const asset = await fetch(`${servers.ok.url}${url}`);
      await asset.arrayBuffer();
      expect({ url, status: asset.status }).toEqual({ url, status: 200 });
    }
  });

  it('links main.css then news.css, each with a content hash', () => {
    const sheets = [
      ...html.ok.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)
    ].map(([, href]) => href);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatch(/^\/static\/css\/main\.css\?v=[0-9a-f]+$/);
    expect(sheets[1]).toMatch(/^\/static\/css\/news\.css\?v=[0-9a-f]+$/);
  });
});

describe('GET /news when NewsAPI fails', () => {
  it('still answers 200 with a short note and no article', () => {
    expect(res.down.status).toBe(200);
    expect(card(html.down)).toBe('');
    expect(text(html.down)).toContain(
      'There was an error with NewsAPI. Please try again later.'
    );
  });

  it('still offers another spin and the docs', () => {
    expect(html.down).toMatch(/<a [^>]*href="\/news"[^>]*>Another one<\/a>/);
    expect(html.down).toMatch(/<a [^>]*href="\/docs#news-api"/);
  });
});

describe('GET /news with hostile article data', () => {
  it('escapes the text it prints', () => {
    expect(html.hostile).not.toContain('<script>alert(1)</script>');
    expect(html.hostile).toContain(
      '&lt;script&gt;alert(1)&lt;/script&gt; &amp; co'
    );
  });

  it('drops a non-https image and a non-https link', () => {
    const article = card(html.hostile);
    expect(article).not.toContain('<img');
    expect(article).not.toContain('class="card__link"');
    expect(html.hostile).not.toContain('javascript:');
  });
});

describe('news.css', () => {
  it('holds the /news-only rules, and the home page never loads it', async () => {
    const main = await Bun.file(
      `${import.meta.dir}/../../src/public/static/css/main.css`
    ).text();
    expect(main).not.toMatch(/\.news[_\w-]* \{/);
    const home = await (await fetch(`${servers.ok.url}/`)).text();
    expect(home).not.toContain('news.css');
  });
});
