import { describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';

const CSS_DIR = `${import.meta.dir}/../src/public/static/css`;

describe('stylesheets', () => {
  it('use only custom properties that some stylesheet defines', async () => {
    const files = (await readdir(CSS_DIR)).filter((f) => f.endsWith('.css'));
    const css = (
      await Promise.all(files.map((f) => Bun.file(`${CSS_DIR}/${f}`).text()))
    ).join('\n');
    const defined = new Set(
      [...css.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
    );
    const undefinedNames = [
      ...new Set([...css.matchAll(/var\((--[\w-]+)/g)].map(([, n]) => n))
    ].filter((name) => !defined.has(name));
    expect(undefinedNames).toEqual([]);
  });
});
