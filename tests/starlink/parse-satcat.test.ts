import { describe, expect, it } from 'bun:test';
import { parseSatcat } from '../../src/starlink/sources/celestrak/parse-satcat';
import capture from '../fixtures/celestrak-starlink-satcat.json';

const byId = (id: number) => {
  const record = capture.find((r) => r.NORAD_CAT_ID === id);
  if (!record) throw new Error(`fixture lost ${id}`);
  return record;
};

const STARLINK_1309 = byId(45414);

const withField = (field: string, value: unknown): Record<string, unknown> => ({
  ...STARLINK_1309,
  [field]: value
});

const without = (field: string): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(STARLINK_1309).filter(([key]) => key !== field)
  );

describe('parseSatcat on the captured Starlink catalogue', () => {
  const reentries = parseSatcat(capture);

  it('keeps the 121 satellites that have come down, and none still in orbit', () => {
    expect(capture).toHaveLength(181);
    expect(capture.filter((r) => r.DECAY_DATE === '')).toHaveLength(60);
    expect(reentries).toHaveLength(121);
  });

  it('reads STARLINK-1309 as launched 2020-03-18 and burned up 2026-10-29', () => {
    expect(reentries.find((r) => r.id === 45414)).toEqual({
      id: 45414,
      name: 'STARLINK-1309',
      launched: '2020-03-18',
      reentered: '2026-10-29'
    });
  });

  it('keeps re-entries on both sides of New Year with their own dates', () => {
    const around = reentries
      .filter((r) => r.reentered >= '2025-12-30' && r.reentered <= '2026-01-03')
      .map((r) => r.reentered)
      .sort();
    expect(around).toEqual([
      '2025-12-30',
      '2025-12-30',
      '2025-12-30',
      '2025-12-31',
      '2025-12-31',
      '2025-12-31',
      '2026-01-02',
      '2026-01-03'
    ]);
  });

  it('keeps the debris CelesTrak lists under a Starlink name', () => {
    expect(
      reentries.filter((r) => r.name === 'STARLINK-34343 DEB').length
    ).toBe(2);
  });

  it('carries no CelesTrak field names', () => {
    expect(JSON.stringify(reentries)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });
});

type Skip = { name: string; record: unknown };

const skipped: Skip[] = [
  { name: 'a record that is not an object', record: 45414 },
  {
    name: 'an empty DECAY_DATE (still in orbit)',
    record: withField('DECAY_DATE', '')
  },
  { name: 'a null DECAY_DATE', record: withField('DECAY_DATE', null) },
  { name: 'no DECAY_DATE', record: without('DECAY_DATE') },
  { name: 'an empty LAUNCH_DATE', record: withField('LAUNCH_DATE', '') },
  { name: 'no LAUNCH_DATE', record: without('LAUNCH_DATE') },
  {
    name: 'a LAUNCH_DATE in another format',
    record: withField('LAUNCH_DATE', '18 Mar 2020')
  },
  {
    name: 'a DECAY_DATE that does not exist',
    record: withField('DECAY_DATE', '2026-02-30')
  },
  {
    name: 'a DECAY_DATE before its LAUNCH_DATE',
    record: withField('DECAY_DATE', '2020-03-17')
  },
  { name: 'no NORAD_CAT_ID', record: without('NORAD_CAT_ID') },
  { name: 'a string NORAD_CAT_ID', record: withField('NORAD_CAT_ID', '45414') },
  { name: 'no OBJECT_NAME', record: without('OBJECT_NAME') },
  { name: 'a blank OBJECT_NAME', record: withField('OBJECT_NAME', '') }
];

describe('parseSatcat skips a record it cannot use and keeps the rest', () => {
  const others = [byId(57302), byId(44741)];

  it.each(skipped.map((c) => [c.name, c.record]))(
    'skips %s',
    (_name, record) => {
      expect(parseSatcat([record, ...others]).map((r) => r.id)).toEqual([
        57302, 44741
      ]);
    }
  );

  it('keeps the first record when an id repeats', () => {
    const again = { ...STARLINK_1309, OBJECT_NAME: 'STARLINK-AGAIN' };
    expect(parseSatcat([STARLINK_1309, again]).map((r) => r.name)).toEqual([
      'STARLINK-1309'
    ]);
  });

  it('accepts a satellite that came down the day it launched', () => {
    const sameDay = withField('DECAY_DATE', '2020-03-18');
    expect(parseSatcat([sameDay])[0]?.reentered).toBe('2020-03-18');
  });
});

describe('parseSatcat throws rather than return no re-entries', () => {
  it.each([
    ['an empty array', []],
    ['an object', { error: 'no records' }],
    ['a string', 'No SATCAT records found'],
    ['null', null],
    ['only satellites still in orbit', capture.filter((r) => !r.DECAY_DATE)]
  ])('throws on %s', (_name, body) => {
    expect(() => parseSatcat(body)).toThrow();
  });
});
