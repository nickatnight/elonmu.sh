import { afterEach, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { cp, mkdir, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isBiomeTarget, isEslintTarget } from '../../.claude/hooks/lib';
import { runHook } from './run-hook';

const projectDir = path.join(import.meta.dir, '../..');
const fixtureName = `tmp-format-fixture-${crypto.randomUUID()}`;
// Lives in the repo so Biome applies biome.json.
const fixture = path.join(import.meta.dir, `${fixtureName}.ts`);
const vendorFixture = path.join(
  projectDir,
  `src/public/static/vendor/${fixtureName}.js`
);

const formatOnEdit = (filePath: string, env: Record<string, string> = {}) =>
  runHook(
    'format-on-edit.ts',
    JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
    { CLAUDE_PROJECT_DIR: projectDir, ...env }
  );

afterEach(() => {
  rmSync(fixture, { force: true });
  rmSync(vendorFixture, { force: true });
});

const withTempDir = async (
  run: (dir: string) => Promise<void>
): Promise<void> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'format-on-edit-'));

  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const packed = 'export const f = (x) => {\n  const y = x;\n  return y;\n};\n';
const spaced = 'export const f = (x) => {\n  const y = x;\n\n  return y;\n};\n';

describe('isBiomeTarget', () => {
  it.each([
    'src/app.ts',
    'tests/hooks/lib.test.ts',
    'src/public/static/js/main.js',
    'src/public/static/css/main.css',
    'biome.json',
    '.github/workflows/main.yml'
  ])('formats %p', (file) => {
    expect(isBiomeTarget(path.join(projectDir, file), projectDir)).toBe(true);
  });

  it.each([
    'README.md',
    'src/views/index.ejs',
    'Dockerfile',
    'src/public/og.png'
  ])('skips %p', (file) => {
    expect(isBiomeTarget(path.join(projectDir, file), projectDir)).toBe(false);
  });

  it('skips files outside the project', () => {
    expect(isBiomeTarget('/tmp/elsewhere.ts', projectDir)).toBe(false);
    expect(
      isBiomeTarget(path.join(projectDir, '../sibling/x.ts'), projectDir)
    ).toBe(false);
  });
});

describe('isEslintTarget', () => {
  it.each([
    'src/app.ts',
    'tests/hooks/lib.test.ts',
    'src/public/static/js/main.js',
    'eslint.config.ts'
  ])('lints %p', (file) => {
    expect(isEslintTarget(path.join(projectDir, file), projectDir)).toBe(true);
  });

  it.each([
    'src/public/static/css/main.css',
    'biome.json',
    '.github/workflows/main.yml',
    'README.md',
    'src/views/index.ejs'
  ])('skips %p', (file) => {
    expect(isEslintTarget(path.join(projectDir, file), projectDir)).toBe(false);
  });

  it('skips files outside the project', () => {
    expect(isEslintTarget('/tmp/elsewhere.ts', projectDir)).toBe(false);
  });
});

describe('format-on-edit hook', () => {
  it('rewrites a badly formatted file and exits 0', async () => {
    await Bun.write(fixture, 'export const   answer = {a:"b"}\n');
    const result = await formatOnEdit(fixture);

    expect(result).toEqual({ exitCode: 0, stderr: '' });
    expect(await Bun.file(fixture).text()).toBe(
      "export const answer = { a: 'b' };\n"
    );
  });

  it('sorts imports, as format:check requires', async () => {
    const body = [
      '',
      'export const app = express();',
      "export const dir = path.join('a', 'b');",
      ''
    ];

    await Bun.write(
      fixture,
      [
        "import express from 'express';",
        "import path from 'node:path';",
        ...body
      ].join('\n')
    );
    expect(await formatOnEdit(fixture)).toEqual({ exitCode: 0, stderr: '' });
    expect(await Bun.file(fixture).text()).toBe(
      [
        "import path from 'node:path';",
        "import express from 'express';",
        ...body
      ].join('\n')
    );
  });

  it('formats with Biome and adds blank lines with ESLint', async () => {
    await Bun.write(
      fixture,
      'export const f = (x) => {\n  const y = x\n  return y\n}\n'
    );

    expect(await formatOnEdit(fixture)).toEqual({ exitCode: 0, stderr: '' });
    expect(await Bun.file(fixture).text()).toBe(spaced);
  });

  it('reports a file neither tool can parse with exit 2', async () => {
    await Bun.write(fixture, 'export const = ;\n');

    const { exitCode, stderr } = await formatOnEdit(fixture);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('Biome found problems');
    expect(stderr).toContain('ESLint found problems');
    expect(stderr).toContain('Parsing error');
  });

  it('leaves vendored files alone', async () => {
    await Bun.write(vendorFixture, packed);

    expect(await formatOnEdit(vendorFixture)).toEqual({
      exitCode: 0,
      stderr: ''
    });
    expect(await Bun.file(vendorFixture).text()).toBe(packed);
  });

  it('uses the config of a worktree under .claude/worktrees/', async () => {
    await withTempDir(async (main) => {
      const worktree = path.join(main, '.claude/worktrees/feature');

      await mkdir(worktree, { recursive: true });
      await symlink(
        path.join(projectDir, 'node_modules'),
        path.join(main, 'node_modules')
      );

      for (const dir of [main, worktree]) {
        await cp(
          path.join(projectDir, 'eslint.config.ts'),
          path.join(dir, 'eslint.config.ts')
        );
      }

      const file = path.join(worktree, 'x.ts');

      await Bun.write(file, packed);

      const { exitCode } = await formatOnEdit(file, {
        CLAUDE_PROJECT_DIR: worktree
      });

      expect(exitCode).toBe(0);
      expect(await Bun.file(file).text()).toMatch(/= x;\n\n\s+return y;/);
    });
  });

  it('reports warnings too, since CI lints with --error-on-warnings', async () => {
    // noUnusedVariables is a warning whose fix is unsafe, so --write leaves it.
    await Bun.write(fixture, 'const unused = 1;\nexport const x = 2;\n');
    const { exitCode, stderr } = await formatOnEdit(fixture);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('noUnusedVariables');
  });

  it('reports lint errors that --write cannot fix with exit 2', async () => {
    await Bun.write(
      fixture,
      'export const isOne = (n: unknown): boolean => n == 1;\n'
    );
    const { exitCode, stderr } = await formatOnEdit(fixture);

    expect(exitCode).toBe(2);
    expect(stderr).toContain('noDoubleEquals');
  });

  it.each([
    ['README.md', path.join(projectDir, 'README.md')],
    ['a file outside the project', '/tmp/elsewhere.ts']
  ])('skips %s', async (_label, filePath) => {
    expect(await formatOnEdit(filePath)).toEqual({ exitCode: 0, stderr: '' });
  });

  it('skips input without a file_path', async () => {
    const result = await runHook('format-on-edit.ts', '{"tool_input":{}}', {
      CLAUDE_PROJECT_DIR: projectDir
    });

    expect(result).toEqual({ exitCode: 0, stderr: '' });
  });

  const withBiomeOnly = (run: (dir: string) => Promise<void>) =>
    withTempDir(async (dir) => {
      await mkdir(path.join(dir, 'node_modules/.bin'), { recursive: true });
      await Bun.write(
        path.join(dir, 'biome.json'),
        '{ "formatter": { "indentStyle": "space" } }'
      );
      await symlink(
        path.join(projectDir, 'node_modules/.bin/biome'),
        path.join(dir, 'node_modules/.bin/biome')
      );
      await run(dir);
    });

  it('fails open with a note when ESLint is not installed', async () => {
    await withBiomeOnly(async (dir) => {
      const file = path.join(dir, 'x.ts');

      await Bun.write(file, packed);

      const { exitCode, stderr } = await formatOnEdit(file, {
        CLAUDE_PROJECT_DIR: dir
      });

      expect(exitCode).toBe(0);
      expect(stderr).toContain('ESLint not found');
      expect(await Bun.file(file).text()).toBe(packed);
    });
  });

  it.each([
    ['x.css', 'a{color:red}\n'],
    ['x.json', '{"a":1}\n'],
    ['x.yml', 'a:   1\n']
  ])('runs only Biome on %p', async (name, content) => {
    await withBiomeOnly(async (dir) => {
      const file = path.join(dir, name);

      await Bun.write(file, content);

      const { exitCode, stderr } = await formatOnEdit(file, {
        CLAUDE_PROJECT_DIR: dir
      });

      expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
      expect(await Bun.file(file).text()).not.toBe(content);
    });
  });

  it('fails open with a note when Biome is not installed', async () => {
    await withTempDir(async (bare) => {
      await cp(
        path.join(projectDir, 'biome.json'),
        path.join(bare, 'biome.json')
      );
      const file = path.join(bare, 'x.ts');

      await Bun.write(file, 'export const   x = 1\n');

      const { exitCode, stderr } = await formatOnEdit(file, {
        CLAUDE_PROJECT_DIR: bare
      });

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Biome not found');
    });
  });
});

describe('.claude/settings.json', () => {
  it('registers the formatter after file edits', async () => {
    const settings = await Bun.file(
      path.join(projectDir, '.claude/settings.json')
    ).json();

    expect(settings.hooks.PostToolUse).toContainEqual({
      matcher: 'Edit|Write|MultiEdit',
      hooks: [
        {
          type: 'command',
          command: 'bun "$CLAUDE_PROJECT_DIR"/.claude/hooks/format-on-edit.ts'
        }
      ]
    });
  });
});
