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

describe('inline ESLint config comments', () => {
  const { scripts }: { scripts: Partial<Record<string, string>> } = JSON.parse(
    readFileSync(path.join(projectDir, 'package.json'), 'utf8')
  );
  const formatCheckEslintStep = scripts['format:check']
    ?.split(' && ')
    .find((step) => step.startsWith('eslint '));
  const formatCheckEslintArgs =
    formatCheckEslintStep
      ?.split(' ')
      .slice(1)
      .filter((arg) => arg !== '.') ?? [];
  const eslintBin = path.join(
    path.dirname(Bun.resolveSync('eslint/package.json', projectDir)),
    'bin/eslint.js'
  );

  const formatCheckExitCode = (code: string): Promise<number> =>
    Bun.spawn(
      [
        process.execPath,
        eslintBin,
        ...formatCheckEslintArgs,
        '--stdin',
        '--stdin-filename',
        path.join(projectDir, 'src/example.ts')
      ],
      {
        cwd: projectDir,
        stdin: Buffer.from(code),
        stdout: 'ignore',
        stderr: 'ignore'
      }
    ).exited;

  it('finds the eslint step in the format:check script', () => {
    expect(
      formatCheckEslintStep,
      'package.json format:check has no step starting with "eslint "'
    ).toBeDefined();
  });

  it('passes format:check on a file without one', async () => {
    expect(await formatCheckExitCode(lines('const a = 1;', '', 'a();'))).toBe(
      0
    );
  });

  it.each([
    [
      'an eslint-disable-next-line that hides a padding error',
      lines(
        'const a = 1;',
        '// eslint-disable-next-line @stylistic/padding-line-between-statements',
        'a();'
      )
    ],
    [
      'an eslint-disable block that hides a padding error',
      lines('/* eslint-disable */', 'const a = 1;', 'a();')
    ],
    [
      'an eslint rule comment that hides a padding error',
      lines(
        '/* eslint @stylistic/padding-line-between-statements: "off" */',
        'const a = 1;',
        'a();'
      )
    ],
    [
      'an eslint-disable with nothing to hide',
      lines('/* eslint-disable */', 'const a = 1;', '', 'a();')
    ]
  ])('fails format:check on %s', async (_case, code) => {
    expect(await formatCheckExitCode(code)).toBe(1);
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
    .filter((line) => line.endsWith('/'));
  // Git anchors an entry to the root when it has a slash before the last one.
  const isAnchored = (entry: string): boolean =>
    entry.slice(0, -1).includes('/');
  const atRoot = (entry: string): string =>
    path.join(projectDir, entry, 'a.ts');
  const nested = (entry: string, parent: string): string =>
    path.join(projectDir, parent, entry, 'a.ts');
  const underEachParent = (entries: string[]): [string, string][] =>
    entries.flatMap((entry) =>
      ['src', 'tests/hooks'].map((parent): [string, string] => [entry, parent])
    );

  it.each(gitignoredDirs)('ignores %p, as .gitignore does', async (entry) => {
    expect(await eslint.isPathIgnored(atRoot(entry))).toBe(true);
  });

  it.each(
    underEachParent(gitignoredDirs.filter((entry) => !isAnchored(entry)))
  )(
    'ignores %p at any depth (under %p), as .gitignore does',
    async (entry, parent) => {
      expect(await eslint.isPathIgnored(nested(entry, parent))).toBe(true);
    }
  );

  it.each(underEachParent(gitignoredDirs.filter(isAnchored)))(
    'lints %p below the root (under %p), where .gitignore does not match it',
    async (entry, parent) => {
      expect(await eslint.isPathIgnored(nested(entry, parent))).toBe(false);
    }
  );
});
