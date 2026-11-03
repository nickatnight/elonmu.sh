import type {
  Attribution,
  IsoDate,
  Reentry,
  ReentryTally,
  StarlinkSnapshot
} from './domain';

const count = new Intl.NumberFormat('en-US');

const monthDay = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric'
});

const plural = (n: number, unit: string): string =>
  `${n} ${unit}${n === 1 ? '' : 's'}`;

const parts = (date: IsoDate): [number, number, number] => {
  const [year, month, day] = date.split('-').map(Number);
  return [year, month, day];
};

export const lifespan = (launched: IsoDate, reentered: IsoDate): string => {
  const [y1, m1, d1] = parts(launched);
  const [y2, m2, d2] = parts(reentered);
  const months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months > 0) {
    const years = Math.floor(months / 12);
    const rest = months % 12;
    const spoken = [
      years > 0 ? plural(years, 'year') : '',
      rest > 0 ? plural(rest, 'month') : ''
    ].filter(Boolean);
    return `lived ${spoken.join(', ')}`;
  }
  const days =
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000;
  return days > 0 ? `lived ${plural(days, 'day')}` : 'lived less than a day';
};

type Day = { datetime: IsoDate; text: string };

export type Obituary = {
  name: string;
  launched: Day;
  reentered: Day;
  lifespan: string;
};

const obituary = (r: Reentry): Obituary => ({
  name: r.name,
  launched: { datetime: r.launched, text: r.launched.slice(0, 4) },
  reentered: {
    datetime: r.reentered,
    text: monthDay.format(new Date(`${r.reentered}T00:00:00.000Z`))
  },
  lifespan: lifespan(r.launched, r.reentered)
});

const obituaries = (tally: ReentryTally) => ({
  heading: `${count.format(tally.count)} burned up in ${tally.year}. RIP.`,
  list: tally.recent.map(obituary)
});

export type LoadedStarlinkPage = {
  state: 'loaded';
  inOrbit: string | null;
  obituaries: { heading: string; list: Obituary[] } | null;
  attribution: Attribution[];
};

export type StarlinkPage = LoadedStarlinkPage | { state: 'unavailable' };

export const starlinkPage = (snapshot: StarlinkSnapshot): StarlinkPage => ({
  state: 'loaded',
  inOrbit: snapshot.inOrbit === null ? null : count.format(snapshot.inOrbit),
  obituaries: snapshot.reentries ? obituaries(snapshot.reentries) : null,
  attribution: snapshot.attribution.filter((a) => a.url.startsWith('https://'))
});
