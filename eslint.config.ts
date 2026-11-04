import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import { parser } from 'typescript-eslint';

const BLOCKS = ['if', 'for', 'while', 'do', 'try', 'switch'];
const DECLARATIONS = ['const', 'let', 'var'];

const root = import.meta.dirname;

const git = (...args: string[]): string | null => {
  const { status, stdout } = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8'
  });

  return status === 0 ? stdout : null;
};

const existingFiles = (relativePaths: string[]): string[] =>
  relativePaths
    .filter(Boolean)
    .map((file) => path.resolve(root, file))
    .filter((file) => existsSync(file));

// -z stops git quoting non-ASCII paths. --cached also lists tracked files that
// were deleted from the working tree, hence existingFiles.
const listedGitignores = git(
  'ls-files',
  '-z',
  '--cached',
  '--others',
  '--exclude-standard',
  '--',
  ':(glob)**/.gitignore'
);
const gitignores = existingFiles(
  listedGitignores === null ? ['.gitignore'] : listedGitignores.split('\0')
);

// In a worktree, info/exclude lives in the main checkout's git dir.
const localExcludes = existingFiles([
  git('rev-parse', '--git-path', 'info/exclude')?.trim() ?? ''
]);

// ESLint only loads a default export.
export default defineConfig(
  // Biome skips what git ignores (vcs.useIgnoreFile), but flat config reads no
  // ignore files.
  includeIgnoreFile(gitignores, { gitignoreResolution: true }),
  includeIgnoreFile(localExcludes),
  // Repeats .gitignore entries so they hold without git or a .gitignore.
  globalIgnores([
    'src/public/static/vendor/',
    '.claude/worktrees/',
    'docs/',
    'dist/'
  ]),
  {
    files: ['**/*.ts', '**/*.js'],
    plugins: { '@stylistic': stylistic },
    rules: {
      '@stylistic/padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: 'return' },
        { blankLine: 'always', prev: '*', next: BLOCKS },
        { blankLine: 'always', prev: BLOCKS, next: '*' },
        { blankLine: 'always', prev: DECLARATIONS, next: '*' },
        { blankLine: 'any', prev: DECLARATIONS, next: DECLARATIONS }
      ]
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser }
  }
);
