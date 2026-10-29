export type IsoTimestamp = string;

export type Attribution = { label: string; url: string };

export type PriceQuote = { at: IsoTimestamp; usd: number };

export type CitedPrice = PriceQuote & { source: Attribution };

export type DogeComparison = {
  coin: string;
  snl: CitedPrice;
  now: PriceQuote;
  changePercent: number;
  thousandDollarsNow: number;
  attribution: Attribution;
};

export const DOGE_COIN = 'Dogecoin';

export const DOGE_ATTRIBUTION: Attribution = {
  label: 'Data provided by CoinGecko',
  url: 'https://www.coingecko.com/en/coins/dogecoin'
};
