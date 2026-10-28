# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Commands (dev server, tests, `bun run check`) are in the README's
Development section. How the code fits together is in
[ARCHITECTURE.md](ARCHITECTURE.md). Read it before changing `src/jet/`.

Read CONSTRAINTS.md before writing code. Do not weaken it to make a change pass.

Project hooks in `.claude/settings.json` run Biome on every file you edit
(formatting plus safe fixes; anything left comes back as an error) and block
`git commit` unless the subject is a Conventional Commit (see below). The
hooks are tested in `tests/hooks/`.

## Conventions

### TypeScript

- Biome decides formatting: 2 spaces, single quotes, no trailing commas,
  80 columns. Don't hand-format; the edit hook and `format:check` enforce it.
- Named exports only, no default exports. Prefer `const` arrow functions;
  use classes for adapters that implement a port (`implements FlightSource`).
- Inject dependencies through the constructor or `deps` objects. Wire concrete
  adapters (axios, the system clock, `console`) only in a composition root
  (`src/jet/index.ts`, `src/index.ts`). Core code and routes import ports, not
  concrete sources, and there are no module-level singletons elsewhere.
- Import types with `import type` or inline `type`. No `any`, `@ts-ignore` or
  `biome-ignore`; there are none in the repo.
- Keep Bluesky-specific fields out of `domain.ts` and out of the public JSON.

### Comments

Let names, types and tests carry the explanation (see #27). Comments are only
for behaviour the code can't show: a browser, library or vendor quirk, or a
non-obvious trap (e.g. the `.finally()` note in `cached-flight-source.ts`).
Don't narrate or justify our own code. If code needs a comment to be
understood, rename or extract a function instead.

### Tests

- Use `bun:test`. Name tests as plain-English statements of behaviour
  (`it('serves plain text with a one-day cache')`).
- Prefer fakes over mocks: `FakeClock` (never real timers),
  `InMemoryFlightSource`, `flight()`, and `createApp({ jet: fake })` over HTTP.
  Spy on `axios.get` only for the NewsAPI tests.
- Parser and pairing tests are table-driven on real post texts
  (`tests/fixtures/elonjet-feed.json`).
- Never skip or delete a failing test, or loosen a budget, to get green.
- Run `bun run check` before committing.

### Views, CSS, client JS

- EJS escapes data with `<%= %>`. Use `<%-` only for `include()` and
  hard-coded markup, never for data.
- Every local URL in a view goes through `asset()`.
- Nav links and service cards render only from `SERVICES`; never hard-code a
  service link.
- CSS uses design tokens on `:root` (dark first, with a
  `prefers-color-scheme: light` override), `clamp()` for type and spacing,
  BEM-ish classes (`.hero__video`), and no `!important`. Respect
  `prefers-reduced-motion` and keep `:focus-visible` outlines.
- `/jet`-only rules (`.jet*`, `.flight*`) go in `jet.css`, never `main.css`
  (enforced in `tests/jet/page.test.ts`). The home page never loads globe.gl or
  `jet.js`.
- Client JS is vanilla ES modules with JSDoc types. Put post-derived text into
  the DOM with `textContent` (no `innerHTML`) and allow only `https:` URLs.
- CSP: never `'unsafe-eval'`, `'unsafe-inline'` or `*`. Fit it to the
  resources the page actually uses.

### Ask before

- Adding a runtime dependency, or upgrading Express or globe.gl.
- Changing a public API response (`/api/news`, `/api/jet/flights`).
- Any user-facing copy: the brand, `<title>`, h1, hero, teaser or meta text.
  Keep the satire marker (`/s`) and the footer disclaimer.
- Visual direction (layout, palette, button style): offer 2–4 options with
  previews instead of picking one yourself.
- Changing `TEASER_VIEW`, or adding pages to the sitemap.

## Docs

Specs go in `docs/specs/` and plans in `docs/plans/`. `docs/` is gitignored,
so these are local working notes and never committed.

## Branching

Name branches `<githubuser>/<short_description>`, using the GitHub username
of the person the work is for, e.g. `nickatnight/bun-migration`.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):
`<type>(<optional scope>): <summary>`, with the summary in the imperative and
lowercase, without a trailing period. Types: `feat`, `fix`, `docs`, `style`,
`refactor`, `perf`, `test`, `build`, `ci`, `chore`. Mark breaking changes with
`!` after the type/scope, or with a `BREAKING CHANGE:` footer.

```
feat(hero): fill the first screen and move the console below it
fix(api): return 200 with an error body when NewsAPI times out
chore: ignore .claude/worktrees/
```
