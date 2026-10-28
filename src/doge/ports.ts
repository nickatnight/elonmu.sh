import type { DogeComparison, PriceQuote } from './domain';

export interface PriceSource {
  /**
   * Contract (tests/doge/price-source.contract.ts):
   * 1. usd is a finite US dollar price above zero
   * 2. at is the time of that price, an ISO 8601 UTC timestamp
   * 3. carries only usd and at, no upstream fields
   * 4. throws on upstream failure or a malformed response
   */
  fetchPrice(): Promise<PriceQuote>;
}

export interface DogeQuery {
  comparison(): Promise<DogeComparison>;
}
