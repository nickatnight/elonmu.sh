import type { IsoTimestamp, PriceQuote } from '../../domain';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toUsd = (usd: unknown): number => {
  if (typeof usd !== 'number' || !Number.isFinite(usd) || usd <= 0)
    throw new Error(`coingecko: bad price ${String(usd)}`);
  return usd;
};

const toTimestamp = (seconds: unknown): IsoTimestamp => {
  if (
    typeof seconds !== 'number' ||
    !Number.isSafeInteger(seconds) ||
    seconds <= 0
  )
    throw new Error(`coingecko: bad update time ${String(seconds)}`);
  const at = new Date(seconds * 1000);
  if (Number.isNaN(at.getTime()))
    throw new Error(`coingecko: update time out of range ${seconds}`);
  return at.toISOString();
};

export const parseSimplePrice = (body: unknown): PriceQuote => {
  const coin = isObject(body) ? body.dogecoin : undefined;
  if (!isObject(coin)) throw new Error('coingecko: no dogecoin in the body');
  return { at: toTimestamp(coin.last_updated_at), usd: toUsd(coin.usd) };
};
