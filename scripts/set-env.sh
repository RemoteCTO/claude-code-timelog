#!/bin/sh
# Persists TIMELOG_PLUGIN_ROOT to the
# session environment so Bash commands
# (e.g. the backfill skill) can locate
# plugin scripts at runtime.

if [ -n "$CLAUDE_ENV_FILE" ]; then
  printf \
    'export TIMELOG_PLUGIN_ROOT="%s"\n' \
    "$CLAUDE_PLUGIN_ROOT" \
    >> "$CLAUDE_ENV_FILE"
fi
