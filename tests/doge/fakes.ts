import { DogeService } from '../../src/doge/doge.service';
import type { PriceQuote } from '../../src/doge/domain';
import type { DogeQuery } from '../../src/doge/ports';
import { InMemoryPriceSource } from '../../src/doge/sources/memory/in-memory-price-source';

export { InMemoryPriceSource };

export const NOW_QUOTE: PriceQuote = {
  at: '2026-10-28T04:30:56.000Z',
  usd: 0.079484
};

export const sampleDoge = (quote: PriceQuote = NOW_QUOTE): DogeQuery =>
  new DogeService(new InMemoryPriceSource(quote));

export const failingDoge = (): DogeQuery => ({
  comparison: () => Promise.reject(new Error('coingecko down'))
});
