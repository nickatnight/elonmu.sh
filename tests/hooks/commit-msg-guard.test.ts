import { describe, expect, it } from 'bun:test';
import path from 'node:path';
import { runHook } from './run-hook';

const guard = (command: string) =>
  runHook(
    'commit-msg-guard.ts',
    JSON.stringify({ tool_name: 'Bash', tool_input: { command } })
  );

describe('commit-msg-guard hook', () => {
  it('blocks a commit whose subject is not a Conventional Commit', async () => {
    const { exitCode, stderr } = await guard('git commit -m "Bad subject"');
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Bad subject');
    expect(stderr).toContain('<type>(<scope>): <summary>');
    expect(stderr).toContain('feat(hero): fill the first screen');
  });

  it('blocks a bad subject piped in with -F - and a heredoc', async () => {
    const { exitCode, stderr } = await guard(
      "git commit -q -F - <<'EOF'\nBad subject\n\nBody.\nEOF"
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain('Subject: Bad subject');
  });

  it('allows a valid subject', async () => {
    const result = await guard('git commit -m "feat(api): add x"');
    expect(result).toEqual({ exitCode: 0, stderr: '' });
  });

  it('allows commands that are not commits', async () => {
    const result = await guard('git status');
    expect(result).toEqual({ exitCode: 0, stderr: '' });
  });

  it.each([
    'not json',
    '',
    'null',
    '"git commit -m Bad"',
    '{}',
    '{"tool_input":null}',
    '{"tool_input":"git commit -m Bad"}',
    '{"tool_input":{"command":42}}'
  ])('fails open on unusable input %p', async (stdin) => {
    const { exitCode } = await runHook('commit-msg-guard.ts', stdin);
    expect(exitCode).toBe(0);
  });
});

describe('.claude/settings.json', () => {
  it('registers the guard on Bash before the tool runs', async () => {
    const settings = await Bun.file(
      path.join(import.meta.dir, '../../.claude/settings.json')
    ).json();
    expect(settings.hooks.PreToolUse).toContainEqual({
      matcher: 'Bash',
      hooks: [
        {
          type: 'command',
          command: 'bun "$CLAUDE_PROJECT_DIR"/.claude/hooks/commit-msg-guard.ts'
        }
      ]
    });
  });
});
