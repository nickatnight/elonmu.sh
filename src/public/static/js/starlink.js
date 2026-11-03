import { EARTH_RADIUS_KM, positionAt } from './orbits.js';

/** @typedef {import('./orbits.js').Elements & { id: number, name: string }} Satellite */
/** @typedef {{ lat: number, lng: number, alt: number }} Particle */
/**
 * @typedef {Record<'width' | 'height' | 'atmosphereAltitude' | 'particlesSize',
 *   (n: number) => GlobeView> & Record<'backgroundColor' | 'globeImageUrl' |
 *   'atmosphereColor' | 'particleLat' | 'particleLng' | 'particleAltitude',
 *   (s: string) => GlobeView> & Record<'showAtmosphere' |
 *   'particlesSizeAttenuation', (on: boolean) => GlobeView> & {
 *   particlesColor(color: () => string): GlobeView,
 *   particlesData(sets: Particle[][]): GlobeView,
 *   onGlobeReady(ready: () => void): GlobeView,
 *   pointOfView(at: { lat: number, lng: number, altitude: number }, ms: number): GlobeView,
 *   controls(): { autoRotate: boolean, autoRotateSpeed: number,
 *     addEventListener(type: string, listener: () => void): void }
 * }} GlobeView
 */
/** @typedef {(options: { animateIn: boolean }) => (el: HTMLElement) => GlobeView} GlobeFactory */
/**
 * @typedef {{
 *   request: (frame: (t: number) => void) => number,
 *   cancel: (id: number) => void
 * }} Frames
 */

const UPDATE_MS = 1000;
const SLICES = 4;
const DOT_COLOR = '#e6eeff';
const DOT_PX = 1.6;
export const HOME_VIEW = { lat: 32, lng: -98, altitude: 2.6 };

/** @param {unknown} v */
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * @param {unknown} value
 * @returns {value is Satellite}
 */
const isSatellite = (value) => {
  if (typeof value !== 'object' || value === null) return false;
  const s = /** @type {Record<string, unknown>} */ (value);
  const elements = [
    s.meanMotion,
    s.meanMotionDot,
    s.eccentricity,
    s.inclination,
    s.raan,
    s.argOfPerigee,
    s.meanAnomaly
  ];
  if (!elements.every(finite)) return false;
  const meanMotion = /** @type {number} */ (s.meanMotion);
  const eccentricity = /** @type {number} */ (s.eccentricity);
  return (
    typeof s.epoch === 'string' &&
    Number.isFinite(Date.parse(s.epoch)) &&
    meanMotion > 0 &&
    eccentricity >= 0 &&
    eccentricity < 1
  );
};

/**
 * @param {unknown} body
 * @returns {Satellite[]}
 */
export const parseSatellites = (body) => {
  if (typeof body !== 'object' || body === null || !('satellites' in body))
    throw new Error('starlink: not a snapshot');
  const { satellites } = body;
  if (satellites === null) return [];
  if (!Array.isArray(satellites))
    throw new Error('starlink: no satellite list');
  return satellites.filter(isSatellite);
};

/**
 * @param {Satellite[]} satellites
 * @param {Date} date
 * @param {Particle[]} [particles]
 * @param {number} [from]
 * @param {number} [to]
 */
export const placeParticles = (
  satellites,
  date,
  particles = [],
  from = 0,
  to = satellites.length
) => {
  const end = Math.min(to, satellites.length);
  for (let i = from; i < end; i++) {
    const { lat, lng, altKm } = positionAt(satellites[i], date);
    const alt = altKm / EARTH_RADIUS_KM;
    const particle = particles[i];
    if (particle) {
      particle.lat = lat;
      particle.lng = lng;
      particle.alt = alt;
    } else particles[i] = { lat, lng, alt };
  }
  return particles;
};

/**
 * @param {number} ms
 * @param {(t: number) => void} onTick
 * @param {Frames} frames
 */
export const everyInterval = (ms, onTick, { request, cancel }) => {
  let last = Number.NEGATIVE_INFINITY;
  let stopped = false;
  /** @param {number} t */
  const frame = (t) => {
    if (stopped) return;
    if (t - last >= ms) {
      last = t;
      onTick(t);
    }
    id = request(frame);
  };
  let id = request(frame);
  return () => {
    stopped = true;
    cancel(id);
  };
};

/**
 * @param {{ show: (particles: Particle[]) => unknown }} view
 * @param {Satellite[]} satellites
 * @param {{ reducedMotion: boolean, frames: Frames, now: () => Date }} options
 */
export const animate = (view, satellites, { reducedMotion, frames, now }) => {
  const particles = placeParticles(satellites, now());
  view.show(particles);
  if (reducedMotion) return;
  const size = Math.ceil(satellites.length / SLICES);
  let slice = 0;
  everyInterval(
    UPDATE_MS / SLICES,
    () => {
      const from = slice * size;
      placeParticles(satellites, now(), particles, from, from + size);
      slice = (slice + 1) % SLICES;
      if (slice === 0) view.show(particles);
    },
    frames
  );
};

/**
 * @param {HTMLElement} pane
 * @param {GlobeFactory} Globe
 * @param {{ texture: string, reducedMotion: boolean }} options
 */
const createGlobeView = (pane, Globe, { texture, reducedMotion }) => {
  const mount = document.createElement('div');
  mount.className = 'starlink__canvas';
  pane.prepend(mount);

  const globe = Globe({ animateIn: false })(mount)
    .width(pane.clientWidth)
    .height(pane.clientHeight)
    .backgroundColor('rgba(0,0,0,0)')
    .globeImageUrl(texture)
    .showAtmosphere(true)
    .atmosphereColor('#5b74d6')
    .atmosphereAltitude(0.16)
    .particleLat('lat')
    .particleLng('lng')
    .particleAltitude('alt')
    .particlesSize(DOT_PX)
    .particlesSizeAttenuation(false)
    .particlesColor(() => DOT_COLOR)
    .onGlobeReady(() => pane.classList.add('has-globe'));

  const controls = globe.controls();
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.3;
  controls.addEventListener('start', () => {
    controls.autoRotate = false;
  });
  globe.pointOfView(HOME_VIEW, 0);

  new ResizeObserver(() =>
    globe.width(pane.clientWidth).height(pane.clientHeight)
  ).observe(pane);

  return {
    /** @param {Particle[]} particles */
    show: (particles) => globe.particlesData([particles])
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

/** @param {HTMLElement} pane */
const showFallback = (pane) => {
  const note = document.createElement('p');
  note.className = 'starlink__fallback';
  note.textContent =
    "This browser can't show the 3D globe. The count and the obituaries are on the page.";
  pane.append(note);
};

const afterLoad = () =>
  document.readyState === 'complete'
    ? Promise.resolve()
    : new Promise((resolve) =>
        window.addEventListener('load', resolve, { once: true })
      );

/** @param {string} src */
const loadScript = (src) =>
  new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`starlink: could not load ${src}`));
    document.head.append(script);
  });

const start = async () => {
  const pane = document.querySelector('.starlink__globe');
  if (!(pane instanceof HTMLElement)) return;
  const globeSrc = pane.dataset.globeSrc;
  const small = matchMedia('(max-width: 56rem)').matches;
  const texture = (small && pane.dataset.textureSmall) || pane.dataset.texture;
  if (!globeSrc || !texture) return;
  if (!hasWebGL()) {
    showFallback(pane);
    return;
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  await afterLoad();
  new Image().src = texture;
  /** @type {Satellite[]} */
  let satellites;
  try {
    const [, res] = await Promise.all([
      loadScript(globeSrc),
      fetch('/api/starlink')
    ]);
    satellites = parseSatellites(await res.json());
  } catch {
    return;
  }
  const Globe = /** @type {{ Globe?: GlobeFactory }} */ (
    /** @type {unknown} */ (window)
  ).Globe;
  if (typeof Globe !== 'function') {
    showFallback(pane);
    return;
  }

  animate(
    createGlobeView(pane, Globe, { texture, reducedMotion }),
    satellites,
    {
      reducedMotion,
      frames: {
        request: (frame) => requestAnimationFrame(frame),
        cancel: (id) => cancelAnimationFrame(id)
      },
      now: () => new Date()
    }
  );
};

if (typeof document !== 'undefined') start();
