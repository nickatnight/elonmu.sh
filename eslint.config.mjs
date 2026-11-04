import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import { parser } from 'typescript-eslint';

const BLOCKS = ['if', 'for', 'while', 'do', 'try', 'switch'];
const DECLARATIONS = ['const', 'let', 'var'];

// ESLint only loads a default export.
export default defineConfig(
  // Flat config reads no ignore files. These mirror the directories in
  // .gitignore, which Biome follows, and biome.json's vendor exclusion.
  globalIgnores([
    '.claude/worktrees/',
    '.emgee/',
    '.playwright-mcp/',
    '.taste-skill/',
    'dist/',
    'docs/',
    'files/',
    'src/public/static/vendor/'
  ]),
  {
    files: ['**/*.ts', '**/*.js', '**/*.mjs'],
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
