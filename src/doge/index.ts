import axios from 'axios';
import { version } from '../../package.json';
import type { Clock, HttpGet, Logger } from '../ports';
import { CachedPriceSource } from './cached-price-source';
import { DogeService } from './doge.service';
import type { DogeQuery } from './ports';
import { CoinGeckoPriceSource } from './sources/coingecko/coingecko-price-source';

export type HttpConfig = {
  timeout: number;
  maxContentLength: number;
  maxRedirects: number;
  headers: Record<string, string>;
};

type GetJson = (url: string, config: HttpConfig) => Promise<{ data: unknown }>;

const systemClock: Clock = { now: () => new Date() };

const consoleLogger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

const COINGECKO_CONFIG: HttpConfig = {
  timeout: 10_000,
  maxContentLength: 64 * 1024,
  maxRedirects: 0,
  headers: {
    'User-Agent': `elonmu.sh/${version} (https://github.com/nickatnight/elonmu.sh)`
  }
};

export const createDogeModule = ({
  get = axios.get,
  clock = systemClock,
  logger = consoleLogger
}: {
  get?: GetJson;
  clock?: Clock;
  logger?: Logger;
} = {}): DogeQuery => {
  const http: HttpGet = async <T>(url: string) =>
    (await get(url, COINGECKO_CONFIG)).data as T;
  return new DogeService(
    new CachedPriceSource(new CoinGeckoPriceSource({ http }), clock, logger)
  );
};
