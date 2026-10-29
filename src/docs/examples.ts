import {
  DOGE_ATTRIBUTION,
  DOGE_COIN,
  type DogeComparison
} from '../doge/domain';
import { SNL_SHOWTIME } from '../doge/snl';
import {
  HYPE_ARTICLE,
  HYPE_ATTRIBUTION,
  type HypeSeries
} from '../hype/domain';
import type { JetSnapshot } from '../jet/domain';
import type { Article } from '../news/domain';

const news: Article = {
  source: 'Business Insider',
  title:
    "Wizards, horses, flip phones and AI: Elon Musk's 10 most colorful quotes from Tesla's investor day",
  description:
    'Musk joked about charging mishaps, hailed the complexity of the human brain, and voiced his fears about the rise of artificial intelligence.',
  url: 'https://markets.businessinsider.com/news/stocks/elon-musk-tesla-investor-day-ai-electric-vehicles-self-driving-2023-3',
  urlImage:
    'https://i.insider.com/64007dd7ce4a630019955630?width=1200&format=jpeg',
  publishDate: '2023-03-02T11:37:41Z'
};

const jet: JetSnapshot = {
  year: 2026,
  updatedAt: '2026-10-28T09:12:44.000Z',
  attribution: {
    label: '@elonjet.net by Jack Sweeney',
    url: 'https://bsky.app/profile/elonjet.net'
  },
  flights: [
    {
      id: '3mxq2c7tluk2a',
      tail: 'N628TS',
      from: {
        name: 'Austin, Texas, United States',
        lat: 30.2672,
        lon: -97.7431
      },
      to: {
        name: 'San Jose, California, United States',
        lat: 37.3362,
        lon: -121.8906
      },
      departedAt: '2026-10-27T15:02:11.000Z',
      landedAt: '2026-10-27T18:21:40.000Z',
      durationMin: 199,
      fuel: { gallons: 1032, usd: 7276, co2Tons: 9.86 },
      status: 'landed',
      sourceUrl: 'https://bsky.app/profile/elonjet.net/post/3mxq2c7tluk2a'
    }
  ],
  totals: {
    flights: 324,
    gallons: 157525,
    usd: 1109406,
    co2Tons: 1657.6,
    hours: 529.1
  }
};

const hype: HypeSeries = {
  article: HYPE_ARTICLE,
  from: '2025-10-27',
  to: '2026-10-26',
  updatedAt: '2026-10-27T09:12:44.000Z',
  attribution: HYPE_ATTRIBUTION,
  days: [{ date: '2025-10-27', views: 19194 }],
  stats: {
    total: 8678483,
    median: 20803,
    peak: { date: '2026-06-12', views: 194434 }
  },
  spikes: [{ date: '2026-06-12', views: 194434, timesMedian: 9.3 }]
};

const doge: DogeComparison = {
  coin: DOGE_COIN,
  snl: SNL_SHOWTIME,
  now: { at: '2026-10-28T04:30:56.000Z', usd: 0.079484 },
  changePercent: -88.2,
  thousandDollarsNow: 118.03,
  attribution: DOGE_ATTRIBUTION
};

export const EXAMPLES = {
  'news-api': news,
  'jet-tracker': jet,
  'hype-meter': hype,
  'doge-since-snl': doge
};

export const UPSTREAM_ERROR_EXAMPLE = {
  error: 'There was an error with NewsAPI. Please try again later.'
};
