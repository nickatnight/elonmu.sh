import { describe, expect, it } from 'bun:test';
import pkg from '../../package.json';
import { createHypeModule, type HttpConfig } from '../../src/hype/index';
import { FakeClock } from '../fakes';
import capture from '../fixtures/wikimedia-pageviews.json';

describe('createHypeModule', () => {
  it('calls Wikimedia with a descriptive User-Agent, a 10 s timeout, a 1 MB cap and no redirects', async () => {
    const requests: { url: string; config: HttpConfig }[] = [];
    const get = async (url: string, config: HttpConfig) => {
      requests.push({ url, config });
      return { data: capture };
    };
    const hype = createHypeModule({
      get,
      clock: new FakeClock('2026-10-27T09:12:44.000Z')
    });

    const series = await hype.series();

    expect(requests).toEqual([
      {
        url: 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Elon_Musk/daily/20251027/20261026',
        config: {
          timeout: 10_000,
          maxContentLength: 1_000_000,
          maxRedirects: 0,
          headers: {
            'User-Agent': `elonmu.sh/${pkg.version} (https://github.com/nickatnight/elonmu.sh)`
          }
        }
      }
    ]);
    expect(series.days).toHaveLength(365);
  });
});
