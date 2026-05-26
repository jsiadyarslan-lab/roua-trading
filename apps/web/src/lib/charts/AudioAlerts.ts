// ═══════════════════════════════════════════════════════════
// Audio Alerts — Stub (no-op in production)
// ═══════════════════════════════════════════════════════════

export interface AudioAlerter {
  announce(opts: { patternType: string; patternTypeAr: string; symbol: string; direction: string; confidence: number }): void;
  announceBreakout(opts: { patternType: string; patternTypeAr: string; symbol: string; direction: string; price: number }): void;
}

export function getPatternAudioAlerter(): AudioAlerter {
  return {
    announce() { /* no-op stub */ },
    announceBreakout() { /* no-op stub */ },
  };
}
