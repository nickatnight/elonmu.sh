import { describe, expect, it } from 'bun:test';
import type { Flight, JetSnapshot } from '../../src/jet/domain';
import {
  ARC_LATEST,
  ARC_OLDER,
  focusPoint,
  limitToReveal,
  PAGE_SIZE,
  pageOf,
  parseSnapshot,
  routeColor,
  toScene
} from '../../src/public/static/js/jet.js';
import { flight, places } from './fakes';

const snap = (flights: Flight[]): JetSnapshot => ({
  year: 2026,
  updatedAt: '2026-10-23T12:00:00.000Z',
  attribution: { label: 'Test', url: 'https://example.com' },
  flights,
  totals: { flights: flights.length, hours: 0, gallons: 0, usd: 0, co2Tons: 0 }
});

// Newest first, as the API sends them.
const flights: Flight[] = [
  flight({
    id: 'up',
    tail: 'N8628',
    to: null,
    landedAt: null,
    durationMin: null,
    status: 'airborne',
    departedAt: '2026-10-23T10:00:00.000Z'
  }),
  flight({ id: 'hop', tail: 'N8628', from: places.austin, to: places.austin }),
  flight({ id: 'arr', tail: 'N7628', from: null, departedAt: null }),
  flight({
    id: 'a-sj',
    tail: 'N7628',
    from: places.austin,
    to: places.sanJose
  }),
  flight({
    id: 'sj-h',
    tail: 'N628TS',
    from: places.sanJose,
    to: places.hawthorne
  })
];

describe('toScene', () => {
  it('draws an arc for each flight with two distinct known ends', () => {
    const scene = toScene(snap(flights), '');
    expect(scene.arcs.map((a) => a.id)).toEqual(['a-sj', 'sj-h']);
    expect(scene.arcs[0]).toMatchObject({
      startLat: places.austin.lat,
      startLng: places.austin.lon,
      endLat: places.sanJose.lat,
      endLng: places.sanJose.lon
    });
  });

  it('draws a point for a one-ended flight or a local hop', () => {
    const scene = toScene(snap(flights), '');
    expect(scene.points.map((p) => p.id).sort()).toEqual(['arr', 'hop']);
    const arr = scene.points.find((p) => p.id === 'arr');
    expect(arr).toMatchObject({
      lat: places.sanJose.lat,
      lng: places.sanJose.lon
    });
  });

  it('marks an airborne flight with a ring at its origin and no arc', () => {
    const scene = toScene(snap(flights), '');
    expect(scene.rings).toEqual([
      { id: 'up', lat: places.austin.lat, lng: places.austin.lon }
    ]);
    expect(scene.arcs.some((a) => a.id === 'up')).toBe(false);
  });

  it('makes the newest arc bright and dims the rest', () => {
    const scene = toScene(snap([flights[3], flights[4]]), '');
    expect(scene.arcs.map((a) => [a.id, a.latest, a.color])).toEqual([
      ['a-sj', true, ARC_LATEST],
      ['sj-h', false, ARC_OLDER]
    ]);
  });

  it('draws one arc per route, either direction, keyed by its newest flight', () => {
    const scene = toScene(
      snap([
        flight({ id: 'sj-a-new', from: places.sanJose, to: places.austin }),
        flight({ id: 'h-a', from: places.hawthorne, to: places.austin }),
        flight({ id: 'a-sj-mid', from: places.austin, to: places.sanJose }),
        flight({ id: 'sj-a-old', from: places.sanJose, to: places.austin })
      ]),
      ''
    );
    expect(scene.arcs.map((a) => [a.id, a.count, a.latest])).toEqual([
      ['sj-a-new', 3, true],
      ['h-a', 1, false]
    ]);
    // The arc runs the way its newest flight flew (San Jose → Austin).
    expect(scene.arcs[0]).toMatchObject({
      startLat: places.sanJose.lat,
      endLat: places.austin.lat
    });
  });

  it('draws busier routes brighter than one-off ones', () => {
    const scene = toScene(
      snap([
        flight({ id: 'new', from: places.tokyo, to: places.austin }),
        ...Array.from({ length: 8 }, (_, i) =>
          flight({ id: `busy${i}`, from: places.austin, to: places.sanJose })
        ),
        flight({ id: 'once', from: places.hawthorne, to: places.austin })
      ]),
      ''
    );
    const busy = scene.arcs.find((a) => a.id === 'busy0');
    const once = scene.arcs.find((a) => a.id === 'once');
    expect(busy?.count).toBe(8);
    expect(busy?.color).toBe(routeColor(8));
    expect(once?.color).toBe(ARC_OLDER);
    expect(routeColor(1)).toBe(ARC_OLDER);
    const alpha = (c: string) => Number(c.match(/([\d.]+)\)$/)?.[1]);
    expect(alpha(routeColor(8))).toBeGreaterThan(alpha(routeColor(1)));
    expect(alpha(routeColor(1000))).toBeLessThanOrEqual(0.75);
  });

  it('counts routes within the tail filter', () => {
    const scene = toScene(
      snap([
        flight({
          id: 'x1',
          tail: 'N7628',
          from: places.austin,
          to: places.sanJose
        }),
        flight({
          id: 'x2',
          tail: 'N8628',
          from: places.austin,
          to: places.sanJose
        }),
        flight({
          id: 'x3',
          tail: 'N7628',
          from: places.sanJose,
          to: places.austin
        })
      ]),
      'N7628'
    );
    expect(scene.arcs.map((a) => [a.id, a.count])).toEqual([['x1', 2]]);
  });

  it('treats the newest flight as the latest even when it draws as a point', () => {
    const scene = toScene(snap(flights), '');
    // 'up' is newest: no arc is bright; its ring carries the emphasis.
    expect(scene.arcs.every((a) => !a.latest)).toBe(true);
  });

  it('filters everything to one tail, re-picking that tail’s latest', () => {
    const scene = toScene(snap(flights), 'N7628');
    expect(scene.arcs.map((a) => [a.id, a.latest])).toEqual([['a-sj', false]]);
    expect(scene.points.map((p) => [p.id, p.latest])).toEqual([['arr', true]]);
    expect(scene.rings).toEqual([]);
  });

  it('is empty for an empty year', () => {
    expect(toScene(snap([]), '')).toEqual({ arcs: [], points: [], rings: [] });
  });
});

describe('focusPoint', () => {
  it('aims at the great-circle midpoint of an arc', () => {
    const at = focusPoint(
      flight({
        from: { name: 'A', lat: 0, lon: 0 },
        to: { name: 'B', lat: 0, lon: 90 }
      })
    );
    expect(at?.lat).toBeCloseTo(0, 6);
    expect(at?.lng).toBeCloseTo(45, 6);
  });

  it('bends poleward like the drawn arc, not along a straight line', () => {
    const at = focusPoint(
      flight({
        from: { name: 'NY', lat: 40.7, lon: -74 },
        to: { name: 'Madrid', lat: 40.4, lon: -3.7 }
      })
    );
    expect(at?.lat).toBeGreaterThan(45);
  });

  it('aims at the known end of a one-ended flight or local hop', () => {
    expect(focusPoint(flight({ from: null }))).toEqual({
      lat: places.sanJose.lat,
      lng: places.sanJose.lon
    });
    expect(
      focusPoint(flight({ status: 'airborne', to: null, landedAt: null }))
    ).toEqual({ lat: places.austin.lat, lng: places.austin.lon });
    expect(
      focusPoint(flight({ from: places.austin, to: places.austin }))
    ).toEqual({ lat: places.austin.lat, lng: places.austin.lon });
  });

  it('is null when neither end is known', () => {
    expect(focusPoint(flight({ from: null, to: null }))).toBeNull();
  });
});

describe('list paging', () => {
  // 60 rows, newest first: every third one is N7628.
  const rows = Array.from({ length: 60 }, (_, i) => ({
    id: `r${i}`,
    tail: i % 3 === 0 ? 'N7628' : 'N8628'
  }));

  it('shows the first page of every flight', () => {
    const page = pageOf(rows, '', PAGE_SIZE);
    expect(PAGE_SIZE).toBe(25);
    expect(page.total).toBe(60);
    expect(page.shown).toEqual(rows.slice(0, 25).map((r) => r.id));
  });

  it('pages within the chosen tail', () => {
    const page = pageOf(rows, 'N7628', PAGE_SIZE);
    expect(page.total).toBe(20);
    expect(page.shown).toHaveLength(20);
    expect(page.shown.every((id) => Number(id.slice(1)) % 3 === 0)).toBe(true);
  });

  it('shows everything once the limit passes the total', () => {
    expect(pageOf(rows, '', 75).shown).toHaveLength(60);
  });

  it('grows the limit by whole pages to reach a row further down', () => {
    expect(limitToReveal(rows, '', 'r10', 25)).toBe(25);
    expect(limitToReveal(rows, '', 'r25', 25)).toBe(50);
    expect(limitToReveal(rows, '', 'r59', 25)).toBe(75);
  });

  it('counts position within the tail filter when revealing', () => {
    // r57 is the 20th N7628 row.
    expect(limitToReveal(rows, 'N7628', 'r57', 25)).toBe(25);
  });

  it('leaves the limit alone for an unknown or filtered-out row', () => {
    expect(limitToReveal(rows, '', 'nope', 25)).toBe(25);
    expect(limitToReveal(rows, 'N7628', 'r1', 25)).toBe(25);
  });
});

describe('parseSnapshot', () => {
  it('accepts the API’s JetSnapshot', () => {
    const s = snap(flights);
    expect(parseSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('rejects the API’s error body', () => {
    expect(() =>
      parseSnapshot({ error: 'Flight data is unavailable' })
    ).toThrow();
  });

  it('rejects flights with out-of-range or missing coordinates', () => {
    const bad = JSON.parse(JSON.stringify(snap([flights[3]])));
    bad.flights[0].from.lat = 123;
    expect(() => parseSnapshot(bad)).toThrow();
    const missing = JSON.parse(JSON.stringify(snap([flights[3]])));
    missing.flights[0].to = { name: 'X' };
    expect(() => parseSnapshot(missing)).toThrow();
  });

  it('rejects anything that is not an object', () => {
    expect(() => parseSnapshot(null)).toThrow();
    expect(() => parseSnapshot('[]')).toThrow();
  });
});
