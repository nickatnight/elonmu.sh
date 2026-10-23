// Pure helpers shared by the Claude Code hooks in this folder. The hook
// scripts do the I/O; everything here is testable without spawning anything.
import path from 'node:path';

const BIOME_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.json',
  '.jsonc',
  '.css',
  '.yml',
  '.yaml'
]);

// Whether the format-on-edit hook should run Biome on this file: a type Biome
// handles, inside the project.
export const isBiomeTarget = (
  filePath: string,
  projectDir: string
): boolean => {
  const relative = path.relative(
    projectDir,
    path.resolve(projectDir, filePath)
  );
  if (relative.startsWith('..') || path.isAbsolute(relative)) return false;
  return BIOME_EXTENSIONS.has(path.extname(filePath));
};

const COMMIT_TYPES = [
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
];

const MAX_SUBJECT_LENGTH = 72;

const SUBJECT = new RegExp(
  `^(?:${COMMIT_TYPES.join('|')})(?:\\([a-z0-9-]+\\))?!?: (\\S.*)$`
);

export type Verdict = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): Verdict => ({ ok: false, reason });

// Checks a commit subject against the Conventional Commits rules in CLAUDE.md.
export const checkSubject = (subject: string): Verdict => {
  const summary = SUBJECT.exec(subject)?.[1];
  if (summary === undefined) {
    return fail(
      `expected \`<type>(<scope>): <summary>\` with a type from ${COMMIT_TYPES.join(', ')} and a lowercase scope`
    );
  }
  if (!/^[a-z]/.test(summary)) {
    return fail('the summary must start with a lowercase letter');
  }
  if (summary.endsWith('.')) {
    return fail('the summary must not end with a period');
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    return fail(
      `the subject is ${subject.length} characters; keep it to ${MAX_SUBJECT_LENGTH}`
    );
  }
  return { ok: true };
};

// `git commit` at the start of a command or after a shell separator, so a
// mention inside a quoted string (`echo "git commit ..."`) doesn't count.
// Allows env-var prefixes (`GIT_EDITOR=true git …`) and git options before the
// subcommand (`git -C dir commit`, `git --no-pager commit`).
const GIT_COMMIT =
  /(?:^|[;&|(\n])\s*(?:\w+=\S*\s+)*git(?:\s+(?:-[cC]\s+\S+|--[\w-]+(?:=\S*)?))*\s+commit\b/;

// The commit command itself: everything up to the first shell separator that
// isn't inside quotes, so a later `&& git tag -m …` or `| grep -F` isn't read.
const COMMAND_SPAN = /^(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^;&|\n"'])*/;
const QUOTED = /"(?:[^"\\]|\\.)*"|'[^']*'/g;

// Flags whose message git writes itself or reads from a file. Matched against
// the arguments with quoted strings blanked, so a message mentioning `--file`
// doesn't count.
const GENERATED = /\s--(?:fixup|squash)\b/;
const STDIN_FILE = /\s(?:-F\s*|--file(?:=|\s+))-(?=\s|$)/;
const FROM_FILE = /\s(?:-F|--file)\b/;

// The first line of a heredoc: after `<<EOF`, `<<'EOF'`, `<<-"EOF"`…
const HEREDOC_BODY = String.raw`<<-?\s*['"]?\w+['"]?[^\n]*\n([^\n]*)`;
const STDIN_HEREDOC = new RegExp(HEREDOC_BODY);

// `-m`, a short-flag cluster ending in m (`-am`), or `--message`, as a whole
// argument: `--amend` must not read as `-am` followed by `end`.
const MESSAGE_FLAG = String.raw`(?<=\s)(?:-[a-zA-Z]*m|--message)(?:=|\s+|(?=["']))`;
const HEREDOC = new RegExp(
  String.raw`${MESSAGE_FLAG}"\$\(cat\s*${HEREDOC_BODY}`
);
const DOUBLE_QUOTED = new RegExp(
  String.raw`${MESSAGE_FLAG}"((?:[^"\\]|\\.)*)"`
);
const SINGLE_QUOTED = new RegExp(`${MESSAGE_FLAG}'([^']*)'`);
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
  const span = COMMAND_SPAN.exec(rest)?.[0] ?? '';
  const args = span.replace(QUOTED, '""');

  if (GENERATED.test(args)) return null;
  if (STDIN_FILE.test(args)) {
    // `-F -` reads stdin; the heredoc body follows the command line.
    const body = STDIN_HEREDOC.exec(rest);
    return body ? body[1].trim() : null;
  }
  if (FROM_FILE.test(args)) return null;

  const heredoc = HEREDOC.exec(span);
  if (heredoc) return heredoc[1].trim();
  const double = DOUBLE_QUOTED.exec(span);
  if (double) return firstLine(unescapeDoubleQuoted(double[1]));
  const single = SINGLE_QUOTED.exec(span);
  if (single) return firstLine(single[1]);
  const bare = BARE.exec(span);
  if (bare) return bare[1];
  return null;
};

// One string field of the hook's `tool_input`, from the JSON Claude Code pipes
// to stdin. Null when stdin isn't JSON or the field is missing: hooks fail open.
export const readToolInput = async (field: string): Promise<string | null> => {
  try {
    // Safe on any JSON value: `?.` stops at null, and primitives yield undefined.
    const value: unknown = JSON.parse(await Bun.stdin.text())?.tool_input?.[
      field
    ];
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
};
