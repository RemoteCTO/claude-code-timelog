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
  isSystemInjected,
  isUserPrompt,
  extractPromptText,
  processTranscript,
  stripNulls,
} from '../../scripts/backfill.mjs';
import {
  makeTranscriptRecords,
  DEFAULT_CONFIG,
} from '../helpers/fixtures.mjs';

describe('backfill', () => {
  describe('isSystemInjected', () => {
    it('returns true for local-command tag', () => {
      const result = isSystemInjected(
        '<local-command foo'
      );
      assert.equal(result, true);
    });

    it(
      'returns true for system-reminder tag',
      () => {
        const result = isSystemInjected(
          '<system-reminder context'
        );
        assert.equal(result, true);
      }
    );

    it('returns true for command-name tag',
      () => {
        const result = isSystemInjected(
          '<command-name exec'
        );
        assert.equal(result, true);
      }
    );

    it('returns false for normal text',
      () => {
        const result = isSystemInjected(
          'Fix auth bug'
        );
        assert.equal(result, false);
      }
    );

    it(
      'returns false for null/undefined',
      () => {
        assert.equal(
          isSystemInjected(null), false
        );
        assert.equal(
          isSystemInjected(undefined),
          false
        );
      }
    );

    it(
      'handles leading whitespace before tags',
      () => {
        const result = isSystemInjected(
          '  <local-command foo'
        );
        assert.equal(result, true);
      }
    );
  });

  describe('isUserPrompt', () => {
    it(
      'returns true for type:user ' +
      'with string content',
      () => {
        const record = {
          type: 'user',
          message: {
            content: 'Fix bug',
          },
        };
        assert.equal(
          isUserPrompt(record), true
        );
      }
    );

    it(
      'returns false for type:assistant',
      () => {
        const record = {
          type: 'assistant',
          message: {
            content: 'Sure',
          },
        };
        assert.equal(
          isUserPrompt(record), false
        );
      }
    );

    it(
      'returns false for records with ' +
      'tool_result in array content',
      () => {
        const record = {
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                content: 'ok',
              },
            ],
          },
        };
        assert.equal(
          isUserPrompt(record), false
        );
      }
    );

    it(
      'returns false for ' +
      'system-injected content',
      () => {
        const record = {
          type: 'user',
          message: {
            content:
              '<system-reminder context',
          },
        };
        assert.equal(
          isUserPrompt(record), false
        );
      }
    );

    it('returns false for null content',
      () => {
        const record = {
          type: 'user',
          message: {
            content: null,
          },
        };
        assert.equal(
          isUserPrompt(record), false
        );
      }
    );

    it(
      'returns true for array content ' +
      'with only text blocks',
      () => {
        const record = {
          type: 'user',
          message: {
            content: [
              { type: 'text',
                text: 'Hello' },
              { type: 'text',
                text: 'World' },
            ],
          },
        };
        assert.equal(
          isUserPrompt(record), true
        );
      }
    );
  });

  describe('extractPromptText', () => {
    it('returns string content directly',
      () => {
        const record = {
          message: {
            content: 'Fix auth bug',
          },
        };
        const result =
          extractPromptText(record);
        assert.equal(
          result, 'Fix auth bug'
        );
      }
    );

    it(
      'joins array text blocks ' +
      'with newline',
      () => {
        const record = {
          message: {
            content: [
              { type: 'text',
                text: 'Line 1' },
              { type: 'text',
                text: 'Line 2' },
            ],
          },
        };
        const result =
          extractPromptText(record);
        assert.equal(
          result, 'Line 1\nLine 2'
        );
      }
    );

    it(
      'returns empty string for ' +
      'null content',
      () => {
        const record = {
          message: { content: null },
        };
        const result =
          extractPromptText(record);
        assert.equal(result, '');
      }
    );

    it(
      'handles mixed array ' +
      '(text + non-text)',
      () => {
        const record = {
          message: {
            content: [
              { type: 'text',
                text: 'Hello' },
              { type: 'tool_use',
                id: '123' },
              { type: 'text',
                text: 'World' },
            ],
          },
        };
        const result =
          extractPromptText(record);
        assert.equal(
          result, 'Hello\nWorld'
        );
      }
    );
  });

  describe('processTranscript', () => {
    it(
      'creates SessionStart, ' +
      'UserPromptSubmit, SessionEnd',
      async () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'backfill-')
        );
        try {
          const tmpFile = join(
            tmpDir, 'test.jsonl'
          );
          const records =
            makeTranscriptRecords();
          const lines = records
            .map((r) =>
              JSON.stringify(r)
            )
            .join('\n');
          writeFileSync(tmpFile, lines);

          const entries =
            await processTranscript(
              tmpFile, DEFAULT_CONFIG
            );

          assert.equal(
            entries.length, 4
          );
          assert.equal(
            entries[0].event,
            'SessionStart'
          );
          assert.equal(
            entries[1].event,
            'UserPromptSubmit'
          );
          assert.equal(
            entries[2].event,
            'UserPromptSubmit'
          );
          assert.equal(
            entries[3].event,
            'SessionEnd'
          );
        } finally {
          rmSync(tmpDir, {
            recursive: true,
          });
        }
      }
    );

    it(
      'skips system-injected prompts',
      async () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'backfill-')
        );
        try {
          const tmpFile = join(
            tmpDir, 'test.jsonl'
          );
          const records =
            makeTranscriptRecords();
          const lines = records
            .map((r) =>
              JSON.stringify(r)
            )
            .join('\n');
          writeFileSync(tmpFile, lines);

          const entries =
            await processTranscript(
              tmpFile, DEFAULT_CONFIG
            );

          const prompts = entries.filter(
            (e) =>
              e.event ===
              'UserPromptSubmit'
          );
          assert.equal(prompts.length, 2);
          assert.equal(
            prompts[0].prompt,
            'Fix the login bug'
          );
          assert.equal(
            prompts[1].prompt,
            'Now add BAN-789 tests'
          );
        } finally {
          rmSync(tmpDir, {
            recursive: true,
          });
        }
      }
    );

    it(
      'extracts ticket from prompt text',
      async () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'backfill-')
        );
        try {
          const tmpFile = join(
            tmpDir, 'test.jsonl'
          );
          const records =
            makeTranscriptRecords();
          const lines = records
            .map((r) =>
              JSON.stringify(r)
            )
            .join('\n');
          writeFileSync(tmpFile, lines);

          const entries =
            await processTranscript(
              tmpFile, DEFAULT_CONFIG
            );

          const withTicket =
            entries.filter(
              (e) => e.ticket === 'BAN-789'
            );
          assert.ok(
            withTicket.length > 0
          );
        } finally {
          rmSync(tmpDir, {
            recursive: true,
          });
        }
      }
    );

    it('detects model from message.model',
      async () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'backfill-')
        );
        try {
          const tmpFile = join(
            tmpDir, 'test.jsonl'
          );
          const records =
            makeTranscriptRecords();
          const lines = records
            .map((r) =>
              JSON.stringify(r)
            )
            .join('\n');
          writeFileSync(tmpFile, lines);

          const entries =
            await processTranscript(
              tmpFile, DEFAULT_CONFIG
            );

          const start = entries.find(
            (e) =>
              e.event === 'SessionStart'
          );
          assert.equal(
            start?.model,
            'claude-opus-4-6'
          );
        } finally {
          rmSync(tmpDir, {
            recursive: true,
          });
        }
      }
    );
  });

  describe('stripNulls', () => {
    it('removes null values', () => {
      const result = stripNulls({
        a: 1,
        b: null,
        c: 'foo',
      });
      assert.deepEqual(result, {
        a: 1,
        c: 'foo',
      });
    });

    it('removes undefined values', () => {
      const result = stripNulls({
        a: 1,
        b: undefined,
        c: 'foo',
      });
      assert.deepEqual(result, {
        a: 1,
        c: 'foo',
      });
    });

    it(
      'keeps 0, false, empty string',
      () => {
        const result = stripNulls({
          a: 0,
          b: false,
          c: '',
        });
        assert.deepEqual(result, {
          a: 0,
          b: false,
          c: '',
        });
      }
    );
  });
});
