import type { DayViews, IsoDate } from '../../domain';

const TIMESTAMP = /^(\d{4})(\d{2})(\d{2})\d{2}$/;

const toDate = (timestamp: unknown): IsoDate => {
  const match = typeof timestamp === 'string' && TIMESTAMP.exec(timestamp);
  if (!match) throw new Error(`wikimedia: bad timestamp ${String(timestamp)}`);
  const [, y, m, d] = match;
  const date = `${y}-${m}-${d}`;
  const at = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(at.getTime()) || at.toISOString().slice(0, 10) !== date)
    throw new Error(`wikimedia: no such day ${timestamp}`);
  return date;
};

const toViews = (views: unknown): number => {
  if (typeof views !== 'number' || !Number.isSafeInteger(views) || views < 0)
    throw new Error(`wikimedia: bad view count ${String(views)}`);
  return views;
};

const toDay = (item: unknown): DayViews => {
  if (typeof item !== 'object' || item === null)
    throw new Error('wikimedia: item is not an object');
  const { timestamp, views } = item as Record<string, unknown>;
  return { date: toDate(timestamp), views: toViews(views) };
};

export const parseItems = (items: unknown): DayViews[] => {
  if (!Array.isArray(items)) throw new Error('wikimedia: items is not a list');
  const byDate = new Map<IsoDate, DayViews>();
  for (const day of items.map(toDay))
    if (!byDate.has(day.date)) byDate.set(day.date, day);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
};
