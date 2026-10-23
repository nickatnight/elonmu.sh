import { describe, expect, it } from 'bun:test';
import { checkSubject, extractSubject } from '../../.claude/hooks/lib';

describe('extractSubject', () => {
  it.each([
    ['git commit -m "feat: add x"', 'feat: add x'],
    ["git commit -m 'feat: add x'", 'feat: add x'],
    ['git commit --message "feat: add x"', 'feat: add x'],
    ['git commit --message="feat: add x"', 'feat: add x'],
    ['git commit --message=wip', 'wip'],
    ['git commit -am "fix: y"', 'fix: y'],
    ['git commit --amend -m "fix: y"', 'fix: y'],
    ['git add . && git commit -m "chore: z"', 'chore: z'],
    ['bun run check; git commit -m "chore: z"', 'chore: z'],
    ['git commit -m "feat: a" -m "Body text."', 'feat: a'],
    ['git commit -m "feat: say \\"hi\\""', 'feat: say "hi"'],
    ['git commit -m "first line\nsecond line"', 'first line'],
    // Flags named in the message or in a later command are not commit flags.
    [
      'git commit -m "Bad: handle --file uploads"',
      'Bad: handle --file uploads'
    ],
    [
      'git commit -m "Bad: explain -F and --fixup"',
      'Bad: explain -F and --fixup'
    ],
    ['git commit -m "Bad" && grep -F x y', 'Bad'],
    ['git commit -m "Bad"; git log --fixup', 'Bad'],
    // Options before `commit` and env-var prefixes.
    ['git -C /repo commit -m "Bad"', 'Bad'],
    ['git -c user.name=x commit -m "Bad"', 'Bad'],
    ['GIT_AUTHOR_NAME=x git commit -m "Bad"', 'Bad'],
    ['cd /repo && GIT_EDITOR=true git -C . commit -m "Bad"', 'Bad']
  ])('reads the subject from %p', (command, subject) => {
    expect(extractSubject(command)).toBe(subject);
  });

  it('reads the first line of a heredoc message', () => {
    const command = [
      `git commit -m "$(cat <<'EOF'`,
      'feat(hero): fill the first screen',
      '',
      'Co-Authored-By: Claude <noreply@anthropic.com>',
      'EOF',
      ')"'
    ].join('\n');
    expect(extractSubject(command)).toBe('feat(hero): fill the first screen');
  });

  it('reads an unquoted heredoc delimiter too', () => {
    const command = 'git commit -m "$(cat <<EOF\nfix: y\nEOF\n)"';
    expect(extractSubject(command)).toBe('fix: y');
  });

  it.each([
    "git commit -q -F - <<'EOF'\nBad subject\n\nbody\nEOF",
    'git commit -F- <<EOF\nBad subject\nEOF',
    'git commit --file=- <<"EOF"\nBad subject\nEOF',
    'git commit --file - <<-EOF\n\tBad subject\n\tEOF'
  ])('reads a message piped from a heredoc on stdin: %p', (command) => {
    expect(extractSubject(command)).toBe('Bad subject');
  });

  it.each([
    'git status',
    'git log --oneline -5',
    'git commit',
    // Each has an -m that would otherwise be read, so these prove the flag
    // check rather than passing for lack of a message.
    'git commit -F msg.txt -m "Bad"',
    'git commit --file=msg.txt -m "Bad"',
    'git commit --fixup HEAD~1 -m "Bad"',
    'git commit --fixup=amend:HEAD -m "Bad"',
    'git commit --squash=HEAD~1 -m "Bad"',
    // stdin with no heredoc to read (e.g. piped from printf).
    'printf "Bad" | git commit -F -',
    'git commit --amend --no-edit',
    // A later command's -m is not the commit's message.
    'git commit --amend --no-edit && git tag -a v1 -m "Bad"',
    'echo "git commit -m \'Bad\'"',
    'git merge main -m "Merge branch main"'
  ])('returns null for %p', (command) => {
    expect(extractSubject(command)).toBeNull();
  });
});

describe('checkSubject', () => {
  it.each([
    'feat(hero): fill the first screen and move the console below it',
    'fix(api): return 200 with an error body when NewsAPI times out',
    'chore: ignore .claude/worktrees/',
    'chore: copy docs/ and .env into new worktrees (#17)',
    'feat(api)!: drop the urlImage field',
    'refactor!: rename the news service',
    `feat: ${'a'.repeat(66)}`
  ])('accepts %p', (subject) => {
    expect(checkSubject(subject)).toEqual({ ok: true });
  });

  it.each([
    ['Prepare elonmu.sh for Render: Dockerfile, /healthz, CI on main', 'type'],
    ['version bump', 'type'],
    ['feature: add x', 'type'],
    ['feat(Hero): add x', 'type'],
    ['feat:add x', 'type'],
    ['feat: Add x', 'lowercase'],
    ['feat: add x.', 'period'],
    [`feat: ${'a'.repeat(67)}`, '72']
  ])('rejects %p', (subject, reason) => {
    const verdict = checkSubject(subject);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain(reason);
  });
});
