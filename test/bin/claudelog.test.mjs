import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(
  fileURLToPath(import.meta.url),
  '..', '..', '..', 'bin', 'claudelog'
);

const ENV = {
  ...process.env,
  CLAUDE_TIMELOG_DIR: '/tmp/claudelog-test',
};

function run(...args) {
  return spawnSync('node', [BIN, ...args], {
    encoding: 'utf8',
    env: ENV,
    timeout: 10000,
  });
}

describe('bin/claudelog', () => {
  it('prints usage with no arguments', () => {
    const r = run();
    assert.equal(r.status, 1);
    assert.match(r.stderr, /usage:/i);
    assert.match(r.stderr, /claudelog/);
    assert.match(r.stderr, /report/);
    assert.match(r.stderr, /backfill/);
  });

  it('prints usage with --help', () => {
    const r = run('--help');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /usage:/i);
    assert.match(r.stdout, /report/);
    assert.match(r.stdout, /backfill/);
  });

  it('prints usage with help subcommand', () => {
    const r = run('help');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /usage:/i);
  });

  it('rejects unknown subcommands', () => {
    const r = run('nonsense');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown command/i);
  });

  it('runs report --help without error', () => {
    const r = run('report', '--help');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /usage:/i);
  });

  it('forwards exit code from subcommand', () => {
    // Far-future range guarantees no data
    const r = run(
      'report',
      '--from', '2099-01-01',
      '--to', '2099-01-07'
    );
    assert.notEqual(r.status, 0);
    assert.match(
      r.stderr, /no timelog data/i
    );
  });

  it('runs backfill without error', () => {
    const r = run('backfill');
    assert.equal(r.status, 0);
  });
});
