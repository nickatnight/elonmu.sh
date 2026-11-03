import type { IsoTimestamp, Satellite } from '../../domain';
import { firstUsableById, isObject } from './records';

const EPOCH = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?Z?$/;

const toEpoch = (value: unknown): IsoTimestamp | null => {
  const match = typeof value === 'string' ? EPOCH.exec(value) : null;
  if (!match) return null;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map(Number);
  const whole = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const fieldsKept =
    whole.getUTCFullYear() === year &&
    whole.getUTCMonth() === month - 1 &&
    whole.getUTCDate() === day &&
    whole.getUTCHours() === hour &&
    whole.getUTCMinutes() === minute &&
    whole.getUTCSeconds() === second;
  if (!fieldsKept) return null;
  const ms = Math.round(Number(match[7] ?? 0) * 1000);
  return new Date(whole.getTime() + ms).toISOString();
};

const finiteOrNaN = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;

const toSatellite = (record: unknown): Satellite | null => {
  if (!isObject(record)) return null;
  const id = record.NORAD_CAT_ID;
  const name = record.OBJECT_NAME;
  const epoch = toEpoch(record.EPOCH);
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
    return null;
  if (typeof name !== 'string' || name.trim() === '' || !epoch) return null;
  const satellite: Satellite = {
    id,
    name: name.trim(),
    epoch,
    meanMotion: finiteOrNaN(record.MEAN_MOTION),
    meanMotionDot: finiteOrNaN(record.MEAN_MOTION_DOT),
    eccentricity: finiteOrNaN(record.ECCENTRICITY),
    inclination: finiteOrNaN(record.INCLINATION),
    raan: finiteOrNaN(record.RA_OF_ASC_NODE),
    argOfPerigee: finiteOrNaN(record.ARG_OF_PERICENTER),
    meanAnomaly: finiteOrNaN(record.MEAN_ANOMALY)
  };
  const valid =
    satellite.meanMotion > 0 &&
    Number.isFinite(satellite.meanMotionDot) &&
    satellite.eccentricity >= 0 &&
    satellite.eccentricity < 1 &&
    satellite.inclination >= 0 &&
    satellite.inclination <= 180 &&
    Number.isFinite(satellite.raan) &&
    Number.isFinite(satellite.argOfPerigee) &&
    Number.isFinite(satellite.meanAnomaly);
  return valid ? satellite : null;
};

export const parseGp = (body: unknown): Satellite[] =>
  firstUsableById(body, toSatellite, { body: 'GP', item: 'satellite' });
