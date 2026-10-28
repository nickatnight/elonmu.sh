import { describe, expect, it } from 'bun:test';
import { DogeService } from '../../src/doge/doge.service';
import { SNL_SHOWTIME } from '../../src/doge/snl';
import { InMemoryPriceSource, NOW_QUOTE, sampleDoge } from './fakes';

describe('SNL_SHOWTIME', () => {
  it('is the price at 11:30 pm EDT on 8 May 2021, when the show went on air', () => {
    expect(SNL_SHOWTIME.at).toBe('2021-05-09T03:30:00.000Z');
    expect(SNL_SHOWTIME.usd).toBe(0.67343);
  });

  it('cites a Binance 1-minute candle that starts at that same minute', () => {
    const url = new URL(SNL_SHOWTIME.source.url);
    expect(url.origin).toBe('https://data-api.binance.vision');
    expect(url.searchParams.get('symbol')).toBe('DOGEUSDT');
    expect(url.searchParams.get('interval')).toBe('1m');
    expect(Number(url.searchParams.get('startTime'))).toBe(
      Date.parse(SNL_SHOWTIME.at)
    );
    expect(SNL_SHOWTIME.source.label).toBe(
      'Binance DOGE/USDT, 1-minute open at showtime'
    );
  });
});

describe('DogeService', () => {
  it('compares the live price with showtime: down 88.2%, $1,000 now worth $118.03', async () => {
    const comparison = await sampleDoge().comparison();
    expect(comparison.changePercent).toBe(-88.2);
    expect(comparison.thousandDollarsNow).toBe(118.03);
  });

  it('reports a rise as a positive change', async () => {
    const comparison = await sampleDoge({
      at: NOW_QUOTE.at,
      usd: 0.7563
    }).comparison();
    expect(comparison.changePercent).toBe(12.3);
    expect(comparison.thousandDollarsNow).toBe(1123.06);
  });

  it('reports an unchanged price as 0% and $1,000', async () => {
    const comparison = await sampleDoge({
      at: NOW_QUOTE.at,
      usd: SNL_SHOWTIME.usd
    }).comparison();
    expect(comparison.changePercent).toBe(0);
    expect(comparison.thousandDollarsNow).toBe(1000);
  });

  it('computes the $1,000 figure from the prices, not from the rounded change', async () => {
    const comparison = await sampleDoge({
      at: NOW_QUOTE.at,
      usd: 0.08
    }).comparison();
    expect(comparison.changePercent).toBe(-88.1);
    expect(comparison.thousandDollarsNow).toBe(118.79);
  });

  it('returns the documented fields, in order, with the live price and its time', async () => {
    expect(await sampleDoge().comparison()).toEqual({
      coin: 'Dogecoin',
      snl: {
        at: '2021-05-09T03:30:00.000Z',
        usd: 0.67343,
        source: {
          label: 'Binance DOGE/USDT, 1-minute open at showtime',
          url: 'https://data-api.binance.vision/api/v3/klines?symbol=DOGEUSDT&interval=1m&startTime=1620531000000&limit=1'
        }
      },
      now: { at: '2026-10-28T04:30:56.000Z', usd: 0.079484 },
      changePercent: -88.2,
      thousandDollarsNow: 118.03,
      attribution: {
        label: 'Data provided by CoinGecko',
        url: 'https://www.coingecko.com/en/coins/dogecoin'
      }
    });
    expect(Object.keys(await sampleDoge().comparison())).toEqual([
      'coin',
      'snl',
      'now',
      'changePercent',
      'thousandDollarsNow',
      'attribution'
    ]);
  });

  it('fails when the price source fails', async () => {
    const doge = new DogeService(
      new InMemoryPriceSource(NOW_QUOTE, { error: new Error('down') })
    );
    await expect(doge.comparison()).rejects.toThrow('down');
  });
});
