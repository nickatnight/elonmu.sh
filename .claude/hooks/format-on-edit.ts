// PostToolUse hook (Edit|Write|MultiEdit): formats the edited file with the
// project's Biome and applies safe lint fixes. Diagnostics that remain go back
// to Claude via exit 2. Missing Biome or bad input never block editing.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { isBiomeTarget, readToolInput } from './lib';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const filePath = await readToolInput('file_path');

// The installed devDependency, found the way `bun run` finds bins: in the
// nearest node_modules/.bin up the tree (worktrees under .claude/worktrees/
// use the main checkout's). Never `bun x`, which could fetch another version.
const findBiome = (from: string): string | null => {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const bin = path.join(dir, 'node_modules', '.bin', 'biome');
    if (existsSync(bin)) return bin;
    if (path.dirname(dir) === dir) return null;
  }
};

if (filePath !== null && isBiomeTarget(filePath, projectDir)) {
  const biome = findBiome(projectDir);
  if (biome === null) {
    console.error('format-on-edit: Biome not found; run `bun install`.');
    process.exit(0);
  }

  const proc = Bun.spawn(
    [
      biome,
      'check',
      '--write',
      // Format + lint only, the same as CI (format:check, lint). Assist
      // actions such as organize-imports would reorder untouched code.
      '--assist-enabled=false',
      '--error-on-warnings',
      '--files-ignore-unknown=true',
      '--no-errors-on-unmatched',
      '--colors=off',
      filePath
    ],
    { cwd: projectDir, stdout: 'pipe', stderr: 'pipe' }
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  if (exitCode !== 0) {
    console.error(
      `Biome found problems it could not fix in ${path.relative(projectDir, filePath)}:\n${stdout}${stderr}`
    );
    process.exit(2);
  }
}
