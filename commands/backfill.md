---
name: backfill
description: Backfill timelog from existing Claude Code session transcripts. Use once to rebuild historical time tracking data.
disable-model-invocation: true
allowed-tools: Bash(node *)
---

# Timelog Backfill

Process all existing Claude Code session transcripts and generate timelog entries for historical sessions.

## Your task

1. Run the backfill script:
   ```
   node ${CLAUDE_PLUGIN_ROOT}/scripts/backfill.mjs
   ```

2. The script:
   - Scans `~/.claude/sessions/` for all JSONL transcripts
   - Extracts SessionStart, UserPromptSubmit, SessionEnd events
   - Detects project names and ticket IDs
   - Writes entries to `~/.claude/timelog/` (or `$CLAUDE_TIMELOG_DIR`)
   - Outputs progress every 100 files

3. Report the summary to the user (number of entries, date range, output location).

## When to use this

- First-time setup: backfill all historical sessions
- After fixing ticket detection patterns: re-run to update logs
- After changing `CLAUDE_TIMELOG_DIR`: regenerate logs in new location

## Notes

- Safe to run multiple times (appends, doesn't duplicate)
- Filters out system-injected messages (not real user prompts)
- Uses the same config as live hooks (`~/.claude/timelog/config.json`)
