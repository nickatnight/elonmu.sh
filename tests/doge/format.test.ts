import { describe, expect, it } from 'bun:test';
import { dogePage, type LoadedDogePage } from '../../src/doge/format';
import { NOW_QUOTE, sampleDoge } from './fakes';

const loaded = async (usd = NOW_QUOTE.usd, at = NOW_QUOTE.at) => {
  const page = dogePage(await sampleDoge({ at, usd }).comparison());
  if (page.state !== 'loaded') throw new Error('expected a loaded page');
  return page as LoadedDogePage;
};

describe('dogePage when the price has fallen since showtime', () => {
  it('shows the change with a minus sign and says "Down" in words', async () => {
    expect((await loaded()).change).toEqual({
      text: '−88.2%',
      words: 'Down 88.2%'
    });
  });

  it('values the DOGE $1,000 bought at showtime, then and now', async () => {
    expect((await loaded()).holding).toEqual({
      doge: '1,484.94',
      atShowtime: '$1,000.00',
      today: '$118.03'
    });
  });

  it('gives the showtime price to four decimals, dated in Eastern time', async () => {
    const { snl } = await loaded();
    expect(snl.price).toBe('$0.6734');
    expect(snl.datetime).toBe('2021-05-09T03:30:00.000Z');
    expect(snl.date).toBe('8 May 2021');
    expect(snl.time).toBe('11:30 pm ET');
  });

  it('gives the live price to four decimals with its UTC time', async () => {
    const { now } = await loaded();
    expect(now.price).toBe('$0.0795');
    expect(now.datetime).toBe('2026-10-28T04:30:56.000Z');
    expect(now.date).toBe('28 Oct 2026');
    expect(now.time).toBe('04:30 UTC');
  });

  it('credits CoinGecko for the live price and Binance for the showtime price', async () => {
    const page = await loaded();
    expect(page.attribution).toEqual({
      label: 'Data provided by CoinGecko',
      url: 'https://www.coingecko.com/en/coins/dogecoin'
    });
    expect(page.snl.source.label).toBe(
      'Binance DOGE/USDT, 1-minute open at showtime'
    );
  });
});

describe('dogePage when the price has risen since showtime', () => {
  it('shows the change with a plus sign and says "Up" in words', async () => {
    expect((await loaded(0.7563)).change).toEqual({
      text: '+12.3%',
      words: 'Up 12.3%'
    });
  });

  it('values the $1,000 bag above $1,000 now', async () => {
    expect((await loaded(0.7563)).holding.today).toBe('$1,123.06');
  });
});

describe('dogePage edge cases', () => {
  it('shows an unchanged price as 0.0% with no sign', async () => {
    expect((await loaded(0.67343)).change).toEqual({
      text: '0.0%',
      words: '0.0%'
    });
  });

  it('uses a 24-hour clock with leading zeros after midday and before 10 am', async () => {
    expect((await loaded(0.08, '2026-01-02T15:07:00.000Z')).now).toMatchObject({
      date: '2 Jan 2026',
      time: '15:07 UTC'
    });
    expect((await loaded(0.08, '2026-01-02T00:05:00.000Z')).now.time).toBe(
      '00:05 UTC'
    );
  });
});
