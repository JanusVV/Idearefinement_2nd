/**
 * Scoped logger with levels, timestamps, and optional file output.
 *
 * Usage:
 *   const log = require('./logger').createScopedLogger('AgentTasks');
 *   log.info('Task created', { taskId });
 *   log.warn('Slow response', { elapsed });
 *   log.error('LLM call failed', err);
 *   log.debug('Raw payload', payload);   // only shown when LOG_LEVEL=debug
 */

const fs = require('fs');
const path = require('path');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_LABELS = { 0: 'DEBUG', 1: 'INFO', 2: 'WARN', 3: 'ERROR' };

const LOG_LEVEL = LEVELS[(process.env.LOG_LEVEL || 'debug').toLowerCase()] ?? LEVELS.debug;

const LOGS_DIR = path.join(process.cwd(), 'verbose-logs');
let logStream = null;

function ensureLogsDir() {
  if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
}

function getLogStream() {
  if (logStream) return logStream;
  ensureLogsDir();
  const date = new Date().toISOString().slice(0, 10);
  const filePath = path.join(LOGS_DIR, `backend-${date}.log`);
  logStream = fs.createWriteStream(filePath, { flags: 'a' });
  return logStream;
}

function formatArgs(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}\n${a.stack || ''}`;
      if (typeof a === 'object' && a !== null) {
        try {
          const s = JSON.stringify(a);
          return s.length > 2000 ? s.slice(0, 2000) + '...[truncated]' : s;
        } catch (_) {
          return String(a);
        }
      }
      return String(a);
    })
    .join(' ');
}

function createScopedLogger(scope) {
  function emit(level, ...args) {
    if (level < LOG_LEVEL) return;
    const ts = new Date().toISOString();
    const label = LEVEL_LABELS[level] || 'INFO';
    const msg = formatArgs(args);
    const line = `[${ts}] [${label}] [${scope}] ${msg}`;

    // Console output (color-coded)
    if (level >= LEVELS.error) console.error(line);
    else if (level >= LEVELS.warn) console.warn(line);
    else console.log(line);

    // File output
    try {
      getLogStream().write(line + '\n');
    } catch (_) {
      // Silently skip if file write fails
    }
  }

  return {
    debug: (...args) => emit(LEVELS.debug, ...args),
    info: (...args) => emit(LEVELS.info, ...args),
    warn: (...args) => emit(LEVELS.warn, ...args),
    error: (...args) => emit(LEVELS.error, ...args),
    /** Log with explicit level string: 'debug' | 'info' | 'warn' | 'error' */
    log: (level, ...args) => emit(LEVELS[level] ?? LEVELS.info, ...args),
  };
}

module.exports = { createScopedLogger, LOGS_DIR };
