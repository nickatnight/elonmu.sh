import type { Attribution, DogeComparison, IsoTimestamp } from './domain';

const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const pricePerCoin = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4
});

const coins = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const MINUS = '−';

export type Holding = { doge: string; atShowtime: string; today: string };

export const holding = (
  amount: number,
  snlUsd: number,
  nowUsd: number
): Holding => ({
  doge: coins.format(amount),
  atShowtime: cents.format(amount * snlUsd),
  today: cents.format(amount * nowUsd)
});

type Change = { text: string; words: string };

const change = (percent: number): Change => {
  const size = `${oneDecimal.format(Math.abs(percent))}%`;
  if (percent > 0) return { text: `+${size}`, words: `Up ${size}` };
  if (percent < 0) return { text: `${MINUS}${size}`, words: `Down ${size}` };
  return { text: size, words: size };
};

type Parts = Record<Intl.DateTimeFormatPartTypes, string>;

const partsIn = (
  at: IsoTimestamp,
  timeZone: string,
  hourCycle: 'h12' | 'h23'
) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
      .formatToParts(new Date(at))
      .map(({ type, value }) => [type, value])
  ) as Parts;

type Moment = { datetime: IsoTimestamp; date: string; time: string };

const easternMoment = (at: IsoTimestamp): Moment => {
  const p = partsIn(at, 'America/New_York', 'h12');
  return {
    datetime: at,
    date: `${p.day} ${p.month} ${p.year}`,
    time: `${Number(p.hour)}:${p.minute} ${p.dayPeriod.toLowerCase()} ET`
  };
};

const utcMoment = (at: IsoTimestamp): Moment => {
  const p = partsIn(at, 'UTC', 'h23');
  return {
    datetime: at,
    date: `${p.day} ${p.month} ${p.year}`,
    time: `${p.hour}:${p.minute} UTC`
  };
};

export type PricePoint = Moment & { usd: number; price: string };

export type LoadedDogePage = {
  state: 'loaded';
  change: Change;
  holding: Holding;
  snl: PricePoint & { source: Attribution };
  now: PricePoint;
  attribution: Attribution;
};

export type DogePage = LoadedDogePage | { state: 'unavailable' };

export const dogePage = (comparison: DogeComparison): DogePage => {
  const { snl, now } = comparison;
  return {
    state: 'loaded',
    change: change(comparison.changePercent),
    holding: holding(1000 / snl.usd, snl.usd, now.usd),
    snl: {
      ...easternMoment(snl.at),
      usd: snl.usd,
      price: pricePerCoin.format(snl.usd),
      source: snl.source
    },
    now: {
      ...utcMoment(now.at),
      usd: now.usd,
      price: pricePerCoin.format(now.usd)
    },
    attribution: comparison.attribution
  };
};
