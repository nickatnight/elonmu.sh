import { describe, expect, it } from 'bun:test';
import { parseGp } from '../../src/starlink/sources/celestrak/parse-gp';
import { inTimeZone } from '../fakes';
import capture from '../fixtures/celestrak-starlink-gp.json';

const STARLINK_1008 = capture.find((r) => r.NORAD_CAT_ID === 44714);
if (!STARLINK_1008) throw new Error('fixture lost STARLINK-1008');

const without = (field: string): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(STARLINK_1008).filter(([key]) => key !== field)
  );

const withField = (field: string, value: unknown): Record<string, unknown> => ({
  ...STARLINK_1008,
  [field]: value
});

describe('parseGp on the captured Starlink GP group', () => {
  const satellites = parseGp(capture);

  it('keeps every one of the 200 captured satellites', () => {
    expect(satellites).toHaveLength(200);
  });

  it('reads STARLINK-1008 into the domain fields, epoch as UTC', () => {
    expect(satellites.find((s) => s.id === 44714)).toEqual({
      id: 44714,
      name: 'STARLINK-1008',
      epoch: '2026-10-28T20:33:11.108Z',
      meanMotion: 15.68273203,
      meanMotionDot: 0.00034042,
      eccentricity: 0.00017858,
      inclination: 53.1434,
      raan: 138.747,
      argOfPerigee: 162.3219,
      meanAnomaly: 197.7861
    });
  });

  it('keeps the [DTC] suffix CelesTrak puts on direct-to-cell satellites', () => {
    expect(
      satellites.filter((s) => s.name.endsWith(' [DTC]')).length
    ).toBeGreaterThan(0);
  });

  it('carries no CelesTrak field names', () => {
    expect(JSON.stringify(satellites)).not.toMatch(/[A-Z]{2,}_[A-Z]/);
  });
});

describe('parseGp epochs', () => {
  it.each([
    ['2026-10-28T20:33:11.108448', '2026-10-28T20:33:11.108Z'],
    ['2026-10-28T20:33:11.1089', '2026-10-28T20:33:11.109Z'],
    ['2026-10-28T20:33:11', '2026-10-28T20:33:11.000Z'],
    ['2026-12-31T23:59:59.9996', '2027-01-01T00:00:00.000Z'],
    ['2026-10-28T20:33:11.108Z', '2026-10-28T20:33:11.108Z']
  ])('reads %s as %s, in UTC whatever the local zone', async (epoch, iso) => {
    await inTimeZone('America/Los_Angeles', () => {
      expect(parseGp([withField('EPOCH', epoch)])[0]?.epoch).toBe(iso);
    });
  });
});

type Skip = { name: string; record: unknown };

const skipped: Skip[] = [
  { name: 'a record that is not an object', record: 'STARLINK-1008' },
  { name: 'no NORAD_CAT_ID', record: without('NORAD_CAT_ID') },
  { name: 'a fractional NORAD_CAT_ID', record: withField('NORAD_CAT_ID', 1.5) },
  { name: 'a NORAD_CAT_ID of 0', record: withField('NORAD_CAT_ID', 0) },
  { name: 'no OBJECT_NAME', record: without('OBJECT_NAME') },
  { name: 'a blank OBJECT_NAME', record: withField('OBJECT_NAME', '  ') },
  { name: 'no EPOCH', record: without('EPOCH') },
  { name: 'an EPOCH in another format', record: withField('EPOCH', '26302.5') },
  {
    name: 'an EPOCH on a day that does not exist',
    record: withField('EPOCH', '2026-02-30T00:00:00')
  },
  {
    name: 'an EPOCH with a zone offset',
    record: withField('EPOCH', '2026-10-28T20:33:11+02:00')
  },
  { name: 'no MEAN_MOTION', record: without('MEAN_MOTION') },
  {
    name: 'a MEAN_MOTION as a string',
    record: withField('MEAN_MOTION', '15.68')
  },
  { name: 'a MEAN_MOTION of 0', record: withField('MEAN_MOTION', 0) },
  { name: 'no MEAN_MOTION_DOT', record: without('MEAN_MOTION_DOT') },
  {
    name: 'an infinite MEAN_MOTION_DOT',
    record: withField('MEAN_MOTION_DOT', Number.POSITIVE_INFINITY)
  },
  { name: 'a NaN ECCENTRICITY', record: withField('ECCENTRICITY', Number.NaN) },
  { name: 'an ECCENTRICITY of 1', record: withField('ECCENTRICITY', 1) },
  {
    name: 'a negative ECCENTRICITY',
    record: withField('ECCENTRICITY', -0.001)
  },
  { name: 'no INCLINATION', record: without('INCLINATION') },
  { name: 'an INCLINATION over 180', record: withField('INCLINATION', 181) },
  { name: 'no RA_OF_ASC_NODE', record: without('RA_OF_ASC_NODE') },
  { name: 'no ARG_OF_PERICENTER', record: without('ARG_OF_PERICENTER') },
  { name: 'no MEAN_ANOMALY', record: without('MEAN_ANOMALY') },
  { name: 'a null MEAN_ANOMALY', record: withField('MEAN_ANOMALY', null) }
];

describe('parseGp skips a bad record and keeps the rest', () => {
  it.each(skipped.map((c) => [c.name, c.record]))(
    'skips %s',
    (_name, record) => {
      const parsed = parseGp([record, ...capture.slice(1, 3)]);
      expect(parsed.map((s) => s.id)).toEqual(
        capture.slice(1, 3).map((r) => r.NORAD_CAT_ID)
      );
    }
  );

  it('keeps the first record when an id repeats', () => {
    const again = { ...capture[1], OBJECT_NAME: 'STARLINK-AGAIN' };
    const parsed = parseGp([capture[1], again]);
    expect(parsed.map((s) => s.name)).toEqual([capture[1].OBJECT_NAME]);
  });
});

describe('parseGp throws rather than return no satellites', () => {
  it.each([
    ['an empty array', []],
    ['an object', { error: 'GROUP not found' }],
    ['a string', 'No GP data found'],
    ['null', null],
    ['only bad records', [without('EPOCH'), 'STARLINK-1008']]
  ])('throws on %s', (_name, body) => {
    expect(() => parseGp(body)).toThrow();
  });
});
