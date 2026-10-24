import path from 'node:path';

export const hooksDir = path.join(import.meta.dir, '../../.claude/hooks');

export interface HookResult {
  exitCode: number;
  stderr: string;
}

export const runHook = async (
  script: string,
  stdin: string,
  env: Record<string, string> = {}
): Promise<HookResult> => {
  const proc = Bun.spawn(['bun', path.join(hooksDir, script)], {
    env: { ...process.env, ...env },
    stdin: Buffer.from(stdin),
    stdout: 'ignore',
    stderr: 'pipe'
  });
  const [exitCode, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stderr).text()
  ]);
  return { exitCode, stderr };
};
