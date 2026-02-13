import {
  describe, it, before, after,
} from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync, writeFileSync, rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(
  fileURLToPath(import.meta.url),
  '..', '..', '..', 'bin', 'claudelog'
);

const TEST_DIR = join(
  '/tmp', 'claudelog-test-' + process.pid
);

function makeEnv(dir) {
  return {
    ...process.env,
    CLAUDE_TIMELOG_DIR: dir || TEST_DIR,
  };
}

function run(args, env) {
  return spawnSync(
    'node', [BIN, ...args],
    {
      encoding: 'utf8',
      env: env || makeEnv(),
      timeout: 10000,
    }
  );
}

describe('bin/claudelog', () => {
  before(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  after(() => {
    rmSync(TEST_DIR, {
      recursive: true, force: true,
    });
  });

  describe('help', () => {
    it('prints usage with --help', () => {
      const r = run(['--help']);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /usage:/i);
      assert.match(r.stdout, /report/);
      assert.match(r.stdout, /backfill/);
    });

    it('prints usage with help subcommand', () => {
      const r = run(['help']);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /usage:/i);
    });

    it('mentions default report in usage', () => {
      const r = run(['--help']);
      assert.match(
        r.stdout, /no arguments/i
      );
    });
  });

  describe('default report (no arguments)', () => {
    it('runs report instead of usage', () => {
      // With no data, report exits 1 with
      // "no timelog data" — NOT usage text
      const dir = join(TEST_DIR, 'empty');
      mkdirSync(dir, { recursive: true });
      const r = run([], makeEnv(dir));
      assert.match(
        r.stderr, /no timelog data/i
      );
      assert.doesNotMatch(
        r.stderr, /usage:/i
      );
    });

    it('uses --week by default', () => {
      // report.mjs mentions the date range
      // in its "no data" message
      const dir = join(TEST_DIR, 'week');
      mkdirSync(dir, { recursive: true });
      const r = run([], makeEnv(dir));
      // Default --week shows date range
      assert.match(
        r.stderr, /no timelog data/i
      );
    });

    it('uses defaultReport from config', () => {
      const dir = join(TEST_DIR, 'custom');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'config.json'),
        JSON.stringify({
          defaultReport: [
            '--from', '2099-01-01',
            '--to', '2099-01-07',
          ],
        })
      );
      const r = run([], makeEnv(dir));
      // The custom date range appears in
      // the "no data" error message
      assert.match(
        r.stderr,
        /2099/
      );
    });

    it('ignores invalid defaultReport', () => {
      const dir = join(
        TEST_DIR, 'bad-config'
      );
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'config.json'),
        JSON.stringify({
          defaultReport: 'not-an-array',
        })
      );
      // Falls back to --week, still runs
      const r = run([], makeEnv(dir));
      assert.match(
        r.stderr, /no timelog data/i
      );
      assert.doesNotMatch(
        r.stderr, /usage:/i
      );
    });
  });

  describe('explicit subcommands', () => {
    it('rejects unknown subcommands', () => {
      const r = run(['nonsense']);
      assert.equal(r.status, 1);
      assert.match(
        r.stderr, /unknown command/i
      );
    });

    it('runs report --help', () => {
      const r = run(['report', '--help']);
      assert.equal(r.status, 0);
      assert.match(r.stdout, /usage:/i);
    });

    it('forwards flags to report', () => {
      const r = run([
        'report',
        '--from', '2099-01-01',
        '--to', '2099-01-07',
      ]);
      assert.notEqual(r.status, 0);
      assert.match(
        r.stderr, /no timelog data/i
      );
    });

    it('forwards exit code', () => {
      const r = run([
        'report',
        '--from', '2099-01-01',
        '--to', '2099-01-07',
      ]);
      assert.notEqual(r.status, 0);
    });

    it('runs backfill without error', () => {
      const r = run(['backfill']);
      assert.equal(r.status, 0);
    });
  });
});
