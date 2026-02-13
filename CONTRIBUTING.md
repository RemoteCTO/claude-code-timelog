# Contributing to claude-code-timelog

## Prerequisites

- Node.js 18 or later
- Claude Code (for testing hooks)

## Setup

```bash
git clone https://github.com/RemoteCTO/claude-code-timelog.git
cd claude-code-timelog
npm install
npm test
npm run lint
```

## Project structure

```
hooks/          Claude Code hook handlers
scripts/        CLI scripts (report, backfill)
lib/            Shared library code
bin/            CLI entry point (claudelog)
commands/       Plugin command definitions
test/           Tests (mirrors source layout)
```

**Hooks** run inside Claude Code sessions.
**Scripts** run standalone from the terminal.
**lib/** is shared between both.

## Code style

Code style is enforced by ESLint and
editorconfig:

- 80-character line limit
- ESM modules (`.mjs` extension)
- `prefer-const`, `no-var`
- 2-space indentation
- LF line endings

Run `npm run lint` before submitting changes.

## Testing

Tests use Node's native test runner
(`node --test`).

- Write tests first (TDD)
- Test behaviour, not implementation
- Use real objects, not mocks
- Keep tests focused and independent

Run tests with `npm test`. Run a single file:

```bash
node --test test/lib/config.test.mjs
```

Use `CLAUDE_TIMELOG_DIR` to point at a temp
directory during development to avoid polluting
your real timelog data.

## Pull request process

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes
4. Write or update tests
5. Update `CHANGELOG.md` under an `[Unreleased]`
   heading (see [Keep a Changelog][kac])
6. Run `npm test` and `npm run lint`
7. Submit a pull request

[kac]: https://keepachangelog.com/en/1.1.0/

Keep PRs focused on a single change. Include
clear descriptions of what changed and why.

## Commit messages

Follow conventional commit format where
appropriate:

- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `test:` test additions or changes
- `refactor:` code changes without behaviour
  changes

Keep commit messages concise and descriptive.

## Questions

Open an issue for questions or clarifications
before starting significant changes.

## Licence

By contributing, you agree that your
contributions will be licensed under the
Apache 2.0 licence.
