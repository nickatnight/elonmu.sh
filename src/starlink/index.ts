import axios, { AxiosError } from 'axios';
import { version } from '../../package.json';
import type { GetJson, HttpConfig } from '../http-config';
import type { Clock, HttpGet, Logger } from '../ports';
import { CachedOrbitSource } from './cached-orbit-source';
import { CachedReentrySource } from './cached-reentry-source';
import { type StarlinkQuery, UpstreamRefusedError } from './ports';
import { CelesTrakOrbitSource } from './sources/celestrak/celestrak-orbit-source';
import { CelesTrakReentrySource } from './sources/celestrak/celestrak-reentry-source';
import { StarlinkService } from './starlink.service';

const systemClock: Clock = { now: () => new Date() };

const consoleLogger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

const CELESTRAK_CONFIG: HttpConfig = {
  timeout: 10_000,
  maxContentLength: 16 * 1024 * 1024,
  maxRedirects: 0,
  headers: {
    'User-Agent': `elonmu.sh/${version} (https://github.com/nickatnight/elonmu.sh)`
  }
};

const classify = (err: unknown): unknown => {
  const status = err instanceof AxiosError ? err.response?.status : undefined;

  if (status === 403 || status === 429)
    return new UpstreamRefusedError(status, { cause: err });

  return err;
};

export const createStarlinkModule = ({
  get = axios.get,
  clock = systemClock,
  logger = consoleLogger
}: {
  get?: GetJson;
  clock?: Clock;
  logger?: Logger;
} = {}): StarlinkQuery => {
  const http: HttpGet = async <T>(url: string) => {
    try {
      return (await get(url, CELESTRAK_CONFIG)).data as T;
    } catch (err) {
      throw classify(err);
    }
  };

  return new StarlinkService({
    orbits: new CachedOrbitSource(
      new CelesTrakOrbitSource({ http, clock }),
      clock,
      logger
    ),
    reentries: new CachedReentrySource(
      new CelesTrakReentrySource({ http, clock }),
      clock,
      logger
    ),
    clock
  });
};

export const warmUp = async (
  starlink: StarlinkQuery,
  log: Logger = consoleLogger
): Promise<void> => {
  try {
    await starlink.snapshot();
  } catch (err) {
    log.warn('starlink: warm-up failed, will retry on the first request', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
};
