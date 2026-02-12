import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import {
  writeFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { processTranscript } from
  '../../scripts/backfill.mjs';
import {
  makeTranscriptRecords,
  DEFAULT_CONFIG,
} from '../helpers/fixtures.mjs';

describe('backfill integration', () => {
  it(
    'processes same transcript twice ' +
    'with identical results',
    async () => {
      const tmpDir = mkdtempSync(
        join(tmpdir(), 'backfill-int-')
      );
      try {
        const tmpFile = join(
          tmpDir, 'test.jsonl'
        );
        const records =
          makeTranscriptRecords();
        const lines = records
          .map((r) => JSON.stringify(r))
          .join('\n');
        writeFileSync(tmpFile, lines);

        const run1 =
          await processTranscript(
            tmpFile, DEFAULT_CONFIG
          );
        const run2 =
          await processTranscript(
            tmpFile, DEFAULT_CONFIG
          );

        assert.deepEqual(run1, run2);
      } finally {
        rmSync(tmpDir, {
          recursive: true,
        });
      }
    }
  );

  it(
    'returns entries sorted ' +
    'by timestamp',
    async () => {
      const tmpDir = mkdtempSync(
        join(tmpdir(), 'backfill-int-')
      );
      try {
        const tmpFile = join(
          tmpDir, 'test.jsonl'
        );
        const records =
          makeTranscriptRecords();
        const lines = records
          .map((r) => JSON.stringify(r))
          .join('\n');
        writeFileSync(tmpFile, lines);

        const entries =
          await processTranscript(
            tmpFile, DEFAULT_CONFIG
          );

        for (
          let i = 0;
          i < entries.length - 1;
          i++
        ) {
          const t1 = new Date(
            entries[i].ts
          ).getTime();
          const t2 = new Date(
            entries[i + 1].ts
          ).getTime();
          assert.ok(
            t1 <= t2,
            'Entries should be sorted ' +
            'by timestamp'
          );
        }
      } finally {
        rmSync(tmpDir, {
          recursive: true,
        });
      }
    }
  );
});
