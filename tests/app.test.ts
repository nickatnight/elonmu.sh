import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { createApp } from '../src/app';
import { SERVICES } from '../src/catalog';
import { sampleDoge } from './doge/fakes';
import {
  metaContent,
  mp4Duration,
  startTestServer,
  type TestServer,
  webmDuration
} from './helpers';
import { sampleHype } from './hype/fakes';
import { sampleJet } from './jet/fakes';
import { sampleNews } from './news/fakes';

let server: TestServer;
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
  html = await (await fetch(`${server.url}/`)).text();
});

afterAll(() => server.close());

const clip = async (name: string): Promise<Buffer> =>
  Buffer.from(
    await Bun.file(
      `${import.meta.dir}/../src/public/static/video/${name}`
    ).arrayBuffer()
  );

const FRAME_S = 1 / 24;
const LAUNCH_MOTION_ENDS_S = 6.5;

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

  it('loads the hero playback as a module, with a content hash', () => {
    expect(html).toMatch(
      /<script type="module" src="\/static\/js\/hero\.js\?v=[0-9a-f]+"><\/script>/
    );
  });

  it('leaves the reference and the live requests to /docs', () => {
    expect(html).not.toContain('id="try"');
    expect(html).not.toContain('class="console');
    expect(html).not.toContain('id="get-api"');
    expect(html).not.toContain('id="errors"');
    expect(html).not.toContain('curl https://elonmu.sh/api/news');
  });

  it('sends the old #get-api and #errors links on to /docs with a hashed module', () => {
    expect(html).toMatch(
      /<script type="module" src="\/static\/js\/legacy-anchors\.js\?v=[0-9a-f]+"><\/script>/
    );
  });

  it('serves less HTML than main did with the docs on it (18,477 bytes)', () => {
    expect(new TextEncoder().encode(html).byteLength).toBeLessThan(18_477);
  });

  it('never loads docs.css, globe.gl or jet.js', () => {
    expect(html).not.toContain('docs.css');
    expect(html).not.toContain('globe.gl');
    expect(html).not.toContain('jet.js');
  });

  it('does not load console.js, and main.js makes no requests', async () => {
    expect(html).not.toContain('console.js');
    const main = await Bun.file(
      `${import.meta.dir}/../src/public/static/js/main.js`
    ).text();
    expect(main).not.toContain('fetch(');
  });

  it('has no copy buttons, which moved to /docs with the examples', () => {
    expect(html).not.toMatch(/<button[^>]*class="copy"/);
  });

  it('has a testimonials section that says its people are fictional', () => {
    expect(html).toContain('id="testimonials"');
    expect(html.match(/<blockquote/g)?.length).toBe(3);
    expect(html).toContain('AI-generated');
  });

  it('runs hero, services, jet teaser, testimonials, then the footer', () => {
    const at = (marker: string) => html.indexOf(marker);
    const order = [
      'class="hero"',
      '<section class="services"',
      '<section class="teaser"',
      '<section class="praise"',
      '<footer class="footer"'
    ].map(at);
    expect(order.every((i) => i > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("quotes Priya's approved four-curl testimonial", () => {
    const lead =
      html.match(/<figure class="praise__lead">[\s\S]*?<\/figure>/)?.[0] ?? '';
    expect(lead).toContain(
      '<p>We replaced our news desk, our travel desk, our sentiment analyst and our financial adviser with four curls. Morale is down, but uptime is divine.</p>'
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

  it('gives the cruise clip its poster, the reduced-motion still', () => {
    expect(html).toMatch(
      /<video\s+class="hero__video hero__video--cruise"[^>]*poster="\/static\/video\/clown-cruise-poster\.jpg\?v=\w+"/
    );
  });

  it('reads clip durations from the MP4 and WebM headers', async () => {
    expect(mp4Duration(await clip('clown-cruise.mp4'))).toBeCloseTo(4.667, 2);
    expect(webmDuration(await clip('clown-cruise.webm'))).toBeCloseTo(4.667, 2);
  });

  it('cuts the launch clip at 6.5 s, before its frames go still', async () => {
    const mp4 = mp4Duration(await clip('clown-launch.mp4'));
    const webm = webmDuration(await clip('clown-launch.webm'));
    expect(mp4).toBeLessThanOrEqual(LAUNCH_MOTION_ENDS_S);
    expect(Math.abs(webm - mp4)).toBeLessThanOrEqual(FRAME_S);
  });

  it('fades the cruise in over the --hero-handoff time that hero.js reads', async () => {
    const source = (path: string) =>
      Bun.file(`${import.meta.dir}/../src/public/static/${path}`).text();
    const css = await source('css/main.css');
    const js = await source('js/hero.js');
    expect(css).toMatch(/:root\s*\{[^}]*--hero-handoff:\s*\d+m?s;/);
    expect(css).toMatch(
      /\.hero__video--cruise\s*\{[^}]*transition:\s*opacity var\(--hero-handoff\)/
    );
    expect(js).toContain("getPropertyValue('--hero-handoff')");
  });

  it('puts no inline style attributes on the page', () => {
    expect(html).not.toMatch(/\sstyle=/);
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

  it('serves every local asset the page references', async () => {
    const urls = [
      ...html.matchAll(/(?:href|src|poster)="(\/[^/"][^"]*)"/g),
      ...html.matchAll(/url\((\/[^/)][^)]*)\)/g)
    ]
      .map(([, url]) => url)
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

const navLinks = (page: string): string[] =>
  [...topbarNav(page).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map(([, inner]) =>
    inner
      .replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
  );

const testService = (n: number) => ({
  id: `service-${n}`,
  name: `Service ${n}`,
  nav: `S${n}`,
  summary: `Does thing ${n}.`,
  href: `/s${n}`,
  cta: `Open ${n}`,
  api: `/api/s${n}`
});

const ribbon = (page: string): string =>
  page.match(/<a class="ribbon"[\s\S]*?<\/a>/)?.[0] ?? '';

const accessibleName = (link: string): string =>
  link
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const mainCss = () =>
  Bun.file(`${import.meta.dir}/../src/public/static/css/main.css`).text();

const ruleBody = (css: string, selector: string): string =>
  css.match(
    new RegExp(
      `(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`
    )
  )?.[1] ?? '';

describe('topbar', () => {
  it('reads News · Jet · Hype · DOGE · Docs', () => {
    expect(navLinks(html)).toEqual(['News', 'Jet', 'Hype', 'DOGE', 'Docs']);
  });

  it('links Docs to /docs, after the services, marking it current only there', async () => {
    expect(topbarNav(html)).toMatch(/<a href="\/docs">Docs<\/a>/);
    const docs = await (await fetch(`${server.url}/docs`)).text();
    expect(topbarNav(docs)).toMatch(
      /<a href="\/docs" aria-current="page">Docs<\/a>/
    );
    expect(docs.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('has no GET /api button', () => {
    const topbar = html.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0];
    expect(topbar).toBeDefined();
    expect(topbar).not.toContain('class="button"');
  });

  it('carries the fork-me ribbon in the topbar, outside the nav', () => {
    const topbar =
      html.match(/<header class="topbar">[\s\S]*?<\/header>/)?.[0] ?? '';
    expect(topbar).toContain('<a class="ribbon"');
    expect(topbarNav(html)).not.toContain('ribbon');
    expect(topbarNav(html)).not.toContain('github.com');
  });

  it('opens the repo in a new tab, safely', () => {
    const tag = ribbon(html).match(/^<a [^>]*>/)?.[0] ?? '';
    expect(tag).toContain('href="https://github.com/nickatnight/elonmu.sh"');
    expect(tag).toContain('target="_blank"');
    expect(tag).toMatch(/rel="noopener noreferrer"/);
  });

  it('starts its accessible name with the visible band text, with no aria-label', () => {
    const link = ribbon(html);
    expect(link).not.toContain('aria-label');
    expect(accessibleName(link)).toBe(
      'Fork me, Daddy /s (source on GitHub, opens in a new tab)'
    );
    expect(link).toContain(
      '<span class="sr-only"> (source on GitHub, opens in a new tab)</span>'
    );
    expect(link).toMatch(
      /<span class="ribbon__band">Fork me, Daddy \/s<span class="sr-only">/
    );
  });

  it('shows the ribbon on every page', async () => {
    for (const path of ['/news', '/jet', '/hype', '/doge', '/docs']) {
      const page = await (await fetch(`${server.url}${path}`)).text();
      expect({ path, ribbon: ribbon(page) }).toEqual({
        path,
        ribbon: ribbon(html)
      });
    }
    expect(ribbon(html)).not.toBe('');
  });

  it('draws the band from tokens, with a focus outline and no motion', async () => {
    const css = await mainCss();
    const band = ruleBody(css, '.ribbon__band');
    expect(band).toContain('background: var(--accent);');
    expect(band).toContain('color: var(--accent-ink);');
    expect(band).toContain('rotate(45deg)');
    expect(css).toMatch(
      /\.ribbon:focus-visible \.ribbon__band \{[^}]*outline:/
    );
    const ribbonRules = [...css.matchAll(/\.ribbon[\w-]*[^{]*\{([^}]*)\}/g)]
      .map(([, body]) => body)
      .join('');
    expect(ribbonRules).not.toMatch(/animation|transition/);
  });

  it('sizes the ribbon with a clamp() token and never hides it', async () => {
    const css = await mainCss();
    expect(ruleBody(css, ':root')).toMatch(/--ribbon: clamp\(/);
    expect(css).not.toMatch(/\.ribbon[^{]*\{[^}]*display: none/);
  });

  it('lets only the band take clicks, not the corner around it', async () => {
    const css = await mainCss();
    expect(ruleBody(css, '.ribbon')).toContain('pointer-events: none;');
    expect(ruleBody(css, '.ribbon__band')).toContain('pointer-events: auto;');
  });

  it('keeps the nav clear of the band', async () => {
    const css = await mainCss();
    expect(ruleBody(css, '.topbar__actions')).toMatch(
      /padding-inline-end: calc\(var\(--ribbon\)/
    );
    expect(ruleBody(css, '.topbar')).not.toContain('overflow');
  });

  it('keeps the brand name for screen readers when only the icon shows', () => {
    const brand = html.match(/<a class="brand"[\s\S]*?<\/a>/)?.[0] ?? '';
    expect(accessibleName(brand)).toBe('elonmu.sh');
  });

  it('tightens the topbar gaps and nav text below 336 px', async () => {
    const css = await Bun.file(
      `${import.meta.dir}/../src/public/static/css/main.css`
    ).text();
    const declaration = (scope: string, selector: string, prop: string) =>
      scope.match(
        new RegExp(`(?:^|\\n)\\s*${selector} \\{[^}]*\\s${prop}: ([^;]+);`)
      )?.[1] ?? '';
    const smallestPx = (value: string): number => {
      const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
      if (token) return smallestPx(declaration(css, ':root', token));
      const rem = value.match(/^(?:clamp\()?([\d.]+)rem/)?.[1];
      return rem ? Number(rem) * 16 : Number.NaN;
    };
    const narrow = [
      ...css.matchAll(/@media \(max-width: ([\d.]+)rem\) \{([\s\S]*?)\n\}/g)
    ].find(([, maxWidth]) => {
      const upToPx = Number(maxWidth) * 16;
      return upToPx >= 335 && upToPx < 336;
    })?.[2];
    expect(narrow).toBeDefined();
    for (const [selector, prop] of [
      ['\\.topbar', 'gap'],
      ['\\.topbar__actions', 'gap'],
      ['\\.topbar__actions', 'font-size']
    ] as const) {
      const tight = smallestPx(declaration(narrow ?? '', selector, prop));
      const base = smallestPx(declaration(css, selector, prop));
      expect({ selector, prop, tighter: tight < base }).toEqual({
        selector,
        prop,
        tighter: true
      });
    }
  });

  it('opens no nav link in a new tab', () => {
    expect(topbarNav(html)).not.toContain('target="_blank"');
  });

  it('renders the same nav on /, /news, /jet, /hype, /doge and /docs', async () => {
    for (const path of ['/news', '/jet', '/hype', '/doge', '/docs']) {
      const page = await (await fetch(`${server.url}${path}`)).text();
      expect({ path, nav: navLinks(page) }).toEqual({
        path,
        nav: navLinks(html)
      });
    }
  });

  it('points every nav link and card at a page that exists', async () => {
    const hrefs = [
      ...topbarNav(html).matchAll(/href="(\/[^"]*)"/g),
      ...servicesSection(html).matchAll(/href="(\/[^"]*)"/g)
    ].map(([, href]) => href);
    expect(hrefs.length).toBe(13);
    for (const href of new Set(hrefs)) {
      const [path, fragment] = href.split('#');
      const res = await fetch(`${server.url}${path}`);
      const page = await res.text();
      expect({ href, status: res.status }).toEqual({ href, status: 200 });
      if (fragment) expect(page).toContain(`id="${fragment}"`);
    }
  });

  it('points News at its own page, current only there', async () => {
    expect(topbarNav(html)).toMatch(/<a href="\/news">News<\/a>/);
    const news = await (await fetch(`${server.url}/news`)).text();
    expect(topbarNav(news)).toMatch(
      /<a href="\/news" aria-current="page">News<\/a>/
    );
    expect(news.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it('links each service page to its block on /docs', async () => {
    for (const { id, href, api } of SERVICES) {
      const page = await (await fetch(`${server.url}${href}`)).text();
      const link =
        page.match(/<a href="\/docs#[^"]*"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
      expect({ href, link }).toEqual({
        href,
        link: `<a href="/docs#${id}"><code>GET ${api}</code> <span>docs</span></a>`
      });
    }
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
      expect(navLinks(page)).toEqual(['S1', 'S2', 'S3', 'Docs']);
      expect(page).toMatch(/<a href="\/s3"[^>]*>S3<\/a>/);
    } finally {
      await three.close();
    }
  });
});

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
      'Free, satirical tools about Elon Musk: a random-news JSON API, a ' +
        'year-to-date private-jet tracker, a Wikipedia hype meter and DOGE ' +
        'since SNL.'
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

  it('drops the single-endpoint copy', () => {
    expect(html).not.toContain('One endpoint');
    expect(html).not.toContain('Stay Informed');
  });
});

const servicesSection = (page: string): string =>
  page.match(
    /<section class="services" id="services"[\s\S]*?<\/section>/
  )?.[0] ?? '';

const serviceCards = (page: string) =>
  [
    ...servicesSection(page).matchAll(
      /<(article|div) class="(service(?: [^"]*)?)">([\s\S]*?)<\/\1>/g
    )
  ].map(([, tag, cls, body]) => ({
    tag,
    cls,
    links: [...body.matchAll(/<a [^>]*href="([^"]*)"/g)].map(([, href]) => href)
  }));

describe('services section', () => {
  it('sits between the hero and the jet teaser', () => {
    const hero = html.search(/<section\s+class="hero"/);
    const services = html.indexOf('<section class="services" id="services"');
    const teaser = html.indexOf('<section class="teaser"');
    expect(hero).toBeGreaterThan(-1);
    expect(services).toBeGreaterThan(hero);
    expect(teaser).toBeGreaterThan(services);
  });

  it('has the Services heading and its subline', () => {
    const section = servicesSection(html);
    expect(section).toContain('aria-labelledby="services-title"');
    expect(section).toMatch(/<h2 id="services-title">Services<\/h2>/);
    expect(section).toContain('Our product suite. All free, all unsolicited.');
  });

  it('links one card per catalog entry, in order, then More soon', () => {
    expect(serviceCards(html)).toEqual([
      { tag: 'article', cls: 'service', links: ['/news', '/docs#news-api'] },
      { tag: 'article', cls: 'service', links: ['/jet', '/docs#jet-tracker'] },
      { tag: 'article', cls: 'service', links: ['/hype', '/docs#hype-meter'] },
      {
        tag: 'article',
        cls: 'service',
        links: ['/doge', '/docs#doge-since-snl']
      },
      { tag: 'div', cls: 'service service--soon', links: [] }
    ]);
    const section = servicesSection(html);
    for (const text of [
      'News roulette',
      'One random news article about Elon Musk. Spin again for another.',
      'Spin the wheel',
      'Jet tracker',
      'Open the globe',
      'Hype meter',
      'A year of Wikipedia views for Elon Musk, read like a seismograph. Aftershocks included.',
      'Read the tremors',
      'DOGE since SNL',
      'What your Dogecoin from the night he hosted SNL is worth today.',
      'Check the damage',
      'More soon',
      'Shipping next quarter. Which quarter is unspecified.'
    ]) {
      expect(section).toContain(text);
    }
  });

  it('links the name to the page and stretches that link over the card', async () => {
    const section = servicesSection(html);
    for (const { name, href } of SERVICES)
      expect(section).toContain(
        `<h3 class="service__name"><a class="service__link" href="${href}">${name}</a></h3>`
      );
    const css = await mainCss();
    const stretch = ruleBody(css, '.service__link::after');
    expect(stretch).toContain('position: absolute;');
    expect(stretch).toContain('inset: 0;');
    expect(ruleBody(css, '.service')).toContain('position: relative;');
  });

  it('ends each card with one endpoint link to its docs block, above the stretched link', async () => {
    const section = servicesSection(html);
    for (const { id, api } of SERVICES)
      expect(section).toContain(
        `<a class="service__endpoint" href="/docs#${id}"><code>GET ${api}</code> <span>docs</span></a>`
      );
    const css = await mainCss();
    const row = ruleBody(css, '.service__endpoint');
    expect(row).toContain('position: relative;');
    expect(row).toMatch(/z-index: [1-9]/);
    expect(row).toMatch(/border-top: 1px solid /);
    expect(row).toContain('font-family: var(--font-code);');
  });

  it('puts the name link before the endpoint link, and never nests links', () => {
    const section = servicesSection(html);
    for (const link of section.match(/<a [^>]*>[\s\S]*?<\/a>/g) ?? [])
      expect(link.slice(2)).not.toContain('<a ');
    for (const { id, href } of SERVICES)
      expect(section.indexOf(`href="${href}"`)).toBeLessThan(
        section.indexOf(`href="/docs#${id}"`)
      );
  });

  it('shows a focus ring around the whole card for the name link', async () => {
    const css = await mainCss();
    expect(css).toMatch(
      /\.service__link:focus-visible::after \{[^}]*outline: 2px solid var\(--accent\);/
    );
  });

  it('lays the cards out two by two on desktop, an odd last card spanning the row at its own height', async () => {
    const css = await Bun.file(
      `${import.meta.dir}/../src/public/static/css/main.css`
    ).text();
    const desktop =
      css.match(
        /@media \(min-width: 56\.25rem\) \{\s*\.services__grid \{([^}]*)\}/
      )?.[1] ?? '';
    const columns = Number(
      desktop.match(
        /grid-template-columns: repeat\((\d+), minmax\(0, 1fr\)\);/
      )?.[1]
    );
    expect(columns).toBe(2);
    const desktopBlock =
      css.match(/@media \(min-width: 56\.25rem\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
    const oddLast =
      desktopBlock.match(
        /\.services__grid > li:last-child:nth-child\(odd\) \{([^}]*)\}/
      )?.[1] ?? '';
    expect(oddLast).toContain('grid-column: 1 / -1;');
    expect(oddLast).toContain('align-self: start;');
    expect(oddLast).not.toContain('min-height');
    expect(desktop).not.toContain('grid-auto-rows');
    const base = css.match(/\n\.services__grid \{([^}]*)\}/)?.[1] ?? '';
    expect(base).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(base).not.toContain('grid-auto-rows');
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
      expect(serviceCards(page).map(({ links }) => links)).toEqual([
        ['/s1', '/docs#service-1'],
        ['/s2', '/docs#service-2'],
        ['/s3', '/docs#service-3'],
        []
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
