import type { Clock } from '../ports';
import {
  type DayViews,
  HYPE_ARTICLE,
  HYPE_ATTRIBUTION,
  type HypeSeries,
  type HypeStats,
  isoDate,
  type Spike
} from './domain';
import type { HypeQuery, PageviewSource } from './ports';

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 365;
const SPIKE_COUNT = 5;
const SPIKE_GAP_DAYS = 7;

const median = (days: readonly DayViews[]): number => {
  const views = days.map((d) => d.views).sort((a, b) => a - b);
  if (views.length === 0) return 0;
  const mid = Math.floor(views.length / 2);
  return views.length % 2 ? views[mid] : (views[mid - 1] + views[mid]) / 2;
};

const statsOf = (days: readonly DayViews[]): HypeStats => {
  let peak: DayViews | null = null;
  let total = 0;
  for (const d of days) {
    total += d.views;
    if (!peak || d.views > peak.views) peak = d;
  }
  return { total, median: median(days), peak };
};

const daysApart = (a: DayViews, b: DayViews): number =>
  Math.abs(Date.parse(a.date) - Date.parse(b.date)) / DAY_MS;

const spikesOf = (days: readonly DayViews[], normal: number): Spike[] => {
  if (normal <= 0) return [];
  const picked: DayViews[] = [];
  const loudestFirst = [...days].sort(
    (a, b) => b.views - a.views || a.date.localeCompare(b.date)
  );
  for (const d of loudestFirst) {
    if (picked.length === SPIKE_COUNT) break;
    if (picked.every((p) => daysApart(p, d) >= SPIKE_GAP_DAYS)) picked.push(d);
  }
  return picked.map((d) => ({
    ...d,
    timesMedian: Math.round((d.views / normal) * 10) / 10
  }));
};

export class HypeService implements HypeQuery {
  constructor(
    private readonly source: PageviewSource,
    private readonly clock: Clock
  ) {}

  async series(): Promise<HypeSeries> {
    const now = this.clock.now();
    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const to = new Date(today - DAY_MS);
    const from = new Date(today - WINDOW_DAYS * DAY_MS);
    const days = await this.source.fetchDays(from, to);
    const stats = statsOf(days);
    return {
      article: HYPE_ARTICLE,
      from: days[0]?.date ?? isoDate(from),
      to: days.at(-1)?.date ?? isoDate(to),
      updatedAt: now.toISOString(),
      attribution: HYPE_ATTRIBUTION,
      days,
      stats,
      spikes: spikesOf(days, stats.median)
    };
  }
}
