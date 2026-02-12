#!/usr/bin/env node

// Backfill timelog from existing Claude Code
// session transcripts. Processes all JSONL
// transcripts and writes timelog entries.

import {
  createReadStream,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  existsSync,
} from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
import {
  createInterface,
} from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  TIMELOG_DIR,
  loadConfig,
  matchTicket,
  extractProjectFromPath,
  extractFilePaths,
} from '../lib/config.mjs';

const TRANSCRIPTS_DIR =
  join(homedir(), '.claude', 'projects');

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

async function processTranscript(
  file, config
) {
  const sessionId =
    basename(file, '.jsonl');
  const entries = [];

  let firstTs = null;
  let lastTs = null;
  let fallbackProject = null;
  let currentProject = null;
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

    if (!fallbackProject && rec.cwd) {
      fallbackProject =
        basename(rec.cwd);
    }

    if (rec.type === 'assistant') {
      for (
        const fp of extractFilePaths(rec)
      ) {
        const proj =
          extractProjectFromPath(
            fp, config
          );
        if (proj) {
          currentProject = proj;
          break;
        }
      }
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
          project:
            currentProject ||
            fallbackProject,
          ticket,
          prompt: text.slice(0, 500),
          source: 'backfill',
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

  const project =
    currentProject || fallbackProject;

  for (const e of entries) {
    if (!e.ticket && ticket) {
      e.ticket = ticket;
    }
    if (
      e.project === fallbackProject &&
      currentProject
    ) {
      e.project = currentProject;
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

// ── Exports ─────────────────────────────

export {
  isSystemInjected,
  isUserPrompt,
  extractPromptText,
  processTranscript,
  stripNulls,
  SYSTEM_TAGS,
};

// ── CLI (only when run directly) ────────

if (
  process.argv[1] ===
  fileURLToPath(import.meta.url)
) {
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
      let dirEntries;
      try {
        dirEntries =
          readdirSync(dirPath);
      } catch {
        continue;
      }
      for (const entry of dirEntries) {
        if (
          entry.endsWith('.jsonl') &&
          !entry.includes('subagent')
        ) {
          files.push(
            join(dirPath, entry)
          );
        }
      }
    }
    return files;
  }

  async function main() {
    const transcripts =
      findTranscripts();
    console.error(
      `Processing ` +
      `${transcripts.length}` +
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
          transcripts[i], config
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

    const allDates =
      new Set(byDate.keys());

    if (existsSync(TIMELOG_DIR)) {
      for (
        const f of readdirSync(TIMELOG_DIR)
      ) {
        if (f.endsWith('.jsonl')) {
          allDates.add(
            f.replace('.jsonl', '')
          );
        }
      }
    }

    let preserved = 0;
    for (const date of allDates) {
      const path = join(
        TIMELOG_DIR, `${date}.jsonl`
      );

      const kept = [];
      if (existsSync(path)) {
        const raw =
          readFileSync(path, 'utf8');
        for (
          const line of raw.split('\n')
        ) {
          if (!line.trim()) continue;
          try {
            const e = JSON.parse(line);
            if (e.source !== 'backfill') {
              kept.push(e);
              preserved++;
            }
          } catch {
            // skip malformed
          }
        }
      }

      const backfill =
        byDate.get(date) || [];
      const merged =
        [...kept, ...backfill].sort(
          (a, b) =>
            (a.ts || '').localeCompare(
              b.ts || ''
            )
        );

      if (merged.length === 0) continue;

      const lines = merged
        .map(
          (e) =>
            JSON.stringify(stripNulls(e))
        )
        .join('\n');
      writeFileSync(path, lines + '\n');
    }

    console.error(
      `Done. ${total} backfill entries` +
      ` across ${byDate.size} days.`
    );
    if (preserved > 0) {
      console.error(
        `Preserved ${preserved}` +
        ' live hook entries.'
      );
    }
    console.error(
      `Output: ${TIMELOG_DIR}`
    );
  }

  main().catch((err) => {
    console.error(
      'Backfill failed:', err
    );
    process.exit(1);
  });
}
