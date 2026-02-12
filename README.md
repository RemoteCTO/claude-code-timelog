# Claude Code Timelog

Automatic time tracking plugin for
[Claude Code](https://code.claude.com/).
Logs session activity as JSONL for
timesheet reconstruction.

## What it tracks

- **Session start/end** with timestamps
- **Every prompt** you submit (first 500
  characters)
- **Project name** from file paths, git
  repository root, or working directory
- **Ticket/issue number** from git branch
  name or prompt text
- **Model** used for the session

All data stays local. Nothing is sent to
external services.

## Quick start

```bash
git clone <repo-url> claude-code-timelog
claude --plugin-dir ./claude-code-timelog
```

That's it. The plugin starts logging
immediately with sensible defaults:

- **Project** = git repository name
- **Tickets** = Jira/Linear IDs from branch
  names (e.g. `BAN-123`, `PROJ-456`)
- **Logs** written to `~/.claude/timelog/`

No configuration needed for basic use.

## CLI usage

The `claudelog` command lets you run reports
and backfills from any terminal — no active
Claude Code session needed.

```bash
claudelog report --week --by-project
claudelog report --month --timesheet --json
claudelog backfill
claudelog --help
```

### Adding to PATH

The plugin installs to a versioned cache
directory. Pick one of:

**Option A: Symlink (recommended)**

```bash
ln -sf ~/.claude/plugins/cache/\
remotecto-plugins/timelog/*/bin/claudelog \
~/.local/bin/claudelog
```

**Option B: PATH in shell profile**

```bash
# Add to .zshrc or .bashrc
TIMELOG_BIN="$(ls -d \
  ~/.claude/plugins/cache/\
remotecto-plugins/timelog/*/bin \
  2>/dev/null | tail -1)"
[ -n "$TIMELOG_BIN" ] && \
  export PATH="$TIMELOG_BIN:$PATH"
```

Either way, `claudelog report --week` then
works from anywhere.

## Getting the best results

### How project detection works

The plugin needs to know which project
you're working on. It tries three methods
in order:

1. **File path regex** (`projectPattern`) —
   extracts the project name from file paths
   Claude touches during the session.
2. **Git root** (`projectSource: "git-root"`)
   — uses the git repository directory name.
3. **Working directory** (`projectSource:
   "cwd"`) — uses the directory name you
   launched from.

**If you launch Claude Code from a project
directory** (the most common case), methods
2 and 3 work automatically. No config
needed.

**If you launch from a parent directory**
(e.g. `~/projects/`), everything gets lumped
under one name. Set `projectPattern` to fix
this — see [Project detection](#project-detection).

### How ticket detection works

Tickets are detected automatically from:

1. **Git branch name** — `feature/BAN-123`
   extracts `BAN-123`
2. **Prompt text** — "Fix BAN-123 login bug"
   extracts `BAN-123`

The default pattern matches Jira, Linear,
Shortcut, and similar formats:
`PROJECT-123`. To add custom patterns
(GitHub issues, internal IDs), see
[Ticket detection](#ticket-detection).

### Tips for accurate tracking

| Tip | Why |
|-----|-----|
| Launch from the project directory | Automatic project detection |
| Use ticket IDs in branch names | Automatic ticket attribution |
| One task per session when possible | Cleaner time attribution |
| Name branches `TICKET-description` | Branch-based detection is most reliable |

If you don't use tickets or branches,
the plugin still tracks time per project
and per day — just without the ticket
breakdown.

## Configuration

Create `config.json` in your timelog
directory to customise behaviour. All
settings are optional.

```json
{
  "ticketPatterns": [
    "([A-Z][A-Z0-9]+-\\d+)"
  ],
  "projectSource": "git-root",
  "projectPattern": null,
  "breakThreshold": 1800
}
```

See `config.example.json` for a template.

### Log directory

```bash
# In your shell profile (.bashrc, .zshrc)
export CLAUDE_TIMELOG_DIR="$HOME/timelogs"
```

**Default**: `~/.claude/timelog/`

### Project detection

When the default git-root detection isn't
enough (e.g. you launch from a parent
directory), use `projectPattern`:

```json
{
  "projectPattern":
    "/home/me/projects/(?:active/)?([^/]+)"
}
```

The regex is applied to absolute file paths
from tool calls (Read, Edit, Write, etc.).
The **first capture group** becomes the
project name.

**How it works:**

- **Live hook**: reads the tail of the
  current session transcript to find recent
  file paths from tool calls.
- **Backfill**: scans all tool calls in each
  transcript.
- **Fallback**: if no file paths match, uses
  `projectSource` detection (git-root or
  cwd).

**Building your pattern:**

Start from your directory structure and skip
any "grouping" directories that aren't
project names:

```
~/projects/
  my-app/          ← project
  client-work/
    acme/          ← project
    widgets/       ← project
  _archived/
    old-thing/     ← project
```

Pattern: `projects/(?:client-work/|_archived/)?([^/]+)`

This captures `my-app`, `acme`, `widgets`,
and `old-thing` — skipping the intermediate
grouping directories.

**More examples:**

| Structure | Pattern |
|-----------|---------|
| `~/projects/<name>/` | `projects/([^/]+)` |
| `~/projects/active/<name>/` | `projects/(?:active/)?([^/]+)` |
| `~/code/<org>/<name>/` | `code/[^/]+/([^/]+)` |
| `~/work/<client>/<project>/` | `work/[^/]+/([^/]+)` |

**Anchoring tip:** use enough path prefix
to avoid matching paths outside your
projects (e.g. `~/.claude/projects/` also
contains `projects/` in the path). A full
home directory prefix is safest:

```json
{
  "projectPattern":
    "/Users/me/projects/(?:active/)?([^/]+)"
}
```

### Ticket detection

```json
{
  "ticketPatterns": [
    "([A-Z][A-Z0-9]+-\\d+)",
    "#(\\d+)"
  ]
}
```

Array of regex strings tried in order. Use a
capture group for the ticket ID; if none,
the full match is used.

Detection sources (priority order):

1. Git branch name
2. Prompt text (first match)

**Common patterns:**

| Format | Pattern |
|--------|---------|
| Jira/Linear (`PROJ-123`) | `([A-Z][A-Z0-9]+-\\d+)` |
| GitHub issues (`#42`) | `#(\\d+)` |
| Custom (`TICKET-0042`) | `(TICKET-\\d{4})` |
| None (disable) | `[]` (empty array) |

### Active time and break detection

Time is calculated from gaps between
consecutive events within a session:

- Gap **under** the threshold → active time
- Gap **over** the threshold → break
  (excluded)

"Active time" includes Claude's processing
time and your review time between prompts —
not just typing time. For billing this is
typically the right metric: the client pays
for the session of work, not keystrokes.

```json
{
  "breakThreshold": 1800
}
```

| Value | Meaning |
|-------|---------|
| `600` | Strict — 10 min break detection |
| `1800` | Default — 30 min threshold |
| `3600` | Lenient — 1 hour threshold |

## Reporting

### Default view (day x project x ticket)

```
/timelog:report
/timelog:report --month
/timelog:report --from 2026-02-01 --to 2026-02-14
```

Shows a daily breakdown with projects and
ticket sub-items where available:

```
Date        Project / Ticket          Active  Prompts
──────────  ──────────────────────  ────────  ───────
Mon 10 Feb  infrastructure           12h 21m      159
              BAN-139                 9h 38m      133
              MB-1                    2h 42m       26
            acme-api                  4h 23m       39
              PROJ-123                3h 51m       36
            rails                        49m       28
```

Projects without detected tickets show the
project row only (no sub-items).

### Timesheet view (project x ticket)

```
/timelog:report --timesheet
/timelog:report --timesheet --month
```

Aggregated across days. Best for monthly
summaries and invoicing:

```
Project / Ticket              Active  Sess  Prompts
──────────────────────────  ────────  ────  ───────
infrastructure                46h 29m    11      686
  BAN-139                     22h 13m     3      341
  BAN-142                      7h 00m     1       90
  NET-001                      6h 47m     1      114
incubating                    26h 12m    14      375
  BAN-136                      7h 23m     2      122
```

### Single-dimension views

```
/timelog:report --by-project
/timelog:report --by-ticket
/timelog:report --by-model
/timelog:report --by-day
```

### Filters

```
/timelog:report --project infrastructure
/timelog:report --ticket BAN-139
```

### All flags

| Flag | Effect |
|------|--------|
| `--week` | This week (default period) |
| `--month` | This calendar month |
| `--from DATE` | Start date (YYYY-MM-DD) |
| `--to DATE` | End date (YYYY-MM-DD) |
| `--timesheet` | Project x ticket summary |
| `--by-project` | Group by project |
| `--by-ticket` | Group by ticket |
| `--by-model` | Group by model |
| `--by-day` | Group by day |
| `--project NAME` | Filter to project |
| `--ticket ID` | Filter to ticket |
| `--json` | Structured JSON output |

### Running directly

```bash
CLAUDE_TIMELOG_DIR=~/timelogs \
  node scripts/report.mjs --timesheet
```

## Backfill historical data

Import from existing Claude Code session
transcripts:

```
/timelog:backfill
```

Or run the script directly:

```bash
node scripts/backfill.mjs
```

The backfill:

- Scans `~/.claude/projects/` for all
  session JSONL transcripts
- Extracts prompts, timestamps, and tickets
- Infers projects from file paths when
  `projectPattern` is configured
- Tags all entries with `source: "backfill"`

### Safe to re-run

Backfill is **idempotent**. Running it again
replaces previous backfill data but
preserves any entries from the live hook
(which have no `source` tag). This means
you can re-run after changing your
`projectPattern` without losing live data.

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
| `UserPromptSubmit` | `prompt`, `source` |
| `SessionEnd` | `reason`, `source` |

All events include `ts`, `session`,
`project`, `ticket`, and `cwd`.

`source` is `"backfill"` for imported data,
absent for live hook data.

### Aggregation model

Reports aggregate at the **event level**,
not the session level. Each consecutive pair
of events within a session creates a "time
slice" attributed to the first event's
project, ticket, and model. This means:

- **Mid-session project switches** are
  tracked accurately
- **Multi-ticket sessions** split time
  correctly between tickets
- **Concurrent sessions** are handled
  cleanly (separate session UUIDs)

## Requirements

- Claude Code 1.0.33+
- Node.js (ships with Claude Code)
- Git (optional, for ticket detection)

## Licence

Apache 2.0 — see [LICENSE](LICENSE).
