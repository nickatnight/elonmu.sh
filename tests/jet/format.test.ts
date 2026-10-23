import { describe, expect, it } from 'bun:test';
import type { JetSnapshot } from '../../src/jet/domain';
import {
  formatDuration,
  formatTotals,
  jetPage,
  latestSentence,
  totalsLine
} from '../../src/jet/format';
import { flight, places } from './fakes';

const snapshot = (flights = [flight()]): JetSnapshot => ({
  year: 2026,
  updatedAt: '2026-10-23T12:00:00.000Z',
  attribution: {
    label: '@elonjet.net by Jack Sweeney',
    url: 'https://bsky.app/profile/elonjet.net'
  },
  flights,
  totals: {
    flights: 313,
    hours: 515.4333,
    gallons: 153457,
    usd: 1077860,
    co2Tons: 1614.6027
  }
});

describe('totals', () => {
  it('rounds to plain, readable numbers with units', () => {
    expect(
      totalsLine({
        flights: 313,
        hours: 515.4333,
        gallons: 153457,
        usd: 1077860,
        co2Tons: 1614.6027
      })
    ).toBe('313 flights · 515 h · 153,000 gal · $1.08M fuel · 1,610 t CO₂');
  });

  it('keeps small numbers exact and says 1 flight, not 1 flights', () => {
    expect(
      totalsLine({
        flights: 1,
        hours: 2.5,
        gallons: 782,
        usd: 6083,
        co2Tons: 8
      })
    ).toBe('1 flight · 3 h · 782 gal · $6.08K fuel · 8 t CO₂');
  });

  it('reads all zeros for an empty year', () => {
    expect(
      totalsLine({ flights: 0, hours: 0, gallons: 0, usd: 0, co2Tons: 0 })
    ).toBe('0 flights · 0 h · 0 gal · $0 fuel · 0 t CO₂');
  });

  it('splits into value and unit parts for layout', () => {
    expect(
      formatTotals({
        flights: 313,
        hours: 515.4,
        gallons: 153457,
        usd: 1077860,
        co2Tons: 1614.6
      })
    ).toEqual([
      { value: '313', unit: 'flights' },
      { value: '515', unit: 'h' },
      { value: '153,000', unit: 'gal' },
      { value: '$1.08M', unit: 'fuel' },
      { value: '1,610', unit: 't CO₂' }
    ]);
  });
});

describe('formatDuration', () => {
  it('writes hours and minutes the way the bot does', () => {
    expect(formatDuration(125)).toBe('2 h 5 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(180)).toBe('3 h');
    expect(formatDuration(0)).toBe('0 min');
  });
});

describe('latestSentence', () => {
  it('describes the newest landed flight', () => {
    expect(
      latestSentence([
        flight({
          from: places.austin,
          to: places.sanJose,
          departedAt: '2026-10-21T14:00:00.000Z',
          durationMin: 125
        })
      ])
    ).toBe('Latest: Austin → San Jose, Oct 21 · 2 h 5 min');
  });

  it('says where an airborne flight left from and when, in UTC', () => {
    expect(
      latestSentence([
        flight({
          status: 'airborne',
          to: null,
          landedAt: null,
          durationMin: null,
          departedAt: '2026-10-23T14:05:00.000Z'
        })
      ])
    ).toBe('In the air since 14:05 UTC from Austin');
  });

  it('is null when there are no flights', () => {
    expect(latestSentence([])).toBeNull();
  });
});

describe('jetPage', () => {
  it('builds one row per flight with route, date, duration, fuel and post link', () => {
    const page = jetPage(snapshot());
    expect(page.flights).toEqual([
      {
        id: 'f1',
        tail: 'N628TS',
        datetime: '2026-03-01T14:00:00.000Z',
        date: 'Mar 1',
        route: 'Austin → San Jose',
        places:
          'Austin, Texas, United States → San Jose, California, United States',
        duration: '3 h 30 min',
        fuel: '$6,000 · 1,000 gal · 10 t CO₂',
        status: 'landed',
        note: null,
        sourceUrl: 'https://example.com/f1',
        latest: true
      }
    ]);
  });

  it('names arrival-only and airborne flights in words, not with a missing end', () => {
    const page = jetPage(
      snapshot([
        flight({
          id: 'up',
          status: 'airborne',
          to: null,
          landedAt: null,
          durationMin: null,
          fuel: null,
          departedAt: '2026-10-23T14:05:00.000Z'
        }),
        flight({
          id: 'arr',
          from: null,
          departedAt: null,
          landedAt: '2026-10-20T09:00:00.000Z'
        })
      ])
    );
    expect(page.flights[0]).toMatchObject({
      route: 'In the air from Austin',
      note: 'In the air since 14:05 UTC from Austin',
      latest: true
    });
    expect(page.flights[1]).toMatchObject({
      route: 'Arrived in San Jose',
      datetime: '2026-10-20T09:00:00.000Z',
      latest: false
    });
  });

  it('drops a source link that is not https', () => {
    const page = jetPage(
      snapshot([flight({ sourceUrl: 'javascript:alert(1)' })])
    );
    expect(page.flights[0].sourceUrl).toBeNull();
  });

  it('counts flights per tail, Unknown last', () => {
    const page = jetPage(
      snapshot([
        flight({ id: 'a', tail: 'Unknown' }),
        flight({ id: 'b', tail: 'N8628' }),
        flight({ id: 'c', tail: 'N7628' }),
        flight({ id: 'd', tail: 'N8628' })
      ])
    );
    expect(page.tails).toEqual([
      { tail: 'N7628', count: 1 },
      { tail: 'N8628', count: 2 },
      { tail: 'Unknown', count: 1 }
    ]);
  });

  it('carries the totals, year and attribution through', () => {
    const page = jetPage(snapshot());
    expect(page.year).toBe(2026);
    expect(page.totalsLine).toBe(
      '313 flights · 515 h · 153,000 gal · $1.08M fuel · 1,610 t CO₂'
    );
    expect(page.attribution.label).toBe('@elonjet.net by Jack Sweeney');
  });
});
