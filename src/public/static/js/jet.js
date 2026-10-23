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

const rad = (/** @type {number} */ d) => (d * Math.PI) / 180;
const deg = (/** @type {number} */ r) => (r * 180) / Math.PI;

/**
 * Where the globe should look to show `flight`: the great-circle midpoint
 * of its arc (the same curve globe.gl draws), else its one known end.
 * @param {Flight} flight
 * @returns {{ lat: number, lng: number } | null}
 */
export const focusPoint = (flight) => {
  const { from, to } = flight;
  if (from && to && !samePlace(from, to)) {
    const v = (/** @type {Place} */ p) => [
      Math.cos(rad(p.lat)) * Math.cos(rad(p.lon)),
      Math.cos(rad(p.lat)) * Math.sin(rad(p.lon)),
      Math.sin(rad(p.lat))
    ];
    // The normalised sum of the two unit vectors is the arc's midpoint.
    const [x, y, z] = v(from).map((c, i) => c + v(to)[i]);
    return {
      lat: deg(Math.atan2(z, Math.hypot(x, y))),
      lng: deg(Math.atan2(y, x))
    };
  }
  const end = to ?? from;
  return end ? { lat: end.lat, lng: end.lon } : null;
};

// Centred over the continental US, where most flights are.
const HOME_VIEW = { lat: 32, lng: -98, altitude: 2.1 };

/**
 * Mounts globe.gl in `pane`. Returns { render, focus, destroy }; swapping
 * the globe library means rewriting only this function.
 * @param {HTMLElement} pane
 * @param {{
 *   texture: string,
 *   reducedMotion: boolean,
 *   label?: (id: string) => HTMLElement | null,
 *   onSelect?: (id: string) => void
 * }} options
 */
export const createGlobeView = (
  pane,
  { texture, reducedMotion, label = () => null, onSelect = () => {} }
) => {
  const byId = (/** @type {any} */ d) => label(d.id) ?? '';
  const select = (/** @type {any} */ d) => onSelect(d.id);
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
    // Tooltips are elements built with textContent, never HTML strings.
    .arcLabel(byId)
    .onArcClick(select)
    .pointLabel(byId)
    .onPointClick(select)
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

/**
 * Takes over the server-rendered panel: reveals the tail chips and, when
 * there is a globe to show things on, turns each route into a button.
 * Post-derived text is only ever copied with textContent.
 * @param {HTMLElement} panel
 * @param {{
 *   canShow: boolean,
 *   reducedMotion: boolean,
 *   onFilter: (tail: string) => void,
 *   onShow: (id: string) => void
 * }} options
 */
const enhancePanel = (panel, { canShow, reducedMotion, onFilter, onShow }) => {
  const rows = /** @type {HTMLElement[]} */ ([
    ...panel.querySelectorAll('.flight')
  ]);
  const status = panel.querySelector('.jet__status');

  /** @param {string | null} id */
  const select = (id, { scroll = false } = {}) => {
    let row = null;
    for (const r of rows) {
      const on = r.dataset.flight === id;
      r.classList.toggle('is-selected', on);
      if (on) row = r;
    }
    if (row && scroll && !row.hidden) {
      row.scrollIntoView({
        block: 'nearest',
        behavior: reducedMotion ? 'auto' : 'smooth'
      });
    }
  };

  const chips = /** @type {HTMLElement | null} */ (
    panel.querySelector('.chips')
  );
  if (chips) {
    chips.hidden = false;
    chips.addEventListener('click', (event) => {
      const chip = /** @type {HTMLElement} */ (event.target).closest('.chip');
      if (!(chip instanceof HTMLElement)) return;
      for (const c of chips.querySelectorAll('.chip')) {
        c.setAttribute('aria-pressed', String(c === chip));
      }
      const tail = chip.dataset.tail ?? '';
      let shown = 0;
      for (const row of rows) {
        row.hidden = Boolean(tail) && row.dataset.tail !== tail;
        if (!row.hidden) shown++;
      }
      select(null);
      if (status) {
        status.textContent = `Showing ${shown} flight${shown === 1 ? '' : 's'}${tail ? ` by ${tail}` : ''}.`;
      }
      onFilter(tail);
    });
  }

  if (canShow) {
    for (const row of rows) {
      const route = row.querySelector('.flight__route');
      const id = row.dataset.flight;
      if (!route || !id) continue;
      const text = route.textContent?.trim() ?? '';
      const date = row.querySelector('time')?.textContent?.trim() ?? '';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'flight__show';
      button.textContent = text;
      button.setAttribute('aria-label', `Show ${text}, ${date}, on the globe`);
      route.replaceChildren(button);
      // The whole row is a target for pointers; the button for keyboards.
      row.addEventListener('click', (event) => {
        if (/** @type {HTMLElement} */ (event.target).closest('a')) return;
        select(id);
        onShow(id);
      });
    }
  }

  return { select };
};

// A tooltip for a flight, copied from its row in the list.
const tooltipFor = (
  /** @type {HTMLElement} */ panel,
  /** @type {string} */ id
) => {
  const row = panel.querySelector(`.flight[data-flight="${CSS.escape(id)}"]`);
  if (!row) return null;
  const tip = document.createElement('div');
  tip.className = 'jet-tip';
  for (const part of ['.flight__route', '.flight__meta', '.flight__detail']) {
    const el = row.querySelector(part);
    // The meta line is a date and a tail in separate elements: "Oct 22 · N8628".
    const pieces = part === '.flight__meta' && el ? [...el.children] : [el];
    const text = pieces
      .map((p) => p?.textContent?.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join(' · ');
    if (!text) continue;
    const line = document.createElement('p');
    line.textContent = text;
    tip.append(line);
  }
  return tip;
};

const start = async () => {
  const panel = /** @type {HTMLElement | null} */ (
    document.querySelector('.jet__panel')
  );
  const pane = /** @type {HTMLElement | null} */ (
    document.querySelector('.jet__globe')
  );
  if (!panel) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const texture = pane?.dataset.texture;
  const canGlobe =
    Boolean(texture) &&
    hasWebGL() &&
    typeof (/** @type {any} */ (window).Globe) === 'function';
  if (pane && !canGlobe) showFallback(pane);

  /** @type {Snapshot | null} */
  let snapshot = null;
  if (canGlobe) {
    try {
      const res = await fetch('/api/jet/flights');
      snapshot = parseSnapshot(await res.json());
    } catch {
      // No data: the server-rendered note and the still Earth already say so.
    }
  }

  /** @type {ReturnType<typeof enhancePanel> | null} */
  let panelControls = null;
  const view =
    snapshot && pane && texture
      ? createGlobeView(pane, {
          texture,
          reducedMotion,
          label: (id) => tooltipFor(panel, id),
          onSelect: (id) => panelControls?.select(id, { scroll: true })
        })
      : null;
  view?.render(toScene(/** @type {Snapshot} */ (snapshot), ''));

  panelControls = enhancePanel(panel, {
    canShow: Boolean(view),
    reducedMotion,
    onFilter: (tail) => {
      if (view && snapshot) view.render(toScene(snapshot, tail));
    },
    onShow: (id) => {
      const flight = snapshot?.flights.find((f) => f.id === id);
      const at = flight ? focusPoint(flight) : null;
      if (view && at) view.focus(at);
    }
  });
};

if (typeof document !== 'undefined') start();
