---
name: report
description: Generate timelog reports (weekly/monthly by project/ticket/model). Use when asked about time spent, billing hours, or activity summaries.
disable-model-invocation: true
allowed-tools: Bash(node *)
---

# Timelog Report

Generate a timelog report using the arguments provided.

## Your task

1. Run the report script with the user's arguments:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/report.mjs $ARGUMENTS
   ```

2. The script accepts these flags:
   - `--week` (default) or `--month`
   - `--by-project` (default if none set)
   - `--by-ticket` to group by ticket
   - `--by-model` to group by model
   - `--from YYYY-MM-DD` custom start
   - `--to YYYY-MM-DD` custom end
   - `--project NAME` filter by project
   - `--json` for JSON output
   Multiple `--by-*` flags can combine.

3. Present the output to the user.

## Examples

- `/timelog:report --week --by-ticket`
- `/timelog:report --month --by-project`
- `/timelog:report --json` (for raw data analysis)

## What it shows

- Total sessions, prompts, active time
- Breakdown by project/ticket/model (if requested)
- Session durations (SessionStart → SessionEnd timestamps)
