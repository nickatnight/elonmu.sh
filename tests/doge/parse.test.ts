import { describe, expect, it } from 'bun:test';
import { parseSimplePrice } from '../../src/doge/sources/coingecko/parse';
import capture from '../fixtures/coingecko-simple-price.json';

const body = (usd: unknown, lastUpdatedAt: unknown) => ({
  dogecoin: { usd, last_updated_at: lastUpdatedAt }
});

describe('parseSimplePrice on the captured CoinGecko response', () => {
  it('reads the price in US dollars and its update time', () => {
    expect(parseSimplePrice(capture)).toEqual({
      usd: 0.079636,
      at: '2026-10-28T04:49:11.000Z'
    });
  });

  it('carries no CoinGecko field names', () => {
    expect(Object.keys(parseSimplePrice(capture)).sort()).toEqual([
      'at',
      'usd'
    ]);
  });
});

describe('parseSimplePrice on small responses', () => {
  it.each([
    ['a price below a cent', body(0.0001, 1), 0.0001],
    ['a price above a dollar', body(0.7316, 1), 0.7316]
  ])('accepts %s', (_name, response, usd) => {
    expect(parseSimplePrice(response).usd).toBe(usd);
  });

  it('ignores other coins and currencies in the same body', () => {
    expect(
      parseSimplePrice({
        bitcoin: { usd: 1 },
        dogecoin: { usd: 0.1, eur: 0.09, last_updated_at: 1793161856 }
      })
    ).toEqual({ usd: 0.1, at: '2026-10-28T04:30:56.000Z' });
  });

  it.each([
    ['a body that is not an object', null],
    ['a body without Dogecoin', { bitcoin: { usd: 1, last_updated_at: 1 } }],
    ['Dogecoin that is not an object', { dogecoin: 0.08 }],
    ['a missing price', { dogecoin: { last_updated_at: 1793161856 } }],
    ['a zero price', body(0, 1793161856)],
    ['a negative price', body(-0.08, 1793161856)],
    ['a price that is not a number', body(Number.NaN, 1793161856)],
    ['an infinite price', body(Number.POSITIVE_INFINITY, 1793161856)],
    ['a price as a string', body('0.08', 1793161856)],
    ['a missing update time', { dogecoin: { usd: 0.08 } }],
    ['an update time as a string', body(0.08, '1793161856')],
    ['a fractional update time', body(0.08, 1793161856.5)],
    ['a zero update time', body(0.08, 0)],
    ['a negative update time', body(0.08, -1)],
    ['an update time beyond the dates JavaScript can hold', body(0.08, 2 ** 52)]
  ])('rejects %s', (_name, response) => {
    expect(() => parseSimplePrice(response)).toThrow();
  });
});
