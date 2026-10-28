export type IsoDate = string;

export type IsoTimestamp = string;

export type Attribution = { label: string; url: string };

export type DayViews = { date: IsoDate; views: number };

export type Spike = DayViews & { timesMedian: number };

export type HypeStats = {
  total: number;
  median: number;
  peak: DayViews | null;
};

export type HypeSeries = {
  article: string;
  from: IsoDate;
  to: IsoDate;
  updatedAt: IsoTimestamp;
  attribution: Attribution;
  days: DayViews[];
  stats: HypeStats;
  spikes: Spike[];
};

export const HYPE_ARTICLE = 'Elon Musk';

export const HYPE_ATTRIBUTION: Attribution = {
  label: 'Wikimedia pageviews (en.wikipedia, users only)',
  url: 'https://pageviews.wmcloud.org/?project=en.wikipedia.org&pages=Elon_Musk'
};
