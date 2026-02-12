import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert/strict';
import {
  writeFileSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  makeSessionEntries,
  makeConcurrentEntries,
} from '../helpers/fixtures.mjs';
import {
  parseEntries,
  buildSlices,
  aggregate,
} from '../../scripts/report.mjs';

describe('report integration', () => {
  it(
    'runs end-to-end pipeline ' +
    'with known totals',
    async () => {
      const tmpDir = mkdtempSync(
        join(tmpdir(), 'report-int-')
      );
      try {
        const tmpFile = join(
          tmpDir, '2026-02-10.jsonl'
        );
        const entries =
          makeSessionEntries();
        const lines = entries
          .map((e) => JSON.stringify(e))
          .join('\n');
        writeFileSync(
          tmpFile, lines + '\n'
        );

        const parsed =
          await parseEntries([tmpFile]);
        assert.equal(
          parsed.length, entries.length
        );

        const breakMs = 1800 * 1000;
        const slices = buildSlices(
          parsed, breakMs
        );

        const byProject = aggregate(
          slices,
          (s) => s.project || '(unknown)'
        );

        const myApp = byProject.get(
          'my-app'
        );
        const otherApp = byProject.get(
          'other-app'
        );

        assert.ok(
          myApp, 'my-app should exist'
        );
        assert.ok(
          otherApp,
          'other-app should exist'
        );

        assert.equal(
          myApp.prompts, 2
        );
        assert.equal(
          otherApp.prompts, 1
        );
      } finally {
        rmSync(tmpDir, {
          recursive: true,
        });
      }
    }
  );

  it(
    'filters entries by date range',
    async () => {
      const tmpDir = mkdtempSync(
        join(tmpdir(), 'report-int-')
      );
      try {
        const file1 = join(
          tmpDir, '2026-02-10.jsonl'
        );
        const file2 = join(
          tmpDir, '2026-02-11.jsonl'
        );

        const entries1 =
          makeSessionEntries();
        const entries2 =
          makeConcurrentEntries();

        writeFileSync(
          file1,
          entries1
            .map((e) => JSON.stringify(e))
            .join('\n') + '\n'
        );
        writeFileSync(
          file2,
          entries2
            .map((e) => JSON.stringify(e))
            .join('\n') + '\n'
        );

        const parsed1 =
          await parseEntries([file1]);
        const parsed2 =
          await parseEntries([file2]);
        const parsedBoth =
          await parseEntries([
            file1, file2,
          ]);

        assert.equal(
          parsed1.length,
          entries1.length
        );
        assert.equal(
          parsed2.length,
          entries2.length
        );
        assert.equal(
          parsedBoth.length,
          entries1.length +
          entries2.length
        );
      } finally {
        rmSync(tmpDir, {
          recursive: true,
        });
      }
    }
  );

  it(
    'handles empty JSONL file correctly',
    async () => {
      const tmpDir = mkdtempSync(
        join(tmpdir(), 'report-int-')
      );
      try {
        const tmpFile = join(
          tmpDir, '2026-02-10.jsonl'
        );
        writeFileSync(tmpFile, '');

        const parsed =
          await parseEntries([tmpFile]);
        assert.deepEqual(parsed, []);
      } finally {
        rmSync(tmpDir, {
          recursive: true,
        });
      }
    }
  );
});
