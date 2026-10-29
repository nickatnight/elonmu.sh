import { describe, expect, it } from 'bun:test';
import { tokenize, trim } from '../src/public/static/js/console.js';

const text = (value: unknown): string =>
  tokenize(value)
    .map((t) => t.text)
    .join('');

describe('tokenize', () => {
  it.each([
    ['a flat object', { a: 'x', b: 2 }],
    ['nested objects', { a: { b: { c: 'deep' } } }],
    ['numbers, booleans and null', { n: -1.5, t: true, f: false, z: null }],
    ['arrays of objects', { list: [{ id: 1 }, { id: 2 }] }],
    ['empty arrays and objects', { a: [], o: {} }],
    ['strings that need escaping', { s: 'a "quote" and \\ and\nnewline' }],
    ['a bare array', [1, 'two', null]],
    ['a bare string', 'just text']
  ])(
    'lays out %s exactly as JSON.stringify with two spaces',
    (_name, value) => {
      expect(text(value)).toBe(JSON.stringify(value, null, 2));
    }
  );

  it('marks keys, strings, numbers and literals, leaving punctuation plain', () => {
    expect(tokenize({ k: 'v', n: 1, z: null, t: true })).toEqual([
      { kind: null, text: '{\n  ' },
      { kind: 'key', text: '"k"' },
      { kind: null, text: ': ' },
      { kind: 'str', text: '"v"' },
      { kind: null, text: ',\n  ' },
      { kind: 'key', text: '"n"' },
      { kind: null, text: ': ' },
      { kind: 'num', text: '1' },
      { kind: null, text: ',\n  ' },
      { kind: 'key', text: '"z"' },
      { kind: null, text: ': ' },
      { kind: 'lit', text: 'null' },
      { kind: null, text: ',\n  ' },
      { kind: 'key', text: '"t"' },
      { kind: null, text: ': ' },
      { kind: 'lit', text: 'true' },
      { kind: null, text: '\n}' }
    ]);
  });

  it('writes a number JSON cannot hold as null, as JSON.stringify does', () => {
    expect(text({ n: Number.NaN })).toBe('{\n  "n": null\n}');
  });
});

describe('trim', () => {
  const lines = (value: unknown): string[] => text(trim(value)).split('\n');

  it.each([
    [2, 0],
    [3, 0],
    [4, 1],
    [365, 362]
  ])(
    'cuts an array of %i to the first 3 and says how many more (%i)',
    (n, more) => {
      const days = Array.from({ length: n }, (_, i) => i);
      const out = lines({ days });
      expect(out.filter((l) => /^ {4}\d+,?$/.test(l))).toHaveLength(
        Math.min(n, 3)
      );
      expect(out.includes(`    … ${more} more`)).toBe(more > 0);
    }
  );

  it('marks the cut line as its own token, without quotes or a trailing comma', () => {
    const tokens = tokenize(trim({ a: [1, 2, 3, 4, 5] }));
    expect(tokens).toContainEqual({ kind: 'more', text: '… 2 more' });
    expect(text(trim({ a: [1, 2, 3, 4, 5] }))).toBe(
      '{\n  "a": [\n    1,\n    2,\n    3,\n    … 2 more\n  ]\n}'
    );
  });

  it('trims arrays nested inside kept items too', () => {
    const value = { flights: [{ legs: [1, 2, 3, 4] }, 2, 3, 4] };
    const out = text(trim(value));
    expect(out).toContain('… 1 more');
    expect(out.match(/… 1 more/g)).toHaveLength(2);
  });

  it('leaves objects, strings, numbers and null as they are', () => {
    const value = { a: { b: null }, s: 'x', n: 2.5 };
    expect(text(trim(value))).toBe(JSON.stringify(value, null, 2));
  });
});
