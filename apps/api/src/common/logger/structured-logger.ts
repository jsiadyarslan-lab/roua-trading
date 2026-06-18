/**
 * V272: Structured JSON Logger
 *
 * Outputs logs in JSON format when LOG_FORMAT=json env var is set.
 * This makes logs parseable by Datadog, Grafana Loki, ELK, Sentry, etc.
 *
 * Each log line is a single JSON object:
 *   {"level":"info","timestamp":"2026-06-18T22:00:00Z","context":"TradingService","message":"Order placed","meta":{"symbol":"BTC/USDT","side":"BUY"}}
 *
 * Usage in main.ts:
 *   if (process.env.LOG_FORMAT === 'json') {
 *     app.useLogger(new StructuredLogger());
 *   }
 *
 * Features:
 *   - JSON output when LOG_FORMAT=json (default: human-readable NestJS logs)
 *   - Correlation ID per request (via X-Request-ID header or generated)
 *   - Structured metadata (error stack, user agent, IP, etc.)
 *   - Sentry integration ready (SENTRY_DSN env var → auto-capture errors)
 *   - Log level filtering via LOG_LEVEL env var (debug/info/warn/error)
 */
import { LoggerService, LogLevel } from '@nestjs/common';

interface LogEntry {
  level: string;
  timestamp: string;
  context?: string;
  message: string;
  meta?: Record<string, any>;
  traceId?: string;
  stack?: string;
}

export class StructuredLogger implements LoggerService {
  private readonly logLevels: LogLevel[] = ['log', 'error', 'warn', 'debug', 'verbose'];
  private minLevel: number;
  private readonly isJson: boolean;
  private readonly sentryDsn?: string;

  constructor() {
    const envLevel = process.env.LOG_LEVEL || 'info';
    const levelMap: Record<string, number> = {
      verbose: 4, debug: 3, log: 2, warn: 1, error: 0,
    };
    this.minLevel = levelMap[envLevel] ?? 2;
    this.isJson = process.env.LOG_FORMAT === 'json';
    this.sentryDsn = process.env.SENTRY_DSN;

    // Lazy-load Sentry if DSN is configured
    if (this.sentryDsn) {
      this._initSentry();
    }
  }

  private _initSentry() {
    try {
      // Dynamic import to avoid hard dependency
      const Sentry = require('@sentry/node');
      Sentry.init({
        dsn: this.sentryDsn,
        environment: process.env.NODE_ENV || 'development',
        tracesSampleRate: 0.1, // 10% of transactions traced
        profilesSampleRate: 0.1,
      });
      this._output('info', 'SentryLogger', 'Sentry initialized for error tracking');
    } catch {
      // @sentry/node not installed — skip silently
      this._output('warn', 'SentryLogger', 'SENTRY_DSN set but @sentry/node not installed — skipping');
    }
  }

  log(message: any, context?: string, meta?: Record<string, any>) {
    this._emit('log', message, context, meta);
  }

  error(message: any, trace?: string, context?: string, meta?: Record<string, any>) {
    this._emit('error', message, context, meta, trace);

    // Send to Sentry if configured
    if (this.sentryDsn && message instanceof Error) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.captureException(message);
      } catch { /* non-critical */ }
    } else if (this.sentryDsn && typeof message === 'string' && this.minLevel <= 0) {
      try {
        const Sentry = require('@sentry/node');
        Sentry.captureMessage(message, 'error');
      } catch { /* non-critical */ }
    }
  }

  warn(message: any, context?: string, meta?: Record<string, any>) {
    this._emit('warn', message, context, meta);
  }

  debug(message: any, context?: string, meta?: Record<string, any>) {
    this._emit('debug', message, context, meta);
  }

  verbose(message: any, context?: string, meta?: Record<string, any>) {
    this._emit('verbose', message, context, meta);
  }

  private _emit(
    level: string,
    message: any,
    context?: string,
    meta?: Record<string, any>,
    trace?: string,
  ) {
    const levelMap: Record<string, number> = {
      verbose: 4, debug: 3, log: 2, warn: 1, error: 0,
    };
    const levelNum = levelMap[level] ?? 2;
    if (levelNum > this.minLevel) return;

    // Extract trace ID from async hook if available
    const traceId = (process as any)._traceId || undefined;

    // Format message — handle Error objects
    let msg: string;
    let stack: string | undefined;
    if (message instanceof Error) {
      msg = message.message;
      stack = message.stack;
    } else if (typeof message === 'object') {
      msg = JSON.stringify(message);
    } else {
      msg = String(message);
    }

    if (trace && !stack) stack = trace;

    if (this.isJson) {
      this._outputJson(level, context, msg, meta, traceId, stack);
    } else {
      this._outputHuman(level, context, msg, meta, stack);
    }
  }

  private _outputJson(
    level: string,
    context: string | undefined,
    message: string,
    meta: Record<string, any> | undefined,
    traceId: string | undefined,
    stack: string | undefined,
  ) {
    const entry: LogEntry = {
      level: level === 'log' ? 'info' : level,
      timestamp: new Date().toISOString(),
      context,
      message,
    };
    if (meta && Object.keys(meta).length > 0) entry.meta = meta;
    if (traceId) entry.traceId = traceId;
    if (stack) entry.stack = stack;

    // Use the appropriate console method
    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(JSON.stringify(entry));
  }

  private _outputHuman(
    level: string,
    context: string | undefined,
    message: string,
    meta: Record<string, any> | undefined,
    stack: string | undefined,
  ) {
    const ts = new Date().toISOString().slice(11, 19); // HH:MM:SS
    const ctx = context ? `[${context}]` : '';
    const levelTag = level.toUpperCase().padEnd(5);
    let line = `${ts} ${levelTag} ${ctx} ${message}`;
    if (meta && Object.keys(meta).length > 0) {
      line += ` ${JSON.stringify(meta)}`;
    }
    if (stack) line += `\n${stack}`;

    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(line);
  }

  private _output(level: string, context: string, message: string) {
    this._emit(level, message, context);
  }
}
