import { describe, expect, it } from 'bun:test';
import {
  rangeUrl,
  WikimediaPageviewSource
} from '../../src/hype/sources/wikimedia/wikimedia-pageview-source';
import { fakeHttpGet } from '../fakes';
import capture from '../fixtures/wikimedia-pageviews.json';
import { capturedDays, day, InMemoryPageviewSource } from './fakes';
import { describePageviewSource } from './pageview-source.contract';

const FROM = new Date('2026-06-01T00:00:00.000Z');
const TO = new Date('2026-06-30T00:00:00.000Z');
const MISSING = '2026-06-13';

const withoutMissing = {
  items: capture.items.filter((i) => i.timestamp !== '2026061300')
};

describePageviewSource('WikimediaPageviewSource', {
  make: () =>
    new WikimediaPageviewSource({
      http: fakeHttpGet({ [rangeUrl(FROM, TO)]: withoutMissing }).get
    }),
  makeFailing: () => new WikimediaPageviewSource({ http: fakeHttpGet({}).get }),
  from: FROM,
  to: TO,
  missing: MISSING
});

describePageviewSource('InMemoryPageviewSource', {
  make: () =>
    new InMemoryPageviewSource(
      capturedDays().filter((d) => d.date !== MISSING)
    ),
  makeFailing: () =>
    new InMemoryPageviewSource(capturedDays(), {
      error: new Error('upstream down')
    }),
  from: FROM,
  to: TO,
  missing: MISSING
});

describe('WikimediaPageviewSource', () => {
  const YEAR_FROM = new Date('2025-10-27T00:00:00.000Z');
  const YEAR_TO = new Date('2026-10-26T00:00:00.000Z');

  it('asks for daily user views of the Elon Musk article over the range', async () => {
    const http = fakeHttpGet({ [rangeUrl(YEAR_FROM, YEAR_TO)]: capture });
    await new WikimediaPageviewSource({ http: http.get }).fetchDays(
      YEAR_FROM,
      YEAR_TO
    );
    expect(http.calls).toEqual([
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Elon_Musk/daily/20251027/20261026'
    ]);
  });

  it('returns the captured year as 365 days', async () => {
    const http = fakeHttpGet({ [rangeUrl(YEAR_FROM, YEAR_TO)]: capture });
    const days = await new WikimediaPageviewSource({
      http: http.get
    }).fetchDays(YEAR_FROM, YEAR_TO);
    expect(days).toHaveLength(365);
    expect(days[0]).toEqual(day('2025-10-27', 19194));
  });

  it('throws when Wikimedia answers 404 for a range it has not loaded', async () => {
    const notLoaded = async <T>(): Promise<T> => {
      throw new Error('Request failed with status code 404');
    };
    await expect(
      new WikimediaPageviewSource({ http: notLoaded }).fetchDays(TO, TO)
    ).rejects.toThrow('404');
  });

  it('throws on a body without items', async () => {
    const http = fakeHttpGet({ [rangeUrl(FROM, TO)]: { detail: 'nope' } });
    await expect(
      new WikimediaPageviewSource({ http: http.get }).fetchDays(FROM, TO)
    ).rejects.toThrow();
  });
});

describe('InMemoryPageviewSource', () => {
  it('serves only the days inside the range', async () => {
    const source = new InMemoryPageviewSource([
      day('2026-05-31', 1),
      day('2026-06-01', 2),
      day('2026-06-30', 3),
      day('2026-07-01', 4)
    ]);
    expect(await source.fetchDays(FROM, TO)).toEqual([
      day('2026-06-01', 2),
      day('2026-06-30', 3)
    ]);
  });
});
