import { describe, expect, it } from 'bun:test';
import type { Flight, JetSnapshot } from '../../src/jet/domain';
import {
  ARC_LATEST,
  ARC_OLDER,
  parseSnapshot,
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
