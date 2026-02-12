# Claude Code Timelog

Automatic time tracking plugin for
[Claude Code](https://code.claude.com/).
Logs session activity as JSONL for
timesheet reconstruction.

## What it tracks

- **Session start/end** with timestamps
- **Every prompt** you submit (first 500
  characters)
- **Project name** from git repository root
- **Ticket/issue number** from git branch
  name (e.g. `BAN-123`, `PROJ-456`)
- **Model** used for the session

All data stays local. Nothing is sent to
external services.

## Installation

### From a marketplace

```bash
claude plugin marketplace add <url>
claude plugin install timelog@<marketplace>
```

### Local development

```bash
git clone <repo-url> claude-code-timelog
claude --plugin-dir ./claude-code-timelog
```

## Configuration

### Log directory

Set `CLAUDE_TIMELOG_DIR` to customise where
logs are written:

```bash
# In your shell profile (.bashrc, .zshrc)
export CLAUDE_TIMELOG_DIR="$HOME/timelogs"
```

**Default**: `~/.claude/timelog/`

### Ticket and project detection

Create `config.json` in your timelog
directory to customise detection:

```json
{
  "ticketPatterns": [
    "([A-Z][A-Z0-9]+-\\d+)",
    "#(\\d+)"
  ],
  "projectSource": "git-root"
}
```

**`ticketPatterns`**: Array of regex strings
tried in order against branch names and
prompt text. Use a capture group for the
ticket ID; if none, the full match is used.

Examples:
- `([A-Z][A-Z0-9]+-\\d+)` — Jira/Linear
  style (default)
- `#(\\d+)` — GitHub issue numbers
- `(TICKET-\\d{4})` — custom format

**`projectSource`**: How to determine the
project name from the working directory.

| Value | Behaviour |
|-------|-----------|
| `git-root` | Git repository root name (default) |
| `cwd` | Current directory name |

See `config.example.json` for a template.

## Output format

One JSONL file per day (`YYYY-MM-DD.jsonl`).
Each line is a JSON object:

```json
{
  "ts": "2026-02-12T14:30:00.000Z",
  "event": "UserPromptSubmit",
  "session": "abc-123-def",
  "project": "my-app",
  "ticket": "BAN-456",
  "prompt": "Fix the login form validation"
}
```

### Events

| Event | Extra fields |
|-------|-------------|
| `SessionStart` | `model`, `source` |
| `UserPromptSubmit` | `prompt` |
| `SessionEnd` | `reason` |

All events include `ts`, `session`,
`project`, `ticket`, and `cwd`.

## Reporting

Generate weekly or monthly summaries of your
logged time:

```
/timelog:report --week --by-ticket
/timelog:report --month --by-project
/timelog:report --by-model
```

**Flags:**
- `--week` (default) or `--month` — period
- `--by-project` — group by project
- `--by-ticket` — group by ticket
- `--by-model` — group by Claude model
- `--json` — raw JSON output

Example output:

```
Timelog Report (week starting 2026-02-09)
Total: 12 sessions, 47 prompts, 3h 15m

By Ticket:
  BAN-789         3 sessions, 12 prompts, 1h 20m
  R21-456         2 sessions, 8 prompts, 45m
  (no ticket)     7 sessions, 27 prompts, 1h 10m
```

Or run the script directly:

```bash
node path/to/scripts/report.mjs --week --by-ticket
```

## Backfill historical data

Populate the timelog from all existing
session transcripts:

```
/timelog:backfill
```

Or run the script directly:

```bash
node path/to/scripts/backfill.mjs
```

## Ticket detection

The default pattern matches Jira/Linear
style tickets in git branch names:

- `feature/BAN-123-login` -> `BAN-123`
- `R21-456-update-reports` -> `R21-456`
- `T-001-initial-setup` -> `T-001`

Add custom patterns via `config.json` for
other formats (GitHub issues, custom IDs).

If no ticket is found in the branch, prompt
text is also scanned.

## Requirements

- Claude Code 1.0.33+
- Node.js (ships with Claude Code)
- Git (optional, for project/ticket
  detection)

## Licence

MIT
