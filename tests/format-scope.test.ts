import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { appendFileSync, rmSync } from 'node:fs';
import { cp, mkdtemp, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runHook } from './hooks/run-hook';

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

const editHook = (checkout: string, file: string) =>
  runHook(
    'format-on-edit.ts',
    JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: path.join(checkout, file) }
    }),
    { CLAUDE_PROJECT_DIR: checkout }
  );

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

  it('the edit hook fixes only the files Biome checks', async () => {
    const checkout = checkoutOf();
    const files = [...checked, ...skipped];

    await write(checkout, files, unformatted);

    const results = await Promise.all(
      files.map((file) => editHook(checkout, file))
    );

    expect(
      Object.fromEntries(files.map((file, i) => [file, results[i]]))
    ).toEqual(each(files, { exitCode: 0, stderr: '' }));
    expect(await contents(checkout, files)).toEqual({
      ...each(checked, formatted),
      ...each(skipped, unformatted)
    });
  }, 20_000);
});
