import { describe, expect, it } from 'bun:test';
import {
  CoinGeckoPriceSource,
  SIMPLE_PRICE_URL
} from '../../src/doge/sources/coingecko/coingecko-price-source';
import { InMemoryPriceSource } from '../../src/doge/sources/memory/in-memory-price-source';
import { fakeHttpGet } from '../fakes';
import capture from '../fixtures/coingecko-simple-price.json';
import { describePriceSource } from './price-source.contract';

describePriceSource('CoinGeckoPriceSource', {
  make: () =>
    new CoinGeckoPriceSource({
      http: fakeHttpGet({ [SIMPLE_PRICE_URL]: capture }).get
    }),
  makeFailing: () => new CoinGeckoPriceSource({ http: fakeHttpGet({}).get })
});

describePriceSource('InMemoryPriceSource', {
  make: () =>
    new InMemoryPriceSource({ usd: 0.079484, at: '2026-10-28T04:30:56.000Z' }),
  makeFailing: () =>
    new InMemoryPriceSource(
      { usd: 0.079484, at: '2026-10-28T04:30:56.000Z' },
      { error: new Error('upstream down') }
    )
});

describe('CoinGeckoPriceSource', () => {
  it("asks CoinGecko's keyless endpoint for Dogecoin in US dollars with its update time", async () => {
    const http = fakeHttpGet({ [SIMPLE_PRICE_URL]: capture });
    await new CoinGeckoPriceSource({ http: http.get }).fetchPrice();
    expect(http.calls).toEqual([
      'https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd&include_last_updated_at=true'
    ]);
  });

  it('reads the captured response as $0.079636 at 04:49:11 UTC on 28 Oct 2026', async () => {
    const http = fakeHttpGet({ [SIMPLE_PRICE_URL]: capture });
    expect(
      await new CoinGeckoPriceSource({ http: http.get }).fetchPrice()
    ).toEqual({ usd: 0.079636, at: '2026-10-28T04:49:11.000Z' });
  });

  it('throws on a body without Dogecoin in it', async () => {
    const http = fakeHttpGet({ [SIMPLE_PRICE_URL]: {} });
    await expect(
      new CoinGeckoPriceSource({ http: http.get }).fetchPrice()
    ).rejects.toThrow();
  });
});
