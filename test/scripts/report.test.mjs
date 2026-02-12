import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
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
} from '../../scripts/report.mjs';
import {
  SESSION_A,
  SESSION_B,
  T0, T1, T3,
  makeEntry,
  makeSessionEntries,
  makeConcurrentEntries,
} from '../helpers/fixtures.mjs';

const BREAK_MS = 1800000; // 30min

describe('startOfWeek', () => {
  it('returns same Monday for Monday', () => {
    const mon = new Date(2026, 1, 9, 14, 30);
    const result = startOfWeek(mon);
    const expected = new Date(2026, 1, 9, 0, 0);
    assert.equal(
      result.getTime(), expected.getTime()
    );
    assert.equal(result.getHours(), 0);
    assert.equal(result.getMinutes(), 0);
  });

  it('returns previous Monday for Wed', () => {
    const wed = new Date(2026, 1, 11, 14, 30);
    const result = startOfWeek(wed);
    const expected = new Date(2026, 1, 9, 0, 0);
    assert.equal(
      result.getTime(), expected.getTime()
    );
  });

  it('returns prev Monday for Sunday', () => {
    const sun = new Date(2026, 1, 15, 14, 30);
    const result = startOfWeek(sun);
    const expected = new Date(2026, 1, 9, 0, 0);
    assert.equal(
      result.getTime(), expected.getTime()
    );
  });

  it('preserves time at 00:00:00', () => {
    const date = new Date(2026, 1, 12, 23, 59);
    const result = startOfWeek(date);
    assert.equal(result.getHours(), 0);
    assert.equal(result.getMinutes(), 0);
    assert.equal(result.getSeconds(), 0);
    assert.equal(
      result.getMilliseconds(), 0
    );
  });
});

describe('dateKey', () => {
  it('returns YYYY-MM-DD from Date', () => {
    const d =
      new Date('2026-02-10T14:30:00Z');
    assert.equal(dateKey(d), '2026-02-10');
  });

  it('works with UTC dates', () => {
    const d = new Date(T0);
    assert.equal(dateKey(d), '2026-02-10');
  });
});

describe('buildSlices', () => {
  describe('WHEN single session', () => {
    it('creates active slice for gap ' +
       'under breakMs', () => {
      const entries = [
        makeEntry({
          ts: T0,
          event: 'UserPromptSubmit',
        }),
        makeEntry({
          ts: T1,
          event: 'SessionEnd',
        }),
      ];
      const slices =
        buildSlices(entries, BREAK_MS);

      assert.equal(slices.length, 1);
      assert.equal(slices[0].seconds, 300);
      assert.equal(
        slices[0].isPrompt, true
      );
    });

    it('creates 0-second slice for ' +
       'prompt before break', () => {
      const entries = [
        makeEntry({
          ts: T0,
          event: 'UserPromptSubmit',
        }),
        makeEntry({
          ts: T3,
          event: 'SessionEnd',
        }),
      ];
      const slices =
        buildSlices(entries, BREAK_MS);

      assert.equal(slices.length, 1);
      assert.equal(slices[0].seconds, 0);
      assert.equal(
        slices[0].isPrompt, true
      );
    });

    it('counts last event as prompt ' +
       'if UserPromptSubmit', () => {
      const entries = [
        makeEntry({
          ts: T0,
          event: 'SessionStart',
        }),
        makeEntry({
          ts: T1,
          event: 'UserPromptSubmit',
        }),
      ];
      const slices =
        buildSlices(entries, BREAK_MS);

      assert.equal(slices.length, 2);
      assert.equal(slices[0].seconds, 300);
      assert.equal(
        slices[0].isPrompt, false
      );
      assert.equal(slices[1].seconds, 0);
      assert.equal(
        slices[1].isPrompt, true
      );
    });

    it('treats gap exactly at breakMs ' +
       'as break', () => {
      const entries = [
        makeEntry({
          ts: T0,
          event: 'UserPromptSubmit',
        }),
        makeEntry({
          ts:
            new Date(
              new Date(T0).getTime() +
              BREAK_MS
            ).toISOString(),
          event: 'SessionEnd',
        }),
      ];
      const slices =
        buildSlices(entries, BREAK_MS);

      assert.equal(slices.length, 1);
      assert.equal(slices[0].seconds, 0);
    });

    it('handles single prompt session', () => {
      const entries = [
        makeEntry({
          ts: T0,
          event: 'UserPromptSubmit',
        }),
      ];
      const slices =
        buildSlices(entries, BREAK_MS);

      assert.equal(slices.length, 1);
      assert.equal(slices[0].seconds, 0);
      assert.equal(
        slices[0].isPrompt, true
      );
    });
  });

  describe('WITH session entries', () => {
    it('creates slices with correct ' +
       'attribution', () => {
      const entries =
        makeSessionEntries();
      const slices =
        buildSlices(entries, BREAK_MS);

      // T0→T1 (5min), T1→T2 (3min),
      // T2 prompt before break (0s),
      // T3 prompt before T4 (10min)
      assert.equal(slices.length, 4);

      assert.equal(
        slices[0].project, 'my-app'
      );
      assert.equal(slices[0].ticket, null);
      assert.equal(slices[0].seconds, 300);

      assert.equal(
        slices[1].project, 'my-app'
      );
      assert.equal(
        slices[1].ticket, 'BAN-123'
      );
      assert.equal(slices[1].seconds, 180);

      assert.equal(
        slices[2].project, 'my-app'
      );
      assert.equal(
        slices[2].ticket, 'BAN-123'
      );
      assert.equal(slices[2].seconds, 0);
      assert.equal(
        slices[2].isPrompt, true
      );

      assert.equal(
        slices[3].project, 'other-app'
      );
      assert.equal(
        slices[3].ticket, 'BAN-456'
      );
      assert.equal(slices[3].seconds, 600);
    });
  });

  describe('WITH concurrent sessions', () => {
    it('handles sessions independently',
       () => {
      const entries =
        makeConcurrentEntries();
      const slices =
        buildSlices(entries, BREAK_MS);

      const sessA = slices.filter(
        (s) => s.session === SESSION_A
      );
      const sessB = slices.filter(
        (s) => s.session === SESSION_B
      );

      assert.equal(sessA.length, 2);
      assert.equal(sessB.length, 2);

      assert.equal(
        sessA[0].project, 'my-app'
      );
      assert.equal(
        sessB[0].project, 'other-app'
      );
    });
  });

  describe('WITHOUT session ID', () => {
    it('ignores entries without ' +
       'session', () => {
      const entries = [
        { ts: T0,
          event: 'UserPromptSubmit' },
        { ts: T1,
          event: 'SessionEnd' },
      ];
      const slices =
        buildSlices(entries, BREAK_MS);

      assert.equal(slices.length, 0);
    });
  });
});

describe('filterSlices', () => {
  const slices = [
    {
      session: SESSION_A,
      project: 'my-app',
      ticket: 'BAN-123',
      seconds: 300,
      isPrompt: true,
    },
    {
      session: SESSION_A,
      project: 'other-app',
      ticket: 'R21-456',
      seconds: 600,
      isPrompt: false,
    },
    {
      session: SESSION_B,
      project: null,
      ticket: null,
      seconds: 100,
      isPrompt: true,
    },
  ];

  it('filters by project ' +
     '(case-insensitive)', () => {
    const result = filterSlices(
      slices, { project: 'MY' }
    );
    assert.equal(result.length, 1);
    assert.equal(
      result[0].project, 'my-app'
    );
  });

  it('filters by ticket ' +
     '(case-insensitive)', () => {
    const result = filterSlices(
      slices, { ticket: 'r21' }
    );
    assert.equal(result.length, 1);
    assert.equal(
      result[0].ticket, 'R21-456'
    );
  });

  it('returns all when no filters', () => {
    const result = filterSlices(slices);
    assert.equal(result.length, 3);
  });

  it('handles null project/ticket', () => {
    const result = filterSlices(
      slices, { project: 'unknown' }
    );
    assert.equal(result.length, 0);
  });
});

describe('aggregate', () => {
  const slices = [
    {
      session: SESSION_A,
      project: 'my-app',
      seconds: 300,
      isPrompt: true,
    },
    {
      session: SESSION_A,
      project: 'my-app',
      seconds: 600,
      isPrompt: false,
    },
    {
      session: SESSION_B,
      project: 'other-app',
      seconds: 200,
      isPrompt: true,
    },
  ];

  it('groups by key function', () => {
    const result = aggregate(
      slices, (s) => s.project
    );
    assert.equal(result.size, 2);
    assert.ok(result.has('my-app'));
    assert.ok(result.has('other-app'));
  });

  it('counts unique sessions', () => {
    const result = aggregate(
      slices, (s) => s.project
    );
    assert.equal(
      result.get('my-app').sessions, 1
    );
  });

  it('sums active seconds', () => {
    const result = aggregate(
      slices, (s) => s.project
    );
    assert.equal(
      result.get('my-app').active, 900
    );
    assert.equal(
      result.get('other-app').active, 200
    );
  });

  it('counts prompts only', () => {
    const result = aggregate(
      slices, (s) => s.project
    );
    assert.equal(
      result.get('my-app').prompts, 1
    );
    assert.equal(
      result.get('other-app').prompts, 1
    );
  });

  it('skips slices where keyFn ' +
     'returns null', () => {
    const result = aggregate(slices, () =>
      null
    );
    assert.equal(result.size, 0);
  });
});

describe('fmtDur', () => {
  it('formats 0 seconds', () => {
    assert.equal(fmtDur(0), '0m');
  });

  it('formats 300 seconds (5min)', () => {
    assert.equal(fmtDur(300), '5m');
  });

  it('formats 3600 seconds (1h)', () => {
    assert.equal(fmtDur(3600), '1h 00m');
  });

  it('formats 3661 seconds', () => {
    assert.equal(fmtDur(3661), '1h 01m');
  });

  it('formats 7260 seconds', () => {
    assert.equal(fmtDur(7260), '2h 01m');
  });

  it('rounds 59 seconds down to 0m', () => {
    assert.equal(fmtDur(59), '0m');
  });
});

describe('fmtDate', () => {
  it('formats as Day DD Mon', () => {
    const result = fmtDate('2026-02-10');
    assert.equal(result, 'Tue 10 Feb');
  });

  it('pads single-digit day', () => {
    const result = fmtDate('2026-02-05');
    assert.equal(result, 'Thu  5 Feb');
  });
});

describe('trunc', () => {
  it('returns unchanged if within ' +
     'width', () => {
    assert.equal(trunc('abc', 5), 'abc');
  });

  it('truncates with ellipsis', () => {
    assert.equal(
      trunc('abcdef', 5), 'abcd\u2026'
    );
  });
});

describe('buildDayProjectTicket', () => {
  it('groups slices by date then ' +
     'project', () => {
    const slices = [
      {
        session: SESSION_A,
        date: '2026-02-10',
        project: 'my-app',
        ticket: 'BAN-123',
        seconds: 300,
        isPrompt: true,
      },
      {
        session: SESSION_A,
        date: '2026-02-10',
        project: 'my-app',
        ticket: 'BAN-123',
        seconds: 200,
        isPrompt: false,
      },
    ];
    const result =
      buildDayProjectTicket(slices);

    assert.equal(result.size, 1);
    const dayMap =
      result.get('2026-02-10');
    assert.ok(dayMap);
    assert.equal(dayMap.size, 1);
  });

  it('tracks tickets within projects',
     () => {
    const slices = [
      {
        session: SESSION_A,
        date: '2026-02-10',
        project: 'my-app',
        ticket: 'BAN-123',
        seconds: 300,
        isPrompt: true,
      },
      {
        session: SESSION_A,
        date: '2026-02-10',
        project: 'my-app',
        ticket: 'BAN-456',
        seconds: 200,
        isPrompt: true,
      },
    ];
    const result =
      buildDayProjectTicket(slices);

    const dayMap =
      result.get('2026-02-10');
    const proj = [...dayMap.values()][0];
    assert.equal(proj.tickets.size, 2);
    assert.ok(proj.tickets.has('BAN-123'));
    assert.ok(proj.tickets.has('BAN-456'));
  });

  it('accumulates prompts and time', () => {
    const slices = [
      {
        session: SESSION_A,
        date: '2026-02-10',
        project: 'my-app',
        ticket: null,
        seconds: 300,
        isPrompt: true,
      },
      {
        session: SESSION_A,
        date: '2026-02-10',
        project: 'my-app',
        ticket: null,
        seconds: 200,
        isPrompt: false,
      },
    ];
    const result =
      buildDayProjectTicket(slices);

    const dayMap =
      result.get('2026-02-10');
    const proj = [...dayMap.values()][0];
    assert.equal(proj.prompts, 1);
    assert.equal(proj.active, 500);
  });
});

describe('buildTimesheet', () => {
  it('groups by project with ticket ' +
     'breakdown', () => {
    const slices = [
      {
        session: SESSION_A,
        project: 'my-app',
        ticket: 'BAN-123',
        seconds: 300,
        isPrompt: true,
      },
      {
        session: SESSION_A,
        project: 'my-app',
        ticket: 'BAN-456',
        seconds: 200,
        isPrompt: false,
      },
    ];
    const result = buildTimesheet(slices);

    assert.equal(result.size, 1);
    const proj = result.get('my-app');
    assert.equal(proj.tickets.size, 2);
  });

  it('tracks sessions per project ' +
     'and ticket', () => {
    const slices = [
      {
        session: SESSION_A,
        project: 'my-app',
        ticket: 'BAN-123',
        seconds: 300,
        isPrompt: true,
      },
      {
        session: SESSION_B,
        project: 'my-app',
        ticket: 'BAN-123',
        seconds: 200,
        isPrompt: false,
      },
    ];
    const result = buildTimesheet(slices);

    const proj = result.get('my-app');
    assert.equal(proj.sessions.size, 2);

    const tkt =
      proj.tickets.get('BAN-123');
    assert.equal(tkt.sessions.size, 2);
  });

  it('uses (untracked) for null ' +
     'tickets', () => {
    const slices = [
      {
        session: SESSION_A,
        project: 'my-app',
        ticket: null,
        seconds: 300,
        isPrompt: true,
      },
    ];
    const result = buildTimesheet(slices);

    const proj = result.get('my-app');
    assert.ok(
      proj.tickets.has('(untracked)')
    );
  });

  it('uses (unknown) for null ' +
     'projects', () => {
    const slices = [
      {
        session: SESSION_A,
        project: null,
        ticket: 'BAN-123',
        seconds: 300,
        isPrompt: true,
      },
    ];
    const result = buildTimesheet(slices);

    assert.ok(result.has('(unknown)'));
  });
});
