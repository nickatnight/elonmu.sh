import type { IsoDate, Reentry } from '../../domain';
import { firstUsableById, isObject } from './records';

const toDate = (value: unknown): IsoDate | null => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;

  const at = new Date(`${value}T00:00:00.000Z`);

  return at.toISOString().slice(0, 10) === value ? value : null;
};

const toReentry = (record: unknown): Reentry | null => {
  if (!isObject(record)) return null;

  const id = record.NORAD_CAT_ID;
  const name = record.OBJECT_NAME;
  const launched = toDate(record.LAUNCH_DATE);
  const reentered = toDate(record.DECAY_DATE);

  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0)
    return null;

  if (typeof name !== 'string' || name.trim() === '') return null;

  if (!launched || !reentered || reentered < launched) return null;

  return { id, name: name.trim(), launched, reentered };
};

export const parseSatcat = (body: unknown): Reentry[] =>
  firstUsableById(body, toReentry, { body: 'SATCAT', item: 're-entry' });
