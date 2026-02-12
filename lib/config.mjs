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

function loadConfig() {
  const configPath =
    join(TIMELOG_DIR, 'config.json');
  try {
    const raw =
      readFileSync(configPath, 'utf8');
    const user = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...user,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function matchTicket(text, config) {
  if (!text) return null;
  for (const pat of config.ticketPatterns) {
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

export {
  TIMELOG_DIR,
  loadConfig,
  matchTicket,
};
