import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { metaContent, startTestServer, type TestServer } from './helpers';
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

  it('names GET /api/news in the console, the docs heading and the curl example', () => {
    expect(html).toContain(
      '<code class="console__url">https://elonmu.sh/api/news</code>'
    );
    expect(html).toContain(
      '<h2 id="get-api-title"><code>GET /api/news</code></h2>'
    );
    expect(html).toContain('<code>curl https://elonmu.sh/api/news</code>');
  });

  it('sends the console request to /api/news', async () => {
    const js = await Bun.file(
      `${import.meta.dir}/../src/public/static/js/main.js`
    ).text();
    expect(js).toContain("fetch('/api/news'");
    expect(js).not.toContain("fetch('/api'");
  });

  it('documents a response example with the real /api/news keys', () => {
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

  it('points the hero scroll cue at the services', () => {
    expect(html).toMatch(
      /<a class="hero__cue" href="#services"[^>]*aria-hidden="true"/
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
      // /api/news would call NewsAPI for real.
      .filter((url) => url !== '/' && url !== '/api/news');
    expect(urls.length).toBeGreaterThan(0);
    for (const url of new Set(urls)) {
      const res = await fetch(`${server.url}${url}`);
      await res.arrayBuffer();
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
    }
  });
});

const topbarNav = (page: string): string =>
  page.match(/<nav class="topbar__actions"[\s\S]*?<\/nav>/)?.[0] ?? '';

// The text of each link in the topbar nav, in order, ignoring inner markup.
// Visible text only: screen-reader-only notes are dropped.
const navLinks = (page: string): string[] =>
  [...topbarNav(page).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(([, inner]) =>
    inner
      .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
  );

// A made-up catalog entry, for tests that pass createApp their own services.
const testService = (n: number) => ({
  id: `service-${n}`,
  name: `Service ${n}`,
  nav: `S${n}`,
  summary: `Does thing ${n}.`,
  href: `/s${n}`,
  cta: `Open ${n}`
});

// The topbar's GitHub link, from <a to </a>.
const githubLink = (page: string): string =>
  topbarNav(page).match(
    /<a [^>]*href="https:\/\/github\.com\/[^"]*"[^>]*>[\s\S]*?<\/a>/
  )?.[0] ?? '';

describe('topbar', () => {
  it('reads News API · Jet · GitHub', () => {
    expect(navLinks(html)).toEqual(['News API', 'Jet', 'GitHub']);
  });

  it('has no GET /api button', () => {
    const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0];
    expect(topbar).toBeDefined();
    expect(topbar).not.toContain('class="button"');
  });

  it('marks GitHub as external with a mark screen readers skip', () => {
    const github = githubLink(html);
    expect(github).toMatch(/<svg\b[^>]*aria-hidden="true"/);
    // No <title>: the icon must not add to the link's accessible name.
    expect(github).not.toContain('<title');
  });

  it('opens GitHub in a new tab, safely, and says so to screen readers', () => {
    const github = githubLink(html);
    const tag = github.match(/^<a [^>]*>/)?.[0] ?? '';
    expect(tag).toContain('target="_blank"');
    // noopener: the new tab gets no window.opener handle back to this page.
    expect(tag).toMatch(/rel="[^"]*\bnoopener\b[^"]*"/);
    expect(github).toContain(
      '<span class="sr-only"> (opens in a new tab)</span>'
    );
  });

  it('opens only GitHub in a new tab; service links stay in this one', () => {
    const newTab = [
      ...topbarNav(html).matchAll(/<a [^>]*target="_blank"[^>]*>/g)
    ];
    expect(newTab.length).toBe(1);
    expect(newTab[0]?.[0]).toContain('href="https://github.com/');
  });

  it('renders the same nav on / and /jet', async () => {
    const jet = await (await fetch(`${server.url}/jet`)).text();
    expect(navLinks(jet)).toEqual(navLinks(html));
  });

  it('points every nav link and card at a page that exists', async () => {
    const hrefs = [
      ...topbarNav(html).matchAll(/href="(\/[^"]*)"/g),
      ...servicesSection(html).matchAll(/href="(\/[^"]*)"/g)
    ].map(([, href]) => href);
    expect(hrefs.length).toBe(4);
    for (const href of new Set(hrefs)) {
      const [path, fragment] = href.split('#');
      const res = await fetch(`${server.url}${path}`);
      const page = await res.text();
      expect({ href, status: res.status }).toEqual({ href, status: 200 });
      if (fragment) expect(page).toContain(`id="${fragment}"`);
    }
  });

  it('points News API at the docs section', () => {
    expect(html).toMatch(/<a href="\/#get-api"[^>]*>News API<\/a>/);
  });

  it('renders one link per catalog entry, with no template change', async () => {
    const three = await startTestServer(
      createApp({
        jet: sampleJet(),
        services: [testService(1), testService(2), testService(3)]
      })
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

// A tag's text with whitespace collapsed (templates wrap long lines).
const textOf = (page: string, open: RegExp): string => {
  const match = page.match(
    new RegExp(`${open.source}([\\s\\S]*?)</`, open.flags)
  );
  return (match?.[1] ?? '').replace(/\s+/g, ' ').trim();
};

describe('catalog copy', () => {
  it('leads the hero with the service catalog', () => {
    expect(textOf(html, /<p class="hero__lead">/)).toBe(
      'Enterprise-grade tools for monitoring our Lord and Savior, Elon Musk. ' +
        'Random news, private-jet emissions, and whatever we ship next. ' +
        'Free, no key, no signup. /s'
    );
  });

  it('describes the catalog to search engines', () => {
    expect(metaContent(html, 'name="description"')).toBe(
      'Free, satirical tools about Elon Musk: a random-news JSON API and a ' +
        'year-to-date private-jet tracker.'
    );
  });

  it('describes the catalog on shared links', () => {
    const share =
      'Enterprise-grade tools for monitoring our Lord and Savior. Random ' +
      'news as JSON, private-jet emissions on a globe. /s';
    expect(metaContent(html, 'property="og:description"')).toBe(share);
    expect(metaContent(html, 'name="twitter:description"')).toBe(share);
  });

  it('describes the share card it shows', () => {
    expect(metaContent(html, 'property="og:image:alt"')).toBe(
      'Musk as a Service: enterprise-grade tools for monitoring our Lord ' +
        'and Savior. News API, Jet tracker, and more soon.'
    );
  });

  it('serves a share card that is 1200x630 and at most 150 KB', async () => {
    const src = html.match(/content="https:\/\/elonmu\.sh(\/og\.png\?v=\w+)"/);
    const png = new DataView(
      await (await fetch(`${server.url}${src?.[1]}`)).arrayBuffer()
    );
    // PNG IHDR: width and height are the big-endian u32s at bytes 16 and 20.
    expect([png.getUint32(16), png.getUint32(20)]).toEqual([1200, 630]);
    expect(png.byteLength).toBeLessThanOrEqual(150 * 1024);
  });

  it('credits each service data source in the footer', () => {
    const footer = html.match(/<footer[\s\S]*?<\/footer>/)?.[0] ?? '';
    expect(footer).toContain('<a href="https://newsapi.org/">NewsAPI.org</a>');
    expect(footer).toMatch(
      /<a href="https:\/\/bsky\.app\/profile\/elonjet\.net"[^>]*>@elonjet\.net<\/a> by Jack Sweeney/
    );
  });

  it('labels the console as the News API', () => {
    expect(html).toContain(
      '<section class="try" id="try" aria-label="Try the News API">'
    );
  });

  it('drops the single-endpoint copy', () => {
    expect(html).not.toContain('One endpoint');
    expect(html).not.toContain('Stay Informed');
  });
});

const servicesSection = (page: string): string =>
  page.match(
    /<section class="services" id="services"[\s\S]*?<\/section>/
  )?.[0] ?? '';

// Every card in the Services section: its tag, class and href (if a link).
const serviceCards = (page: string) =>
  [
    ...servicesSection(page).matchAll(
      /<(a|div) class="(service(?: [^"]*)?)"(?: href="([^"]*)")?/g
    )
  ].map(([, tag, cls, href]) => ({
    tag,
    cls,
    // An unmatched optional group is undefined at runtime
    href: href as string | undefined
  }));

describe('services section', () => {
  it('sits between the hero and the console', () => {
    const hero = html.search(/<section\s+class="hero"/);
    const services = html.indexOf('<section class="services" id="services"');
    const tryIt = html.indexOf('<section class="try" id="try"');
    expect(hero).toBeGreaterThan(-1);
    expect(services).toBeGreaterThan(hero);
    expect(tryIt).toBeGreaterThan(services);
  });

  it('has the Services heading and its subline', () => {
    const section = servicesSection(html);
    expect(section).toContain('aria-labelledby="services-title"');
    expect(section).toMatch(/<h2 id="services-title">Services<\/h2>/);
    expect(section).toContain('Our product suite. All free, all unsolicited.');
  });

  it('links one card per catalog entry, in order, then More soon', () => {
    expect(serviceCards(html)).toEqual([
      { tag: 'a', cls: 'service', href: '/#get-api' },
      { tag: 'a', cls: 'service', href: '/jet' },
      { tag: 'div', cls: 'service service--soon', href: undefined }
    ]);
    const section = servicesSection(html);
    for (const text of [
      'News API',
      'One random news article about Elon Musk, as JSON.',
      'GET /api/news',
      'Jet tracker',
      'Open the globe',
      'More soon',
      'Shipping next quarter. Which quarter is unspecified.'
    ]) {
      expect(section).toContain(text);
    }
  });

  it('renders one card per entry for any catalog, escaping its text', async () => {
    const three = await startTestServer(
      createApp({
        jet: sampleJet(),
        services: [
          testService(1),
          testService(2),
          { ...testService(3), summary: 'Uses <b>bold</b> & more.' }
        ]
      })
    );
    try {
      const page = await (await fetch(`${three.url}/`)).text();
      expect(serviceCards(page).map(({ href }) => href)).toEqual([
        '/s1',
        '/s2',
        '/s3',
        undefined
      ]);
      expect(servicesSection(page)).toContain(
        'Uses &lt;b&gt;bold&lt;/b&gt; &amp; more.'
      );
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
