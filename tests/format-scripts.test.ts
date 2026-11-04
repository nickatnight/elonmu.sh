import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { rmSync } from 'node:fs';
import { cp, mkdtemp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const projectDir = path.join(import.meta.dir, '..');
const packed = 'export const f = (x) => {\n  const y = x;\n  return y;\n};\n';
const spaced = 'export const f = (x) => {\n  const y = x;\n\n  return y;\n};\n';

let dir = '';

beforeAll(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'format-scripts-'));

  for (const file of [
    'package.json',
    'biome.json',
    'eslint.config.mjs',
    '.gitignore'
  ]) {
    await cp(path.join(projectDir, file), path.join(dir, file));
  }

  await symlink(
    path.join(projectDir, 'node_modules'),
    path.join(dir, 'node_modules')
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

const run = (script: string) => {
  const { exitCode, stdout, stderr } = Bun.spawnSync(
    [process.execPath, 'run', script],
    { cwd: dir }
  );

  return { exitCode, output: `${stdout}${stderr}` };
};

describe('format scripts', () => {
  it('format:check fails on a missing blank line that Biome accepts', async () => {
    await Bun.write(path.join(dir, 'src/a.ts'), packed);

    const { exitCode, output } = run('format:check');

    expect(exitCode).toBe(1);
    expect(output).toContain('padding-line-between-statements');
  }, 20_000);

  it('format adds the blank line, so format:check passes', async () => {
    const file = path.join(dir, 'src/a.ts');

    await Bun.write(file, packed);

    expect(run('format')).toMatchObject({ exitCode: 0 });
    expect(await Bun.file(file).text()).toBe(spaced);
    expect(run('format:check')).toMatchObject({ exitCode: 0 });
  }, 20_000);
});
