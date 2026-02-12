#!/usr/bin/env node

// Claude Code timelog hook.
// Appends session activity as JSONL for
// timesheet reconstruction.

import {
  readFileSync,
  appendFileSync,
  mkdirSync,
  openSync,
  readSync,
  statSync,
  closeSync,
} from 'node:fs';
import {
  join, basename,
} from 'node:path';
import { homedir } from 'node:os';
import {
  execFileSync,
} from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TIMELOG_DIR,
  loadConfig,
  matchTicket,
  extractProjectFromPath,
  extractFilePaths,
} from '../lib/config.mjs';

// ── Pure functions ──────────────────────

function detectProjectFromCwd(cwd, cfg) {
  if (cfg.projectSource === 'cwd') {
    return basename(cwd);
  }
  try {
    const root = execFileSync(
      'git',
      ['rev-parse', '--show-toplevel'],
      {
        cwd,
        encoding: 'utf8',
        stdio: [
          'pipe', 'pipe', 'ignore',
        ],
      }
    ).trim();
    return basename(root || cwd);
  } catch {
    return basename(cwd);
  }
}

// Read the tail of the session transcript
// to find file paths from recent tool calls.
// We read from the end because recent tool
// calls are more likely to reflect the
// current project. The transcript path is
// derived from cwd: Claude Code encodes
// the working directory path (replacing /
// with -) as the project folder name under
// ~/.claude/projects/.
const TAIL_BYTES = 16384;

function readTail(filePath) {
  try {
    const fd = openSync(filePath, 'r');
    const st = statSync(filePath);
    const start =
      Math.max(0, st.size - TAIL_BYTES);
    const len =
      Math.min(st.size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function detectProjectFromTranscript(
  cwd, sessionId, cfg
) {
  if (!cfg.projectPattern) return null;
  const encoded =
    cwd.replace(/\//g, '-');
  const transcript = join(
    homedir(), '.claude', 'projects',
    encoded, `${sessionId}.jsonl`
  );
  const tail = readTail(transcript);
  if (!tail) return null;

  const lines = tail.split('\n');
  for (
    let i = lines.length - 1;
    i >= 0;
    i--
  ) {
    if (!lines[i].trim()) continue;
    let rec;
    try {
      rec = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    for (
      const fp of extractFilePaths(rec)
    ) {
      const proj =
        extractProjectFromPath(fp, cfg);
      if (proj) return proj;
    }
  }
  return null;
}

function detectProject(
  cwd, sessionId, cfg
) {
  const fromPaths =
    detectProjectFromTranscript(
      cwd, sessionId, cfg
    );
  if (fromPaths) return fromPaths;
  return detectProjectFromCwd(cwd, cfg);
}

function detectTicket(cwd, cfg) {
  try {
    const branch = execFileSync(
      'git',
      ['branch', '--show-current'],
      {
        cwd,
        encoding: 'utf8',
        stdio: [
          'pipe', 'pipe', 'ignore',
        ],
      }
    ).trim();
    if (!branch) return null;
    return matchTicket(branch, cfg);
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

// ── Exports ─────────────────────────────

export {
  detectProjectFromCwd,
  detectProjectFromTranscript,
  detectProject,
  detectTicket,
  readTail,
  stripNulls,
  TAIL_BYTES,
};

// ── Hook (only when run directly) ───────

if (
  process.argv[1] ===
  fileURLToPath(import.meta.url)
) {
  const config = loadConfig();

  const input = JSON.parse(
    readFileSync(
      process.stdin.fd, 'utf8'
    )
  );
  const event = input.hook_event_name;
  const cwd =
    input.cwd || process.cwd();
  const sessionId = input.session_id;

  const entry = {
    ts: new Date().toISOString(),
    event,
    session: sessionId,
    project: detectProject(
      cwd, sessionId, config
    ),
    ticket: detectTicket(cwd, config),
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
      if (
        !entry.ticket && input.prompt
      ) {
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

  mkdirSync(
    TIMELOG_DIR, { recursive: true }
  );
  const date =
    new Date().toISOString().slice(0, 10);
  const logFile =
    join(TIMELOG_DIR, `${date}.jsonl`);

  appendFileSync(
    logFile,
    JSON.stringify(
      stripNulls(entry)
    ) + '\n'
  );

  console.log('{}');
}
