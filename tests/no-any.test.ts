import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = path.join(import.meta.dir, '..');
const ROOTS = ['src', 'tests', 'scripts', '.claude/hooks'];
const VENDOR = 'src/public/static/vendor/';
const THIS_FILE = path.relative(projectDir, import.meta.path);

const ANY_TYPE = [
  /@\w+\s*\{[^}]*\bany\b/,
  /:\s*any\b(?!\s*[\w.(])/,
  /\bas\s+any\b(?!\s*[\w.(])/,
  /=>\s*any\b(?!\s*[\w.(])/,
  /(?<![|&])[|&]\s*any\b(?!\s*[\w.(])/,
  /(?<!\.)\bany\s*[|&](?![|&])/,
  /[<,[]\s*any\s*(?:\[\])?\s*[,>\]]/
];

const usesAny = (line: string): boolean =>
  ANY_TYPE.some((pattern) => pattern.test(line));

const sourceFiles = (): string[] =>
  ROOTS.flatMap((root) => [
    ...new Bun.Glob(`${root}/**/*.{ts,js,mjs}`).scanSync({
      cwd: projectDir,
      dot: true
    })
  ]).filter((file) => !file.startsWith(VENDOR) && file !== THIS_FILE);

describe('the any check', () => {
  it.each([
    'const isPlace = (/** @type {any} */ p) =>',
    '  const s = /** @type {any} */ (data);',
    ' * @param {any[]} rows',
    ' * @returns {Promise<any>}',
    'const f = (x: any) => x;',
    'let rows: any[] = [];',
    'const body = res as any;',
    'const map: Map<string, any> = new Map();',
    'const g = <any>value;',
    ' *   cb: () => any,',
    ' *   (n: number) => any> & {',
    ' *   string | any',
    'let x: string | any;',
    'type Maybe = any | null;',
    'type Both = Base & any;',
    'const t: [any, string] = [a, b];',
    'const t: [string, any] = [a, b];'
  ])('flags %s', (line) => {
    expect(usesAny(line)).toBe(true);
  });

  it.each([
    "const company = 'SpaceX';",
    'expect(spy).toHaveBeenCalledWith(expect.any(String));',
    '// fails like any other upstream error',
    ' * Works for any tail, such as any other jet.',
    '/** @type {unknown} */',
    "if (!rows.some((r) => r.any)) return 'many';",
    'if (a.any || b.any) return;'
  ])('ignores %s', (line) => {
    expect(usesAny(line)).toBe(false);
  });
});

describe('source files', () => {
  it('scans the client, server, test and hook code', () => {
    const files = sourceFiles();

    expect(files).toContain('src/public/static/js/jet.js');
    expect(files).toContain('src/index.ts');
    expect(files).toContain('tests/jet/scene.test.ts');
    expect(files.some((f) => f.startsWith('.claude/hooks/'))).toBe(true);
    expect(files.some((f) => f.startsWith(VENDOR))).toBe(false);
  });

  it('declare no type as any', () => {
    const found = sourceFiles().flatMap((file) =>
      readFileSync(path.join(projectDir, file), 'utf8')
        .split('\n')
        .flatMap((line, i) => (usesAny(line) ? [`${file}:${i + 1}`] : []))
    );

    expect(found).toEqual([]);
  });
});
