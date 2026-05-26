// ═══════════════════════════════════════════════════════════
// Pattern Performance Tracker — Stub
// ═══════════════════════════════════════════════════════════

export interface PatternTypeStats {
  patternType: string;
  totalOccurrences: number;
  successRate: number;
  avgReturn: number;
}

export interface PerformanceSummary {
  statsByType: Map<string, PatternTypeStats>;
  totalTrades: number;
  overallSuccessRate: number;
}

export interface PatternPerformanceTracker {
  getSummary(): PerformanceSummary;
  record(patternType: string, success: boolean, ret: number): void;
}

export function getPatternPerformanceTracker(): PatternPerformanceTracker {
  return {
    getSummary(): PerformanceSummary {
      return {
        statsByType: new Map<string, PatternTypeStats>(),
        totalTrades: 0,
        overallSuccessRate: 0,
      };
    },
    record() { /* no-op stub */ },
  };
}
