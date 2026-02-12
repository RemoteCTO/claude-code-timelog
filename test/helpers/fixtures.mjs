// Shared test fixtures for timelog tests.

const SESSION_A = 'sess-aaa-111';
const SESSION_B = 'sess-bbb-222';

// ISO timestamps with known gaps:
// t0 → t1: 5min (active)
// t1 → t2: 3min (active)
// t2 → t3: 2h   (break at 30min default)
// t3 → t4: 10min (active)
const T0 = '2026-02-10T09:00:00.000Z';
const T1 = '2026-02-10T09:05:00.000Z';
const T2 = '2026-02-10T09:08:00.000Z';
const T3 = '2026-02-10T11:08:00.000Z';
const T4 = '2026-02-10T11:18:00.000Z';

// Second day timestamps
const T5 = '2026-02-11T10:00:00.000Z';
const T6 = '2026-02-11T10:15:00.000Z';

function makeEntry(overrides = {}) {
  return {
    ts: T0,
    event: 'UserPromptSubmit',
    session: SESSION_A,
    project: 'my-app',
    ticket: null,
    model: 'claude-opus-4-6',
    ...overrides,
  };
}

function makeSessionEntries() {
  return [
    makeEntry({
      ts: T0,
      event: 'SessionStart',
    }),
    makeEntry({
      ts: T1,
      ticket: 'BAN-123',
      prompt: 'Fix auth bug',
    }),
    makeEntry({
      ts: T2,
      ticket: 'BAN-123',
      prompt: 'Add test',
    }),
    // 2h gap (break)
    makeEntry({
      ts: T3,
      ticket: 'BAN-456',
      project: 'other-app',
      prompt: 'Deploy changes',
    }),
    makeEntry({
      ts: T4,
      event: 'SessionEnd',
    }),
  ];
}

// Two concurrent sessions on same day
function makeConcurrentEntries() {
  return [
    makeEntry({
      ts: T0,
      session: SESSION_A,
      event: 'SessionStart',
    }),
    makeEntry({
      ts: T0,
      session: SESSION_B,
      event: 'SessionStart',
      project: 'other-app',
    }),
    makeEntry({
      ts: T1,
      session: SESSION_A,
      prompt: 'Work on A',
    }),
    makeEntry({
      ts: T1,
      session: SESSION_B,
      project: 'other-app',
      prompt: 'Work on B',
    }),
    makeEntry({
      ts: T2,
      session: SESSION_A,
      event: 'SessionEnd',
    }),
    makeEntry({
      ts: T2,
      session: SESSION_B,
      project: 'other-app',
      event: 'SessionEnd',
    }),
  ];
}

// Transcript-like JSONL records
function makeTranscriptRecords() {
  return [
    {
      type: 'user',
      timestamp: T0,
      cwd: '/home/ed/projects/my-app',
      message: {
        content: 'Fix the login bug',
      },
    },
    {
      type: 'assistant',
      timestamp: T1,
      message: {
        model: 'claude-opus-4-6',
        content: [
          {
            type: 'tool_use',
            input: {
              file_path:
                '/home/ed/projects/' +
                'my-app/src/auth.js',
            },
          },
        ],
      },
    },
    {
      type: 'user',
      timestamp: T2,
      message: {
        content:
          '<system-reminder>' +
          'context here',
      },
    },
    {
      type: 'user',
      timestamp: T3,
      message: {
        content: [
          { type: 'tool_result',
            content: 'ok' },
        ],
      },
    },
    {
      type: 'user',
      timestamp: T4,
      message: {
        content: 'Now add BAN-789 tests',
      },
    },
  ];
}

const DEFAULT_CONFIG = {
  ticketPatterns: [
    '([A-Z][A-Z0-9]+-\\d+)',
  ],
  projectSource: 'git-root',
  breakThreshold: 1800,
};

export {
  DEFAULT_CONFIG,
  SESSION_A,
  SESSION_B,
  T0, T1, T2, T3, T4, T5, T6,
  makeConcurrentEntries,
  makeEntry,
  makeSessionEntries,
  makeTranscriptRecords,
};
