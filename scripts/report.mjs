#!/usr/bin/env node

// Generate timelog reports: weekly/monthly
// by project, ticket, or model usage.

import {
  createReadStream,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  createInterface,
} from 'node:readline';
import {
  TIMELOG_DIR,
  loadConfig,
} from '../lib/config.mjs';

const config = loadConfig();
const BREAK_MS =
  (config.breakThreshold || 1800) * 1000;

// ── CLI parsing ──────────────────────────

const args = process.argv.slice(2);
const flags = new Set(
  args.filter((a) => a.startsWith('--'))
);
const flagArgs = {};
for (let i = 0; i < args.length; i++) {
  if (
    ['--from', '--to', '--project']
      .includes(args[i])
  ) {
    flagArgs[args[i]] = args[++i];
  }
}

const format = flags.has('--json')
  ? 'json'
  : 'text';
const period = flags.has('--month')
  ? 'month'
  : 'week';
const byTicket = flags.has('--by-ticket');
const byProject = flags.has('--by-project');
const byModel = flags.has('--by-model');
const filterProject =
  flagArgs['--project'] || null;

// Default: show by-project if nothing
// explicitly requested
const showDefault =
  !byTicket && !byProject && !byModel;

// ── Date range ───────────────────────────

function startOfWeek(d) {
  const r = new Date(d);
  const day = r.getDay();
  // Monday-based week
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

const now = new Date();
let startDate;
let endDate = now;

if (flagArgs['--from']) {
  startDate = new Date(
    flagArgs['--from'] + 'T00:00:00'
  );
}
if (flagArgs['--to']) {
  endDate = new Date(
    flagArgs['--to'] + 'T23:59:59'
  );
}

if (!flagArgs['--from']) {
  if (period === 'month') {
    startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  } else {
    startDate = startOfWeek(now);
  }
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// ── Read log files ───────────────────────

function getLogFiles() {
  if (!existsSync(TIMELOG_DIR)) {
    return [];
  }
  const start = dateKey(startDate);
  const end = dateKey(endDate);
  return readdirSync(TIMELOG_DIR)
    .filter((f) => f.endsWith('.jsonl'))
    .filter((f) => {
      const d = f.replace('.jsonl', '');
      return d >= start && d <= end;
    })
    .map((f) => join(TIMELOG_DIR, f));
}

// ── Parse entries ────────────────────────

async function parseEntries(files) {
  const entries = [];
  for (const file of files) {
    const rl = createInterface({
      input: createReadStream(file),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed
      }
    }
  }
  return entries;
}

// ── Build sessions ───────────────────────

function calcActive(events) {
  const times = events
    .map((e) => e.ts)
    .filter(Boolean)
    .map((t) => new Date(t).getTime())
    .sort((a, b) => a - b);
  if (times.length < 2) return 0;
  let active = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    if (gap < BREAK_MS) active += gap;
  }
  return active / 1000;
}

function groupSessions(entries) {
  const sessions = new Map();
  for (const e of entries) {
    if (!sessions.has(e.session)) {
      sessions.set(e.session, []);
    }
    sessions.get(e.session).push(e);
  }
  return Array.from(
    sessions.values()
  ).map((events) => {
    events.sort(
      (a, b) =>
        new Date(a.ts) - new Date(b.ts)
    );
    const start = events.find(
      (e) => e.event === 'SessionStart'
    );
    const end = events.find(
      (e) => e.event === 'SessionEnd'
    );
    const prompts = events.filter(
      (e) =>
        e.event === 'UserPromptSubmit'
    );
    const wallSec =
      start && end
        ? (new Date(end.ts) -
            new Date(start.ts)) /
          1000
        : null;
    return {
      session: events[0].session,
      project:
        start?.project ||
        prompts[0]?.project,
      ticket:
        start?.ticket ||
        prompts[0]?.ticket,
      model: start?.model,
      start: start?.ts,
      end: end?.ts,
      promptCount: prompts.length,
      duration: wallSec,
      active: calcActive(events),
    };
  });
}

// ── Filtering ────────────────────────────

function filterBy(sessions) {
  if (!filterProject) return sessions;
  const fp = filterProject.toLowerCase();
  return sessions.filter(
    (s) =>
      (s.project || '')
        .toLowerCase()
        .includes(fp)
  );
}

// ── Aggregation ──────────────────────────

function aggregate(sessions, keyFn) {
  const groups = new Map();
  for (const s of sessions) {
    const key = keyFn(s);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        sessions: 0,
        prompts: 0,
        duration: 0,
        active: 0,
      });
    }
    const g = groups.get(key);
    g.sessions += 1;
    g.prompts += s.promptCount;
    if (s.duration) {
      g.duration += s.duration;
    }
    g.active += s.active;
  }
  return groups;
}

function fmtDur(seconds) {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor(
    (seconds % 3600) / 60
  );
  if (h > 0) {
    return (
      `${h}h ` +
      `${m.toString().padStart(2, '0')}m`
    );
  }
  return `${m}m`;
}

function printGroup(label, groups) {
  console.log(`By ${label}:`);
  const sorted = [...groups].sort(
    (a, b) => b[1].active - a[1].active
  );
  for (const [key, stats] of sorted) {
    const name =
      key.length > 20
        ? key.slice(0, 19) + '~'
        : key.padEnd(20);
    console.log(
      `  ${name}` +
      `${String(stats.sessions)
        .padStart(4)} sessions,` +
      `${String(stats.prompts)
        .padStart(5)} prompts,` +
      ` ${fmtDur(stats.active)}`
    );
  }
  console.log();
}

// ── Main ─────────────────────────────────

const files = getLogFiles();
if (files.length === 0) {
  console.error(
    'No timelog files found for',
    period
  );
  process.exit(1);
}

const entries = await parseEntries(files);
const sessions = filterBy(
  groupSessions(entries)
);

if (format === 'json') {
  console.log(
    JSON.stringify(sessions, null, 2)
  );
  process.exit(0);
}

// ── Text output ──────────────────────────

const totalPrompts = sessions.reduce(
  (sum, s) => sum + s.promptCount, 0
);
const totalActive = sessions.reduce(
  (sum, s) => sum + s.active, 0
);
const totalDur = sessions.reduce(
  (sum, s) => sum + (s.duration || 0), 0
);

const periodLabel =
  flagArgs['--from']
    ? `${dateKey(startDate)}` +
      ` to ${dateKey(endDate)}`
    : `${period} starting ` +
      dateKey(startDate);

console.log(
  `Timelog Report (${periodLabel})`
);
console.log(
  `Total: ${sessions.length} sessions, ` +
  `${totalPrompts} prompts, ` +
  `${fmtDur(totalActive)} active ` +
  `(${fmtDur(totalDur)} wall)`
);
console.log();

if (byProject || showDefault) {
  const g = aggregate(
    sessions,
    (s) => s.project || '(unknown)'
  );
  printGroup('Project', g);
}

if (byTicket) {
  const g = aggregate(
    sessions,
    (s) => s.ticket || '(no ticket)'
  );
  printGroup('Ticket', g);
}

if (byModel) {
  const g = aggregate(
    sessions,
    (s) => s.model || '(unknown)'
  );
  printGroup('Model', g);
}
