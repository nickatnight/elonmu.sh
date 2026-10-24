import { describe, expect, it } from 'bun:test';
import { GazetteerPlaceResolver } from '../../src/jet/places/gazetteer-place-resolver';
import places from '../../src/jet/places/places.json';
import type { HttpGet } from '../../src/jet/ports';
import { BlueskyFlightSource } from '../../src/jet/sources/bluesky/bluesky-flight-source';
import type { FeedPage } from '../../src/jet/sources/bluesky/feed-client';
import feedPages from '../fixtures/elonjet-feed.json';
import { FakeClock, FakeLogger, fakeHttpGet } from './fakes';
import { describeFlightSource } from './flight-source.contract';

const FEED =
  'https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=elonjet.net&limit=100';
const page2Url = `${FEED}&cursor=fixture-page-2`;
const [page1, page2] = feedPages as FeedPage[];

const fixtureHttp = (first: FeedPage = page1) =>
  fakeHttpGet({ [FEED]: first, [page2Url]: page2 });

const failingHttp: HttpGet = () => Promise.reject(new Error('bsky down'));

const makeSource = (
  http: HttpGet,
  options: { logger?: FakeLogger; gazetteer?: Record<string, number[]> } = {}
) =>
  new BlueskyFlightSource({
    http,
    resolver: new GazetteerPlaceResolver(options.gazetteer ?? places),
    logger: options.logger ?? new FakeLogger(),
    clock: new FakeClock('2026-10-23T12:00:00.000Z')
  });

const YEAR = new Date('2026-01-01T00:00:00.000Z');

describeFlightSource('BlueskyFlightSource', {
  make: () => makeSource(fixtureHttp().get),
  makeFailing: () => makeSource(failingHttp),
  since: YEAR
});

const item = (
  rkey: string,
  text: string,
  createdAt: string,
  extra: { reason?: object; handle?: string } = {}
) => ({
  post: {
    uri: `at://did:plc:62cuohm6c6nefpnw4uujepty/app.bsky.feed.post/${rkey}`,
    author: { handle: extra.handle ?? 'elonjet.net' },
    record: { text, createdAt }
  },
  ...(extra.reason ? { reason: extra.reason } : {})
});

describe('BlueskyFlightSource', () => {
  it('credits @elonjet.net', () => {
    expect(makeSource(fixtureHttp().get).attribution).toEqual({
      label: '@elonjet.net by Jack Sweeney',
      url: 'https://bsky.app/profile/elonjet.net'
    });
  });

  it('turns the feed into flights with places, fuel and links to the posts', async () => {
    const flights = await makeSource(fixtureHttp().get).fetchFlights(YEAR);
    expect(flights.length).toBeGreaterThan(20);
    expect(flights.some((f) => f.fuel !== null)).toBe(true);
    const tokyo = flights.find((f) => f.to?.name.startsWith('Tokyo'));
    expect(tokyo?.to?.lat).toBeCloseTo(35.68, 1);
    for (const f of flights) {
      expect(f.sourceUrl).toMatch(
        /^https:\/\/bsky\.app\/profile\/elonjet\.net\/post\/\w+$/
      );
    }
  });

  it('files the older tail-less posts under the Unknown tail', async () => {
    const flights = await makeSource(fixtureHttp().get).fetchFlights(YEAR);
    expect(
      flights.some(
        (f) => f.tail === 'Unknown' && f.to?.name.startsWith('Zurich')
      )
    ).toBe(true);
  });

  it('ignores reposts, even of bot-shaped text', async () => {
    const repost = item(
      'repost1',
      'N8628 Landed in Memphis, Tennessee, United States. Apx. flt. time 1 h.',
      '2026-10-22T22:00:00.000Z',
      {
        reason: { $type: 'app.bsky.feed.defs#reasonRepost' },
        handle: 'someone.else'
      }
    );
    const { get } = fixtureHttp({ ...page1, feed: [repost, ...page1.feed] });
    const flights = await makeSource(get).fetchFlights(YEAR);
    expect(flights.some((f) => f.landedAt === '2026-10-22T22:00:00.000Z')).toBe(
      false
    );
  });

  it('stops paging once posts are older than `since`', async () => {
    const { get, calls } = fixtureHttp();
    await makeSource(get).fetchFlights(new Date('2026-10-01T00:00:00.000Z'));
    expect(calls).toEqual([FEED]);
  });

  it('refreshes with one request when the newest page holds posts it has seen', async () => {
    const { get, calls } = fixtureHttp();
    const source = makeSource(get);
    const first = await source.fetchFlights(YEAR);
    expect(calls).toHaveLength(2);
    const second = await source.fetchFlights(YEAR);
    expect(calls).toHaveLength(3);
    expect(second).toEqual(first);
  });

  it('picks up a new post on refresh', async () => {
    const responses: Record<string, FeedPage> = {
      [FEED]: page1,
      [page2Url]: page2
    };
    const get: HttpGet = async <T>(url: string) => responses[url] as T;
    const source = makeSource(get);
    await source.fetchFlights(YEAR);

    const takeoff = item(
      'new1',
      'N8628 Took off from Austin, Texas, United States.',
      '2026-10-23T09:00:00.000Z'
    );
    responses[FEED] = { ...page1, feed: [takeoff, ...page1.feed] };
    const flights = await source.fetchFlights(YEAR);
    expect(flights.find((f) => f.id === 'new1')).toMatchObject({
      status: 'airborne',
      departedAt: '2026-10-23T09:00:00.000Z'
    });
  });

  it('pages past known posts when asked to reach further back than before', async () => {
    const { get, calls } = fixtureHttp();
    const source = makeSource(get);
    await source.fetchFlights(new Date('2026-10-01T00:00:00.000Z'));
    expect(calls).toEqual([FEED]);
    const flights = await source.fetchFlights(YEAR);
    expect(calls).toEqual([FEED, FEED, page2Url]);
    expect(flights.some((f) => f.to?.name.startsWith('Zurich'))).toBe(true);
  });

  it('throws on a failed page and does not remember a partial crawl', async () => {
    let failPage2 = true;
    const calls: string[] = [];
    const get: HttpGet = async <T>(url: string) => {
      calls.push(url);
      if (url === page2Url && failPage2) throw new Error('bsky down');
      return (url === FEED ? page1 : page2) as T;
    };
    const source = makeSource(get);
    await expect(source.fetchFlights(YEAR)).rejects.toThrow('bsky down');

    failPage2 = false;
    const flights = await source.fetchFlights(YEAR);
    expect(calls.slice(2)).toEqual([FEED, page2Url]);
    expect(flights.some((f) => f.to?.name.startsWith('Zurich'))).toBe(true);
  });

  it('warns about an unknown place once, not on every refresh', async () => {
    const logger = new FakeLogger();
    const withoutTokyo = Object.fromEntries(
      Object.entries(places).filter(([name]) => !name.startsWith('Tokyo'))
    );
    const source = makeSource(fixtureHttp().get, {
      logger,
      gazetteer: withoutTokyo
    });
    await source.fetchFlights(YEAR);
    await source.fetchFlights(YEAR);
    const tokyoWarnings = logger.warnings.filter((w) =>
      (w.meta as { place?: string }).place?.startsWith('Tokyo')
    );
    expect(tokyoWarnings).toHaveLength(1);
  });
});
