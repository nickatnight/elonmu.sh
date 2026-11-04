import { describe, expect, it } from 'bun:test';
import { AxiosError, type AxiosResponse } from 'axios';
import pkg from '../../package.json';
import {
  createStarlinkModule,
  type HttpConfig,
  warmUp
} from '../../src/starlink/index';
import { GP_URL } from '../../src/starlink/sources/celestrak/celestrak-orbit-source';
import { SATCAT_URL } from '../../src/starlink/sources/celestrak/celestrak-reentry-source';
import { FakeClock, FakeLogger, inTimeZone } from '../fakes';
import gpCapture from '../fixtures/celestrak-starlink-gp.json';
import satcatCapture from '../fixtures/celestrak-starlink-satcat.json';
import { failingStarlink } from './fakes';

const captures: Record<string, unknown> = {
  [GP_URL]: gpCapture,
  [SATCAT_URL]: satcatCapture
};

const recordingGet = () => {
  const requests: { url: string; config: HttpConfig }[] = [];
  const get = async (url: string, config: HttpConfig) => {
    requests.push({ url, config });

    return { data: captures[url] };
  };

  return { get, requests };
};

describe('createStarlinkModule', () => {
  it('calls CelesTrak with the site User-Agent, a 10 s timeout, a 16 MB cap and no redirects', async () => {
    const { get, requests } = recordingGet();
    const starlink = createStarlinkModule({
      get,
      clock: new FakeClock('2026-10-30T04:30:00.000Z')
    });

    const snapshot = await starlink.snapshot();

    const config = {
      timeout: 10_000,
      maxContentLength: 16 * 1024 * 1024,
      maxRedirects: 0,
      headers: {
        'User-Agent': `elonmu.sh/${pkg.version} (https://github.com/nickatnight/elonmu.sh)`
      }
    };

    expect(requests).toEqual([
      {
        url: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json',
        config
      },
      {
        url: 'https://celestrak.org/satcat/records.php?NAME=STARLINK&FORMAT=json',
        config
      }
    ]);
    expect(snapshot.inOrbit).toBe(200);
    expect(snapshot.updatedAt).toBe('2026-10-30T04:30:00.000Z');
  });

  it('asks CelesTrak for orbits once per 6 hours and the catalogue once per 12', async () => {
    const { get, requests } = recordingGet();
    const clock = new FakeClock('2026-10-30T04:30:00.000Z');
    const starlink = createStarlinkModule({ get, clock });

    for (let minute = 0; minute < 24 * 60; minute += 5) {
      await starlink.snapshot();
      clock.advance(5 * 60_000);
    }

    const count = (url: string) => requests.filter((r) => r.url === url).length;

    expect({ gp: count(GP_URL), satcat: count(SATCAT_URL) }).toEqual({
      gp: 4,
      satcat: 2
    });
  });

  it('rolls the re-entry count over at New Year UTC without fetching the catalogue again', async () => {
    await inTimeZone('America/Los_Angeles', async () => {
      const { get, requests } = recordingGet();
      const clock = new FakeClock('2026-12-31T23:30:00.000Z');
      const starlink = createStarlinkModule({ get, clock });

      const before = await starlink.snapshot();

      clock.set('2027-01-01T00:00:00.000Z');
      const after = await starlink.snapshot();

      expect(before.reentries?.count).toBe(83);
      expect(after.reentries).toEqual({ year: 2027, count: 0, recent: [] });
      expect(requests.filter((r) => r.url === SATCAT_URL)).toHaveLength(1);
    });
  });

  const refusal = (status: number) =>
    new AxiosError(
      `Request failed with status code ${status}`,
      'ERR_BAD_REQUEST',
      undefined,
      {},
      { status } as AxiosResponse
    );

  it.each([
    ['a 403', '2 hours', refusal(403), 2 * 3_600_000],
    ['a 429', '2 hours', refusal(429), 2 * 3_600_000],
    ['a 500', 'a minute', refusal(500), 60_000],
    [
      'no answer in time',
      'a minute',
      new AxiosError(
        'timeout of 10000ms exceeded',
        'ECONNABORTED',
        undefined,
        {}
      ),
      60_000
    ],
    [
      'an error that is not from axios',
      'a minute',
      new Error('socket hang up'),
      60_000
    ]
  ] as [string, string, Error, number][])(
    'after CelesTrak gives %s, waits %s before asking again',
    async (_name, _wait, error, waitMs) => {
      let calls = 0;
      const clock = new FakeClock('2026-10-30T04:30:00.000Z');
      const starlink = createStarlinkModule({
        get: async () => {
          calls++;
          throw error;
        },
        clock,
        logger: new FakeLogger()
      });

      await expect(starlink.snapshot()).rejects.toThrow();
      clock.advance(waitMs - 1);
      await expect(starlink.snapshot()).rejects.toThrow();
      expect(calls).toBe(2);
      clock.advance(1);
      await expect(starlink.snapshot()).rejects.toThrow();
      expect(calls).toBe(4);
    }
  );

  it('keeps serving the last orbits while it waits out a 403', async () => {
    const { get, requests } = recordingGet();
    const clock = new FakeClock('2026-10-30T04:30:00.000Z');
    const logger = new FakeLogger();
    let refusing = false;
    const starlink = createStarlinkModule({
      get: async (url, config) => {
        const answer = await get(url, config);

        if (refusing) throw refusal(403);

        return answer;
      },
      clock,
      logger
    });
    const first = await starlink.snapshot();

    clock.advance(6 * 3_600_000);
    refusing = true;

    for (let minute = 0; minute < 119; minute++) {
      expect((await starlink.snapshot()).satellites).toEqual(first.satellites);
      clock.advance(60_000);
    }

    expect(requests.map((r) => r.url)).toEqual([GP_URL, SATCAT_URL, GP_URL]);
    expect(logger.warnings.map((w) => w.msg)).toEqual([
      'starlink: orbit refresh failed, serving stale orbits'
    ]);
  });

  it('warns through the logger it is given when a refresh fails', async () => {
    const logger = new FakeLogger();
    const starlink = createStarlinkModule({
      get: async () => {
        throw new Error('Request failed with status code 403');
      },
      clock: new FakeClock('2026-10-30T04:30:00.000Z'),
      logger
    });

    await expect(starlink.snapshot()).rejects.toThrow('403');
    expect(logger.warnings.map((w) => w.msg).sort()).toEqual([
      'starlink: orbit refresh failed, no orbits to serve',
      'starlink: re-entry refresh failed, no re-entries to serve'
    ]);
  });
});

describe('warmUp', () => {
  it('loads both catalogues, so the first visitor makes no CelesTrak call', async () => {
    const { get, requests } = recordingGet();
    const starlink = createStarlinkModule({
      get,
      clock: new FakeClock('2026-10-30T04:30:00.000Z')
    });

    await warmUp(starlink, new FakeLogger());
    await starlink.snapshot();
    expect(requests.map((r) => r.url)).toEqual([GP_URL, SATCAT_URL]);
  });

  it('warns and carries on when CelesTrak is down at start', async () => {
    const logger = new FakeLogger();

    await expect(warmUp(failingStarlink(), logger)).resolves.toBeUndefined();
    expect(logger.warnings).toEqual([
      {
        msg: 'starlink: warm-up failed, will retry on the first request',
        meta: { error: 'celestrak down' }
      }
    ]);
  });
});
