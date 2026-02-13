// Shared configuration for timelog plugin.
// Reads ${TIMELOG_DIR}/config.json if present,
// merging with defaults.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TIMELOG_DIR =
  process.env.CLAUDE_TIMELOG_DIR ||
  join(homedir(), '.claude', 'timelog');

const DEFAULT_CONFIG = {
  ticketPatterns: [
    '([A-Z][A-Z0-9]+-\\d+)',
  ],
  projectSource: 'git-root',
  breakThreshold: 1800,
};

const NESTED_QUANT_RE =
  /\([^)]*[+*][^)]*\)[+*]/;

function validateConfig(cfg) {
  const result = { ...cfg };

  // breakThreshold: positive number, max 24h
  if ('breakThreshold' in result) {
    const bt = Number(result.breakThreshold);
    if (
      !Number.isFinite(bt) ||
      bt <= 0 ||
      bt > 86400
    ) {
      console.error(
        'timelog: breakThreshold must be ' +
        '1-86400 (seconds). Using default.'
      );
      result.breakThreshold =
        DEFAULT_CONFIG.breakThreshold;
    } else {
      result.breakThreshold = bt;
    }
  }

  // ticketPatterns: array of strings
  if ('ticketPatterns' in result) {
    if (!Array.isArray(result.ticketPatterns)) {
      console.error(
        'timelog: ticketPatterns must be ' +
        'an array. Using default.'
      );
      result.ticketPatterns =
        DEFAULT_CONFIG.ticketPatterns;
    } else {
      result.ticketPatterns =
        result.ticketPatterns.filter(
          (p) => typeof p === 'string'
        );
    }
  }

  // projectSource: 'git-root' | 'cwd'
  if (
    'projectSource' in result &&
    result.projectSource !== 'git-root' &&
    result.projectSource !== 'cwd'
  ) {
    console.error(
      'timelog: projectSource must be ' +
      "'git-root' or 'cwd'. " +
      'Using default.'
    );
    result.projectSource =
      DEFAULT_CONFIG.projectSource;
  }

  // defaultReport: array of strings
  if ('defaultReport' in result) {
    if (
      !Array.isArray(result.defaultReport)
    ) {
      console.error(
        'timelog: defaultReport must be ' +
        'an array. Ignoring.'
      );
      delete result.defaultReport;
    } else {
      result.defaultReport =
        result.defaultReport.filter(
          (a) => typeof a === 'string'
        );
    }
  }

  // projectPattern: reject ReDoS patterns
  if (
    result.projectPattern &&
    NESTED_QUANT_RE.test(
      result.projectPattern
    )
  ) {
    console.error(
      'timelog: projectPattern has ' +
      'nested quantifiers (ReDoS risk).' +
      ' Ignoring.'
    );
    result.projectPattern = null;
  }

  return result;
}

function loadConfig() {
  const configPath =
    join(TIMELOG_DIR, 'config.json');
  try {
    const raw =
      readFileSync(configPath, 'utf8');
    const user = JSON.parse(raw);
    return validateConfig({
      ...DEFAULT_CONFIG,
      ...user,
    });
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function matchTicket(text, config) {
  if (!text) return null;
  for (
    const pat of config.ticketPatterns
  ) {
    try {
      const re = new RegExp(pat);
      const m = text.match(re);
      if (m) return m[1] || m[0];
    } catch {
      // Skip invalid patterns
    }
  }
  return null;
}

function extractProjectFromPath(
  filePath, config
) {
  if (
    !filePath ||
    !config.projectPattern
  ) {
    return null;
  }
  try {
    const re = new RegExp(
      config.projectPattern
    );
    const m = filePath.match(re);
    if (m) return m[1] || m[0];
  } catch {
    // Invalid regex — skip
  }
  return null;
}

const FILE_PATH_KEYS = [
  'file_path', 'path', 'notebook_path',
];

function extractFilePaths(record) {
  const paths = [];
  const content =
    record?.message?.content;
  if (!Array.isArray(content)) {
    return paths;
  }
  for (const block of content) {
    if (block.type !== 'tool_use') {
      continue;
    }
    const input = block.input || {};
    for (const key of FILE_PATH_KEYS) {
      if (
        typeof input[key] === 'string' &&
        input[key].startsWith('/')
      ) {
        paths.push(input[key]);
      }
    }
  }
  return paths;
}

export {
  DEFAULT_CONFIG,
  NESTED_QUANT_RE,
  TIMELOG_DIR,
  extractFilePaths,
  extractProjectFromPath,
  loadConfig,
  matchTicket,
  validateConfig,
};
