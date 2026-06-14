// ═══════════════════════════════════════════════════════════
// AI Analysis Web Worker — Offloads heavy pattern analysis
// from the main thread to prevent UI jank.
// FIX (4.7): Elliott, Wyckoff, SMC, and Harmonic pattern
// detection can take 50-200ms on large candle arrays.
// Running them in a worker keeps the chart responsive.
// ═══════════════════════════════════════════════════════════

// Worker message types
export interface AIAnalysisRequest {
  type: 'analyze';
  id: string;  // Unique request ID for matching responses
  analysisType: 'elliott' | 'wyckoff' | 'smc' | 'harmonic' | 'all';
  candles: any[];  // CandleData[]
  options?: Record<string, any>;
}

export interface AIAnalysisResponse {
  type: 'result';
  id: string;
  analysisType: string;
  data: any;
  duration: number;  // ms
}

export interface AIAnalysisError {
  type: 'error';
  id: string;
  error: string;
}

// ── Message handler ──────────────────────────────────────
self.onmessage = async (event: MessageEvent<AIAnalysisRequest>) => {
  const { type, id, analysisType, candles, options } = event.data;

  if (type !== 'analyze') return;

  const startTime = performance.now();

  try {
    let result: any;

    // Import analysis engines dynamically (worker-safe).
    // These are pure computation modules with no DOM/React dependencies.
    switch (analysisType) {
      case 'elliott': {
        const { detectElliottAdvanced } = await import('../lib/charts/ElliottEngine');
        result = detectElliottAdvanced(candles);
        break;
      }
      case 'wyckoff': {
        const { detectWyckoff } = await import('../lib/charts/WyckoffAnalysis');
        result = detectWyckoff(candles);
        break;
      }
      case 'smc': {
        const { detectSMC } = await import('../lib/charts/SMCDetector');
        result = detectSMC(candles);
        break;
      }
      case 'harmonic': {
        const { detectHarmonicPatterns } = await import('../lib/charts/HarmonicPatterns');
        result = detectHarmonicPatterns(candles);
        break;
      }
      case 'all': {
        // Run all analyses in parallel within the worker
        const [
          elliottMod,
          wyckoffMod,
          smcMod,
          harmonicMod,
        ] = await Promise.all([
          import('../lib/charts/ElliottEngine'),
          import('../lib/charts/WyckoffAnalysis'),
          import('../lib/charts/SMCDetector'),
          import('../lib/charts/HarmonicPatterns'),
        ]);

        result = {
          elliott: elliottMod.detectElliottAdvanced(candles),
          wyckoff: wyckoffMod.detectWyckoff(candles),
          smc: smcMod.detectSMC(candles),
          harmonic: harmonicMod.detectHarmonicPatterns(candles),
        };
        break;
      }
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }

    const duration = performance.now() - startTime;

    (self as any).postMessage({
      type: 'result',
      id,
      analysisType,
      data: result,
      duration,
    } as AIAnalysisResponse);

  } catch (err: any) {
    (self as any).postMessage({
      type: 'error',
      id,
      error: err?.message || 'Unknown error',
    } as AIAnalysisError);
  }
};
