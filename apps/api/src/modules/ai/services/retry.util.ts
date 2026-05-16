/**
 * Retry with exponential backoff utility for AI service calls.
 *
 * Pattern: delay = baseDelay * 2^attempt + jitter
 * Jitter prevents thundering herd when multiple requests retry simultaneously.
 */

export interface RetryOptions {
  maxAttempts: number;      // Maximum number of retry attempts (default: 3)
  baseDelayMs: number;      // Base delay in milliseconds (default: 1000)
  maxDelayMs: number;       // Maximum delay cap (default: 30000)
  jitterMs: number;         // Random jitter to add (default: 200)
  retryableCheck?: (error: any) => boolean;  // Function to determine if error is retryable
  logger?: { warn: (msg: string) => void };  // FIX #16: Optional logger for consistent logging
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 200,
};

/**
 * Execute a function with exponential backoff retry.
 * Only retries on errors that pass the retryableCheck (defaults to retrying on 429 and network errors).
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      // Don't retry if this is the last attempt
      if (attempt >= opts.maxAttempts) break;

      // Check if the error is retryable
      if (opts.retryableCheck && !opts.retryableCheck(error)) break;

      // Default retryable check: 429 rate limits and network errors
      if (!opts.retryableCheck) {
        const status = error?.response?.status || error?.status;
        const is429 = status === 429 || String(error?.message || '').includes('429');
        const isNetworkError = !status && (
          error?.code === 'ECONNRESET' ||
          error?.code === 'ETIMEDOUT' ||
          error?.code === 'ENOTFOUND' ||
          error?.code === 'ECONNREFUSED' ||
          String(error?.message || '').includes('timeout') ||
          String(error?.message || '').includes('network')
        );
        if (!is429 && !isNetworkError) break; // Don't retry on auth errors, 404, etc.
      }

      // Calculate delay with exponential backoff + jitter
      const delay = Math.min(
        opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * opts.jitterMs,
        opts.maxDelayMs,
      );

      // FIX #16: Use provided logger or fall back to console.warn for consistent error logging
      const logFn = opts.logger?.warn || console.warn;
      logFn(`[retry] Attempt ${attempt + 1}/${opts.maxAttempts} failed, retrying in ${Math.round(delay)}ms: ${error?.message || error}`);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
