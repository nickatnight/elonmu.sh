import { expect, it } from 'bun:test';
import path from 'node:path';
import { ESLint } from 'eslint';

const projectDir = path.join(import.meta.dir, '..');

it.each([
  ['rejects Bun.fetch', 'Bun.fetch(url);\n', ['no-restricted-properties']],
  ['allows the global fetch', 'fetch(url);\n', []]
])('%s', async (_, code, ruleIds) => {
  const [result] = await new ESLint({ cwd: projectDir }).lintText(code, {
    filePath: path.join(projectDir, 'src/example.ts')
  });

  expect(result.messages.map(({ ruleId }) => ruleId)).toEqual(ruleIds);
});
