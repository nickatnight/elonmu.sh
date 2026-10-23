// elonmu.sh /jet: the live globe. One file, no bundler; a module so its
// pure parts can be unit-tested. Layers:
//   parseSnapshot()   validates GET /api/jet/flights (the public contract)
//   toScene()         pure: flights → arcs, points and rings to draw
//   createGlobeView() the only code that touches globe.gl
// The page renders its list and totals on the server; without JS, WebGL or
// globe.gl, the still Earth image stays and nothing here is required.

/** @typedef {{ name: string, lat: number, lon: number }} Place */
/**
 * @typedef {{
 *   id: string, tail: string, from: Place | null, to: Place | null,
 *   departedAt: string | null, landedAt: string | null,
 *   durationMin: number | null, fuel: object | null,
 *   status: 'landed' | 'airborne', sourceUrl: string | null
 * }} Flight
 */
/** @typedef {{ year: number, flights: Flight[], attribution: object, totals: object }} Snapshot */

export const ARC_LATEST = '#ffa94d';
export const ARC_OLDER = 'rgba(255, 169, 77, 0.32)';

const inRange = (/** @type {unknown} */ v, /** @type {number} */ max) =>
  typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max;

const isPlace = (/** @type {any} */ p) =>
  p === null ||
  (typeof p === 'object' &&
    p !== null &&
    typeof p.name === 'string' &&
    inRange(p.lat, 90) &&
    inRange(p.lon, 180));

/**
 * The API's JSON as a Snapshot, or a thrown error for anything else
 * (including its `{ error }` body), so bad data never reaches the globe.
 * @param {unknown} data
 * @returns {Snapshot}
 */
export const parseSnapshot = (data) => {
  const s = /** @type {any} */ (data);
  if (
    !s ||
    typeof s !== 'object' ||
    typeof s.year !== 'number' ||
    !Array.isArray(s.flights) ||
    typeof s.attribution !== 'object' ||
    typeof s.totals !== 'object'
  ) {
    throw new Error('jet: not a flight snapshot');
  }
  for (const f of s.flights) {
    const ok =
      f &&
      typeof f.id === 'string' &&
      typeof f.tail === 'string' &&
      isPlace(f.from) &&
      isPlace(f.to) &&
      (f.status === 'landed' || f.status === 'airborne');
    if (!ok) throw new Error(`jet: bad flight ${f?.id}`);
  }
  return s;
};

const samePlace = (/** @type {Place} */ a, /** @type {Place} */ b) =>
  a.name === b.name || (a.lat === b.lat && a.lon === b.lon);

/**
 * What to draw for `tail` ('' for every aircraft). The first matching
 * flight is the latest: bright; the rest are dimmed.
 * - two distinct known ends → an arc
 * - one end, or the same place twice → a point
 * - airborne → a ring at the origin, never a guessed arc
 * @param {Snapshot} snapshot
 * @param {string} tail
 */
export const toScene = (snapshot, tail) => {
  const scene = {
    /** @type {{ id: string, startLat: number, startLng: number, endLat: number, endLng: number, latest: boolean, color: string }[]} */
    arcs: [],
    /** @type {{ id: string, lat: number, lng: number, latest: boolean, color: string }[]} */
    points: [],
    /** @type {{ id: string, lat: number, lng: number }[]} */
    rings: []
  };
  const flights = snapshot.flights.filter((f) => !tail || f.tail === tail);
  flights.forEach((f, i) => {
    const latest = i === 0;
    const color = latest ? ARC_LATEST : ARC_OLDER;
    if (f.status === 'airborne') {
      if (f.from)
        scene.rings.push({ id: f.id, lat: f.from.lat, lng: f.from.lon });
      return;
    }
    if (f.from && f.to && !samePlace(f.from, f.to)) {
      scene.arcs.push({
        id: f.id,
        startLat: f.from.lat,
        startLng: f.from.lon,
        endLat: f.to.lat,
        endLng: f.to.lon,
        latest,
        color
      });
      return;
    }
    const end = f.to ?? f.from;
    if (end)
      scene.points.push({
        id: f.id,
        lat: end.lat,
        lng: end.lon,
        latest,
        color
      });
  });
  return scene;
};

// Centred over the continental US, where most flights are.
const HOME_VIEW = { lat: 32, lng: -98, altitude: 2.1 };

/**
 * Mounts globe.gl in `pane`. Returns { render, focus, destroy }; swapping
 * the globe library means rewriting only this function.
 * @param {HTMLElement} pane
 * @param {{ texture: string, reducedMotion: boolean }} options
 */
export const createGlobeView = (pane, { texture, reducedMotion }) => {
  const mount = document.createElement('div');
  mount.className = 'jet__canvas';
  pane.append(mount);

  const globe = /** @type {any} */ (window)
    .Globe({ animateIn: !reducedMotion })(mount)
    .width(pane.clientWidth)
    .height(pane.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(texture)
    .showAtmosphere(true)
    .atmosphereColor('#5b74d6')
    .atmosphereAltitude(0.16)
    // Arcs: older ones thin and dim, the latest thicker and brighter. The
    // dash animation moves along the arc (shader-side, off the main thread).
    .arcColor('color')
    .arcStroke((/** @type {any} */ d) => (d.latest ? 0.8 : 0.35))
    .arcAltitudeAutoScale(0.35)
    .arcDashLength(reducedMotion ? 1 : 0.45)
    .arcDashGap(reducedMotion ? 0 : 0.2)
    .arcDashInitialGap(() => Math.random())
    .arcDashAnimateTime(
      reducedMotion ? 0 : (/** @type {any} */ d) => (d.latest ? 2200 : 5200)
    )
    .arcsTransitionDuration(reducedMotion ? 0 : 500)
    .pointLat('lat')
    .pointLng('lng')
    .pointColor('color')
    .pointAltitude(0.004)
    .pointRadius((/** @type {any} */ d) => (d.latest ? 0.45 : 0.25))
    .ringLat('lat')
    .ringLng('lng')
    .ringColor(
      () => (/** @type {number} */ t) => `rgba(255, 169, 77, ${1 - t})`
    )
    .ringMaxRadius(3.5)
    .ringPropagationSpeed(2.5)
    .ringRepeatPeriod(1200)
    .onGlobeReady(() => pane.classList.add('has-globe'));

  const controls = globe.controls();
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.3;
  // Once someone grabs the globe, it stays where they leave it.
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
  });
  globe.pointOfView(HOME_VIEW, 0);

  const resize = new ResizeObserver(() =>
    globe.width(pane.clientWidth).height(pane.clientHeight)
  );
  resize.observe(pane);

  return {
    /** @param {ReturnType<typeof toScene>} scene */
    render(scene) {
      // An airborne origin gets a bright dot; the pulsing ring around it
      // only when motion is welcome.
      const origins = scene.rings.map((r) => ({
        ...r,
        latest: true,
        color: ARC_LATEST
      }));
      globe
        .arcsData(scene.arcs)
        .pointsData([...scene.points, ...origins])
        .ringsData(reducedMotion ? [] : scene.rings);
    },
    /** @param {{ lat: number, lng: number }} at */
    focus(at) {
      controls.autoRotate = false;
      globe.pointOfView({ ...at, altitude: 1.6 }, reducedMotion ? 0 : 900);
    },
    destroy() {
      resize.disconnect();
      globe._destructor();
      mount.remove();
      pane.classList.remove('has-globe');
    }
  };
};

const hasWebGL = () => {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

// Leaves the still Earth in place and says why there's no live globe.
const showFallback = (/** @type {HTMLElement} */ pane) => {
  const note = document.createElement('p');
  note.className = 'jet__fallback';
  note.textContent =
    'This browser can’t show the 3D globe. Every flight is in the list.';
  pane.append(note);
};

const start = async () => {
  const pane = /** @type {HTMLElement | null} */ (
    document.querySelector('.jet__globe')
  );
  if (!pane?.dataset.texture) return;
  if (
    !hasWebGL() ||
    typeof (/** @type {any} */ (window).Globe) !== 'function'
  ) {
    showFallback(pane);
    return;
  }
  let snapshot;
  try {
    const res = await fetch('/api/jet/flights');
    snapshot = parseSnapshot(await res.json());
  } catch {
    // No data: the server-rendered note and the still Earth already say so.
    return;
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const view = createGlobeView(pane, {
    texture: pane.dataset.texture,
    reducedMotion
  });
  view.render(toScene(snapshot, ''));
};

if (typeof document !== 'undefined') start();
