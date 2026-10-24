import { describe, expect, it } from 'bun:test';
import type { Flight, JetSnapshot } from '../../src/jet/domain';
import { arcPath, orthographic, TEASER_SIZE } from '../../src/jet/projection';
import { toTeaser } from '../../src/jet/teaser';
import { flight, places } from './fakes';

const newDelhi = { name: 'New Delhi, Delhi, India', lat: 28.61, lon: 77.21 };

const snap = (flights: Flight[], year = 2026): JetSnapshot => ({
  year,
  updatedAt: '2026-10-23T12:00:00.000Z',
  attribution: {
    label: '@elonjet.net by Jack Sweeney',
    url: 'https://bsky.app/profile/elonjet.net'
  },
  flights,
  totals: {
    flights: flights.length,
    hours: 10,
    gallons: 4000,
    usd: 30000,
    co2Tons: 40
  }
});

const flights: Flight[] = [
  flight({
    id: 'newest',
    from: places.hawthorne,
    to: places.austin,
    departedAt: '2026-10-22T15:00:00.000Z',
    durationMin: 160
  }),
  flight({ id: 'hop', from: places.austin, to: places.austin }),
  flight({ id: 'arrival', from: null, departedAt: null }),
  flight({ id: 'far-side', from: places.tokyo, to: newDelhi }),
  flight({ id: 'oldest', from: places.austin, to: places.sanJose })
];

describe('toTeaser', () => {
  it('draws one arc per flight whose arc is visible, oldest first so the latest sits on top', () => {
    const teaser = toTeaser(snap(flights));
    expect(teaser.arcs.map((a) => a.id)).toEqual(['oldest', 'newest']);
    expect(teaser.arcs.map((a) => a.latest)).toEqual([false, true]);
  });

  it('uses the shared projection for each path, in the image’s coordinates', () => {
    const teaser = toTeaser(snap(flights));
    expect(teaser.size).toBe(TEASER_SIZE);
    expect(teaser.arcs[0].d).toBe(arcPath(places.austin, places.sanJose));
  });

  it('leaves out local hops, one-ended and far-side flights, but still counts them', () => {
    const teaser = toTeaser(snap(flights));
    expect(
      teaser.arcs.some((a) => ['hop', 'arrival', 'far-side'].includes(a.id))
    ).toBe(false);
    expect(teaser.totalsLine).toContain('5 flights');
    expect(teaser.summary).toContain('5 flights');
  });

  it('describes the newest flight and the year for screen readers', () => {
    const teaser = toTeaser(snap(flights));
    expect(teaser.latest).toBe(
      'Latest: Hawthorne → Austin, Oct 22 · 2 h 40 min'
    );
    expect(teaser.summary).toBe(
      'Map of 5 flights so far in 2026. Latest: Hawthorne → Austin, Oct 22 · 2 h 40 min'
    );
  });

  it('marks an airborne newest flight at its origin, with no guessed arc', () => {
    const teaser = toTeaser(
      snap([
        flight({
          id: 'up',
          to: null,
          landedAt: null,
          durationMin: null,
          status: 'airborne',
          departedAt: '2026-10-23T14:05:00.000Z'
        }),
        ...flights.slice(4)
      ])
    );
    const austin = orthographic(places.austin);
    expect(teaser.origin?.x).toBeCloseTo(austin.x, 1);
    expect(teaser.origin?.y).toBeCloseTo(austin.y, 1);
    expect(teaser.arcs.map((a) => [a.id, a.latest])).toEqual([
      ['oldest', false]
    ]);
    expect(teaser.latest).toBe('In the air since 14:05 UTC from Austin');
  });

  it('has no origin marker when the airborne origin is on the far side', () => {
    const teaser = toTeaser(
      snap([
        flight({
          id: 'up',
          from: places.tokyo,
          to: null,
          landedAt: null,
          durationMin: null,
          status: 'airborne'
        })
      ])
    );
    expect(teaser.origin).toBeNull();
  });

  it('is empty, with no latest line, before the year’s first flight', () => {
    const teaser = toTeaser(snap([], 2027));
    expect(teaser.empty).toBe(true);
    expect(teaser.arcs).toEqual([]);
    expect(teaser.origin).toBeNull();
    expect(teaser.latest).toBeNull();
    expect(teaser.summary).toBe('Map with no flights yet in 2027.');
  });
});
