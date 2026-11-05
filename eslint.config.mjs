import stylistic from '@stylistic/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import { parser } from 'typescript-eslint';

const BLOCKS = ['if', 'for', 'while', 'do', 'try', 'switch'];
const DECLARATIONS = ['const', 'let', 'var'];
const GITIGNORED_DIRS = [
  '**/.emgee/',
  '**/.playwright-mcp/',
  '**/.taste-skill/',
  '**/dist/',
  '.claude/worktrees/',
  'docs/',
  'files/'
];
const BIOME_EXCLUDED_DIRS = ['src/public/static/vendor/'];

// ESLint only loads a default export.
export default defineConfig(
  // Flat config reads no ignore files.
  globalIgnores([...GITIGNORED_DIRS, ...BIOME_EXCLUDED_DIRS]),
  { linterOptions: { noInlineConfig: true } },
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
      ],
      'no-restricted-properties': [
        'error',
        {
          object: 'Bun',
          property: 'fetch',
          message: 'Use fetch, which the test network guard can see.'
        }
      ]
    }
  },
  {
    files: ['**/*.ts'],
    languageOptions: { parser }
  }
);
