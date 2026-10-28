import { describe, expect, it } from 'bun:test';
import { SNL_SHOWTIME } from '../../src/doge/snl';
import { startHeldControl } from '../../src/public/static/js/doge.js';

const NOW_USD = 0.079484;

class FakeHeld {
  hidden = true;

  constructor(readonly dataset: Record<string, string | undefined>) {}
}

class FakeInput extends EventTarget {
  readonly attributes = new Map<string, string>();

  constructor(public value: string) {
    super();
  }

  get valueAsNumber(): number {
    return Number(this.value);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  input(value: string): void {
    this.value = value;
    this.dispatchEvent(new Event('input'));
  }
}

class FakeOutput {
  readonly dataset: { out: string };

  constructor(
    out: string,
    public textContent: string
  ) {
    this.dataset = { out };
  }
}

const setup = (
  dataset: Record<string, string | undefined> = {
    snlUsd: String(SNL_SHOWTIME.usd),
    nowUsd: String(NOW_USD)
  }
) => {
  const held = new FakeHeld(dataset);
  const field = new FakeInput('1484.94');
  const range = new FakeInput('362');
  const outputs = [
    new FakeOutput('doge', '1,484.94'),
    new FakeOutput('atShowtime', '$1,000.00'),
    new FakeOutput('today', '$118.03'),
    new FakeOutput('atShowtime', '$1,000.00'),
    new FakeOutput('today', '$118.03')
  ];
  startHeldControl({ held, field, range, outputs });
  return { held, field, range, outputs };
};

const shown = (outputs: FakeOutput[]): string[] =>
  outputs.map((output) => `${output.dataset.out}=${output.textContent}`);

describe('the DOGE-held control in the page', () => {
  it('reveals the control once the script has both prices', () => {
    const { held } = setup();
    expect(held.hidden).toBe(false);
  });

  it.each([
    ['the SNL price is missing', { nowUsd: String(NOW_USD) }],
    ['the price now is missing', { snlUsd: String(SNL_SHOWTIME.usd) }],
    ['a price is zero', { snlUsd: '0', nowUsd: String(NOW_USD) }],
    ['a price is negative', { snlUsd: String(SNL_SHOWTIME.usd), nowUsd: '-1' }],
    ['a price is not a number', { snlUsd: 'abc', nowUsd: String(NOW_USD) }]
  ])('leaves the control hidden when %s', (_name, dataset) => {
    const { held, range, field, outputs } = setup(dataset);
    range.input('1000');
    expect(held.hidden).toBe(true);
    expect(field.value).toBe('1484.94');
    expect(shown(outputs)).toContain('atShowtime=$1,000.00');
  });

  it('moving the slider writes the rounded amount into the field and updates every worth and the read-out', () => {
    const { range, field, outputs } = setup();

    range.input('362');
    expect(field.value).toBe('1490');
    expect(shown(outputs)).toEqual([
      'doge=1,490',
      'atShowtime=$1,003.41',
      'today=$118.43',
      'atShowtime=$1,003.41',
      'today=$118.43'
    ]);
    expect(range.attributes.get('aria-valuetext')).toBe('1,490 DOGE');

    range.input('1000');
    expect(field.value).toBe('10000000');
    expect(shown(outputs)).toEqual([
      'doge=10,000,000',
      'atShowtime=$6,734,300.00',
      'today=$794,840.00',
      'atShowtime=$6,734,300.00',
      'today=$794,840.00'
    ]);
    expect(range.attributes.get('aria-valuetext')).toBe('10,000,000 DOGE');
  });

  it('typing an amount moves the slider, clamped to its ends, without rewriting the field', () => {
    const { range, field, outputs } = setup();

    field.input('3');
    expect(range.value).toBe('0');
    expect(field.value).toBe('3');
    expect(shown(outputs)).toEqual([
      'doge=3',
      'atShowtime=$2.02',
      'today=$0.24',
      'atShowtime=$2.02',
      'today=$0.24'
    ]);

    field.input('50000000');
    expect(range.value).toBe('1000');
    expect(field.value).toBe('50000000');
    expect(shown(outputs)[0]).toBe('doge=50,000,000');
    expect(range.attributes.get('aria-valuetext')).toBe('50,000,000 DOGE');
  });

  it('typing an empty, negative or non-numeric amount leaves the last good output and slider position', () => {
    const { range, field, outputs } = setup();
    field.input('2000');
    const lastGood = {
      range: range.value,
      outputs: shown(outputs),
      valuetext: range.attributes.get('aria-valuetext')
    };
    expect(lastGood.outputs[0]).toBe('doge=2,000');

    for (const text of ['', '-5', 'lots']) {
      field.input(text);
      expect({
        text,
        field: field.value,
        range: range.value,
        outputs: shown(outputs),
        valuetext: range.attributes.get('aria-valuetext')
      }).toEqual({ text, field: text, ...lastGood });
    }
  });
});
