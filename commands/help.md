---
name: help
description: Show available timelog commands and usage
disable-model-invocation: true
allowed-tools: ""
---

# Timelog Commands

## Available Commands

| Command | Description |
|---------|-------------|
| `/timelog:report` | Generate time reports |
| `/timelog:backfill` | Import existing sessions |
| `/timelog:help` | Show this help |

## Report Examples

```
/timelog:report --week --by-project
/timelog:report --month --by-ticket
/timelog:report --timesheet
/timelog:report --from 2026-02-01 --to 2026-02-14
/timelog:report --project my-app --by-ticket
/timelog:report --json
```

## Report Flags

| Flag | Description |
|------|-------------|
| `--week` | This week (default) |
| `--month` | This month |
| `--by-project` | Group by project (default) |
| `--by-ticket` | Group by ticket |
| `--by-model` | Group by model |
| `--by-day` | Group by day |
| `--timesheet` | Project → ticket breakdown |
| `--from DATE` | Start (YYYY-MM-DD) |
| `--to DATE` | End (YYYY-MM-DD) |
| `--project NAME` | Filter by project |
| `--ticket ID` | Filter by ticket |
| `--json` | JSON output |

## Configuration

Edit `${CLAUDE_TIMELOG_DIR}/config.json`:

```json
{
  "breakThreshold": 1800,
  "ticketPatterns": ["([A-Z][A-Z0-9]+-\\d+)"],
  "projectSource": "git-root"
}
```
