// ═══════════════════════════════════════════════════════════
// useConsensusStream — React hook for SSE AI Consensus
// Replaces blocking fetch with progressive streaming
// Shows models appearing one by one ("War Room" experience)
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

// ── Types ────────────────────────────────────────────────
export interface ModelResult {
  role: string;
  model: string;
  vote: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  reason: string;
  featuresUsed?: string[];
  index: number;
  total: number;
  arrivedAt: number;  // When this model result arrived
}

export interface ConsensusUpdate {
  consensusScore: number;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  modelsResponded: number;
  totalModels: number;
  buyWeight: number;
  sellWeight: number;
  holdWeight: number;
}

export interface ConsensusStreamState {
  status: 'idle' | 'connecting' | 'streaming' | 'complete' | 'error';
  models: ModelResult[];
  currentConsensus: ConsensusUpdate | null;
  finalResult: any | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
  progress: number;  // 0-1 based on models responded vs total
}

// ── Hook ─────────────────────────────────────────────────
export function useConsensusStream() {
  const [state, setState] = useState<ConsensusStreamState>({
    status: 'idle',
    models: [],
    currentConsensus: null,
    finalResult: null,
    error: null,
    startedAt: null,
    completedAt: null,
    progress: 0,
  });

  const abortRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // ── Start streaming consensus ──────────────────────────
  const startStream = useCallback((symbol: string, language: 'ar' | 'en' = 'ar') => {
    // Cancel any existing stream
    cancelStream();

    const startedAt = Date.now();

    setState({
      status: 'connecting',
      models: [],
      currentConsensus: null,
      finalResult: null,
      error: null,
      startedAt,
      completedAt: null,
      progress: 0,
    });

    try {
      const params = new URLSearchParams({ symbol, language });
      const eventSource = new EventSource(`/api/ai/consensus-stream?${params}`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState(prev => ({ ...prev, status: 'streaming' }));
      };

      eventSource.onmessage = (event) => {
        try {
          const sseEvent = JSON.parse(event.data);

          switch (sseEvent.type) {
            case 'model_start':
              // System starting message
              break;

            case 'model_result':
              setState(prev => {
                const newModels = [...prev.models, {
                  ...sseEvent.data,
                  arrivedAt: Date.now(),
                }];
                const progress = sseEvent.data.total > 0
                  ? newModels.length / sseEvent.data.total
                  : 0;
                return {
                  ...prev,
                  status: 'streaming',
                  models: newModels,
                  progress,
                };
              });
              break;

            case 'consensus_update':
              setState(prev => ({
                ...prev,
                currentConsensus: sseEvent.data,
              }));
              break;

            case 'complete':
              setState(prev => ({
                ...prev,
                status: 'complete',
                finalResult: sseEvent.data,
                progress: 1,
                completedAt: Date.now(),
              }));
              eventSource.close();
              eventSourceRef.current = null;
              break;

            case 'error':
              setState(prev => ({
                ...prev,
                status: 'error',
                error: sseEvent.data?.message || 'Stream error',
              }));
              eventSource.close();
              eventSourceRef.current = null;
              break;
          }
        } catch (parseErr) {
          console.warn('[ConsensusStream] Parse error:', parseErr);
        }
      };

      eventSource.onerror = () => {
        setState(prev => {
          // If we already have some models, don't show error
          if (prev.models.length > 0 && prev.currentConsensus) {
            return {
              ...prev,
              status: 'complete',
              progress: 1,
              completedAt: Date.now(),
            };
          }
          return {
            ...prev,
            status: 'error',
            error: 'Connection lost',
          };
        });
        eventSource.close();
        eventSourceRef.current = null;
      };
    } catch (err: any) {
      setState(prev => ({
        ...prev,
        status: 'error',
        error: err?.message || 'Failed to start stream',
      }));
    }
  }, []);

  // ── Cancel active stream ──────────────────────────────
  const cancelStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  // ── Reset to idle ─────────────────────────────────────
  const reset = useCallback(() => {
    cancelStream();
    setState({
      status: 'idle',
      models: [],
      currentConsensus: null,
      finalResult: null,
      error: null,
      startedAt: null,
      completedAt: null,
      progress: 0,
    });
  }, [cancelStream]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  // ── Derived data ──────────────────────────────────────
  const duration = state.startedAt
    ? ((state.completedAt || Date.now()) - state.startedAt) / 1000
    : 0;

  const buyModels = state.models.filter(m => m.vote === 'BUY');
  const sellModels = state.models.filter(m => m.vote === 'SELL');
  const holdModels = state.models.filter(m => m.vote === 'HOLD');

  return {
    ...state,
    duration,
    buyModels,
    sellModels,
    holdModels,
    startStream,
    cancelStream,
    reset,
  };
}
