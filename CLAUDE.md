# CLAUDE.md

Guidance for Claude Code when working in this repo.

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
