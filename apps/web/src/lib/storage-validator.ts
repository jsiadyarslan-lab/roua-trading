// ═══════════════════════════════════════════════════════════
// ROUA — Storage Validator
// Safe localStorage access with schema validation.
// FIX (5.8): Prevents corrupted/malformed localStorage data
// from causing runtime errors and crashes.
// ═══════════════════════════════════════════════════════════

/** Validation result */
interface ValidationResult<T> {
  valid: boolean;
  data: T | null;
  error?: string;
}

/** Validate a value against a schema predicate */
export function validateStorage<T>(
  key: string,
  predicate: (value: unknown) => value is T,
  fallback: T
): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;

    const parsed = JSON.parse(raw);

    if (predicate(parsed)) {
      return parsed;
    }

    console.warn(`[StorageValidator] Invalid data for key "${key}": schema mismatch. Using fallback.`);
    // Save the fallback to fix the corrupted data
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  } catch (err) {
    console.warn(`[StorageValidator] Failed to parse key "${key}":`, err);
    // Remove corrupted data
    try { localStorage.removeItem(key); } catch {}
    return fallback;
  }
}

/** Safe JSON parse with fallback */
export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Safe localStorage get */
export function safeGetStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Safe localStorage set */
export function safeSetStorage(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // localStorage might be full
    return false;
  }
}

/** Common validators */
export const validators = {
  isObject: (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v),

  isStringArray: (v: unknown): v is string[] =>
    Array.isArray(v) && v.every(item => typeof item === 'string'),

  isNumberArray: (v: unknown): v is number[] =>
    Array.isArray(v) && v.every(item => typeof item === 'number'),

  isDrawingArray: (v: unknown): v is any[] =>
    Array.isArray(v) &&
    v.every(item =>
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.type === 'string'
    ),

  hasProperty: (v: unknown, prop: string): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && prop in v,
};
