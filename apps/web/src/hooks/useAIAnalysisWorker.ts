// ═══════════════════════════════════════════════════════════
// useAIAnalysisWorker — React hook for AI pattern analysis
// via Web Worker. Offloads Elliott, Wyckoff, SMC, and
// Harmonic detection off the main thread.
// FIX (4.7): Prevents UI jank during heavy analysis.
// ═══════════════════════════════════════════════════════════

'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type { AIAnalysisRequest, AIAnalysisResponse, AIAnalysisError } from '../workers/ai-analysis-worker';
import type { CandleData } from '@/lib/charts/types';

interface UseAIAnalysisWorkerOptions {
  enabled?: boolean;
}

interface AnalysisState {
  loading: boolean;
  result: any | null;
  error: string | null;
  duration: number;
}

type AnalysisType = AIAnalysisRequest['analysisType'];

/**
 * Hook to run AI pattern analysis in a Web Worker.
 * FIX (4.7): Offloads Elliott, Wyckoff, SMC, Harmonic analysis
 * off the main thread to keep the chart responsive.
 *
 * Falls back to main-thread execution if the Worker API is
 * unavailable (e.g. SSR, older browsers).
 */
export function useAIAnalysisWorker(options: UseAIAnalysisWorkerOptions = {}) {
  const { enabled = true } = options;
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, { resolve: (value: any) => void; reject: (err: Error) => void }>>(new Map());
  const [state, setState] = useState<AnalysisState>({
    loading: false,
    result: null,
    error: null,
    duration: 0,
  });

  // Initialize / teardown worker
  useEffect(() => {
    if (!enabled || typeof Worker === 'undefined') return;

    try {
      const worker = new Worker(
        new URL('../workers/ai-analysis-worker.ts', import.meta.url),
        { type: 'module' }
      );

      worker.onmessage = (event: MessageEvent<AIAnalysisResponse | AIAnalysisError>) => {
        const { id, type } = event.data;
        const pending = pendingRef.current.get(id);
        if (!pending) return;

        pendingRef.current.delete(id);

        if (type === 'result') {
          const resp = event.data as AIAnalysisResponse;
          pending.resolve(resp.data);
          setState({ loading: false, result: resp.data, error: null, duration: resp.duration });
        } else if (type === 'error') {
          const err = event.data as AIAnalysisError;
          pending.reject(new Error(err.error));
          setState({ loading: false, result: null, error: err.error, duration: 0 });
        }

        // If no more pending, keep loading false
        if (pendingRef.current.size === 0) {
          setState(prev => ({ ...prev, loading: false }));
        }
      };

      worker.onerror = (err) => {
        console.error('[AIAnalysisWorker] Error:', err);
        // Reject all pending requests
        for (const [, pending] of pendingRef.current) {
          pending.reject(new Error('Worker error'));
        }
        pendingRef.current.clear();
        setState(prev => ({ ...prev, loading: false, error: 'Worker error' }));
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      // Worker creation failed — will fall back to main thread
      console.warn('[AIAnalysisWorker] Web Worker not available, using main-thread fallback');
    }
  }, [enabled]);

  /**
   * Main-thread fallback: imports the analysis module directly
   * and calls the function on the main thread when the worker
   * is unavailable.
   */
  const analyzeOnMainThread = useCallback(async (
    analysisType: AnalysisType,
    candles: CandleData[],
    options?: Record<string, any>
  ): Promise<any> => {
    switch (analysisType) {
      case 'elliott': {
        const { detectElliottAdvanced } = await import('@/lib/charts/ElliottEngine');
        return detectElliottAdvanced(candles);
      }
      case 'wyckoff': {
        const { detectWyckoff } = await import('@/lib/charts/WyckoffAnalysis');
        return detectWyckoff(candles);
      }
      case 'smc': {
        const { detectSMC } = await import('@/lib/charts/SMCDetector');
        return detectSMC(candles);
      }
      case 'harmonic': {
        const { detectHarmonicPatterns } = await import('@/lib/charts/HarmonicPatterns');
        return detectHarmonicPatterns(candles);
      }
      case 'all': {
        const [
          elliottMod,
          wyckoffMod,
          smcMod,
          harmonicMod,
        ] = await Promise.all([
          import('@/lib/charts/ElliottEngine'),
          import('@/lib/charts/WyckoffAnalysis'),
          import('@/lib/charts/SMCDetector'),
          import('@/lib/charts/HarmonicPatterns'),
        ]);
        return {
          elliott: elliottMod.detectElliottAdvanced(candles),
          wyckoff: wyckoffMod.detectWyckoff(candles),
          smc: smcMod.detectSMC(candles),
          harmonic: harmonicMod.detectHarmonicPatterns(candles),
        };
      }
      default:
        throw new Error(`Unknown analysis type: ${analysisType}`);
    }
  }, []);

  const analyze = useCallback(async (
    analysisType: AnalysisType,
    candles: CandleData[],
    options?: Record<string, any>
  ): Promise<any> => {
    const worker = workerRef.current;

    // Fallback: run on main thread if worker unavailable or disabled
    if (!worker || !enabled) {
      console.warn(`[AIAnalysisWorker] Main-thread fallback for ${analysisType}`);
      setState(prev => ({ ...prev, loading: true }));
      try {
        const result = await analyzeOnMainThread(analysisType, candles, options);
        setState({ loading: false, result, error: null, duration: 0 });
        return result;
      } catch (err: any) {
        setState({ loading: false, result: null, error: err?.message || 'Analysis failed', duration: 0 });
        throw err;
      }
    }

    const id = `${analysisType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      setState(prev => ({ ...prev, loading: true, error: null }));

      worker.postMessage({
        type: 'analyze',
        id,
        analysisType,
        candles,
        options,
      } as AIAnalysisRequest);

      // Timeout after 10 seconds
      setTimeout(() => {
        if (pendingRef.current.has(id)) {
          pendingRef.current.delete(id);
          const timeoutErr = new Error('Analysis timeout');
          reject(timeoutErr);
          setState(prev => ({ ...prev, loading: false, error: 'Timeout' }));
        }
      }, 10000);
    });
  }, [enabled, analyzeOnMainThread]);

  return { ...state, analyze };
}
