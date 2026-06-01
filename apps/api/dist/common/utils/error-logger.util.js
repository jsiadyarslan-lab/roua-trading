"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categorizeError = categorizeError;
exports.logError = logError;
function categorizeError(error) {
    const status = error?.response?.status || error?.status;
    const message = String(error?.message || '').toLowerCase();
    if (status === 401 || status === 403 || message.includes('unauthorized') || message.includes('forbidden'))
        return 'auth';
    if (status === 429 || message.includes('rate limit') || message.includes('too many'))
        return 'rate-limit';
    if (status === 400 || status === 422 || message.includes('validation'))
        return 'validation';
    if (message.includes('timeout') || message.includes('etimedout') || message.includes('abort'))
        return 'timeout';
    if (message.includes('econnreset') || message.includes('econnrefused') || message.includes('enotfound') || message.includes('network'))
        return 'network';
    return 'internal';
}
function logError(logger, context, error, extra) {
    const category = categorizeError(error);
    const status = error?.response?.status || error?.status || 'N/A';
    const message = error?.message || String(error);
    const logMessage = `[${category.toUpperCase()}] ${context} — status: ${status}, message: ${message}`;
    if (category === 'rate-limit' || category === 'timeout') {
        logger.warn(logMessage);
    }
    else if (category === 'validation' || category === 'auth') {
        logger.warn(logMessage);
    }
    else {
        logger.error(logMessage + (extra ? ` | extra: ${JSON.stringify(extra)}` : ''), error?.stack);
    }
}
//# sourceMappingURL=error-logger.util.js.map