# Changelog

All notable changes to claude-code-timelog are
documented here. Format follows
[Keep a Changelog][kac].

[kac]: https://keepachangelog.com/en/1.1.0/

## [Unreleased]

### Added

- Default report: `claudelog` with no arguments
  runs a weekly report instead of printing usage.
  Configurable via `defaultReport` in config.json.
- `CONTRIBUTING.md` with setup, code style,
  testing, and submission guidelines.
- `SECURITY.md` with vulnerability reporting
  instructions.
- Issue templates for bug reports and feature
  requests.
- Pull request template with checklist.
- `CHANGELOG.md` (this file).

## [0.2.0] — 2026-02-12

### Added

- `claudelog` CLI command for running reports
  and backfills from any terminal without an
  active Claude Code session.
- `bin` field in package.json.

## [0.1.0] — 2026-02-11

Initial release.

### Added

- Automatic time tracking via Claude Code hooks
  (SessionStart, UserPromptSubmit, Stop).
- JSONL log files (one per day) with session,
  project, ticket, and prompt data.
- Report generation with multiple views:
  default (day x project x ticket), timesheet,
  by-project, by-ticket, by-model, by-day.
- Date range filters: `--week`, `--month`,
  `--from`/`--to`.
- Project and ticket filters.
- JSON output mode (`--json`).
- Backfill from existing Claude Code session
  transcripts.
- Configurable project detection via
  `projectPattern` regex.
- Configurable ticket patterns with
  Jira/Linear/GitHub support.
- Break detection with configurable threshold.
- Event-level aggregation for accurate
  mid-session project/ticket switching.
