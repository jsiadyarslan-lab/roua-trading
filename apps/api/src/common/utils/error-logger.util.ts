import { Logger } from '@nestjs/common';

/**
 * Consistent error logging utility.
 * Ensures all errors are logged with the same structure:
 * - Service name
 * - Error category (auth, network, rate-limit, validation, internal)
 * - Error message
 * - Stack trace (for internal errors only)
 */

export type ErrorCategory = 'auth' | 'network' | 'rate-limit' | 'validation' | 'timeout' | 'internal';

export function categorizeError(error: any): ErrorCategory {
  const status = error?.response?.status || error?.status;
  const message = String(error?.message || '').toLowerCase();

  if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden')) return 'auth';
  if (status === 429 || message.includes('rate limit') || message.includes('too many')) return 'rate-limit';
  if (status === 400 || status === 422 || message.includes('validation')) return 'validation';
  if (message.includes('timeout') || message.includes('etimedout') || message.includes('abort')) return 'timeout';
  if (message.includes('econnreset') || message.includes('econnrefused') || message.includes('enotfound') || message.includes('network')) return 'network';
  return 'internal';
}

export function logError(logger: Logger, context: string, error: any, extra?: Record<string, any>): void {
  const category = categorizeError(error);
  const status = error?.response?.status || error?.status || 'N/A';
  const message = error?.message || String(error);
  
  const logMessage = `[${category.toUpperCase()}] ${context} — status: ${status}, message: ${message}`;
  
  // Rate-limit and timeout are warnings, not errors
  if (category === 'rate-limit' || category === 'timeout') {
    logger.warn(logMessage);
  } else if (category === 'validation' || category === 'auth') {
    logger.warn(logMessage);
  } else {
    logger.error(logMessage + (extra ? ` | extra: ${JSON.stringify(extra)}` : ''), error?.stack);
  }
}
