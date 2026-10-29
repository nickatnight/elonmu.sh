import { DOGE_ATTRIBUTION, DOGE_COIN, type DogeComparison } from './domain';
import type { DogeQuery, PriceSource } from './ports';
import { SNL_SHOWTIME } from './snl';

const toOneDecimal = (n: number): number => Math.round(n * 10) / 10;

const toCents = (usd: number): number => Math.round(usd * 100) / 100;

export class DogeService implements DogeQuery {
  constructor(private readonly source: PriceSource) {}

  async comparison(): Promise<DogeComparison> {
    const now = await this.source.fetchPrice();
    const ratio = now.usd / SNL_SHOWTIME.usd;
    return {
      coin: DOGE_COIN,
      snl: SNL_SHOWTIME,
      now,
      changePercent: toOneDecimal((ratio - 1) * 100),
      thousandDollarsNow: toCents(1000 * ratio),
      attribution: DOGE_ATTRIBUTION
    };
  }
}
