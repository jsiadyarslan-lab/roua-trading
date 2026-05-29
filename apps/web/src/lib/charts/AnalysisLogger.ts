// ═══════════════════════════════════════════════════════════
// ROUA Analysis Logger — Phase 4
// Centralized error logging for all analysis engines.
// Shows error count in the AI panel as a visual indicator.
// ═══════════════════════════════════════════════════════════

/** Log level */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/** A logged analysis event */
export interface AnalysisLogEntry {
  timestamp: number;
  level: LogLevel;
  engine: string;
  action: string;
  message: string;
  context?: Record<string, unknown>;
}

/** Logger configuration */
interface LoggerConfig {
  maxEntries: number;
  minLevel: LogLevel;
  persistToStorage: boolean;
  storageKey: string;
}

const DEFAULT_CONFIG: LoggerConfig = {
  maxEntries: 500,
  minLevel: 'warn',
  persistToStorage: true,
  storageKey: 'roua-analysis-logs',
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// ── In-memory log store ──────────────────────────────────
let entries: AnalysisLogEntry[] = [];
let config = { ...DEFAULT_CONFIG };
let listeners: Array<(entries: AnalysisLogEntry[]) => void> = [];

// ── Core Logging Functions ───────────────────────────────

function addEntry(level: LogLevel, engine: string, action: string, message: string, context?: Record<string, unknown>): void {
  if (LEVEL_PRIORITY[level] > LEVEL_PRIORITY[config.minLevel]) return;

  const entry: AnalysisLogEntry = {
    timestamp: Date.now(),
    level,
    engine,
    action,
    message,
    context,
  };

  entries.push(entry);
  if (entries.length > config.maxEntries) {
    entries = entries.slice(-config.maxEntries);
  }

  // Persist errors and warnings
  if (config.persistToStorage && (level === 'error' || level === 'warn')) {
    try {
      if (typeof window !== 'undefined') {
        const recentErrors = entries
          .filter(e => e.level === 'error' || e.level === 'warn')
          .slice(-50);
        localStorage.setItem(config.storageKey, JSON.stringify(recentErrors));
      }
    } catch { /* storage unavailable */ }
  }

  // Notify listeners
  for (const listener of listeners) {
    try { listener(entries); } catch { /* listener error */ }
  }

  // Console output in development
  if (level === 'error') {
    console.error(`[ROUA:${engine}] ${action}: ${message}`, context || '');
  } else if (level === 'warn') {
    console.warn(`[ROUA:${engine}] ${action}: ${message}`, context || '');
  }
}

/** Log an error */
export function logError(engine: string, action: string, message: string, context?: Record<string, unknown>): void {
  addEntry('error', engine, action, message, context);
}

/** Log a warning */
export function logWarn(engine: string, action: string, message: string, context?: Record<string, unknown>): void {
  addEntry('warn', engine, action, message, context);
}

/** Log info */
export function logInfo(engine: string, action: string, message: string, context?: Record<string, unknown>): void {
  addEntry('info', engine, action, message, context);
}

/** Log debug */
export function logDebug(engine: string, action: string, message: string, context?: Record<string, unknown>): void {
  addEntry('debug', engine, action, message, context);
}

// ── Query Functions ──────────────────────────────────────

/** Get all log entries */
export function getLogEntries(): AnalysisLogEntry[] {
  return [...entries];
}

/** Get error count */
export function getErrorCount(): number {
  return entries.filter(e => e.level === 'error').length;
}

/** Get warning count */
export function getWarningCount(): number {
  return entries.filter(e => e.level === 'warn').length;
}

/** Get recent errors (last N) */
export function getRecentErrors(count: number = 10): AnalysisLogEntry[] {
  return entries.filter(e => e.level === 'error').slice(-count);
}

/** Get entries for a specific engine */
export function getEntriesByEngine(engine: string): AnalysisLogEntry[] {
  return entries.filter(e => e.engine === engine);
}

/** Subscribe to log changes */
export function subscribeToLogs(listener: (entries: AnalysisLogEntry[]) => void): () => void {
  listeners.push(listener);
  return () => { listeners = listeners.filter(l => l !== listener); };
}

/** Clear all logs */
export function clearLogs(): void {
  entries = [];
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(config.storageKey);
    }
  } catch { /* storage unavailable */ }
  for (const listener of listeners) {
    try { listener(entries); } catch { /* listener error */ }
  }
}

/** Load persisted logs from localStorage */
export function loadPersistedLogs(): void {
  try {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(config.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          entries = parsed.slice(-config.maxEntries);
        }
      }
    }
  } catch { /* storage unavailable */ }
}

/**
 * Wrap an engine call with error logging and smart fallback.
 * If the engine throws, logs the error and returns the fallback value.
 */
export function safeEngineCall<T>(
  engine: string,
  action: string,
  fn: () => T,
  fallback: T,
): T {
  try {
    const result = fn();
    logDebug(engine, action, 'Success');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(engine, action, message, {
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });
    return fallback;
  }
}

/**
 * Wrap an async engine call with error logging and smart fallback.
 */
export async function safeEngineCallAsync<T>(
  engine: string,
  action: string,
  fn: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    const result = await fn();
    logDebug(engine, action, 'Success');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logError(engine, action, message, {
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
    });
    return fallback;
  }
}
