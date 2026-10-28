# Constraints

Last reviewed: 2026-10-27 by @nickatnight

Read this before writing code. Do not weaken it to make a change pass.
CLAUDE.md holds the conventions; this file holds the bar a change must clear.

## Floor (always enforced)

- No suppression comments: `@ts-ignore`, `@ts-expect-error`, `biome-ignore`,
  and no `any`. There are none in the repo today.
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

| Dimension        | Rule                                            | Checked by                                        | Runs at               |
| ---------------- | ----------------------------------------------- | ------------------------------------------------- | --------------------- |
| Format           | Zero diffs from Biome                           | `bun run format:check`                            | every edit (hook), CI |
| Lint             | Zero errors or warnings                         | `bun run lint`                                    | every edit (hook), CI |
| Types            | Zero type errors, strict mode                   | `bun run typecheck`                               | task end, CI          |
| Tests            | All pass, none skipped                          | `bun test`                                        | task end, CI          |
| Security headers | CSP and headers unchanged unless a spec says so | `tests/security-headers.test.ts`                  | task end, CI          |
| Page weight      | Per-asset and per-page budgets hold             | `tests/jet/budgets.test.ts` and page budget tests | task end, CI          |
| Commits          | Conventional Commit subject                     | `.claude/hooks/commit-msg-guard.ts`               | every commit          |

`bun run check` runs the first four rows plus every test. It takes about one
second today. Run it before every commit.

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

Nothing in this file is judged from outside the project's own suite and
tools. Candidates, each needing a dev tool installed first (ask before
adding): `osv-scanner` for dependency CVEs in CI, and axe-core against a
local server for accessibility.

## Exceptions

None.
