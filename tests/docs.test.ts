import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { SERVICES } from '../src/catalog';
import { sampleDoge } from './doge/fakes';
import { metaContent, startTestServer, type TestServer } from './helpers';
import { sampleHype } from './hype/fakes';
import { sampleJet } from './jet/fakes';
import { sampleNews } from './news/fakes';

let server: TestServer;
let res: Response;
let html: string;

beforeAll(async () => {
  server = await startTestServer(
    createApp({
      jet: sampleJet(),
      hype: sampleHype(),
      doge: sampleDoge(),
      news: sampleNews()
    })
  );
  res = await fetch(`${server.url}/docs`);
  html = await res.text();
});

afterAll(() => server.close());

const decode = (s: string): string =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const textOf = (fragment: string): string =>
  decode(fragment).replace(/\s+/g, ' ').trim();

const block = (id: string): string =>
  (
    html.match(
      new RegExp(`<section class="doc" id="${id}"[\\s\\S]*?</section>`)
    )?.[0] ?? ''
  ).replaceAll('<wbr>', '');

const example = (id: string): unknown =>
  JSON.parse(
    decode(
      block(id).match(
        /<pre data-example="response"[^>]*>([\s\S]*?)<\/pre>/
      )?.[1] ?? ''
    )
  );

const keyPaths = (value: unknown, at = ''): string[] => {
  if (Array.isArray(value))
    return [...new Set(value.flatMap((item) => keyPaths(item, `${at}[]`)))];
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = at ? `${at}.${key}` : key;
    return [path, ...keyPaths(child, path)];
  });
};

describe('GET /docs', () => {
  it('renders an HTML page with the approved title, heading, lead and description', () => {
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<title>API docs | elonmu.sh</title>');
    expect(textOf(html.match(/<h1[^>]*>[\s\S]*?<\/h1>/)?.[0] ?? '')).toBe(
      'API docs'
    );
    expect(
      textOf(html.match(/<p class="docs__lead">[\s\S]*?<\/p>/)?.[0] ?? '')
    ).toBe(
      'Four endpoints. No key, no signup, no SDK, no parameters, no point. All GET, all JSON. /s'
    );
    expect(metaContent(html, 'name="description"')).toBe(
      'Reference for the elonmu.sh JSON APIs: random Elon Musk news, his private-jet flights this year, a year of Wikipedia views, and what your SNL-night Dogecoin is worth now.'
    );
  });

  it('has its own canonical URL and share tags', () => {
    expect(html).toContain(
      '<link rel="canonical" href="https://elonmu.sh/docs" />'
    );
    expect(metaContent(html, 'property="og:url"')).toBe(
      'https://elonmu.sh/docs'
    );
    expect(metaContent(html, 'property="og:title"')).toBe(
      'API docs | elonmu.sh'
    );
  });

  it('has a skip link, the topbar and one main landmark', () => {
    expect(html).toContain('<a class="skip" href="#main">');
    expect(html).toContain('<header class="topbar">');
    expect(html.match(/<main\b[^>]*id="main"/g)).toHaveLength(1);
  });

  it('documents every endpoint in catalog order, then the errors', () => {
    const ids = [...html.matchAll(/<section class="doc" id="([^"]+)"/g)].map(
      ([, id]) => id
    );
    expect(ids).toEqual([...SERVICES.map(({ id }) => id), 'errors']);
  });

  it('heads each block with its endpoint and gives a curl for it', () => {
    for (const { id, api } of SERVICES) {
      const section = block(id);
      expect({
        id,
        heading: textOf(section.match(/<h2[^>]*>[\s\S]*?<\/h2>/)?.[0] ?? '')
      }).toEqual({
        id,
        heading: `GET ${api}`
      });
      expect(section).toContain(`<code>curl https://elonmu.sh${api}</code>`);
    }
  });

  it.each(SERVICES.map(({ id, api }) => [id, api]))(
    'documents the %s example with the keys %s really returns',
    async (id, api) => {
      const real = await (await fetch(`${server.url}${api}`)).json();
      expect(keyPaths(example(id)).sort()).toEqual(keyPaths(real).sort());
    }
  );

  it('lists every documented top-level field in the field table', () => {
    for (const { id } of SERVICES) {
      const documented = [
        ...block(id).matchAll(/<tr><td><code>([^<]+)<\/code><\/td>/g)
      ].map(([, field]) => field);
      for (const key of Object.keys(example(id) as object))
        expect({ id, key, listed: documented.includes(key) }).toEqual({
          id,
          key,
          listed: true
        });
    }
  });

  it('says where an example is trimmed', () => {
    expect(textOf(block('jet-tracker'))).toContain('trimmed');
    expect(textOf(block('hype-meter'))).toContain('trimmed');
  });

  it('cites the SNL price source and what now.at means', () => {
    const doge = textOf(block('doge-since-snl'));
    expect(doge).toContain('Binance');
    expect(doge).toContain('now.at');
  });

  it('explains errors with the approved intro, the statuses and the 404 body', () => {
    const errors = textOf(block('errors'));
    expect(errors).toContain(
      'When an upstream (NewsAPI, Bluesky, Wikimedia, CoinGecko) is down, the status is still 200: we are fine, it is the world that failed. Our own mistakes are a 500.'
    );
    for (const status of ['200', '500', '404'])
      expect(block('errors')).toContain(`<td><code>${status}</code></td>`);
    expect(errors).toContain('does not compute...');
    expect(errors).toContain('Fig. 1: a 500, in production.');
    expect(block('errors')).toMatch(
      /src="\/static\/img\/rud\.jpg\?v=[0-9a-f]+"/
    );
  });

  it('says news, hype and DOGE wait a minute after a failed refresh', () => {
    for (const api of ['/api/news', '/api/hype', '/api/doge']) {
      const row =
        block('errors').match(
          new RegExp(`<tr><td><code>${api}</code></td>[\\s\\S]*?</tr>`)
        )?.[0] ?? '';
      expect({ api, row: textOf(row) }).toEqual({
        api,
        row: expect.stringContaining('asks again after a minute')
      });
    }
  });

  it('gives each endpoint a cache row', () => {
    const errors = block('errors');
    for (const { api } of SERVICES)
      expect(errors).toContain(`<td><code>${api}</code></td>`);
  });

  it('renders copy buttons hidden until the script runs', () => {
    const buttons = html.match(/<button[^>]*class="copy"[^>]*>/g) ?? [];
    expect(buttons.length).toBeGreaterThanOrEqual(SERVICES.length * 2);
    for (const button of buttons) expect(button).toContain('hidden');
  });

  it('loads main.css then docs.css, each with a content hash', () => {
    const sheets = [
      ...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)
    ].map(([, href]) => href);
    expect(sheets).toHaveLength(2);
    expect(sheets[0]).toMatch(/^\/static\/css\/main\.css\?v=[0-9a-f]+$/);
    expect(sheets[1]).toMatch(/^\/static\/css\/docs\.css\?v=[0-9a-f]+$/);
  });

  it('loads only console.js, for Send and Copy, with a content hash', () => {
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts).toEqual([
      expect.stringMatching(
        /^<script type="module" src="\/static\/js\/console\.js\?v=[0-9a-f]+">$/
      )
    ]);
    expect(html).toContain('aria-live="polite"');
  });

  it('gives each endpoint block a Send button for its catalog api, hidden until the script runs', () => {
    for (const { id, api } of SERVICES) {
      const sends = block(id).match(/<button [^>]*data-api="[^"]*"[^>]*>/g);
      expect({ id, sends }).toEqual({
        id,
        sends: [
          `<button class="button code__send" type="button" data-api="${api}" hidden>`
        ]
      });
    }
    expect(block('errors')).not.toContain('data-api=');
  });

  it('links each live preview to the full response in a new tab, hidden until a preview exists', () => {
    for (const { id, api } of SERVICES) {
      const link =
        block(id).match(/<a class="code__full"[\s\S]*?<\/a>/)?.[0] ?? '';
      expect(link).toContain(
        `<a class="code__full" href="${api}" target="_blank" rel="noopener noreferrer" hidden>`
      );
      expect(textOf(link)).toBe('Full response ↗ (opens in a new tab)');
    }
  });

  it('labels the static example as the response until Send replaces it', () => {
    for (const { id } of SERVICES)
      expect(block(id)).toContain(
        '<span class="code__label">Response · 200</span>'
      );
  });

  it('puts no inline style attributes on the page', () => {
    expect(html).not.toMatch(/\sstyle=/);
  });

  it('stays within 60 KB of HTML', () => {
    expect(new TextEncoder().encode(html).byteLength).toBeLessThanOrEqual(
      60 * 1024
    );
  });

  it('serves every local asset the page references', async () => {
    const urls = [...html.matchAll(/(?:href|src)="(\/[^/"][^"]*)"/g)]
      .map(([, url]) => url)
      .filter((url) => !url.startsWith('/#') && !/^\/[a-z]*$/.test(url));
    expect(urls.length).toBeGreaterThan(0);
    for (const url of new Set(urls)) {
      const asset = await fetch(`${server.url}${url}`);
      await asset.arrayBuffer();
      expect({ url, status: asset.status }).toEqual({ url, status: 200 });
    }
  });
});

describe('docs.css', () => {
  it('draws focus rings inside code figures in the code ink, for contrast on the dark bar', async () => {
    const docs = await Bun.file(
      `${import.meta.dir}/../src/public/static/css/docs.css`
    ).text();
    expect(docs).toMatch(
      /\.code :focus-visible \{\s*outline-color: var\(--code-ink\);\s*\}/
    );
  });

  it('holds the reference layout rules, which main.css no longer carries', async () => {
    const css = (file: string) =>
      Bun.file(`${import.meta.dir}/../src/public/static/css/${file}`).text();
    const main = await css('main.css');
    const docs = await css('docs.css');
    for (const selector of ['.doc', '.code', '.fields', '.illus']) {
      const rule = new RegExp(`(^|\\n)\\s*\\${selector}[ ,{]`);
      expect({
        selector,
        main: rule.test(main),
        docs: rule.test(docs)
      }).toEqual({
        selector,
        main: false,
        docs: true
      });
    }
  });
});
