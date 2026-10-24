import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import {
  arcPath,
  greatCircle,
  orthographic,
  TEASER_SIZE,
  TEASER_VIEW
} from '../../src/jet/projection';
import { places } from './fakes';

const TEASER_WEBP = path.join(
  import.meta.dir,
  '../../src/public/static/img/globe/teaser-earth.webp'
);

const centre = TEASER_SIZE / 2;
const radius = TEASER_SIZE / 2;

const pathPoints = (d: string): { x: number; y: number }[] =>
  [...d.matchAll(/(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({
    x: Number(m[1]),
    y: Number(m[2])
  }));

describe('greatCircle', () => {
  it('starts and ends at the two places', () => {
    const pts = greatCircle(places.austin, places.sanJose, 10);
    expect(pts).toHaveLength(10);
    expect(pts[0].lat).toBeCloseTo(places.austin.lat, 6);
    expect(pts[0].lon).toBeCloseTo(places.austin.lon, 6);
    expect(pts[9].lat).toBeCloseTo(places.sanJose.lat, 6);
    expect(pts[9].lon).toBeCloseTo(places.sanJose.lon, 6);
  });

  it('follows the equator between two equator points', () => {
    const pts = greatCircle({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }, 3);
    expect(pts[1].lat).toBeCloseTo(0, 6);
    expect(pts[1].lon).toBeCloseTo(45, 6);
  });

  it('bends poleward between two mid-latitude points, unlike a straight line', () => {
    const pts = greatCircle(
      { lat: 40.7, lon: -74 },
      { lat: 40.4, lon: -3.7 },
      3
    );
    expect(pts[1].lat).toBeGreaterThan(45);
  });
});

describe('orthographic', () => {
  it('projects the view centre to the image centre', () => {
    const p = orthographic(TEASER_VIEW);
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(centre, 6);
    expect(p.y).toBeCloseTo(centre, 6);
  });

  it('puts a point 90° south of the centre on the bottom of the rim', () => {
    const p = orthographic({ lat: TEASER_VIEW.lat - 90, lon: TEASER_VIEW.lon });
    expect(p.visible).toBe(true);
    expect(p.x).toBeCloseTo(centre, 6);
    expect(p.y).toBeCloseTo(centre + radius, 6);
  });

  it('draws north up and east to the right', () => {
    const north = orthographic({
      lat: TEASER_VIEW.lat + 10,
      lon: TEASER_VIEW.lon
    });
    const east = orthographic({
      lat: TEASER_VIEW.lat,
      lon: TEASER_VIEW.lon + 10
    });
    expect(north.y).toBeLessThan(centre);
    expect(east.x).toBeGreaterThan(centre);
  });

  it('hides the far side of the globe', () => {
    const antipode = orthographic({
      lat: -TEASER_VIEW.lat,
      lon: TEASER_VIEW.lon + 180
    });
    expect(antipode.visible).toBe(false);
    expect(orthographic(places.tokyo).visible).toBe(false);
  });
});

describe('arcPath', () => {
  it('draws Austin → San Jose as one path inside the disc', () => {
    const d = arcPath(places.austin, places.sanJose);
    expect(d).toStartWith('M');
    expect(d.match(/M/g)).toHaveLength(1);
    const pts = pathPoints(d);
    expect(pts.length).toBeGreaterThanOrEqual(2);
    for (const { x, y } of pts) {
      expect(Math.hypot(x - centre, y - centre)).toBeLessThanOrEqual(radius);
    }
  });

  it('starts and ends on the projected places, rounded to 1 decimal place', () => {
    const d = arcPath(places.austin, places.sanJose);
    const pts = pathPoints(d);
    const from = orthographic(places.austin);
    const to = orthographic(places.sanJose);
    expect(pts[0].x).toBeCloseTo(from.x, 1);
    expect(pts[0].y).toBeCloseTo(from.y, 1);
    expect(pts.at(-1)?.x).toBeCloseTo(to.x, 1);
    expect(pts.at(-1)?.y).toBeCloseTo(to.y, 1);
    expect(d).not.toMatch(/\.\d{2}/);
  });

  it('clips an arc that runs over the horizon, keeping only the near part', () => {
    const d = arcPath(places.austin, places.tokyo);
    expect(d).not.toBe('');
    const pts = pathPoints(d);
    const from = orthographic(places.austin);
    expect(pts[0].x).toBeCloseTo(from.x, 1);
    const rounding = 0.1;
    for (const { x, y } of pts) {
      expect(Math.hypot(x - centre, y - centre)).toBeLessThanOrEqual(
        radius + rounding
      );
    }
    const end = pts.at(-1) as { x: number; y: number };
    expect(
      Math.abs(Math.hypot(end.x - centre, end.y - centre) - radius)
    ).toBeLessThan(rounding);
  });

  it('draws nothing for a flight that starts and ends in the same place', () => {
    expect(arcPath(places.tokyo, places.tokyo)).toBe('');
    expect(arcPath(places.austin, places.austin)).toBe('');
  });

  it('draws nothing for a flight entirely on the far side', () => {
    const newDelhi = { name: 'New Delhi, India', lat: 28.61, lon: 77.21 };
    expect(arcPath(places.tokyo, newDelhi)).toBe('');
  });
});

describe('the teaser camera', () => {
  it('matches the committed teaser-earth.webp (re-run scripts/render-teaser-earth.ts when this changes)', async () => {
    const bytes = new Uint8Array(await Bun.file(TEASER_WEBP).arrayBuffer());
    const u24 = (o: number) =>
      bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16);
    expect([u24(24) + 1, u24(27) + 1]).toEqual([TEASER_SIZE, TEASER_SIZE]);
    expect(TEASER_VIEW).toEqual({ lat: 32, lon: -98 });
  });
});
