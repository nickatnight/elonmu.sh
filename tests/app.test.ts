import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { startTestServer, type TestServer } from './helpers';
import { sampleJet } from './jet/fakes';

let server: TestServer;
let html: string;

beforeAll(async () => {
  server = await startTestServer(createApp({ jet: sampleJet() }));
  html = await (await fetch(`${server.url}/`)).text();
});

afterAll(() => server.close());

// The opening <video> tag that carries the given class.
const videoTag = (cls: string): string => {
  const tag = new RegExp(`<video\\s+class="hero__video ${cls}"[^>]*>`);
  return html.match(tag)?.[0] ?? '';
};

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

  it('links the local favicons and the web manifest with content hashes', () => {
    for (const href of [
      '/favicon.ico',
      '/favicon-32x32.png',
      '/favicon-16x16.png',
      '/apple-touch-icon.png',
      '/site.webmanifest'
    ]) {
      expect(html).toContain(`href="${href}?v=`);
    }
  });

  it('shares a 1200x630 card that the server serves', async () => {
    const match = html.match(
      /<meta property="og:image" content="https:\/\/elonmu\.sh(\/og\.png\?v=[0-9a-f]+)"/
    );
    expect(match).not.toBeNull();
    expect(html).toContain(
      `name="twitter:image" content="https://elonmu.sh${match?.[1]}"`
    );
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    const res = await fetch(`${server.url}${match?.[1]}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
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

  it('keeps the console out of the hero, in its own section below it', () => {
    const hero =
      html.match(/<section\s+class="hero"[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(hero).toContain('id="hero-title"');
    expect(hero).not.toContain('class="console"');
    expect(html).toMatch(
      /<section class="try" id="try"[^>]*>\s*<figure class="console"/
    );
  });

  it('points the hero scroll cue at the console', () => {
    expect(html).toMatch(
      /<a class="hero__cue" href="#try"[^>]*aria-hidden="true"/
    );
  });

  it('plays the launch clip once, behind the hero text', () => {
    const launch = videoTag('hero__video--launch');
    for (const attr of ['autoplay', 'muted', 'playsinline']) {
      expect(launch).toMatch(new RegExp(`\\s${attr}[\\s>]`));
    }
    expect(launch).not.toMatch(/\sloop[\s>]/);
    expect(launch).toContain('aria-hidden="true"');
    expect(launch).toMatch(
      /poster="\/static\/video\/clown-launch-poster\.jpg\?v=\w+"/
    );
  });

  it('loads the cruise loop only on demand, without autoplay', () => {
    const cruise = videoTag('hero__video--cruise');
    for (const attr of ['muted', 'loop', 'playsinline']) {
      expect(cruise).toMatch(new RegExp(`\\s${attr}[\\s>]`));
    }
    expect(cruise).not.toMatch(/\sautoplay[\s>]/);
    expect(cruise).toContain('preload="none"');
    expect(cruise).toContain('aria-hidden="true"');
  });

  it('lists WebM before MP4 for both clips, with content hashes', () => {
    for (const name of ['launch', 'cruise']) {
      const video =
        html.match(
          new RegExp(
            `<video\\s+class="hero__video hero__video--${name}"[\\s\\S]*?</video>`
          )
        )?.[0] ?? '';
      const sources = [
        ...video.matchAll(/<source src="([^"]+)" type="([^"]+)"/g)
      ];
      expect(sources.map(([, , type]) => type)).toEqual([
        'video/webm',
        'video/mp4'
      ]);
      for (const [, src] of sources) {
        expect(src).toMatch(
          new RegExp(`^/static/video/clown-${name}\\.(webm|mp4)\\?v=\\w+$`)
        );
      }
    }
  });

  it('renders the background pause toggle hidden until the script runs', () => {
    const hero =
      html.match(/<section\s+class="hero"[\s\S]*?<\/section>/)?.[0] ?? '';
    const toggle = hero.match(/<button class="hero__toggle"[^>]*>/)?.[0] ?? '';
    expect(toggle).toContain('type="button"');
    expect(toggle).toContain('aria-pressed="false"');
    expect(toggle).toContain('aria-label="Pause background"');
    expect(toggle).toMatch(/\shidden[\s>]/);
  });

  it('gives the hero the cruise poster as its reduced-motion still', () => {
    expect(html).toMatch(
      /<section\s+class="hero"[^>]*style="--still: url\(\/static\/video\/clown-cruise-poster\.jpg\?v=\w+\)"/
    );
  });

  it('serves the clips and posters with video and image types', async () => {
    const types = {
      webm: 'video/webm',
      mp4: 'video/mp4',
      jpg: 'image/jpeg'
    } as const;
    const urls = [
      ...html.matchAll(/(\/static\/video\/[^"?)]+\.(webm|mp4|jpg)\?v=\w+)/g)
    ];
    expect(new Set(urls.map(([url]) => url)).size).toBe(6);
    for (const [url, , ext] of urls) {
      const res = await fetch(`${server.url}${url}`);
      // Read the body so the socket closes and server.close() can finish.
      await res.arrayBuffer();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain(
        types[ext as keyof typeof types]
      );
    }
  });

  it('announces console results politely', () => {
    expect(html).toContain('aria-live="polite"');
  });

  it('serves every local asset the page references', async () => {
    const urls = [
      ...html.matchAll(/(?:href|src|poster)="(\/[^/"][^"]*)"/g),
      ...html.matchAll(/url\((\/[^/)][^)]*)\)/g)
    ]
      .map(([, url]) => url)
      .filter((url) => url !== '/' && url !== '/api');
    expect(urls.length).toBeGreaterThan(0);
    for (const url of new Set(urls)) {
      const res = await fetch(`${server.url}${url}`);
      await res.arrayBuffer();
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });
});

// The text of each link in the topbar nav, in order.
const navLinks = (page: string): string[] => {
  const nav =
    page.match(/<nav class="topbar__actions"[\s\S]*?<\/nav>/)?.[0] ?? '';
  return [...nav.matchAll(/<a\b[^>]*>([^<]*)<\/a>/g)].map(([, text]) => text);
};

describe('topbar', () => {
  it('reads News API · Jet · GitHub', () => {
    expect(navLinks(html)).toEqual(['News API', 'Jet', 'GitHub']);
  });

  it('has no GET /api button', () => {
    const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0];
    expect(topbar).toBeDefined();
    expect(topbar).not.toContain('class="button"');
  });

  it('points News API at the docs section', () => {
    expect(html).toMatch(/<a href="\/#get-api"[^>]*>News API<\/a>/);
  });

  it('renders one link per catalog entry, with no template change', async () => {
    const entry = (n: number) => ({
      id: `service-${n}`,
      name: `Service ${n}`,
      nav: `S${n}`,
      summary: `Does thing ${n}.`,
      href: `/s${n}`,
      cta: `Open ${n}`
    });
    const three = await startTestServer(
      createApp({ jet: sampleJet(), services: [1, 2, 3].map(entry) })
    );
    try {
      const page = await (await fetch(`${three.url}/`)).text();
      expect(navLinks(page)).toEqual(['S1', 'S2', 'S3', 'GitHub']);
      expect(page).toMatch(/<a href="\/s3"[^>]*>S3<\/a>/);
    } finally {
      await three.close();
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
