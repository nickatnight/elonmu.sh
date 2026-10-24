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
 * @param {number} count
 */
export const routeColor = (count) => {
  const alpha = Math.min(0.75, 0.32 + 0.11 * Math.log2(Math.max(1, count)));
  return `rgba(255, 169, 77, ${Math.round(alpha * 100) / 100})`;
};

/**
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
    const [x, y, z] = v(from).map((c, i) => c + v(to)[i]);
    return {
      lat: deg(Math.atan2(z, Math.hypot(x, y))),
      lng: deg(Math.atan2(y, x))
    };
  }
  const end = to ?? from;
  return end ? { lat: end.lat, lng: end.lon } : null;
};

export const PAGE_SIZE = 25;

/**
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

const PULSE_LENGTH = 0.08;

const arcWidth = (/** @type {number} */ count = 1) =>
  Math.min(0.7, 0.3 + 0.08 * Math.log2(count));

const solidArc = (/** @type {any} */ arc) => ({
  ...arc,
  stroke: arc.latest ? 0.8 : arcWidth(arc.count),
  dashLength: 1,
  dashGap: 0,
  dashInitialGap: 0,
  dashAnimateTime: 0
});

const pulseArc = (/** @type {any} */ arc) => ({
  ...arc,
  color: arc.latest ? '#ffe2bd' : 'rgba(255, 210, 160, 0.75)',
  stroke: arc.latest ? 1.1 : arcWidth(arc.count) + 0.2,
  dashLength: PULSE_LENGTH,
  dashGap: 1,
  dashInitialGap: Math.random(),
  dashAnimateTime: arc.latest ? 2200 : 5200
});

const HOME_VIEW = { lat: 32, lng: -98, altitude: 2.1 };

/**
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
  const select = (/** @type {any} */ d) => onSelect(d.id);
  const mount = document.createElement('div');
  mount.className = 'jet__canvas';
  pane.prepend(mount);

  const globe = /** @type {any} */ (window)
    .Globe({ animateIn: !reducedMotion })(mount)
    .width(pane.clientWidth)
    .height(pane.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(texture)
    .showAtmosphere(true)
    .atmosphereColor('#5b74d6')
    .atmosphereAltitude(0.16)
    .arcColor('color')
    .arcStroke('stroke')
    .arcAltitudeAutoScale(0.35)
    .arcDashLength('dashLength')
    .arcDashGap('dashGap')
    .arcDashInitialGap('dashInitialGap')
    .arcDashAnimateTime('dashAnimateTime')
    .arcsTransitionDuration(reducedMotion ? 0 : 500)
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
      const origins = scene.rings.map((r) => ({
        ...r,
        latest: true,
        color: ARC_LATEST
      }));
      const pulses = reducedMotion ? [] : scene.arcs.map(pulseArc);
      globe
        .arcsData([...scene.arcs.map(solidArc), ...pulses])
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

const showFallback = (/** @type {HTMLElement} */ pane) => {
  const note = document.createElement('p');
  note.className = 'jet__fallback';
  note.textContent =
    'This browser can’t show the 3D globe. Every flight is in the list.';
  pane.append(note);
};

/**
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

  const more = document.createElement('div');
  more.className = 'flights__more';
  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'button';
  const moreCount = document.createElement('span');
  more.append(moreButton, moreCount);
  list?.after(more);

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
      row.addEventListener('click', (event) => {
        if (/** @type {HTMLElement} */ (event.target).closest('a')) return;
        select(id);
        onShow(id);
      });
    }
  };

  return { select, enableShow, currentTail: () => tail };
};

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
  const small = matchMedia('(max-width: 56rem)').matches;
  const texture =
    (small && pane?.dataset.textureSmall) || pane?.dataset.texture;
  if (!pane || !globeSrc || !texture) return;
  if (!hasWebGL()) {
    showFallback(pane);
    return;
  }

  await afterLoad();
  try {
    const [, res] = await Promise.all([
      loadScript(globeSrc),
      fetch('/api/jet/flights')
    ]);
    snapshot = parseSnapshot(await res.json());
  } catch {
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

const afterLoad = () =>
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) =>
        window.addEventListener('load', resolve, { once: true })
      );

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
