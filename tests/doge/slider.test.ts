import { describe, expect, it } from 'bun:test';
import { SNL_SHOWTIME } from '../../src/doge/snl';
import {
  amountAt,
  holding,
  MAX_DOGE,
  MIN_DOGE,
  parseAmount,
  positionOf,
  SLIDER_STEPS
} from '../../src/public/static/js/doge.js';

const DEFAULT_DOGE = 1000 / SNL_SHOWTIME.usd;

describe('the DOGE-held slider scale', () => {
  it('runs from 10 DOGE to 10 million DOGE over 1,000 steps', () => {
    expect([MIN_DOGE, MAX_DOGE, SLIDER_STEPS]).toEqual([10, 10_000_000, 1000]);
  });

  it('round-trips at the low end', () => {
    expect(amountAt(0)).toBe(10);
    expect(positionOf(10)).toBe(0);
  });

  it('round-trips at the high end', () => {
    expect(amountAt(1000)).toBe(10_000_000);
    expect(positionOf(10_000_000)).toBe(1000);
  });

  it('places the $1,000 default at step 362, about a third of the way along', () => {
    expect(positionOf(DEFAULT_DOGE)).toBe(362);
  });

  it('round-trips at the default step', () => {
    expect(positionOf(amountAt(362))).toBe(362);
    expect(Math.abs(amountAt(362) / DEFAULT_DOGE - 1)).toBeLessThan(0.015);
  });

  it('is logarithmic: each sixth of the track is ten times more DOGE', () => {
    expect([0, 1000 / 6, 2000 / 6, 500, 4000 / 6].map(amountAt)).toEqual([
      10, 100, 1000, 10_000, 100_000
    ]);
  });

  it('rounds slider amounts to whole DOGE, and to tens from 1,000 up', () => {
    expect(amountAt(200)).toBe(158);
    expect(amountAt(362)).toBe(1490);
  });

  it('clamps typed amounts outside the range to its ends', () => {
    expect(positionOf(0)).toBe(0);
    expect(positionOf(3)).toBe(0);
    expect(positionOf(50_000_000)).toBe(1000);
  });
});

describe('parseAmount', () => {
  it.each([
    ['1484.94', 1484.94],
    ['0', 0],
    ['50000000', 50_000_000],
    [' 12 ', 12]
  ])('reads %p as %p', (text, amount) => {
    expect(parseAmount(text)).toBe(amount);
  });

  it.each([
    ['an empty field', ''],
    ['a negative amount', '-5'],
    ['text that is not a number', 'lots'],
    ['NaN', 'NaN'],
    ['Infinity', 'Infinity'],
    ['a number too big to hold', '1e400']
  ])('ignores %s', (_name, text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('holding', () => {
  it('values the default bag at $1,000.00 at showtime and $118.03 at $0.079484', () => {
    expect(holding(DEFAULT_DOGE, SNL_SHOWTIME.usd, 0.079484)).toEqual({
      doge: '1,484.94',
      atShowtime: '$1,000.00',
      today: '$118.03'
    });
  });

  it('values 10 million DOGE in full dollars and cents', () => {
    expect(holding(10_000_000, SNL_SHOWTIME.usd, 0.079484)).toEqual({
      doge: '10,000,000',
      atShowtime: '$6,734,300.00',
      today: '$794,840.00'
    });
  });

  it('values a rise above what the bag was worth at showtime', () => {
    expect(holding(1000, SNL_SHOWTIME.usd, 0.7563)).toEqual({
      doge: '1,000',
      atShowtime: '$673.43',
      today: '$756.30'
    });
  });
});
