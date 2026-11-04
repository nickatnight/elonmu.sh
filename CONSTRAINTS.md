# Constraints

Last reviewed: 2026-11-04 by @nickatnight

Read this before writing code. Do not weaken it to make a change pass.
CLAUDE.md holds the conventions; this file holds the bar a change must clear.

## Floor (always enforced)

- No suppression comments: `@ts-ignore`, `@ts-expect-error`, `biome-ignore`,
  `eslint-disable` (or any other inline ESLint config), and no `any`. There
  are none in the repo today. `tests/no-any.test.ts` fails on an `any` type
  in TypeScript or JSDoc, and `bun run format:check` fails on an inline
  ESLint config comment.
- No unimplemented stubs (`throw new Error('Not implemented')`), and no empty
  `catch {}`.
- No skipped (`.skip`, `.todo`) or deleted tests, and no assertions removed
  from tests that stay.
- No budget in `tests/**/budgets.test.ts` or a page test raised to make a
  change pass.
- No secrets in source. API keys live in `.env`, which is gitignored.
- No CSP loosening: never `'unsafe-inline'`, `'unsafe-eval'` or `*`.
- This file does not get weakened in the same change that was failing it.

## Enforced with numbers

| Dimension        | Rule                                                                   | Checked by                                        | Runs at               |
| ---------------- | ---------------------------------------------------------------------- | ------------------------------------------------- | --------------------- |
| Format           | Zero diffs from Biome and ESLint's padding rule                        | `bun run format:check`                            | edit hook (Biome), CI |
| Lint             | Zero errors or warnings                                                | `bun run lint`                                    | every edit (hook), CI |
| Types            | Zero type errors, strict mode, client JS included (`checkJs`)          | `bun run typecheck`                               | task end, CI          |
| Tests            | All pass, none skipped                                                 | `bun test`                                        | task end, CI          |
| Security headers | CSP and headers unchanged unless a spec says so                        | `tests/security-headers.test.ts`                  | task end, CI          |
| Page weight      | Per-asset and per-page budgets hold                                    | `tests/jet/budgets.test.ts` and page budget tests | task end, CI          |
| Dependencies     | No advisory at moderate or above, except those listed under Exceptions | `bun run audit`                                   | CI                    |
| Commits          | Conventional Commit subject                                            | `.claude/hooks/commit-msg-guard.ts`               | every commit          |

`bun run check` runs the first four rows plus every test. It takes about five
seconds today. Run it before every commit. `bun run audit` stays out of it
because it needs the network and the suite runs offline.

## Measured, not yet enforced

Measured with `bun test --coverage` on `main` at 5858dcd.

| Metric                        | Today  | Direction                       |
| ----------------------------- | ------ | ------------------------------- |
| Line coverage (all files)     | 93.59% | must not fall by more than 0.5% |
| Function coverage (all files) | 94.14% | must not fall by more than 0.5% |

Why a ratchet and not a target: the suite is already high, so holding the
line costs nothing and a fixed number would only invite argument. New modules
are expected to come in at or above today's level.

## Not covered yet

Apart from dependency advisories, nothing in this file is judged from
outside the project's own suite and tools. One candidate, needing a dev tool
installed first (ask before adding): axe-core against a local server for
accessibility.

## Exceptions

Fix an advisory by default: bump the lockfile first, then upgrade the
dependency. Ignore one only when no fixed version is reachable and our use of
the package never reaches the vulnerable code. Each ignore adds an
`--ignore=<GHSA>` flag to the `audit` script in `package.json` and a row
below, in the same commit, with a review-by date at most 90 days out. When
the review date passes, check again and either fix it or renew it with a new
date.

| GHSA | Package and path | Severity | Why unreachable | Accepted | Review by |
| ---- | ---------------- | -------- | --------------- | -------- | --------- |

None today, and no other rule in this file has an exception.
