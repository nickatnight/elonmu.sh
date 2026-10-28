import { describe, expect, it } from 'bun:test';
import type { DayViews } from '../../src/hype/domain';
import { parseItems } from '../../src/hype/sources/wikimedia/parse';
import capture from '../fixtures/wikimedia-pageviews.json';

const item = (timestamp: string, views: unknown) => ({
  project: 'en.wikipedia',
  article: 'Elon_Musk',
  granularity: 'daily',
  timestamp,
  access: 'all-access',
  agent: 'user',
  views
});

describe('parseItems on the captured year of Elon Musk pageviews', () => {
  const days = parseItems(capture.items);

  it('keeps every one of the 365 days', () => {
    expect(days).toHaveLength(365);
  });

  it.each([
    ['2025-10-27', 19194],
    ['2026-06-12', 194434],
    ['2026-06-13', 186157],
    ['2026-10-26', 22904]
  ])('reads %s as %d views', (date, views) => {
    expect(days.find((d) => d.date === date)).toEqual({ date, views });
  });

  it('returns days in ascending order, each date once', () => {
    const dates = days.map((d) => d.date);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(dates).size).toBe(dates.length);
  });

  it('carries no Wikimedia fields', () => {
    for (const day of days) expect(Object.keys(day)).toEqual(['date', 'views']);
  });

  it('leaves a day Wikimedia omitted missing, not zero', () => {
    const withGap = capture.items.filter((i) => i.timestamp !== '2026061300');
    const parsed = parseItems(withGap);
    expect(parsed).toHaveLength(364);
    expect(parsed.some((d) => d.date === '2026-06-13')).toBe(false);
    expect(parsed.some((d) => d.views === 0)).toBe(false);
  });
});

type Case = { name: string; items: unknown[]; want: DayViews[] };

const cases: Case[] = [
  {
    name: 'a gap',
    items: [item('2026090100', 10), item('2026090300', 30)],
    want: [
      { date: '2026-09-01', views: 10 },
      { date: '2026-09-03', views: 30 }
    ]
  },
  {
    name: 'a duplicate date (the first one wins)',
    items: [item('2026090100', 10), item('2026090100', 99)],
    want: [{ date: '2026-09-01', views: 10 }]
  },
  {
    name: 'days out of order',
    items: [item('2026090200', 20), item('2026090100', 10)],
    want: [
      { date: '2026-09-01', views: 10 },
      { date: '2026-09-02', views: 20 }
    ]
  },
  {
    name: 'zero views on a day that was loaded',
    items: [item('2026090100', 0)],
    want: [{ date: '2026-09-01', views: 0 }]
  },
  { name: 'no items', items: [], want: [] }
];

describe('parseItems on small responses', () => {
  it.each(cases)('handles $name', ({ items, want }) => {
    expect(parseItems(items)).toEqual(want);
  });

  it.each([
    ['negative views', [item('2026090100', -1)]],
    ['fractional views', [item('2026090100', 1.5)]],
    ['views beyond the safe integer range', [item('2026090100', 2 ** 53)]],
    ['views as a string', [item('2026090100', '10')]],
    ['missing views', [{ timestamp: '2026090100' }]],
    ['a timestamp that is not YYYYMMDDHH', [item('2026-09-01', 10)]],
    ['a date that does not exist', [item('2026023000', 10)]],
    ['items that are not a list', { timestamp: '2026090100', views: 1 }],
    ['an item that is not an object', [null]]
  ])('rejects %s', (_name, items) => {
    expect(() => parseItems(items)).toThrow();
  });
});
