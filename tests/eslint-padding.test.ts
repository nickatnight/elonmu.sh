import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';

const projectDir = path.join(import.meta.dir, '..');
const eslint = new ESLint({ cwd: projectDir, fix: true });

const fix = async (code: string, file = 'src/example.ts'): Promise<string> => {
  const [result] = await eslint.lintText(code, {
    filePath: path.join(projectDir, file)
  });

  expect(result.messages).toEqual([]);

  return result.output ?? code;
};

const lines = (...text: string[]): string => `${text.join('\n')}\n`;

const assetUrl = lines(
  'const assetUrl = (file: string): string => {',
  '  let url = assetUrls.get(file);',
  '',
  '  if (!url) {',
  '    const hash = hashOf(file);',
  '',
  `    url = \`/\${file}?v=\${hash}\`;`,
  '    assetUrls.set(file, url);',
  '  }',
  '',
  '  return url;',
  '};'
);

describe('padding-line-between-statements', () => {
  it('leaves the issue #59 example unchanged', async () => {
    expect(await fix(assetUrl)).toBe(assetUrl);
  });

  it('spaces out the packed issue #59 example into exactly its shape', async () => {
    const packed = assetUrl.replaceAll('\n\n', '\n');

    expect(packed).not.toBe(assetUrl);
    expect(await fix(packed)).toBe(assetUrl);
  });

  it.each([
    [
      'a blank line before return',
      lines('const f = () => {', '  g();', '  return 1;', '};'),
      lines('const f = () => {', '  g();', '', '  return 1;', '};')
    ],
    [
      'blank lines around if',
      lines('a();', 'if (b) c();', 'd();'),
      lines('a();', '', 'if (b) c();', '', 'd();')
    ],
    [
      'blank lines around for',
      lines('a();', 'for (const x of xs) b(x);', 'c();'),
      lines('a();', '', 'for (const x of xs) b(x);', '', 'c();')
    ],
    [
      'blank lines around while',
      lines('a();', 'while (b()) c();', 'd();'),
      lines('a();', '', 'while (b()) c();', '', 'd();')
    ],
    [
      'blank lines around do',
      lines('a();', 'do b();', 'while (c());', 'd();'),
      lines('a();', '', 'do b();', 'while (c());', '', 'd();')
    ],
    [
      'blank lines around try',
      lines('a();', 'try {', '  b();', '} catch {', '  c();', '}', 'd();'),
      lines(
        'a();',
        '',
        'try {',
        '  b();',
        '} catch {',
        '  c();',
        '}',
        '',
        'd();'
      )
    ],
    [
      'blank lines around switch',
      lines('a();', 'switch (b) {', '  default:', '    c();', '}', 'd();'),
      lines(
        'a();',
        '',
        'switch (b) {',
        '  default:',
        '    c();',
        '}',
        '',
        'd();'
      )
    ],
    [
      'a blank line after a const/let/var group',
      lines('const a = 1;', 'let b = 2;', 'var c = 3;', 'f(a, b, c);'),
      lines('const a = 1;', 'let b = 2;', 'var c = 3;', '', 'f(a, b, c);')
    ]
  ])('inserts %s', async (_rule, packed, spaced) => {
    expect(await fix(packed)).toBe(spaced);
    expect(await fix(spaced)).toBe(spaced);
  });

  it.each([
    [
      'a return that opens its block',
      lines('const f = () => {', '  return 1;', '};')
    ],
    [
      'consecutive declarations',
      lines('const a = 1;', 'const b = 2;', 'let c = a + b;')
    ],
    ['consecutive expressions', lines('a();', 'b();', 'c();')]
  ])('keeps %s tight', async (_case, code) => {
    expect(await fix(code)).toBe(code);
  });

  it('applies to client JS too', async () => {
    expect(
      await fix(lines('const a = 1;', 'a();'), 'src/public/static/js/x.js')
    ).toBe(lines('const a = 1;', '', 'a();'));
  });
});

describe('files ESLint checks', () => {
  it.each([
    'src/app.ts',
    'src/public/static/js/main.js',
    'tests/hooks/lib.test.ts',
    'scripts/geocode-places.ts',
    '.claude/hooks/format-on-edit.ts',
    'eslint.config.mjs'
  ])('lints %p', async (file) => {
    expect(await eslint.isPathIgnored(path.join(projectDir, file))).toBe(false);
  });

  it.each([
    'src/public/static/vendor/globe.gl.min.js',
    'node_modules/eslint/lib/api.js'
  ])('ignores %p', async (file) => {
    expect(await eslint.isPathIgnored(path.join(projectDir, file))).toBe(true);
  });

  const gitignoredDirs = readFileSync(
    path.join(projectDir, '.gitignore'),
    'utf8'
  )
    .split('\n')
    .filter((line) => line.endsWith('/'))
    .map((line) => line.replace(/^\//, ''));

  it.each(gitignoredDirs)('ignores %p, as .gitignore does', async (dir) => {
    expect(await eslint.isPathIgnored(path.join(projectDir, dir, 'a.ts'))).toBe(
      true
    );
  });
});
