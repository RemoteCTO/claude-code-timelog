#!/usr/bin/env node

// Claude Code timelog hook.
// Appends session activity as JSONL for
// timesheet reconstruction.

import {
  readFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import {
  execFileSync,
} from 'node:child_process';
import {
  TIMELOG_DIR,
  loadConfig,
  matchTicket,
} from '../lib/config.mjs';

const config = loadConfig();

function detectProject(cwd) {
  if (config.projectSource === 'cwd') {
    return basename(cwd);
  }
  // Default: git-root
  try {
    const root = execFileSync(
      'git',
      ['rev-parse', '--show-toplevel'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    ).trim();
    return basename(root || cwd);
  } catch {
    return basename(cwd);
  }
}

function detectTicket(cwd) {
  try {
    const branch = execFileSync(
      'git',
      ['branch', '--show-current'],
      {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }
    ).trim();
    if (!branch) return null;
    return matchTicket(branch, config);
  } catch {
    return null;
  }
}

function stripNulls(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v != null)
  );
}

const input = JSON.parse(
  readFileSync(process.stdin.fd, 'utf8')
);
const event = input.hook_event_name;
const cwd = input.cwd || process.cwd();

const entry = {
  ts: new Date().toISOString(),
  event,
  session: input.session_id,
  project: detectProject(cwd),
  ticket: detectTicket(cwd),
  cwd,
};

switch (event) {
  case 'SessionStart':
    entry.model = input.model;
    entry.source = input.source;
    break;
  case 'UserPromptSubmit':
    if (input.prompt) {
      entry.prompt =
        input.prompt.slice(0, 500);
    }
    if (!entry.ticket && input.prompt) {
      entry.ticket =
        matchTicket(
          input.prompt, config
        );
    }
    break;
  case 'SessionEnd':
    entry.reason = input.reason;
    break;
}

mkdirSync(TIMELOG_DIR, { recursive: true });
const date =
  new Date().toISOString().slice(0, 10);
const logFile =
  join(TIMELOG_DIR, `${date}.jsonl`);

appendFileSync(
  logFile,
  JSON.stringify(stripNulls(entry)) + '\n'
);

console.log('{}');
