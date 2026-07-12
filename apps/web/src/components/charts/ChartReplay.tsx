// ═══════════════════════════════════════════════════════════
// ROUA Trading Chart — Chart Replay Mode (Bar Replay)
// Replay historical price action bar-by-bar for study
// ═══════════════════════════════════════════════════════════

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { CandleData } from '@/lib/charts/types'
import T from '@/lib/unified-tokens';

// ── Types ─────────────────────────────────────────────────
type ReplaySpeed = 0.5 | 1 | 2 | 5 | 10;

interface ChartReplayProps {
  /** Full candle data array */
  candles: CandleData[];
  /** Chart setCandles function to control visible data */
  setCandles: (candles: CandleData[]) => void;
  /** Called when replay mode is closed */
  onClose: () => void;
}

// ── Speed config ──────────────────────────────────────────
const SPEEDS: { value: ReplaySpeed; label: string; intervalMs: number }[] = [
  { value: 0.5, label: '0.5x', intervalMs: 2000 },
  { value: 1,   label: '1x',   intervalMs: 1000 },
  { value: 2,   label: '2x',   intervalMs: 500 },
  { value: 5,   label: '5x',   intervalMs: 200 },
  { value: 10,  label: '10x',  intervalMs: 100 },
];

// ── Color Palette ─────────────────────────────────────────
const C = {
  bg: 'rgba(11,14,20,0.95)',
  card: '#111620',
  border: '#1E2530',
  cyan: T.info,
  text: T.text,
  textDim: T.text2,
  textMuted: T.text3,
  success: T.success,
  danger: T.danger,
  warning: '#fbbf24',
};

export function ChartReplay({ candles, setCandles, onClose }: ChartReplayProps) {
  const t = useTranslations('dashboard.chartReplay');
  const [isPlaying, setIsPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(1); // Start with at least 1 candle visible
  const [speed, setSpeed] = useState<ReplaySpeed>(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // FIX: Keep a ref to the full original data so unmount/stop always restores
  // the complete dataset, even if the `candles` prop has been sliced by a prior render.
  const fullCandlesRef = useRef<CandleData[]>(candles);
  // Only update the ref when the incoming candles array GROWS (new data from WebSocket).
  // Never shrink it — slicing for replay reduces visible data, not the source.
  if (candles.length > fullCandlesRef.current.length) {
    fullCandlesRef.current = candles;
  }

  const totalCandles = fullCandlesRef.current.length;

  // ── Auto-play interval ──
  useEffect(() => {
    if (isPlaying && replayIndex < totalCandles) {
      const speedConfig = SPEEDS.find(s => s.value === speed) || SPEEDS[1];
      intervalRef.current = setInterval(() => {
        setReplayIndex(prev => {
          const next = prev + 1;
          if (next >= totalCandles) {
            setIsPlaying(false);
            return totalCandles;
          }
          return next;
        });
      }, speedConfig.intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPlaying, speed, totalCandles]);

  // ── Update chart data when replay index changes ──
  useEffect(() => {
    if (totalCandles === 0) return;
    const visibleCandles = fullCandlesRef.current.slice(0, replayIndex);
    setCandles(visibleCandles);
  }, [replayIndex, setCandles, totalCandles]);

  // ── Restore full data on unmount ──
  useEffect(() => {
    return () => {
      // FIX: Restore from fullCandlesRef, not from the `candles` prop
      // which may have been sliced to a subset during replay.
      if (fullCandlesRef.current.length > 0) {
        setCandles(fullCandlesRef.current);
      }
    };
  }, [setCandles]);

  // ── Handlers ──
  const handlePlay = useCallback(() => {
    if (replayIndex >= totalCandles) {
      // Reset to start if at end
      setReplayIndex(1);
    }
    setIsPlaying(true);
  }, [replayIndex, totalCandles]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    setReplayIndex(totalCandles);
    // FIX: Restore from fullCandlesRef to always show complete data
    setCandles(fullCandlesRef.current);
  }, [setCandles, totalCandles]);

  const handleStepForward = useCallback(() => {
    setIsPlaying(false);
    setReplayIndex(prev => Math.min(prev + 1, totalCandles));
  }, [totalCandles]);

  const handleStepBackward = useCallback(() => {
    setIsPlaying(false);
    setReplayIndex(prev => Math.max(prev - 1, 1));
  }, []);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    const idx = parseInt(e.target.value, 10);
    setReplayIndex(Math.max(1, idx));
  }, []);

  const handleSpeedChange = useCallback((newSpeed: ReplaySpeed) => {
    setSpeed(newSpeed);
  }, []);

  // ── Current bar info ──
  const currentCandle = replayIndex > 0 && replayIndex <= totalCandles
    ? fullCandlesRef.current[replayIndex - 1]
    : null;

  const formatDateTime = (time: number) => {
    const d = new Date(time * 1000);
    return d.toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  const progress = totalCandles > 0 ? (replayIndex / totalCandles) * 100 : 0;

  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      background: C.bg,
      backdropFilter: 'blur(24px)',
      borderTop: `1px solid ${C.border}`,
      zIndex: 600,
      padding: '8px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
    }}>
      {/* Top row: Controls + Info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Replay badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,212,255,0.1)',
          border: '1px solid rgba(0,212,255,0.25)',
          borderRadius: 'var(--radius-sm)', padding: '3px 8px',
          fontSize: 'var(--text-xs)', fontWeight: 700, color: C.cyan,
          fontFamily: "var(--font-mono)",
          flexShrink: 0,
        }}>
          ⏪ {t('replay')}
        </div>

        {/* Transport controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Step backward */}
          <button
            onClick={handleStepBackward}
            disabled={replayIndex <= 1}
            style={{
              width: 26, height: 26, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: replayIndex <= 1 ? C.textMuted : C.text,
              fontSize: 'var(--text-sm)', cursor: replayIndex <= 1 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            title={t('previousBar')}
          >
            ⏮
          </button>

          {/* Play/Pause */}
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            style={{
              width: 32, height: 26, borderRadius: 'var(--radius-sm)',
              background: isPlaying ? 'rgba(251,191,36,0.15)' : 'rgba(0,255,163,0.15)',
              border: `1px solid ${isPlaying ? 'rgba(251,191,36,0.3)' : 'rgba(0,255,163,0.3)'}`,
              color: isPlaying ? C.warning : C.success,
              fontSize: 'var(--text-sm)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
              fontWeight: 700,
            }}
            title={isPlaying ? t('pause') : t('play')}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>

          {/* Step forward */}
          <button
            onClick={handleStepForward}
            disabled={replayIndex >= totalCandles}
            style={{
              width: 26, height: 26, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: replayIndex >= totalCandles ? C.textMuted : C.text,
              fontSize: 'var(--text-sm)', cursor: replayIndex >= totalCandles ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            title={t('nextBar')}
          >
            ⏭
          </button>

          {/* Stop (restore full data) */}
          <button
            onClick={handleStop}
            style={{
              width: 26, height: 26, borderRadius: 'var(--radius-sm)',
              background: 'rgba(255,71,87,0.08)',
              border: '1px solid rgba(255,71,87,0.15)',
              color: C.danger,
              fontSize: 'var(--text-xs)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
            title={t('stopShowAll')}
          >
            ⏹
          </button>
        </div>

        {/* Speed selector */}
        <div style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
          {SPEEDS.map(s => (
            <button
              key={s.value}
              onClick={() => handleSpeedChange(s.value)}
              style={{
                padding: '3px 5px',
                background: speed === s.value ? 'rgba(0,212,255,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${speed === s.value ? 'rgba(0,212,255,0.3)' : 'transparent'}`,
                borderRadius: 'var(--radius-xs)', color: speed === s.value ? C.cyan : C.textDim,
                fontSize: 'var(--text-xs)', fontWeight: speed === s.value ? 700 : 500,
                cursor: 'pointer', fontFamily: "var(--font-mono)",
                transition: 'all 0.1s ease',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Current bar info */}
        {currentCandle && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)",
            color: C.textDim, flexShrink: 0,
          }}>
            <span style={{ color: C.cyan }}>{formatDateTime(currentCandle.time)}</span>
            <span style={{ color: currentCandle.close >= currentCandle.open ? C.success : C.danger }}>
              O:{currentCandle.open.toFixed(currentCandle.open > 1000 ? 2 : 5)}
            </span>
            <span>H:{currentCandle.high.toFixed(currentCandle.high > 1000 ? 2 : 5)}</span>
            <span>L:{currentCandle.low.toFixed(currentCandle.low > 1000 ? 2 : 5)}</span>
            <span>C:{currentCandle.close.toFixed(currentCandle.close > 1000 ? 2 : 5)}</span>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Bar counter */}
        <div style={{
          fontSize: 'var(--text-xs)', fontFamily: "var(--font-mono)",
          color: C.textMuted, flexShrink: 0,
        }}>
          {replayIndex}/{totalCandles}
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          style={{
            width: 22, height: 22, borderRadius: 'var(--radius-sm)',
            background: 'rgba(255,255,255,0.04)', border: 'none',
            color: C.textMuted, fontSize: 'var(--text-xs)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
          }}
          title={t('closeReplay')}
        >
          ✕
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ position: 'relative', height: 4, display: 'flex', alignItems: 'center' }}>
        {/* Track */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 3,
          background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-xs)',
        }} />
        {/* Fill */}
        <div style={{
          position: 'absolute', left: 0, height: 3,
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${C.cyan}, ${C.success})`,
          borderRadius: 'var(--radius-xs)',
          transition: 'width 0.15s ease',
        }} />
        {/* Slider input (invisible but interactive) */}
        <input
          type="range"
          min={1}
          max={totalCandles}
          value={replayIndex}
          onChange={handleSliderChange}
          style={{
            position: 'absolute', left: 0, right: 0,
            width: '100%', height: 14, opacity: 0,
            cursor: 'pointer', margin: 0, padding: 0,
          }}
        />
        {/* Thumb indicator */}
        <div style={{
          position: 'absolute',
          left: `${progress}%`,
          transform: 'translateX(-50%)',
          width: 10, height: 10,
          background: C.cyan,
          borderRadius: '50%',
          border: '2px solid #0B0E14',
          boxShadow: `0 0 6px rgba(0,212,255,0.5)`,
          pointerEvents: 'none',
          transition: 'left 0.15s ease',
        }} />
      </div>
    </div>
  );
}
