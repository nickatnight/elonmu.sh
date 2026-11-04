import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { appendFileSync, rmSync } from 'node:fs';
import { cp, mkdtemp, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const projectDir = path.join(import.meta.dir, '..');

const unformatted =
  'export const   f = (x) => {\n  const y = x;\n  return y;\n};\n';
const packed = 'export const f = (x) => {\n  const y = x;\n  return y;\n};\n';
const formatted =
  'export const f = (x) => {\n  const y = x;\n\n  return y;\n};\n';

const checked = ['src/a.ts', 'src/public/static/js/page.js'];
const skippedBecause: Record<string, string> = {
  'ignored/a.ts': 'listed in .gitignore',
  'excluded/a.ts': 'listed in .git/info/exclude',
  'nested/a.ts': 'listed in nested/.gitignore',
  'café/a.ts': 'listed in a .gitignore that git quotes the path of',
  'src/public/static/vendor/a.js': 'vendored'
};
const skipped = Object.keys(skippedBecause);

// Inherited GIT_DIR or GIT_INDEX_FILE (inside a git hook, say) would point the
// temp repo's commands at the outer repo.
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
);

const git = (cwd: string, ...args: string[]): void => {
  const { exitCode, stderr } = Bun.spawnSync(
    [
      'git',
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args
    ],
    { cwd, env }
  );

  if (exitCode !== 0) throw new Error(`git ${args[0]} failed: ${stderr}`);
};

let main = '';
let worktree = '';

beforeAll(async () => {
  // Biome rejects paths that reach git's root through a symlink, like macOS's
  // /var -> /private/var.
  main = await realpath(await mkdtemp(path.join(tmpdir(), 'format-scope-')));
  git(main, 'init', '-q');

  for (const file of [
    'eslint.config.ts',
    'biome.json',
    'package.json',
    '.gitignore'
  ]) {
    await cp(path.join(projectDir, file), path.join(main, file));
  }

  appendFileSync(path.join(main, '.gitignore'), 'ignored/\n');
  appendFileSync(path.join(main, '.git/info/exclude'), 'excluded/\n');
  await Bun.write(path.join(main, 'nested/.gitignore'), 'a.ts\n');
  await Bun.write(path.join(main, 'café/.gitignore'), 'a.ts\n');
  await symlink(
    path.join(projectDir, 'node_modules'),
    path.join(main, 'node_modules')
  );
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'chore: init');
  worktree = path.join(main, '.claude/worktrees/feature');
  git(main, 'worktree', 'add', '-q', worktree);
});

afterAll(() => rmSync(main, { recursive: true, force: true }));

const write = (checkout: string, files: string[], text: string) =>
  Promise.all(files.map((file) => Bun.write(path.join(checkout, file), text)));

const contents = async (checkout: string, files: string[]) =>
  Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        await Bun.file(path.join(checkout, file)).text()
      ])
    )
  );

const each = <T>(files: string[], value: T) =>
  Object.fromEntries(files.map((file) => [file, value]));

const run = (checkout: string, script: string) => {
  const { exitCode, stdout, stderr } = Bun.spawnSync(
    [process.execPath, 'run', script],
    { cwd: checkout, env }
  );

  return { exitCode, output: `${stdout}${stderr}` };
};

describe.each([
  ['the main checkout', () => main],
  ['a worktree under .claude/worktrees/', () => worktree]
])('in %s, Biome and ESLint check the same files', (_where, checkoutOf) => {
  it('bun run format fixes only the files Biome checks', async () => {
    const checkout = checkoutOf();
    const files = [...checked, ...skipped];

    await write(checkout, files, unformatted);

    expect(run(checkout, 'format')).toMatchObject({ exitCode: 0 });
    expect(await contents(checkout, files)).toEqual({
      ...each(checked, formatted),
      ...each(skipped, unformatted)
    });
    expect(run(checkout, 'format:check')).toMatchObject({ exitCode: 0 });
  }, 20_000);

  it('bun run format:check reports a missing blank line only in checked files', async () => {
    const checkout = checkoutOf();
    const files = [...checked, ...skipped];

    await write(checkout, files, packed);

    const { exitCode, output } = run(checkout, 'format:check');

    expect(exitCode).not.toBe(0);
    expect(
      files.filter((file) => output.includes(path.join(checkout, file)))
    ).toEqual(checked);
  }, 20_000);
});

describe('with a tracked .gitignore deleted from the working tree', () => {
  it('format:check still runs', async () => {
    const nestedIgnore = path.join(main, 'nested/.gitignore');

    rmSync(nestedIgnore);
    rmSync(path.join(main, 'nested/a.ts'), { force: true });
    await write(main, checked, formatted);

    try {
      expect(run(main, 'format:check')).toMatchObject({ exitCode: 0 });
    } finally {
      await Bun.write(nestedIgnore, 'a.ts\n');
    }
  }, 20_000);
});

describe('without git', () => {
  const eslintBin = path.join(projectDir, 'node_modules/.bin/eslint');
  const floor = ['docs/a.ts', 'dist/a.ts', '.claude/worktrees/x/a.ts'];
  const gitignored = ['files/a.js', '.playwright-mcp/a.js'];

  const lintOutsideGit = async (
    copyGitignore: boolean,
    runEnv: Record<string, string | undefined>
  ) => {
    const dir = await realpath(
      await mkdtemp(path.join(tmpdir(), 'format-scope-no-git-'))
    );

    try {
      await cp(
        path.join(projectDir, 'eslint.config.ts'),
        path.join(dir, 'eslint.config.ts')
      );

      if (copyGitignore) {
        await cp(
          path.join(projectDir, '.gitignore'),
          path.join(dir, '.gitignore')
        );
      }

      await symlink(
        path.join(projectDir, 'node_modules'),
        path.join(dir, 'node_modules')
      );

      const files = [...checked, ...floor, ...gitignored];

      await write(dir, files, packed);

      const { exitCode, stderr } = Bun.spawnSync(
        [process.execPath, eslintBin, '--fix', '.'],
        { cwd: dir, env: runEnv }
      );

      return {
        exitCode,
        stderr: `${stderr}`,
        files: await contents(dir, files)
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it.each([
    ['outside a git repo', env],
    ['with git missing from PATH', { ...env, PATH: '' }]
  ])(
    '%s, ESLint still skips what the root .gitignore lists',
    async (_case, runEnv) => {
      expect(await lintOutsideGit(true, runEnv)).toEqual({
        exitCode: 0,
        stderr: '',
        files: {
          ...each(checked, formatted),
          ...each([...floor, ...gitignored], packed)
        }
      });
    },
    20_000
  );

  it('without a .gitignore either, ESLint still skips docs, dist and worktrees', async () => {
    expect(await lintOutsideGit(false, env)).toEqual({
      exitCode: 0,
      stderr: '',
      files: {
        ...each(checked, formatted),
        ...each(floor, packed),
        ...each(gitignored, formatted)
      }
    });
  }, 20_000);
});
