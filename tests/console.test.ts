import { describe, expect, it } from 'bun:test';
import { tokenize } from '../src/public/static/js/console.js';

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
