import { existsSync } from 'node:fs';
import path from 'node:path';
import { isBiomeTarget, isEslintTarget, readToolInput } from './lib';

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const filePath = await readToolInput('file_path');

if (filePath === null) process.exit(0);

// Installed devDependencies, found the way `bun run` finds bins: in the
// nearest node_modules/.bin up the tree (worktrees under .claude/worktrees/
// use the main checkout's). Never `bun x`, which could fetch another version.
const findBin = (name: string, from: string): string | null => {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const bin = path.join(dir, 'node_modules', '.bin', name);

    if (existsSync(bin)) return bin;

    if (path.dirname(dir) === dir) return null;
  }
};

const run = async (command: string[]) => {
  const proc = Bun.spawn(command, {
    cwd: projectDir,
    stdout: 'pipe',
    stderr: 'pipe'
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text()
  ]);

  return { exitCode, output: `${stdout}${stderr}` };
};

const tools = [
  {
    name: 'Biome',
    bin: 'biome',
    handles: isBiomeTarget,
    command: (biome: string, file: string) => [
      biome,
      'check',
      // Formatting, sorted imports and safe lint fixes: what format:check
      // and lint enforce in CI.
      '--write',
      '--error-on-warnings',
      '--files-ignore-unknown=true',
      '--no-errors-on-unmatched',
      '--colors=off',
      file
    ]
  },
  {
    name: 'ESLint',
    bin: 'eslint',
    handles: isEslintTarget,
    // Run under Bun, which loads eslint.config.ts natively; under Node,
    // ESLint needs the jiti package to read a TypeScript config.
    command: (eslint: string, file: string) => [
      process.execPath,
      eslint,
      '--fix',
      '--no-color',
      file
    ]
  }
];

const problems: string[] = [];

for (const tool of tools) {
  if (!tool.handles(filePath, projectDir)) continue;

  const bin = findBin(tool.bin, projectDir);

  if (bin === null) {
    console.error(
      `format-on-edit: ${tool.name} not found; run \`bun install\`.`
    );
    continue;
  }

  const { exitCode, output } = await run(tool.command(bin, filePath));

  if (exitCode !== 0) {
    problems.push(
      `${tool.name} found problems it could not fix in ${path.relative(projectDir, filePath)}:\n${output}`
    );
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  // Claude Code shows a PostToolUse hook's stderr to Claude only on exit 2.
  process.exit(2);
}
