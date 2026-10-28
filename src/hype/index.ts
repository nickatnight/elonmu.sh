import axios from 'axios';
import { version } from '../../package.json';
import type { Clock, HttpGet, Logger } from '../ports';
import { CachedPageviewSource } from './cached-pageview-source';
import { HypeService } from './hype.service';
import type { HypeQuery } from './ports';
import { WikimediaPageviewSource } from './sources/wikimedia/wikimedia-pageview-source';

export type HttpConfig = {
  timeout: number;
  maxContentLength: number;
  maxRedirects: number;
  headers: Record<string, string>;
};

type GetJson = (url: string, config: HttpConfig) => Promise<{ data: unknown }>;

const systemClock: Clock = { now: () => new Date() };

const logger: Logger = {
  warn: (msg, meta) => console.warn(`⚠️ ${msg}`, meta ?? '')
};

// Wikimedia's API policy asks every client for a descriptive User-Agent
// with contact details, and may block clients that send none.
const WIKIMEDIA_CONFIG: HttpConfig = {
  timeout: 10_000,
  maxContentLength: 1_000_000,
  maxRedirects: 0,
  headers: {
    'User-Agent': `elonmu.sh/${version} (https://github.com/nickatnight/elonmu.sh)`
  }
};

export const createHypeModule = ({
  get = axios.get,
  clock = systemClock
}: {
  get?: GetJson;
  clock?: Clock;
} = {}): HypeQuery => {
  const http: HttpGet = async <T>(url: string) =>
    (await get(url, WIKIMEDIA_CONFIG)).data as T;
  return new HypeService(
    new CachedPageviewSource(
      new WikimediaPageviewSource({ http }),
      clock,
      logger
    ),
    clock
  );
};
