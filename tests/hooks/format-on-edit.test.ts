import { afterAll, afterEach, beforeAll, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { cp, mkdtemp, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isBiomeTarget } from '../../.claude/hooks/lib';
import { runHook } from './run-hook';

const projectDir = path.join(import.meta.dir, '../..');
const installedNodeModules = path.resolve(
  Bun.resolveSync('@biomejs/biome/package.json', projectDir),
  '../../..'
);

let tempDir: string | undefined;
let sandbox = '';
let fixture = '';

beforeAll(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), 'format-on-edit-'));
  // Biome panics on a project path behind a symlink, like macOS's /var.
  sandbox = await realpath(tempDir);
  fixture = path.join(sandbox, 'fixture.ts');
  await cp(
    path.join(projectDir, 'biome.json'),
    path.join(sandbox, 'biome.json')
  );
  // With vcs.useIgnoreFile on, Biome refuses to run without an ignore file.
  await cp(
    path.join(projectDir, '.gitignore'),
    path.join(sandbox, '.gitignore')
  );
  await symlink(installedNodeModules, path.join(sandbox, 'node_modules'));
});

afterAll(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

const formatOnEdit = (filePath: string, env: Record<string, string> = {}) =>
  runHook(
    'format-on-edit.ts',
    JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: filePath } }),
    { CLAUDE_PROJECT_DIR: projectDir, ...env }
  );

const formatFixture = () =>
  formatOnEdit(fixture, { CLAUDE_PROJECT_DIR: sandbox });

afterEach(() => rmSync(fixture, { force: true }));

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

describe('format-on-edit hook', () => {
  it('writes its fixture outside the checkout, where format:check cannot see it', () => {
    expect(path.relative(projectDir, fixture)).toStartWith('..');
  });

  it('rewrites a badly formatted file and exits 0', async () => {
    await Bun.write(fixture, 'export const   answer = {a:"b"}\n');
    const result = await formatFixture();

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
    expect(await formatFixture()).toEqual({ exitCode: 0, stderr: '' });
    expect(await Bun.file(fixture).text()).toBe(
      [
        "import path from 'node:path';",
        "import express from 'express';",
        ...body
      ].join('\n')
    );
  });

  it('reports warnings too, since CI lints with --error-on-warnings', async () => {
    // noUnusedVariables is a warning whose fix is unsafe, so --write leaves it.
    await Bun.write(fixture, 'const unused = 1;\nexport const x = 2;\n');
    const { exitCode, stderr } = await formatFixture();

    expect(exitCode).toBe(2);
    expect(stderr).toContain('noUnusedVariables');
  });

  it('reports lint errors that --write cannot fix with exit 2', async () => {
    await Bun.write(
      fixture,
      'export const isOne = (n: unknown): boolean => n == 1;\n'
    );
    const { exitCode, stderr } = await formatFixture();

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

  it('fails open with a note when Biome is not installed', async () => {
    const bare = await mkdtemp(path.join(tmpdir(), 'format-on-edit-'));

    await cp(
      path.join(projectDir, 'biome.json'),
      path.join(bare, 'biome.json')
    );
    const file = path.join(bare, 'x.ts');

    await Bun.write(file, 'export const   x = 1\n');

    try {
      const { exitCode, stderr } = await formatOnEdit(file, {
        CLAUDE_PROJECT_DIR: bare
      });

      expect(exitCode).toBe(0);
      expect(stderr).toContain('Biome not found');
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
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
