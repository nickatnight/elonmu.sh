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
 * A route's arc colour: one-off routes dim, busier ones brighter, capped
 * well below the latest flight's full orange.
 * @param {number} count flights on the route
 */
export const routeColor = (count) => {
  const alpha = Math.min(0.75, 0.32 + 0.11 * Math.log2(Math.max(1, count)));
  return `rgba(255, 169, 77, ${Math.round(alpha * 100) / 100})`;
};

/**
 * What to draw for `tail` ('' for every aircraft). The first matching
 * flight is the latest: bright; the rest are dimmed.
 * - two distinct known ends → an arc, one per route (either direction)
 *   keyed by and drawn the way of its newest flight, with a flight count;
 *   identical arcs would only overlap, and each costs the globe per frame
 * - one end, or the same place twice → a point
 * - airborne → a ring at the origin, never a guessed arc
 * @param {Snapshot} snapshot
 * @param {string} tail
 */
export const toScene = (snapshot, tail) => {
  const scene = {
    /** @type {{ id: string, startLat: number, startLng: number, endLat: number, endLng: number, latest: boolean, color: string, count: number }[]} */
    arcs: [],
    /** @type {{ id: string, lat: number, lng: number, latest: boolean, color: string }[]} */
    points: [],
    /** @type {{ id: string, lat: number, lng: number }[]} */
    rings: []
  };
  /** @type {Map<string, (typeof scene.arcs)[number]>} */
  const routes = new Map();
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
      const key = [f.from.name, f.to.name].sort().join('\n');
      const seen = routes.get(key);
      if (seen) {
        seen.count++;
        return;
      }
      const arc = {
        id: f.id,
        startLat: f.from.lat,
        startLng: f.from.lon,
        endLat: f.to.lat,
        endLng: f.to.lon,
        latest,
        color,
        count: 1
      };
      routes.set(key, arc);
      scene.arcs.push(arc);
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
  for (const arc of scene.arcs) {
    if (!arc.latest) arc.color = routeColor(arc.count);
  }
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

// The flight list shows this many rows at a time, per tail filter.
export const PAGE_SIZE = 25;

/**
 * The ids on screen for `tail` ('' for all) with `limit` rows allowed,
 * and how many rows match in total. Rows are newest first.
 * @param {{ id: string, tail: string }[]} rows
 * @param {string} tail
 * @param {number} limit
 */
export const pageOf = (rows, tail, limit) => {
  const matching = rows.filter((r) => !tail || r.tail === tail);
  return {
    shown: matching.slice(0, limit).map((r) => r.id),
    total: matching.length
  };
};

/**
 * The limit, grown by whole pages if needed, that puts row `id` on
 * screen. Unchanged when the row is already shown, unknown, or filtered out.
 * @param {{ id: string, tail: string }[]} rows
 * @param {string} tail
 * @param {string} id
 * @param {number} limit
 */
export const limitToReveal = (rows, tail, id, limit) => {
  const index = rows
    .filter((r) => !tail || r.tail === tail)
    .findIndex((r) => r.id === id);
  if (index < limit) return limit;
  return Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE;
};

// The travelling pulse: a short dash (8% of the arc) in a lighter orange,
// full strength on the latest flight and softer on earlier ones.
const PULSE_LENGTH = 0.08;
const pulseColor = (/** @type {{ latest: boolean }} */ d) =>
  d.latest ? '#ffe2bd' : 'rgba(255, 210, 160, 0.75)';

// Centred over the continental US, where most flights are.
const HOME_VIEW = { lat: 32, lng: -98, altitude: 2.1 };

/**
 * Mounts globe.gl in `pane`. Returns { render, focus, destroy }; swapping
 * the globe library means rewriting only this function.
 * @param {HTMLElement} pane
 * @param {{
 *   texture: string,
 *   reducedMotion: boolean,
 *   label?: (id: string, count?: number) => HTMLElement | null,
 *   onSelect?: (id: string) => void
 * }} options
 */
export const createGlobeView = (
  pane,
  { texture, reducedMotion, label = () => null, onSelect = () => {} }
) => {
  const byId = (/** @type {any} */ d) => label(d.id, d.count) ?? '';
  // Busier routes draw a little thicker, like their colour.
  const width = (/** @type {number} */ count = 1) =>
    Math.min(0.7, 0.3 + 0.08 * Math.log2(count));
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
    // Each flight is a solid arc (older ones thin and dim, the latest
    // thicker and brighter) plus, when motion is welcome, a second arc on
    // the same path carrying one short bright pulse from departure to
    // arrival. The pulse moves shader-side, off the main thread.
    .arcColor((/** @type {any} */ d) => (d.pulse ? pulseColor(d) : d.color))
    .arcStroke((/** @type {any} */ d) =>
      d.latest ? (d.pulse ? 1.1 : 0.8) : width(d.count) + (d.pulse ? 0.2 : 0)
    )
    .arcAltitudeAutoScale(0.35)
    .arcDashLength((/** @type {any} */ d) => (d.pulse ? PULSE_LENGTH : 1))
    .arcDashGap((/** @type {any} */ d) => (d.pulse ? 1 : 0))
    .arcDashInitialGap((/** @type {any} */ d) => (d.pulse ? d.phase : 0))
    .arcDashAnimateTime((/** @type {any} */ d) =>
      d.pulse ? (d.latest ? 2200 : 5200) : 0
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
      // One pulse per arc, started at a random point so they don't fire in
      // unison. Under reduced motion only the solid arcs are drawn.
      const pulses = reducedMotion
        ? []
        : scene.arcs.map((a) => ({ ...a, pulse: true, phase: Math.random() }));
      globe
        .arcsData([...scene.arcs, ...pulses])
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
 * Takes over the server-rendered panel straight away: reveals the tail
 * chips and pages the list. `enableShow()` later turns each route into a
 * "show on globe" button, once there is a globe. Post-derived text is
 * only ever copied with textContent.
 * @param {HTMLElement} panel
 * @param {{
 *   reducedMotion: boolean,
 *   onFilter: (tail: string) => void,
 *   onShow: (id: string) => void
 * }} options
 */
const enhancePanel = (panel, { reducedMotion, onFilter, onShow }) => {
  const rows = /** @type {HTMLElement[]} */ ([
    ...panel.querySelectorAll('.flight')
  ]);
  const meta = rows.map((r) => ({
    id: r.dataset.flight ?? '',
    tail: r.dataset.tail ?? ''
  }));
  const status = panel.querySelector('.jet__status');
  const list = panel.querySelector('.flights');
  let tail = '';
  let limit = PAGE_SIZE;

  // "Show 25 more · 25 of 313", built here: without JS every row shows.
  const more = document.createElement('div');
  more.className = 'flights__more';
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'button';
  const moreCount = document.createElement('span');
  more.append(moreButton, moreCount);
  list?.after(more);

  // Shows the first `limit` rows matching `tail`; returns what's on screen.
  const apply = () => {
    const page = pageOf(meta, tail, limit);
    const shown = new Set(page.shown);
    rows.forEach((row, i) => {
      row.hidden = !shown.has(meta[i].id);
    });
    const left = page.total - page.shown.length;
    more.hidden = left <= 0;
    moreButton.textContent = `Show ${Math.min(left, PAGE_SIZE)} more`;
    moreCount.textContent = `${page.shown.length} of ${page.total}`;
    return page;
  };

  const announce = (/** @type {{ shown: string[], total: number }} */ page) => {
    if (!status) return;
    const n = page.shown.length;
    const of = n < page.total ? ` of ${page.total}` : '';
    status.textContent = `Showing ${n}${of} flight${page.total === 1 ? '' : 's'}${tail ? ` by ${tail}` : ''}.`;
  };

  /** @param {string | null} id */
  const select = (id, { scroll = false } = {}) => {
    if (id) {
      // A row further down (say, tapped on the globe) gets revealed first.
      const needed = limitToReveal(meta, tail, id, limit);
      if (needed !== limit) {
        limit = needed;
        announce(apply());
      }
    }
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

  moreButton.addEventListener('click', () => {
    const before = pageOf(meta, tail, limit).shown.length;
    limit += PAGE_SIZE;
    const page = apply();
    announce(page);
    // Keyboard users land on the first new row rather than the button.
    const first = rows.find((r) => r.dataset.flight === page.shown[before]);
    const target = first?.querySelector('.flight__show') ?? first;
    if (target instanceof HTMLElement) {
      if (target === first) target.tabIndex = -1;
      target.focus();
    }
  });

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
      tail = chip.dataset.tail ?? '';
      limit = PAGE_SIZE;
      select(null);
      announce(apply());
      onFilter(tail);
    });
  }

  apply();

  // Once a globe exists, each route becomes a "show on globe" button.
  const enableShow = () => {
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
  };

  return { select, enableShow, currentTail: () => tail };
};

// A tooltip for a flight, copied from its row in the list. For a route
// flown more than once, the newest flight's details plus the route's count.
const tooltipFor = (
  /** @type {HTMLElement} */ panel,
  /** @type {string} */ id,
  /** @type {number} */ count = 1
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
  if (count > 1) {
    const line = document.createElement('p');
    line.textContent = `${count} flights on this route`;
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

  /** @type {Snapshot | null} */
  let snapshot = null;
  /** @type {ReturnType<typeof createGlobeView> | null} */
  let view = null;

  // The panel works at once; the globe joins it when (and if) it's ready.
  const panelControls = enhancePanel(panel, {
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

  const globeSrc = pane?.dataset.globeSrc;
  // Phones get the 2048 px texture: a quarter of the pixels to decode.
  const small = matchMedia('(max-width: 56rem)').matches;
  const texture =
    (small && pane?.dataset.textureSmall) || pane?.dataset.texture;
  if (!pane || !globeSrc || !texture) return;
  if (!hasWebGL()) {
    showFallback(pane);
    return;
  }

  // globe.gl is 523 KB gzipped: fetch it only after the page has loaded,
  // so it never competes with the still Earth, list and totals.
  await afterLoad();
  try {
    const [, res] = await Promise.all([
      loadScript(globeSrc),
      fetch('/api/jet/flights')
    ]);
    snapshot = parseSnapshot(await res.json());
  } catch {
    // No library or no data: the still Earth and the list already serve.
    return;
  }
  if (typeof (/** @type {any} */ (window).Globe) !== 'function') {
    showFallback(pane);
    return;
  }

  view = createGlobeView(pane, {
    texture,
    reducedMotion,
    label: (id, count) => tooltipFor(panel, id, count),
    onSelect: (id) => panelControls.select(id, { scroll: true })
  });
  view.render(toScene(snapshot, panelControls.currentTail()));
  panelControls.enableShow();
};

// Resolves once the window's load event has fired.
const afterLoad = () =>
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) =>
        window.addEventListener('load', resolve, { once: true })
      );

// Adds a classic script and resolves when it has run.
const loadScript = (/** @type {string} */ src) =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`jet: could not load ${src}`));
    document.head.append(script);
  });

if (typeof document !== 'undefined') start();
