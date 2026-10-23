import path from 'node:path';

export const hooksDir = path.join(import.meta.dir, '../../.claude/hooks');

export interface HookResult {
  exitCode: number;
  stderr: string;
}

// Runs a hook script the way Claude Code does: hook JSON on stdin, verdict in
// the exit code and stderr.
export const runHook = async (
  script: string,
  stdin: string
): Promise<HookResult> => {
  const proc = Bun.spawn(['bun', path.join(hooksDir, script)], {
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
