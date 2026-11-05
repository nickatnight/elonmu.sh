import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const projectDir = path.join(import.meta.dir, '..');
const read = (file: string): string =>
  readFileSync(path.join(projectDir, file), 'utf8');

describe('install settings', () => {
  const { overrides }: { overrides?: Partial<Record<string, string>> } =
    JSON.parse(read('package.json'));
  const minimatchOverride = overrides?.minimatch;

  it('pins the minimatch override to one exact version', () => {
    expect(minimatchOverride).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('pins the minimatch override to the version bun.lock resolves', () => {
    const [, lockedMinimatch] =
      /"minimatch": \["minimatch@([^"]+)"/.exec(read('bun.lock')) ?? [];

    expect(minimatchOverride).toBe(lockedMinimatch);
  });

  it('holds back package releases younger than three days', () => {
    const bunfig: { install?: { minimumReleaseAge?: number } } = Bun.TOML.parse(
      read('bunfig.toml')
    );
    const threeDaysInSeconds = 3 * 24 * 60 * 60;

    expect(
      bunfig.install?.minimumReleaseAge ?? 0,
      'bunfig.toml needs [install] minimumReleaseAge of at least 259200'
    ).toBeGreaterThanOrEqual(threeDaysInSeconds);
  });
});
