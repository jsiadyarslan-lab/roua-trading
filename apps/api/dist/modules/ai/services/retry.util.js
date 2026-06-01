"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withExponentialBackoff = withExponentialBackoff;
const DEFAULT_OPTIONS = {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    jitterMs: 200,
};
async function withExponentialBackoff(fn, options = {}) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError;
    for (let attempt = 0; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt >= opts.maxAttempts)
                break;
            if (opts.retryableCheck && !opts.retryableCheck(error))
                break;
            if (!opts.retryableCheck) {
                const status = error?.response?.status || error?.status;
                const is429 = status === 429 || String(error?.message || '').includes('429');
                const isNetworkError = !status && (error?.code === 'ECONNRESET' ||
                    error?.code === 'ETIMEDOUT' ||
                    error?.code === 'ENOTFOUND' ||
                    error?.code === 'ECONNREFUSED' ||
                    String(error?.message || '').includes('timeout') ||
                    String(error?.message || '').includes('network'));
                if (!is429 && !isNetworkError)
                    break;
            }
            const delay = Math.min(opts.baseDelayMs * Math.pow(2, attempt) + Math.random() * opts.jitterMs, opts.maxDelayMs);
            const logFn = opts.logger?.warn || console.warn;
            logFn(`[retry] Attempt ${attempt + 1}/${opts.maxAttempts} failed, retrying in ${Math.round(delay)}ms: ${error?.message || error}`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError;
}
//# sourceMappingURL=retry.util.js.map