import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import { parser } from 'typescript-eslint';

const BLOCKS = ['if', 'for', 'while', 'do', 'try', 'switch'];
const DECLARATIONS = ['const', 'let', 'var'];

// ESLint only loads a default export.
export default defineConfig(
  // Flat config does not read .gitignore.
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
