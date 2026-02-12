#!/usr/bin/env node

// Generate timelog reports from JSONL events.
// Aggregates at event level — accurate when
// projects/tickets change mid-session.

import {
  createReadStream,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  createInterface,
} from 'node:readline';
import { fileURLToPath } from 'node:url';
import {
  TIMELOG_DIR,
  loadConfig,
} from '../lib/config.mjs';

// ── Date helpers ────────────────────────

function startOfWeek(d) {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  r.setHours(0, 0, 0, 0);
  return r;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

// ── Parse entries ───────────────────────

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

// ── Event-level time slicing ────────────
//
// Algorithm:
// 1. Group all entries by session ID
// 2. Sort each session's events by timestamp
// 3. Walk consecutive pairs (i, i+1):
//    - If gap < breakThreshold → active slice
//      attributed to event[i]'s project/ticket
//    - If gap >= breakThreshold → break; if
//      event[i] is a prompt, record 0-second
//      slice (counts the prompt but not idle)
// 4. Last event: if prompt, record 0-second
//    slice (no following event to measure to)
//
// This handles mid-session project switches
// and concurrent sessions accurately because
// each slice carries its own project/ticket
// from the event that started it.

function buildSlices(entries, breakMs) {
  const bySession = new Map();
  for (const e of entries) {
    if (!e.session) continue;
    if (!bySession.has(e.session)) {
      bySession.set(e.session, []);
    }
    bySession.get(e.session).push(e);
  }

  const slices = [];

  for (const [sid, events] of bySession) {
    events.sort(
      (a, b) =>
        new Date(a.ts) - new Date(b.ts)
    );

    for (
      let i = 0;
      i < events.length - 1;
      i++
    ) {
      const curr = events[i];
      const next = events[i + 1];
      const t0 =
        new Date(curr.ts).getTime();
      const t1 =
        new Date(next.ts).getTime();
      const gap = t1 - t0;

      if (gap > 0 && gap < breakMs) {
        slices.push({
          session: sid,
          project: curr.project,
          ticket: curr.ticket,
          model: curr.model,
          date: dateKey(new Date(t0)),
          seconds: gap / 1000,
          isPrompt:
            curr.event ===
            'UserPromptSubmit',
        });
      } else if (
        curr.event === 'UserPromptSubmit'
      ) {
        slices.push({
          session: sid,
          project: curr.project,
          ticket: curr.ticket,
          model: curr.model,
          date: dateKey(new Date(t0)),
          seconds: 0,
          isPrompt: true,
        });
      }
    }

    const last =
      events[events.length - 1];
    if (
      last?.event === 'UserPromptSubmit'
    ) {
      slices.push({
        session: sid,
        project: last.project,
        ticket: last.ticket,
        model: last.model,
        date: dateKey(
          new Date(last.ts)
        ),
        seconds: 0,
        isPrompt: true,
      });
    }
  }

  return slices;
}

// ── Filtering ───────────────────────────

function filterSlices(slices, opts = {}) {
  let result = slices;
  if (opts.project) {
    const fp = opts.project.toLowerCase();
    result = result.filter(
      (s) =>
        (s.project || '')
          .toLowerCase()
          .includes(fp)
    );
  }
  if (opts.ticket) {
    const ft = opts.ticket.toUpperCase();
    result = result.filter(
      (s) =>
        (s.ticket || '')
          .toUpperCase()
          .includes(ft)
    );
  }
  return result;
}

// ── Aggregation ─────────────────────────

function aggregate(slices, keyFn) {
  const groups = new Map();
  for (const s of slices) {
    const key = keyFn(s);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        sessions: new Set(),
        prompts: 0,
        active: 0,
      });
    }
    const g = groups.get(key);
    g.sessions.add(s.session);
    if (s.isPrompt) g.prompts += 1;
    g.active += s.seconds;
  }
  const result = new Map();
  for (const [key, g] of groups) {
    result.set(key, {
      sessions: g.sessions.size,
      prompts: g.prompts,
      active: g.active,
    });
  }
  return result;
}

// ── Formatting ──────────────────────────

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

const DAYS = [
  'Sun', 'Mon', 'Tue', 'Wed',
  'Thu', 'Fri', 'Sat',
];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr',
  'May', 'Jun', 'Jul', 'Aug',
  'Sep', 'Oct', 'Nov', 'Dec',
];

function fmtDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  const dd =
    d.getDate().toString().padStart(2);
  return (
    `${DAYS[d.getDay()]} ${dd} ` +
    MONTHS[d.getMonth()]
  );
}

function trunc(str, w) {
  if (str.length <= w) return str;
  return str.slice(0, w - 1) + '\u2026';
}

// ── Day x Project x Ticket ─────────────

function buildDayProjectTicket(slices) {
  const days = new Map();
  for (const s of slices) {
    const proj =
      s.project || '(unknown)';
    const tkt = s.ticket || null;
    const dk = s.date;
    const pk = `${dk}\t${proj}`;

    if (!days.has(dk)) {
      days.set(dk, new Map());
    }
    const dayMap = days.get(dk);

    if (!dayMap.has(pk)) {
      dayMap.set(pk, {
        date: dk,
        project: proj,
        prompts: 0,
        active: 0,
        tickets: new Map(),
      });
    }
    const pg = dayMap.get(pk);
    if (s.isPrompt) pg.prompts += 1;
    pg.active += s.seconds;

    if (tkt) {
      if (!pg.tickets.has(tkt)) {
        pg.tickets.set(tkt, {
          prompts: 0,
          active: 0,
        });
      }
      const tg = pg.tickets.get(tkt);
      if (s.isPrompt) tg.prompts += 1;
      tg.active += s.seconds;
    }
  }
  return days;
}

// ── Timesheet: Project → Ticket ─────────

function buildTimesheet(slices) {
  const projects = new Map();
  for (const s of slices) {
    const proj =
      s.project || '(unknown)';
    if (!projects.has(proj)) {
      projects.set(proj, {
        sessions: new Set(),
        prompts: 0,
        active: 0,
        tickets: new Map(),
      });
    }
    const pg = projects.get(proj);
    pg.sessions.add(s.session);
    if (s.isPrompt) pg.prompts += 1;
    pg.active += s.seconds;

    const tkt =
      s.ticket || '(untracked)';
    if (!pg.tickets.has(tkt)) {
      pg.tickets.set(tkt, {
        sessions: new Set(),
        prompts: 0,
        active: 0,
      });
    }
    const tg = pg.tickets.get(tkt);
    tg.sessions.add(s.session);
    if (s.isPrompt) tg.prompts += 1;
    tg.active += s.seconds;
  }
  return projects;
}

// ── Exports ─────────────────────────────

export {
  startOfWeek,
  dateKey,
  buildSlices,
  filterSlices,
  aggregate,
  fmtDur,
  fmtDate,
  trunc,
  buildDayProjectTicket,
  buildTimesheet,
  parseEntries,
};

// ── CLI (only when run directly) ────────

if (
  process.argv[1] ===
  fileURLToPath(import.meta.url)
) {
  const USAGE = `Usage: report.mjs [options]

Period:
  --week          This week (default)
  --month         This month

Grouping:
  --by-project    Group by project (default)
  --by-ticket     Group by ticket
  --by-model      Group by model
  --by-day        Group by day
  --timesheet     Project → ticket breakdown

Filters:
  --from DATE     Start date (YYYY-MM-DD)
  --to DATE       End date (YYYY-MM-DD)
  --project NAME  Filter by project
  --ticket ID     Filter by ticket

Output:
  --json          JSON output
  --help          Show this help

Examples:
  report.mjs --week --by-ticket
  report.mjs --from 2026-02-01 --to 2026-02-14
  report.mjs --timesheet --project my-app`;

  const KNOWN_FLAGS = new Set([
    '--week', '--month',
    '--by-project', '--by-ticket',
    '--by-model', '--by-day',
    '--timesheet',
    '--from', '--to',
    '--project', '--ticket',
    '--json', '--help',
  ]);

  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const config = loadConfig();
  const breakMs =
    (config.breakThreshold || 1800)
    * 1000;

  const args = process.argv.slice(2);
  const flags = new Set(
    args.filter(
      (a) => a.startsWith('--')
    )
  );

  if (flags.has('--help')) {
    console.log(USAGE);
    process.exit(0);
  }

  // Warn on unknown flags
  for (const f of flags) {
    if (!KNOWN_FLAGS.has(f)) {
      console.error(
        `Unknown flag: ${f}\n` +
        'Run with --help for usage.'
      );
      process.exit(2);
    }
  }

  const flagArgs = {};
  for (let i = 0; i < args.length; i++) {
    if (
      [
        '--from', '--to',
        '--project', '--ticket',
      ].includes(args[i])
    ) {
      flagArgs[args[i]] = args[++i];
    }
  }

  // Validate date formats
  for (
    const key of ['--from', '--to']
  ) {
    if (
      flagArgs[key] &&
      !DATE_RE.test(flagArgs[key])
    ) {
      console.error(
        `Invalid date for ${key}: ` +
        `${flagArgs[key]}\n` +
        'Expected YYYY-MM-DD format.'
      );
      process.exit(2);
    }
  }

  const format = flags.has('--json')
    ? 'json'
    : 'text';
  const period = flags.has('--month')
    ? 'month'
    : 'week';
  const byTicket =
    flags.has('--by-ticket');
  const byProject =
    flags.has('--by-project');
  const byModel =
    flags.has('--by-model');
  const byDay = flags.has('--by-day');
  const timesheet =
    flags.has('--timesheet');
  const fpArg =
    flagArgs['--project'] || null;
  const ftArg =
    flagArgs['--ticket'] || null;

  const showDefault =
    !byTicket && !byProject
    && !byModel && !byDay
    && !timesheet;

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

  function getLogFiles() {
    if (!existsSync(TIMELOG_DIR)) return [];
    const start = dateKey(startDate);
    const end = dateKey(endDate);
    return readdirSync(TIMELOG_DIR)
      .filter(
        (f) => f.endsWith('.jsonl')
      )
      .filter((f) => {
        const d = f.replace('.jsonl', '');
        return d >= start && d <= end;
      })
      .map((f) => join(TIMELOG_DIR, f));
  }

  function printTable(cols, rows, label) {
    if (label) console.log(label);
    const hdr = cols.map((c) =>
      c.align === 'right'
        ? c.header.padStart(c.width)
        : c.header.padEnd(c.width)
    ).join('  ');
    console.log(hdr);
    console.log(
      cols.map((c) =>
        '\u2500'.repeat(c.width)
      ).join('  ')
    );
    for (const row of rows) {
      const line = cols.map((c, i) => {
        const val = String(row[i] ?? '');
        const t = trunc(val, c.width);
        return c.align === 'right'
          ? t.padStart(c.width)
          : t.padEnd(c.width);
      }).join('  ');
      console.log(line);
    }
    console.log();
  }

  function printGroupTable(label, groups) {
    const sorted = [...groups].sort(
      (a, b) => b[1].active - a[1].active
    );
    const cols = [
      { header: label,
        width: 22, align: 'left' },
      { header: 'Active',
        width: 7, align: 'right' },
      { header: 'Sess',
        width: 4, align: 'right' },
      { header: 'Prompts',
        width: 7, align: 'right' },
    ];
    const tableRows = sorted.map(
      ([key, s]) => [
        key,
        fmtDur(s.active),
        s.sessions,
        s.prompts,
      ]
    );
    printTable(cols, tableRows);
  }

  const DP_COLS = [
    { header: 'Date',
      width: 10, align: 'left' },
    { header: 'Project / Ticket',
      width: 24, align: 'left' },
    { header: 'Active',
      width: 8, align: 'right' },
    { header: 'Prompts',
      width: 7, align: 'right' },
  ];
  const DP_SEP =
    DP_COLS.map((c) =>
      '\u2500'.repeat(c.width)
    ).join('  ');

  function printDayProject(slices) {
    const days =
      buildDayProjectTicket(slices);
    const sortedDays = [...days.keys()]
      .sort();

    const hdr = DP_COLS.map((c) =>
      c.align === 'right'
        ? c.header.padStart(c.width)
        : c.header.padEnd(c.width)
    ).join('  ');
    console.log(hdr);
    console.log(DP_SEP);

    for (const dk of sortedDays) {
      const projects =
        [...days.get(dk).values()]
          .sort(
            (a, b) =>
              b.active - a.active
          );
      let showDate = true;

      for (const pg of projects) {
        const date = showDate
          ? fmtDate(dk) : '';
        showDate = false;

        console.log(
          date.padEnd(10) + '  ' +
          trunc(pg.project, 24)
            .padEnd(24) +
          '  ' +
          fmtDur(pg.active)
            .padStart(8) +
          '  ' +
          String(pg.prompts)
            .padStart(7)
        );

        if (pg.tickets.size === 0) {
          continue;
        }
        const tickets = [...pg.tickets]
          .sort(
            (a, b) =>
              b[1].active - a[1].active
          );
        for (
          const [tkt, tg] of tickets
        ) {
          console.log(
            ''.padEnd(10) + '  ' +
            ('  ' + trunc(tkt, 22))
              .padEnd(24) +
            '  ' +
            fmtDur(tg.active)
              .padStart(8) +
            '  ' +
            String(tg.prompts)
              .padStart(7)
          );
        }
      }
    }
    console.log();
  }

  const TS_COLS = [
    { header: 'Project / Ticket',
      width: 28, align: 'left' },
    { header: 'Active',
      width: 8, align: 'right' },
    { header: 'Sess',
      width: 4, align: 'right' },
    { header: 'Prompts',
      width: 7, align: 'right' },
  ];
  const TS_SEP =
    '\u2500'.repeat(28) + '  ' +
    '\u2500'.repeat(8) + '  ' +
    '\u2500'.repeat(4) + '  ' +
    '\u2500'.repeat(7);

  function printTimesheet(slices) {
    const projects =
      buildTimesheet(slices);
    const sorted = [...projects].sort(
      (a, b) => b[1].active - a[1].active
    );

    const hdr = TS_COLS.map((c) =>
      c.align === 'right'
        ? c.header.padStart(c.width)
        : c.header.padEnd(c.width)
    ).join('  ');
    console.log(hdr);
    console.log(TS_SEP);

    for (const [proj, pg] of sorted) {
      console.log(
        trunc(proj, 28).padEnd(28) +
        '  ' +
        fmtDur(pg.active)
          .padStart(8) +
        '  ' +
        String(pg.sessions.size)
          .padStart(4) +
        '  ' +
        String(pg.prompts)
          .padStart(7)
      );

      const tickets = [...pg.tickets]
        .sort(
          (a, b) =>
            b[1].active - a[1].active
        );
      for (
        const [tkt, tg] of tickets
      ) {
        console.log(
          ('  ' + trunc(tkt, 26))
            .padEnd(28) +
          '  ' +
          fmtDur(tg.active)
            .padStart(8) +
          '  ' +
          String(tg.sessions.size)
            .padStart(4) +
          '  ' +
          String(tg.prompts)
            .padStart(7)
        );
      }
    }

    console.log(TS_SEP);
    const totSess = new Set(
      slices.map((s) => s.session)
    ).size;
    const totPr = slices.filter(
      (s) => s.isPrompt
    ).length;
    const totAct = slices.reduce(
      (sum, s) => sum + s.seconds, 0
    );
    console.log(
      'Total'.padEnd(28) +
      '  ' +
      fmtDur(totAct).padStart(8) +
      '  ' +
      String(totSess).padStart(4) +
      '  ' +
      String(totPr).padStart(7)
    );
    console.log();
  }

  // ── Run ───────────────────────────────

  const files = getLogFiles();
  if (files.length === 0) {
    console.error(
      'No timelog data for ' +
      `${dateKey(startDate)} to ` +
      `${dateKey(endDate)}.\n` +
      'Run backfill first: node ' +
      'scripts/backfill.mjs'
    );
    process.exit(1);
  }

  const entries =
    await parseEntries(files);
  const slices = filterSlices(
    buildSlices(entries, breakMs),
    { project: fpArg, ticket: ftArg }
  );

  if (format === 'json') {
    const data = {};
    if (byProject || showDefault) {
      data.byProject =
        Object.fromEntries(
          aggregate(
            slices,
            (s) =>
              s.project || '(unknown)'
          )
        );
    }
    if (byTicket) {
      data.byTicket =
        Object.fromEntries(
          aggregate(
            slices,
            (s) =>
              s.ticket || '(no ticket)'
          )
        );
    }
    if (byModel) {
      data.byModel =
        Object.fromEntries(
          aggregate(
            slices,
            (s) =>
              s.model || '(unknown)'
          )
        );
    }
    if (byDay) {
      data.byDay =
        Object.fromEntries(
          aggregate(
            slices, (s) => s.date
          )
        );
    }
    console.log(
      JSON.stringify(data, null, 2)
    );
    process.exit(0);
  }

  const totalPrompts = slices.filter(
    (s) => s.isPrompt
  ).length;
  const totalActive = slices.reduce(
    (sum, s) => sum + s.seconds, 0
  );
  const totalSessions = new Set(
    slices.map((s) => s.session)
  ).size;

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
    'Total: ' +
    `${totalSessions} sessions, ` +
    `${totalPrompts} prompts, ` +
    `${fmtDur(totalActive)} active`
  );
  console.log();

  if (timesheet) printTimesheet(slices);
  if (showDefault) printDayProject(slices);

  if (byProject) {
    printGroupTable(
      'Project',
      aggregate(
        slices,
        (s) => s.project || '(unknown)'
      )
    );
  }
  if (byTicket) {
    printGroupTable(
      'Ticket',
      aggregate(
        slices,
        (s) =>
          s.ticket || '(no ticket)'
      )
    );
  }
  if (byModel) {
    printGroupTable(
      'Model',
      aggregate(
        slices,
        (s) => s.model || '(unknown)'
      )
    );
  }
  if (byDay) {
    printGroupTable(
      'Day',
      aggregate(
        slices, (s) => s.date
      )
    );
  }
}
