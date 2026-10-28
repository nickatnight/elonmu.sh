import type { DayViews, HypeSeries } from './domain';

export interface PageviewSource {
  /**
   * Contract (tests/hype/pageview-source.contract.ts):
   * 1. only days in [from, to], ascending, no duplicate dates
   * 2. dates are YYYY-MM-DD (UTC); views are non-negative integers
   * 3. missing upstream days are omitted, never zero-filled
   * 4. throws on upstream failure (including a 404 for the range)
   */
  fetchDays(from: Date, to: Date): Promise<DayViews[]>;
}

export interface HypeQuery {
  series(): Promise<HypeSeries>;
}
