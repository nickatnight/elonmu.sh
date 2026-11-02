/**
 * @typedef {{
 *   epoch: string, meanMotion: number, meanMotionDot: number,
 *   eccentricity: number, inclination: number, raan: number,
 *   argOfPerigee: number, meanAnomaly: number
 * }} Elements
 */
/** @typedef {{ lat: number, lng: number, altKm: number }} Position */

export const EARTH_RADIUS_KM = 6378.135;
const MU_KM3_S2 = 398600.8;
const J2 = 0.001082616;
const TWO_PI = 2 * Math.PI;
const RAD = Math.PI / 180;
const MINUTES_PER_DAY = 1440;
const MS_PER_DAY = 86_400_000;
const EARTH_RADII_PER_MINUTE = 60 / Math.sqrt(EARTH_RADIUS_KM ** 3 / MU_KM3_S2);

/** @param {number} ms */
const gmst = (ms) => {
  const t = (ms / MS_PER_DAY + 2440587.5 - 2451545) / 36525;
  const seconds =
    67310.54841 +
    (876600 * 3600 + 8640184.812866) * t +
    0.093104 * t * t -
    6.2e-6 * t * t * t;
  return (((seconds % 86400) + 86400) % 86400) * (TWO_PI / 86400);
};

/** @param {number} radians */
const toLongitude = (radians) =>
  ((((radians / RAD + 180) % 360) + 360) % 360) - 180;

/**
 * @typedef {{
 *   epochMs: number, a: number, beta: number, cosI: number, sinI: number,
 *   meanAnomalyRate: number, perigeeRate: number, nodeRate: number
 * }} Orbit
 */

/** @type {WeakMap<Elements, Orbit>} */
const orbits = new WeakMap();

/**
 * @param {Elements} sat
 * @returns {Orbit}
 */
const orbitOf = (sat) => {
  const known = orbits.get(sat);
  if (known) return known;
  const e = sat.eccentricity;
  const i = sat.inclination * RAD;
  const cosI = Math.cos(i);
  const theta2 = cosI * cosI;
  const beta2 = 1 - e * e;
  const beta = Math.sqrt(beta2);

  const kozai = (sat.meanMotion * TWO_PI) / MINUTES_PER_DAY;
  const a1 = (EARTH_RADII_PER_MINUTE / kozai) ** (2 / 3);
  const shape = (0.75 * J2 * (3 * theta2 - 1)) / (beta * beta2);
  const d1 = shape / (a1 * a1);
  const a0 = a1 * (1 - d1 / 3 - d1 * d1 - (134 / 81) * d1 * d1 * d1);
  const d0 = shape / (a0 * a0);
  const n = kozai / (1 + d0);
  const a = a0 / (1 - d0);

  const j2Rate = (1.5 * J2 * n) / (a * beta2) ** 2;
  const orbit = {
    epochMs: Date.parse(sat.epoch),
    a,
    beta,
    cosI,
    sinI: Math.sin(i),
    meanAnomalyRate: n + 0.5 * j2Rate * beta * (3 * theta2 - 1),
    perigeeRate: -0.5 * j2Rate * (1 - 5 * theta2),
    nodeRate: -j2Rate * cosI
  };
  orbits.set(sat, orbit);
  return orbit;
};

/**
 * @param {Elements} sat
 * @param {Date} date
 * @returns {Position}
 */
export const positionAt = (sat, date) => {
  const orbit = orbitOf(sat);
  const e = sat.eccentricity;
  const ms = date.getTime();
  const days = (ms - orbit.epochMs) / MS_PER_DAY;
  const minutes = days * MINUTES_PER_DAY;
  const meanMotionNow = sat.meanMotion + 2 * sat.meanMotionDot * days;
  const aNow = orbit.a * Math.cbrt((sat.meanMotion / meanMotionNow) ** 2);

  const m =
    sat.meanAnomaly * RAD +
    orbit.meanAnomalyRate * minutes +
    TWO_PI * sat.meanMotionDot * days * days;
  const omega = sat.argOfPerigee * RAD + orbit.perigeeRate * minutes;
  const node = sat.raan * RAD + orbit.nodeRate * minutes;

  let ecc = m;
  for (let k = 0; k < 3; k++)
    ecc -= (ecc - e * Math.sin(ecc) - m) / (1 - e * Math.cos(ecc));
  const cosE = Math.cos(ecc);
  const trueAnomaly = Math.atan2(orbit.beta * Math.sin(ecc), cosE - e);
  const u = omega + trueAnomaly;
  const rKm = aNow * (1 - e * cosE) * EARTH_RADIUS_KM;

  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosNode = Math.cos(node);
  const sinNode = Math.sin(node);
  const x = cosNode * cosU - sinNode * sinU * orbit.cosI;
  const y = sinNode * cosU + cosNode * sinU * orbit.cosI;
  const z = sinU * orbit.sinI;

  return {
    lat: Math.asin(z) / RAD,
    lng: toLongitude(Math.atan2(y, x) - gmst(ms)),
    altKm: rKm - EARTH_RADIUS_KM
  };
};
