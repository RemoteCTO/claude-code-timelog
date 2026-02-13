# Contributing

Thanks for your interest in contributing to
Claude Code Timelog. This guide covers setup,
standards, and how to submit changes.

## Getting started

```bash
git clone https://github.com/RemoteCTO/claude-code-timelog.git
cd claude-code-timelog
npm install
```

Run the test suite and linter to verify
everything works:

```bash
npm test
npm run lint
```

Tests use Node's built-in test runner and
run across Node 18, 20, and 22 in CI.

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

- **80 character line limit** (enforced by
  ESLint and editorconfig)
- ESM modules (`.mjs` extension, `import`/
  `export`)
- `prefer-const`, `no-var`
- 2-space indentation
- LF line endings
- Trailing newline at end of file

The full config is in `eslint.config.mjs`
and `.editorconfig`. Most editors pick these
up automatically.

## Writing tests

Tests live in `test/` and mirror the source
tree:

```
lib/config.mjs       → test/lib/config.test.mjs
scripts/report.mjs   → test/scripts/report.test.mjs
bin/claudelog         → test/bin/claudelog.test.mjs
```

Use Node's built-in `node:test` and
`node:assert` modules:

```js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('feature', () => {
  it('does the thing', () => {
    assert.strictEqual(actual, expected);
  });
});
```

Run a single test file during development:

```bash
node --test test/lib/config.test.mjs
```

## Submitting changes

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes with tests
4. Ensure `npm test` and `npm run lint` pass
5. Open a pull request against `main`

CI runs automatically on pull requests.
Both lint and test jobs must pass.

### Good pull requests

- **One concern per PR** — a bug fix, a
  feature, a refactor. Not all three.
- **Tests included** — new behaviour needs
  tests; bug fixes need a regression test.
- **Descriptive commit messages** — explain
  *why*, not just *what*.

### Reporting bugs

Open an issue with:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Node version (`node -v`)
- Claude Code version

## Environment variables

These are useful during development:

| Variable | Purpose |
|----------|---------|
| `CLAUDE_TIMELOG_DIR` | Override log directory |

Set `CLAUDE_TIMELOG_DIR` to a temp directory
when running tests or experimenting to avoid
polluting your real timelog data.

## Licence

By contributing, you agree that your
contributions will be licensed under the
Apache 2.0 licence.
