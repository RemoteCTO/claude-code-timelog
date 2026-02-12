#!/usr/bin/env node

// Backfill timelog from existing Claude Code
// session transcripts. Processes all JSONL
// transcripts and writes timelog entries.

import {
  createReadStream,
  mkdirSync,
  appendFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import {
  createInterface,
} from 'node:readline';
import {
  TIMELOG_DIR,
  loadConfig,
  matchTicket,
} from '../lib/config.mjs';

const TRANSCRIPTS_DIR =
  join(homedir(), '.claude', 'projects');

const config = loadConfig();

function findTranscripts() {
  const files = [];
  let dirs;
  try {
    dirs = readdirSync(TRANSCRIPTS_DIR);
  } catch {
    return files;
  }
  for (const dir of dirs) {
    const dirPath =
      join(TRANSCRIPTS_DIR, dir);
    try {
      const st = statSync(dirPath);
      if (!st.isDirectory()) continue;
    } catch {
      continue;
    }
    let entries;
    try {
      entries = readdirSync(dirPath);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (
        entry.endsWith('.jsonl') &&
        !entry.includes('subagent')
      ) {
        files.push(join(dirPath, entry));
      }
    }
  }
  return files;
}

// System-injected messages that look like
// user prompts but aren't actual input.
const SYSTEM_TAGS = [
  '<local-command',
  '<system-reminder',
  '<command-name',
];

function isSystemInjected(text) {
  if (!text) return false;
  const trimmed = text.trimStart();
  return SYSTEM_TAGS.some(
    (tag) => trimmed.startsWith(tag)
  );
}

function isUserPrompt(record) {
  if (record.type !== 'user') return false;
  const content =
    record?.message?.content;
  if (!content) return false;
  if (typeof content === 'string') {
    return !isSystemInjected(content);
  }
  if (Array.isArray(content)) {
    const hasToolResult = content.some(
      (c) => c.type === 'tool_result'
    );
    if (hasToolResult) return false;
    // Check array text for system tags
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');
    return !isSystemInjected(text);
  }
  return false;
}

function extractPromptText(record) {
  const content =
    record?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  }
  return '';
}

async function processTranscript(file) {
  const sessionId =
    basename(file, '.jsonl');
  const entries = [];

  let firstTs = null;
  let lastTs = null;
  let project = null;
  let ticket = null;
  let model = null;
  let summary = null;

  const rl = createInterface({
    input: createReadStream(
      file, 'utf8'
    ),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = rec.timestamp;
    if (ts && !firstTs) firstTs = ts;
    if (ts) lastTs = ts;

    if (!project && rec.cwd) {
      project = basename(rec.cwd);
    }

    if (!ticket && rec.gitBranch) {
      ticket = matchTicket(
        rec.gitBranch, config
      );
    }

    if (!model && rec?.message?.model) {
      model = rec.message.model;
    }

    if (isUserPrompt(rec)) {
      const text =
        extractPromptText(rec);
      if (text) {
        entries.push({
          ts,
          event: 'UserPromptSubmit',
          session: sessionId,
          project,
          ticket,
          prompt: text.slice(0, 500),
        });
        if (!ticket) {
          ticket = matchTicket(
            text, config
          );
        }
      }
    }

    if (rec.type === 'summary') {
      summary = rec.summary;
    }
  }

  if (!firstTs) return [];

  // Backfill ticket on earlier entries
  // now we have the final value
  for (const e of entries) {
    if (!e.ticket && ticket) {
      e.ticket = ticket;
    }
  }

  return [
    {
      ts: firstTs,
      event: 'SessionStart',
      session: sessionId,
      project,
      ticket,
      model,
      source: 'backfill',
    },
    ...entries,
    {
      ts: lastTs,
      event: 'SessionEnd',
      session: sessionId,
      project,
      ticket,
      summary: summary || undefined,
      source: 'backfill',
    },
  ];
}

function stripNulls(obj) {
  return Object.fromEntries(
    Object.entries(obj)
      .filter(([, v]) => v != null)
  );
}

async function main() {
  const transcripts = findTranscripts();
  console.error(
    `Processing ${transcripts.length}` +
    ' transcripts...'
  );

  mkdirSync(
    TIMELOG_DIR, { recursive: true }
  );
  const byDate = new Map();
  let total = 0;

  for (
    let i = 0;
    i < transcripts.length;
    i++
  ) {
    const entries =
      await processTranscript(
        transcripts[i]
      );

    for (const entry of entries) {
      const date =
        entry.ts?.slice(0, 10) ||
        'unknown';
      if (!byDate.has(date)) {
        byDate.set(date, []);
      }
      byDate.get(date).push(entry);
      total++;
    }

    if ((i + 1) % 100 === 0) {
      console.error(
        `  ${i + 1}` +
        `/${transcripts.length}...`
      );
    }
  }

  for (const [date, entries] of byDate) {
    const sorted = entries.sort(
      (a, b) =>
        (a.ts || '').localeCompare(
          b.ts || ''
        )
    );
    const path =
      join(TIMELOG_DIR, `${date}.jsonl`);
    const lines = sorted
      .map(
        (e) =>
          JSON.stringify(stripNulls(e))
      )
      .join('\n');
    appendFileSync(path, lines + '\n');
  }

  console.error(
    `Done. ${total} entries across ` +
    `${byDate.size} days.`
  );
  console.error(`Output: ${TIMELOG_DIR}`);
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
