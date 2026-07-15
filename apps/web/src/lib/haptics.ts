/**
 * Haptic feedback utility — wraps the Vibration API.
 *
 * Usage:
 *   import { haptic } from '@/lib/haptics';
 *   haptic.light();   // 10ms tap (UI taps)
 *   haptic.medium();  // 20ms tap (selection changes)
 *   haptic.heavy();   // 40ms tap (important actions)
 *   haptic.success(); // pattern: tap-tap (trade executed)
 *   haptic.error();   // pattern: long-buzz (trade failed)
 *   haptic.warning(); // pattern: buzz-tap (warning state)
 *
 * Browser support:
 *   - Chrome/Edge Android: full support
 *   - Firefox Android: full support
 *   - Safari iOS 17.5+: partial support (only via window.navigator.vibrate)
 *   - Desktop browsers: silently no-ops (safe to call)
 *
 * The function is a no-op if the Vibration API is unavailable, so it's
 * always safe to call without feature detection.
 */

type VibrationPattern = number | number[];

function vibrate(pattern: VibrationPattern): void {
  if (typeof window === 'undefined') return;
  if (typeof navigator === 'undefined') return;
  if (!('vibrate' in navigator)) return;

  // Respect prefers-reduced-motion: skip haptics if user disabled motion
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  try {
    navigator.vibrate(pattern);
  } catch {
    // Silently ignore — vibration can throw on some browsers
    // if the user has disabled it or if the document isn't focused.
  }
}

export const haptic = {
  /** Light tap — UI button presses, tab switches. 10ms. */
  light(): void {
    vibrate(10);
  },

  /** Medium tap — selection changes, dropdown opens. 20ms. */
  medium(): void {
    vibrate(20);
  },

  /** Heavy tap — important actions (form submit, modal open). 40ms. */
  heavy(): void {
    vibrate(40);
  },

  /** Success pattern — trade executed, order filled. Two short taps. */
  success(): void {
    vibrate([10, 30, 10]);
  },

  /** Error pattern — trade failed, network error. Long buzz. */
  error(): void {
    vibrate([60, 40, 60]);
  },

  /** Warning pattern — risky action confirmation needed. Buzz-tap. */
  warning(): void {
    vibrate([30, 50, 10]);
  },

  /** Selection changed pattern — picker wheel, segmented control. */
  selection(): void {
    vibrate(5);
  },
};

/**
 * Convenience hook for React components.
 *
 * Example:
 *   const haptic = useHaptics();
 *   <button onClick={() => { haptic.success(); handleTrade(); }}>
 */
export function useHaptics() {
  return haptic;
}
