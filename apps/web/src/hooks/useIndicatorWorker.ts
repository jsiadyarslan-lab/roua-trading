// ═══════════════════════════════════════════════════════════
// useIndicatorWorker — React hook for Web Worker indicator calculations
// Offloads heavy calculations (Ichimoku, etc.) off the main thread
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CandleData } from '@/lib/charts/types';

interface WorkerResult {
  id: string;
  indicator: string;
  data: any;
  durationMs: number;
}

interface UseIndicatorWorkerReturn {
  calculate: (indicator: string, candles: CandleData[], params?: Record<string, number>) => Promise<any>;
  isCalculating: boolean;
  lastResult: WorkerResult | null;
  error: string | null;
  avgDurationMs: number;
}

export function useIndicatorWorker(): UseIndicatorWorkerReturn {
  const workerRef = useRef<Worker | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [lastResult, setLastResult] = useState<WorkerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avgDurationMs, setAvgDurationMs] = useState(0);
  const pendingRef = useRef<Map<string, { resolve: (data: any) => void; reject: (err: Error) => void }>>(new Map());
  const durationsRef = useRef<number[]>([]);

  // Initialize worker
  useEffect(() => {
    try {
      const worker = new Worker(
        new URL('../workers/indicator-worker.ts', import.meta.url)
      );

      worker.onmessage = (e) => {
        const { type, id, data, error: workerError, durationMs } = e.data;

        const pending = pendingRef.current.get(id);
        if (!pending) return;

        if (type === 'result') {
          pending.resolve(data);
          setLastResult({ id, indicator: e.data.indicator, data, durationMs });

          // Track average duration
          durationsRef.current.push(durationMs);
          if (durationsRef.current.length > 20) durationsRef.current.shift();
          setAvgDurationMs(
            Math.round(durationsRef.current.reduce((s, d) => s + d, 0) / durationsRef.current.length)
          );
        } else {
          pending.reject(new Error(workerError || 'Worker calculation failed'));
          setError(workerError);
        }

        pendingRef.current.delete(id);
        setIsCalculating(pendingRef.current.size > 0);
      };

      worker.onerror = (e) => {
        setError(e.message);
        // Reject all pending
        for (const [id, pending] of pendingRef.current) {
          pending.reject(new Error('Worker error'));
        }
        pendingRef.current.clear();
        setIsCalculating(false);
      };

      workerRef.current = worker;

      return () => {
        worker.terminate();
        workerRef.current = null;
      };
    } catch {
      // Worker not available — fallback to main thread
      console.warn('[IndicatorWorker] Web Worker not available, using main thread');
    }
  }, []);

  const calculate = useCallback(async (
    indicator: string,
    candles: CandleData[],
    params: Record<string, number> = {}
  ): Promise<any> => {
    if (!workerRef.current) {
      // Fallback: calculate on main thread
      // This is a simplified fallback — full calculations would import from IndicatorCalculator
      console.warn('[IndicatorWorker] Falling back to main thread calculation');
      return null;
    }

    const id = `${indicator}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      setIsCalculating(true);
      setError(null);

      workerRef.current!.postMessage({
        type: 'calculate',
        id,
        indicator,
        candles: candles.map(c => ({
          time: c.time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          volume: c.volume,
        })),
        params,
      });
    });
  }, []);

  return {
    calculate,
    isCalculating,
    lastResult,
    error,
    avgDurationMs,
  };
}
