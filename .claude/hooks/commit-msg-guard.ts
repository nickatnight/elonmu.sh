// PreToolUse hook (Bash): blocks `git commit` when the subject isn't a
// Conventional Commit as CLAUDE.md defines one. Exit 2 blocks the command and
// shows stderr to Claude; anything it can't read is allowed through.
import { checkSubject, extractSubject, readToolInput } from './lib';

const command = await readToolInput('command');
const subject = command === null ? null : extractSubject(command);

if (subject !== null) {
  const verdict = checkSubject(subject);
  if (!verdict.ok) {
    console.error(
      [
        `Commit blocked: ${verdict.reason}.`,
        `Subject: ${subject}`,
        'Use `<type>(<scope>): <summary>` (see CLAUDE.md), e.g.',
        '  feat(hero): fill the first screen and move the console below it',
        '  fix(api): return 200 with an error body when NewsAPI times out'
      ].join('\n')
    );
    process.exit(2);
  }
}
