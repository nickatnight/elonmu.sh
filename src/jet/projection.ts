// Pure globe geometry for the home teaser: great-circle sampling and an
// orthographic projection matching scripts/render-teaser-earth.ts, so the
// server-rendered SVG arcs sit on the pre-rendered Earth image.

export type LatLon = { lat: number; lon: number };
export type ScreenPoint = { x: number; y: number; visible: boolean };

// The teaser's fixed camera, centred over the continental US where most
// flights are. The ffmpeg render script reads both constants: change them
// together with a re-render, never alone.
export const TEASER_VIEW: LatLon = { lat: 32, lon: -98 };
// Square image size in px; the Earth's disc fills it edge to edge.
export const TEASER_SIZE = 960;

// Flights whose ends are closer than this are local hops: drawn as a point.
const SAME_PLACE_RAD = (0.1 * Math.PI) / 180;
// Arc sampling step: smooth at teaser scale without bloating the HTML.
const STEP_RAD = (2 * Math.PI) / 180;

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

type Vec = [number, number, number];

const toVec = ({ lat, lon }: LatLon): Vec => {
  const φ = rad(lat);
  const λ = rad(lon);
  return [Math.cos(φ) * Math.cos(λ), Math.cos(φ) * Math.sin(λ), Math.sin(φ)];
};

const toLatLon = ([x, y, z]: Vec): LatLon => ({
  lat: deg(Math.asin(Math.max(-1, Math.min(1, z)))),
  lon: deg(Math.atan2(y, x))
});

const angleBetween = (a: Vec, b: Vec): number =>
  Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));

// The point a fraction t of the way along the great circle from a to b.
const slerp = (a: Vec, b: Vec, ω: number, t: number): LatLon => {
  if (ω < 1e-12) return toLatLon(a);
  const s = Math.sin(ω);
  const ka = Math.sin((1 - t) * ω) / s;
  const kb = Math.sin(t * ω) / s;
  return toLatLon([
    ka * a[0] + kb * b[0],
    ka * a[1] + kb * b[1],
    ka * a[2] + kb * b[2]
  ]);
};

// n evenly spaced points on the shorter great circle from a to b, ends included.
export const greatCircle = (a: LatLon, b: LatLon, n: number): LatLon[] => {
  const va = toVec(a);
  const vb = toVec(b);
  const ω = angleBetween(va, vb);
  return Array.from({ length: n }, (_, i) =>
    slerp(va, vb, ω, n === 1 ? 0 : i / (n - 1))
  );
};

// Orthographic projection seen from far above `view`: north up, east right.
// `visible` is false on the far side of the globe.
export const orthographic = (
  p: LatLon,
  view: LatLon = TEASER_VIEW,
  size: number = TEASER_SIZE
): ScreenPoint => {
  const φ = rad(p.lat);
  const φ0 = rad(view.lat);
  const Δλ = rad(p.lon - view.lon);
  const r = size / 2;
  const x = Math.cos(φ) * Math.sin(Δλ);
  const y =
    Math.cos(φ0) * Math.sin(φ) - Math.sin(φ0) * Math.cos(φ) * Math.cos(Δλ);
  const cosC =
    Math.sin(φ0) * Math.sin(φ) + Math.cos(φ0) * Math.cos(φ) * Math.cos(Δλ);
  return { x: r + r * x, y: r - r * y, visible: cosC >= -1e-9 };
};

// Rounds to 0.1 px: plenty for SVG at teaser size, and keeps the HTML small.
export const round1 = (v: number) => Math.round(v * 10) / 10;

// An SVG path `d` for the great-circle arc a → b as seen in the teaser,
// clipped at the horizon. '' when the ends are the same place or nothing of
// the arc is on the near side.
export const arcPath = (
  a: LatLon,
  b: LatLon,
  view: LatLon = TEASER_VIEW,
  size: number = TEASER_SIZE
): string => {
  const va = toVec(a);
  const vb = toVec(b);
  const ω = angleBetween(va, vb);
  if (ω < SAME_PLACE_RAD) return '';

  const at = (t: number) => orthographic(slerp(va, vb, ω, t), view, size);
  const steps = Math.max(1, Math.ceil(ω / STEP_RAD));
  const ts = Array.from({ length: steps + 1 }, (_, i) => i / steps);

  // Where visibility flips between two samples, add the exact horizon
  // crossing so clipped arcs end on the rim, not a sample short of it.
  const samples: ScreenPoint[] = [];
  for (let i = 0; i < ts.length; i++) {
    const p = at(ts[i]);
    const prev = samples.at(-1);
    if (prev && prev.visible !== p.visible) {
      let lo = ts[i - 1];
      let hi = ts[i];
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (at(mid).visible === prev.visible) lo = mid;
        else hi = mid;
      }
      samples.push({ ...at(prev.visible ? lo : hi), visible: true });
    }
    samples.push(p);
  }

  // One subpath per visible run (a short arc has at most one).
  const runs: ScreenPoint[][] = [];
  let run: ScreenPoint[] = [];
  for (const p of samples) {
    if (p.visible) run.push(p);
    else if (run.length) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length) runs.push(run);

  return runs
    .filter((r) => r.length >= 2)
    .map((r) =>
      r
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${round1(p.x)} ${round1(p.y)}`)
        .join('')
    )
    .join('');
};
