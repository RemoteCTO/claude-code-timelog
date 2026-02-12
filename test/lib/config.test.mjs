import { describe, it } from 'node:test';
import { strict as assert }
  from 'node:assert';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadConfig,
  matchTicket,
  extractProjectFromPath,
  extractFilePaths,
  validateConfig,
} from '../../lib/config.mjs';
import { DEFAULT_CONFIG }
  from '../helpers/fixtures.mjs';

describe('lib/config', () => {
  describe('loadConfig', () => {
    it('returns defaults when no config file',
      () => {
        const cfg = loadConfig();
        assert.deepEqual(
          cfg,
          DEFAULT_CONFIG
        );
      });

    it('merges user config over defaults',
      async () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'config-test-')
        );
        try {
          const origEnv =
            process.env.CLAUDE_TIMELOG_DIR;
          process.env.CLAUDE_TIMELOG_DIR =
            tmpDir;

          mkdirSync(tmpDir, {
            recursive: true,
          });
          const configPath =
            join(tmpDir, 'config.json');
          writeFileSync(
            configPath,
            JSON.stringify({
              breakThreshold: 3600,
              projectPattern: 'custom',
            })
          );

          const { loadConfig: freshLoad } =
            await import(
              '../../lib/config.mjs?' +
              Date.now()
            );

          const cfg = freshLoad();
          assert.strictEqual(
            cfg.breakThreshold,
            3600
          );
          assert.strictEqual(
            cfg.projectPattern,
            'custom'
          );
          assert.deepEqual(
            cfg.ticketPatterns,
            DEFAULT_CONFIG.ticketPatterns
          );

          process.env.CLAUDE_TIMELOG_DIR =
            origEnv;
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });

    it('handles invalid JSON gracefully',
      async () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'config-test-')
        );
        try {
          const origEnv =
            process.env.CLAUDE_TIMELOG_DIR;
          process.env.CLAUDE_TIMELOG_DIR =
            tmpDir;

          mkdirSync(tmpDir, {
            recursive: true,
          });
          const configPath =
            join(tmpDir, 'config.json');
          writeFileSync(
            configPath,
            '{ invalid json }'
          );

          const { loadConfig: freshLoad } =
            await import(
              '../../lib/config.mjs?' +
              Date.now()
            );

          const cfg = freshLoad();
          assert.deepEqual(
            cfg,
            DEFAULT_CONFIG
          );

          process.env.CLAUDE_TIMELOG_DIR =
            origEnv;
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });
  });

  describe('matchTicket', () => {
    it('matches Jira-style ticket', () => {
      const result = matchTicket(
        'BAN-123',
        DEFAULT_CONFIG
      );
      assert.strictEqual(result, 'BAN-123');
    });

    it('matches from branch name', () => {
      const result = matchTicket(
        'feature/ban-456-fix',
        DEFAULT_CONFIG
      );
      assert.strictEqual(result, null);
    });

    it('matches from uppercase branch', () => {
      const result = matchTicket(
        'feature/BAN-456-fix',
        DEFAULT_CONFIG
      );
      assert.strictEqual(result, 'BAN-456');
    });

    it('returns capture group when pattern ' +
      'has one', () => {
        const cfg = {
          ticketPatterns: [
            'ticket-([0-9]+)',
          ],
        };
        const result = matchTicket(
          'ticket-789',
          cfg
        );
        assert.strictEqual(result, '789');
      });

    it('returns match[0] when no capture ' +
      'group', () => {
        const cfg = {
          ticketPatterns: [
            'T-\\d+',
          ],
        };
        const result = matchTicket(
          'T-123',
          cfg
        );
        assert.strictEqual(result, 'T-123');
      });

    it('returns null for no match', () => {
      const result = matchTicket(
        'no-ticket-here',
        DEFAULT_CONFIG
      );
      assert.strictEqual(result, null);
    });

    it('returns null for null input', () => {
      const result = matchTicket(
        null,
        DEFAULT_CONFIG
      );
      assert.strictEqual(result, null);
    });

    it('handles invalid regex pattern ' +
      'gracefully', () => {
        const cfg = {
          ticketPatterns: [
            '[invalid(regex',
            '([A-Z]+-\\d+)',
          ],
        };
        const result = matchTicket(
          'BAN-999',
          cfg
        );
        assert.strictEqual(result, 'BAN-999');
      });
  });

  describe('extractProjectFromPath', () => {
    it('returns null when no ' +
      'projectPattern', () => {
        const result =
          extractProjectFromPath(
            '/home/ed/projects/my-app/src/' +
            'file.js',
            DEFAULT_CONFIG
          );
        assert.strictEqual(result, null);
      });

    it('matches and returns capture group',
      () => {
        const cfg = {
          ...DEFAULT_CONFIG,
          projectPattern:
            '/projects/([^/]+)/',
        };
        const result =
          extractProjectFromPath(
            '/home/ed/projects/my-app/src/' +
            'file.js',
            cfg
          );
        assert.strictEqual(
          result,
          'my-app'
        );
      });

    it('returns match[0] when no capture ' +
      'group', () => {
        const cfg = {
          ...DEFAULT_CONFIG,
          projectPattern:
            '/projects/[^/]+',
        };
        const result =
          extractProjectFromPath(
            '/home/ed/projects/my-app/src/' +
            'file.js',
            cfg
          );
        assert.strictEqual(
          result,
          '/projects/my-app'
        );
      });

    it('returns null on no match', () => {
      const cfg = {
        ...DEFAULT_CONFIG,
        projectPattern: '/nowhere/',
      };
      const result = extractProjectFromPath(
        '/home/ed/projects/my-app/src/' +
        'file.js',
        cfg
      );
      assert.strictEqual(result, null);
    });

    it('handles null filePath', () => {
      const cfg = {
        ...DEFAULT_CONFIG,
        projectPattern: '/projects/',
      };
      const result = extractProjectFromPath(
        null,
        cfg
      );
      assert.strictEqual(result, null);
    });

    it('handles invalid regex gracefully',
      () => {
        const cfg = {
          ...DEFAULT_CONFIG,
          projectPattern: '[invalid(regex',
        };
        const result =
          extractProjectFromPath(
            '/home/ed/projects/my-app',
            cfg
          );
        assert.strictEqual(result, null);
      });
  });

  describe('extractFilePaths', () => {
    it('extracts file_path from tool_use',
      () => {
        const record = {
          message: {
            content: [
              {
                type: 'tool_use',
                input: {
                  file_path: '/home/ed/file.js',
                },
              },
            ],
          },
        };
        const paths = extractFilePaths(record);
        assert.deepEqual(paths,
          ['/home/ed/file.js']);
      });

    it('extracts path key', () => {
      const record = {
        message: {
          content: [
            {
              type: 'tool_use',
              input: {
                path: '/home/ed/other.rb',
              },
            },
          ],
        },
      };
      const paths = extractFilePaths(record);
      assert.deepEqual(paths,
        ['/home/ed/other.rb']);
    });

    it('extracts notebook_path key', () => {
      const record = {
        message: {
          content: [
            {
              type: 'tool_use',
              input: {
                notebook_path: '/home/ed/' +
                  'notebook.ipynb',
              },
            },
          ],
        },
      };
      const paths = extractFilePaths(record);
      assert.deepEqual(paths,
        ['/home/ed/notebook.ipynb']);
    });

    it('ignores non-absolute paths', () => {
      const record = {
        message: {
          content: [
            {
              type: 'tool_use',
              input: {
                file_path: 'relative/path.js',
              },
            },
          ],
        },
      };
      const paths = extractFilePaths(record);
      assert.deepEqual(paths, []);
    });

    it('extracts multiple paths from same ' +
      'record', () => {
        const record = {
          message: {
            content: [
              {
                type: 'tool_use',
                input: {
                  file_path: '/home/ed/a.js',
                },
              },
              {
                type: 'tool_use',
                input: {
                  path: '/home/ed/b.rb',
                },
              },
            ],
          },
        };
        const paths = extractFilePaths(record);
        assert.deepEqual(paths,
          ['/home/ed/a.js', '/home/ed/b.rb']);
      });

    it('handles records without message.' +
      'content array', () => {
        const record = {
          message: {
            content: 'plain text',
          },
        };
        const paths = extractFilePaths(record);
        assert.deepEqual(paths, []);
      });

    it('handles records without message',
      () => {
        const record = {
          type: 'user',
        };
        const paths = extractFilePaths(record);
        assert.deepEqual(paths, []);
      });

    it('returns empty for non-tool_use ' +
      'blocks', () => {
        const record = {
          message: {
            content: [
              {
                type: 'text',
                text: 'some text',
              },
            ],
          },
        };
        const paths = extractFilePaths(record);
        assert.deepEqual(paths, []);
      });

    it('handles missing input field', () => {
      const record = {
        message: {
          content: [
            {
              type: 'tool_use',
            },
          ],
        },
      };
      const paths = extractFilePaths(record);
      assert.deepEqual(paths, []);
    });
  });

  describe('validateConfig', () => {
    it('passes valid config through',
      () => {
        const cfg = validateConfig(
          DEFAULT_CONFIG
        );
        assert.deepEqual(
          cfg, DEFAULT_CONFIG
        );
      });

    describe('breakThreshold', () => {
      it('rejects negative values', () => {
        const cfg = validateConfig({
          ...DEFAULT_CONFIG,
          breakThreshold: -1,
        });
        assert.strictEqual(
          cfg.breakThreshold, 1800
        );
      });

      it('rejects values over 86400',
        () => {
          const cfg = validateConfig({
            ...DEFAULT_CONFIG,
            breakThreshold: 100000,
          });
          assert.strictEqual(
            cfg.breakThreshold, 1800
          );
        });

      it('rejects non-numeric values',
        () => {
          const cfg = validateConfig({
            ...DEFAULT_CONFIG,
            breakThreshold: 'foo',
          });
          assert.strictEqual(
            cfg.breakThreshold, 1800
          );
        });

      it('accepts valid threshold',
        () => {
          const cfg = validateConfig({
            ...DEFAULT_CONFIG,
            breakThreshold: 3600,
          });
          assert.strictEqual(
            cfg.breakThreshold, 3600
          );
        });
    });

    describe('ticketPatterns', () => {
      it('rejects non-array', () => {
        const cfg = validateConfig({
          ...DEFAULT_CONFIG,
          ticketPatterns: 'not-array',
        });
        assert.deepEqual(
          cfg.ticketPatterns,
          DEFAULT_CONFIG.ticketPatterns
        );
      });

      it('filters non-string entries',
        () => {
          const cfg = validateConfig({
            ...DEFAULT_CONFIG,
            ticketPatterns: [
              'valid', 123, null,
            ],
          });
          assert.deepEqual(
            cfg.ticketPatterns, ['valid']
          );
        });
    });

    describe('projectSource', () => {
      it('rejects invalid values', () => {
        const cfg = validateConfig({
          ...DEFAULT_CONFIG,
          projectSource: 'invalid',
        });
        assert.strictEqual(
          cfg.projectSource, 'git-root'
        );
      });

      it('accepts cwd', () => {
        const cfg = validateConfig({
          ...DEFAULT_CONFIG,
          projectSource: 'cwd',
        });
        assert.strictEqual(
          cfg.projectSource, 'cwd'
        );
      });
    });

    describe('projectPattern', () => {
      it('rejects nested quantifiers',
        () => {
          const cfg = validateConfig({
            ...DEFAULT_CONFIG,
            projectPattern: '(.+)+',
          });
          assert.strictEqual(
            cfg.projectPattern, null
          );
        });

      it('accepts safe patterns', () => {
        const cfg = validateConfig({
          ...DEFAULT_CONFIG,
          projectPattern:
            '/projects/([^/]+)/',
        });
        assert.strictEqual(
          cfg.projectPattern,
          '/projects/([^/]+)/'
        );
      });
    });
  });
});
