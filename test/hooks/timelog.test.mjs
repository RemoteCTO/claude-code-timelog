import { describe, it } from 'node:test';
import { strict as assert }
  from 'node:assert';
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  detectProjectFromCwd,
  detectTicket,
  readTail,
  stripNulls,
  TAIL_BYTES,
} from '../../hooks/timelog.mjs';
import { DEFAULT_CONFIG }
  from '../helpers/fixtures.mjs';

describe('hooks/timelog', () => {
  describe('detectProjectFromCwd', () => {
    describe('WHEN projectSource is cwd', () => {
      it('returns basename of cwd', () => {
        const cfg = {
          ...DEFAULT_CONFIG,
          projectSource: 'cwd',
        };
        const result = detectProjectFromCwd(
          '/home/ed/projects/my-app',
          cfg
        );
        assert.strictEqual(
          result,
          'my-app'
        );
      });
    });

    describe('WHEN projectSource is ' +
      'git-root', () => {
        it('returns git root basename when ' +
          'in git repo', () => {
            const tmpDir = mkdtempSync(
              join(tmpdir(), 'git-test-')
            );
            try {
              execSync(
                'git init',
                { cwd: tmpDir }
              );
              const cfg = {
                ...DEFAULT_CONFIG,
                projectSource: 'git-root',
              };
              const result =
                detectProjectFromCwd(
                  tmpDir,
                  cfg
                );
              assert.strictEqual(
                result,
                tmpDir.split('/').pop()
              );
            } finally {
              rmSync(tmpDir, {
                recursive: true,
                force: true,
              });
            }
          });

        it('falls back to basename when not ' +
          'in git repo', () => {
            const tmpDir = mkdtempSync(
              join(tmpdir(), 'no-git-')
            );
            try {
              const cfg = {
                ...DEFAULT_CONFIG,
                projectSource: 'git-root',
              };
              const result =
                detectProjectFromCwd(
                  tmpDir,
                  cfg
                );
              assert.strictEqual(
                result,
                tmpDir.split('/').pop()
              );
            } finally {
              rmSync(tmpDir, {
                recursive: true,
                force: true,
              });
            }
          });

        it('falls back to basename when git ' +
          'command fails', () => {
            const cfg = {
              ...DEFAULT_CONFIG,
              projectSource: 'git-root',
            };
            const result =
              detectProjectFromCwd(
                '/nonexistent/path',
                cfg
              );
            assert.strictEqual(result, 'path');
          });
      });
  });

  describe('detectTicket', () => {
    it('returns null when not in git repo',
      () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'no-git-')
        );
        try {
          const result = detectTicket(
            tmpDir,
            DEFAULT_CONFIG
          );
          assert.strictEqual(result, null);
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });

    it('returns null when on branch with ' +
      'no ticket pattern', () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'git-test-')
        );
        try {
          execSync(
            'git init',
            { cwd: tmpDir }
          );
          execSync(
            'git config user.name "Test"',
            { cwd: tmpDir }
          );
          execSync(
            'git config user.email ' +
            '"test@test.com"',
            { cwd: tmpDir }
          );
          writeFileSync(
            join(tmpDir, 'file.txt'),
            'content'
          );
          execSync(
            'git add .',
            { cwd: tmpDir }
          );
          execSync(
            'git commit -m "Initial"',
            { cwd: tmpDir }
          );

          const result = detectTicket(
            tmpDir,
            DEFAULT_CONFIG
          );
          assert.strictEqual(result, null);
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });

    it('returns ticket when branch name ' +
      'matches pattern', () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'git-test-')
        );
        try {
          execSync(
            'git init',
            { cwd: tmpDir }
          );
          execSync(
            'git config user.name "Test"',
            { cwd: tmpDir }
          );
          execSync(
            'git config user.email ' +
            '"test@test.com"',
            { cwd: tmpDir }
          );
          writeFileSync(
            join(tmpDir, 'file.txt'),
            'content'
          );
          execSync(
            'git add .',
            { cwd: tmpDir }
          );
          execSync(
            'git commit -m "Initial"',
            { cwd: tmpDir }
          );
          execSync(
            'git checkout -b ' +
            'feature/BAN-789-fix',
            { cwd: tmpDir }
          );

          const result = detectTicket(
            tmpDir,
            DEFAULT_CONFIG
          );
          assert.strictEqual(
            result,
            'BAN-789'
          );
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });

    it('returns null when git command ' +
      'fails', () => {
        const result = detectTicket(
          '/nonexistent/path',
          DEFAULT_CONFIG
        );
        assert.strictEqual(result, null);
      });
  });

  describe('readTail', () => {
    it('reads last bytes of file', () => {
      const tmpDir = mkdtempSync(
        join(tmpdir(), 'read-test-')
      );
      try {
        const file =
          join(tmpDir, 'test.txt');
        const content =
          'a'.repeat(100);
        writeFileSync(file, content);

        const result = readTail(file);
        assert.strictEqual(
          result.length,
          100
        );
        assert.strictEqual(result, content);
      } finally {
        rmSync(tmpDir, {
          recursive: true,
          force: true,
        });
      }
    });

    it('returns empty string for ' +
      'nonexistent file', () => {
        const result = readTail(
          '/nonexistent/file.txt'
        );
        assert.strictEqual(result, '');
      });

    it('reads whole file when smaller ' +
      'than TAIL_BYTES', () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'read-test-')
        );
        try {
          const file =
            join(tmpDir, 'small.txt');
          const content = 'small content';
          writeFileSync(file, content);

          const result = readTail(file);
          assert.strictEqual(result, content);
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });

    it('reads only tail when file larger ' +
      'than TAIL_BYTES', () => {
        const tmpDir = mkdtempSync(
          join(tmpdir(), 'read-test-')
        );
        try {
          const file =
            join(tmpDir, 'large.txt');
          const content =
            'x'.repeat(TAIL_BYTES + 1000);
          writeFileSync(file, content);

          const result = readTail(file);
          assert.strictEqual(
            result.length,
            TAIL_BYTES
          );
          assert.ok(
            result.startsWith('x')
          );
          assert.ok(
            result.endsWith('x')
          );
        } finally {
          rmSync(tmpDir, {
            recursive: true,
            force: true,
          });
        }
      });
  });

  describe('stripNulls', () => {
    it('removes null values', () => {
      const obj = {
        a: 1,
        b: null,
        c: 'test',
      };
      const result = stripNulls(obj);
      assert.deepEqual(result, {
        a: 1,
        c: 'test',
      });
    });

    it('removes undefined values', () => {
      const obj = {
        a: 1,
        b: undefined,
        c: 'test',
      };
      const result = stripNulls(obj);
      assert.deepEqual(result, {
        a: 1,
        c: 'test',
      });
    });

    it('keeps falsy values like 0, ' +
      'empty string, false', () => {
        const obj = {
          zero: 0,
          empty: '',
          bool: false,
          nul: null,
        };
        const result = stripNulls(obj);
        assert.deepEqual(result, {
          zero: 0,
          empty: '',
          bool: false,
        });
      });

    it('returns empty object when all ' +
      'values null', () => {
        const obj = {
          a: null,
          b: undefined,
        };
        const result = stripNulls(obj);
        assert.deepEqual(result, {});
      });

    it('handles empty object', () => {
      const obj = {};
      const result = stripNulls(obj);
      assert.deepEqual(result, {});
    });
  });
});
