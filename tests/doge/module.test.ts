import { describe, expect, it } from 'bun:test';
import pkg from '../../package.json';
import { createDogeModule, type HttpConfig } from '../../src/doge/index';
import { FakeClock } from '../fakes';
import capture from '../fixtures/coingecko-simple-price.json';

describe('createDogeModule', () => {
  it('calls CoinGecko with the site User-Agent, a 10 s timeout, a 64 KB cap and no redirects', async () => {
    const requests: { url: string; config: HttpConfig }[] = [];
    const get = async (url: string, config: HttpConfig) => {
      requests.push({ url, config });
      return { data: capture };
    };
    const doge = createDogeModule({
      get,
      clock: new FakeClock('2026-10-28T04:50:00.000Z')
    });

    const comparison = await doge.comparison();

    expect(requests).toEqual([
      {
        url: 'https://api.coingecko.com/api/v3/simple/price?ids=dogecoin&vs_currencies=usd&include_last_updated_at=true',
        config: {
          timeout: 10_000,
          maxContentLength: 65_536,
          maxRedirects: 0,
          headers: {
            'User-Agent': `elonmu.sh/${pkg.version} (https://github.com/nickatnight/elonmu.sh)`
          }
        }
      }
    ]);
    expect(comparison.now).toEqual({
      at: '2026-10-28T04:49:11.000Z',
      usd: 0.079636
    });
  });

  it('caches the price, so a second request within 5 minutes makes no call', async () => {
    let calls = 0;
    const get = async () => {
      calls++;
      return { data: capture };
    };
    const clock = new FakeClock('2026-10-28T04:50:00.000Z');
    const doge = createDogeModule({ get, clock });

    await doge.comparison();
    clock.advance(5 * 60_000 - 1);
    await doge.comparison();

    expect(calls).toBe(1);
  });
});
