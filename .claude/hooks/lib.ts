// Pure helpers shared by the Claude Code hooks in this folder. The hook
// scripts do the I/O; everything here is testable without spawning anything.

export const COMMIT_TYPES = [
  'feat',
  'fix',
  'docs',
  'style',
  'refactor',
  'perf',
  'test',
  'build',
  'ci',
  'chore'
] as const;

export const MAX_SUBJECT_LENGTH = 72;

export type Verdict = { ok: true } | { ok: false; reason: string };

const SUBJECT = new RegExp(
  `^(?:${COMMIT_TYPES.join('|')})(?:\\([a-z0-9-]+\\))?!?: (\\S.*)$`
);

// Checks a commit subject against the Conventional Commits rules in CLAUDE.md.
export const checkSubject = (subject: string): Verdict => {
  const match = SUBJECT.exec(subject);
  if (!match) {
    return {
      ok: false,
      reason: `expected \`<type>(<scope>): <summary>\` with a type from ${COMMIT_TYPES.join(', ')} and a lowercase scope`
    };
  }
  const summary = match[1];
  if (!/^[a-z]/.test(summary)) {
    return {
      ok: false,
      reason: 'the summary must start with a lowercase letter'
    };
  }
  if (summary.endsWith('.')) {
    return { ok: false, reason: 'the summary must not end with a period' };
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return {
      ok: false,
      reason: `the subject is ${subject.length} characters; keep it to ${MAX_SUBJECT_LENGTH}`
    };
  }
  return { ok: true };
};

// `git commit` at the start of a command or after a shell separator, so a
// mention inside a quoted string (`echo "git commit ..."`) doesn't count.
const GIT_COMMIT = /(?:^|[;&|(\n])\s*git\s+commit\b/;

// Flags whose message git writes itself or reads from elsewhere.
const UNCHECKABLE = /\s(?:-F|--file|--fixup|--squash)\b/;

// `-m`, a short-flag cluster ending in m (`-am`), or `--message`, as a whole
// argument: `--amend` must not read as `-am` followed by `end`.
const MESSAGE_FLAG = String.raw`(?<=\s)(?:-[a-zA-Z]*m|--message)(?:=|\s+|(?=["']))`;
const HEREDOC = new RegExp(
  String.raw`${MESSAGE_FLAG}"\$\(cat\s*<<-?\s*['"]?\w+['"]?[^\n]*\n([^\n]*)`
);
const DOUBLE_QUOTED = new RegExp(
  String.raw`${MESSAGE_FLAG}"((?:[^"\\]|\\.)*)"`
);
const SINGLE_QUOTED = new RegExp(String.raw`${MESSAGE_FLAG}'([^']*)'`);
const BARE = new RegExp(String.raw`${MESSAGE_FLAG}([^\s'"]+)`);

const unescapeDoubleQuoted = (text: string): string =>
  text.replace(/\\(["\\$`])/g, '$1');

const firstLine = (text: string): string => text.split('\n')[0].trim();

// The subject of the first `git commit` in a shell command, or null when the
// command isn't a commit or its message can't be read from the command line.
export const extractSubject = (command: string): string | null => {
  const commit = GIT_COMMIT.exec(command);
  if (!commit) return null;
  const rest = command.slice(commit.index + commit[0].length);
  if (UNCHECKABLE.test(rest)) return null;

  const heredoc = HEREDOC.exec(rest);
  if (heredoc) return heredoc[1].trim();
  const double = DOUBLE_QUOTED.exec(rest);
  if (double) return firstLine(unescapeDoubleQuoted(double[1]));
  const single = SINGLE_QUOTED.exec(rest);
  if (single) return firstLine(single[1]);
  const bare = BARE.exec(rest);
  if (bare) return bare[1];
  return null;
};
