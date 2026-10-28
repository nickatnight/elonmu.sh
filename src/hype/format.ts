import { type ChartGeometry, dayMonth, seismograph } from './chart';
import type { Attribution, HypeSeries, IsoDate } from './domain';

const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

const oneDecimal = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

const millions = (views: number): string =>
  `${oneDecimal.format(views / 1_000_000)}M`;

const longDate = (date: IsoDate): string =>
  `${dayMonth(date)} ${date.slice(0, 4)}`;

const viewsText = (views: number): string =>
  `${whole.format(views)} ${views === 1 ? 'view' : 'views'}`;

export type HypeStat = { value: string; label: string };

export type SpikeRow = {
  datetime: IsoDate;
  date: string;
  views: string;
  size: string;
};

export type LoadedHypePage = {
  state: 'loaded';
  summary: string;
  stats: HypeStat[];
  spikes: SpikeRow[];
  charts: { wide: ChartGeometry; narrow: ChartGeometry };
  attribution: Attribution;
};

export type HypePage =
  | LoadedHypePage
  | { state: 'empty' }
  | { state: 'unavailable' };

export const hypePage = (series: HypeSeries): HypePage => {
  const { peak, median, total } = series.stats;
  if (series.days.length === 0 || !peak) return { state: 'empty' };
  return {
    state: 'loaded',
    summary: `Daily views, ${longDate(series.from)} – ${longDate(series.to)}, peak ${whole.format(peak.views)} on ${longDate(peak.date)}`,
    stats: [
      { value: whole.format(median), label: 'views on a normal day' },
      {
        value: whole.format(peak.views),
        label: `peak, ${longDate(peak.date)}`
      },
      { value: millions(total), label: 'views in the last year' }
    ],
    spikes: series.spikes.map((s) => ({
      datetime: s.date,
      date: longDate(s.date),
      views: viewsText(s.views),
      size: `${s.timesMedian}× a normal day`
    })),
    charts: {
      wide: seismograph(series, 'wide'),
      narrow: seismograph(series, 'narrow')
    },
    attribution: series.attribution
  };
};
