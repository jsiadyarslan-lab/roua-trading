'use client';

/**
 * ThinkingIndicator — V466
 *
 * مؤشر تفكير احترافي مع:
 * - Neural orbiting orbs (3 orbs تدور حول مركز)
 * - BrainIcon نابض
 * - مراحل تفكير متغيرة (Analyzing → Cross-referencing → Synthesizing)
 *
 * مستوحى من مساعد رؤى المالي
 */

import { useEffect, useState } from 'react';
import BrainIcon from './BrainIcon';

interface ThinkingIndicatorProps {
  isRtl: boolean;
  language?: string;
}

// مراحل التفكير حسب اللغة
const THINKING_PHASES: Record<string, string[]> = {
  ar: [
    '🔍 جاري التحليل...',
    '📊 أربط البيانات...',
    '🧠 أصيغ الرد...',
  ],
  en: [
    '🔍 Analyzing...',
    '📊 Cross-referencing...',
    '🧠 Synthesizing...',
  ],
  fr: [
    '🔍 Analyse...',
    '📊 Croisement des données...',
    '🧠 Synthèse...',
  ],
  es: [
    '🔍 Analizando...',
    '📊 Cruzando datos...',
    '🧠 Sintetizando...',
  ],
  de: [
    '🔍 Analyse...',
    '📊 Daten abgleichen...',
    '🧠 Synthese...',
  ],
};

export default function ThinkingIndicator({ isRtl, language = 'ar' }: ThinkingIndicatorProps) {
  const phases = THINKING_PHASES[language] ?? THINKING_PHASES.ar;
  const [phaseIndex, setPhaseIndex] = useState(0);

  // دوران المراحل كل 1.5s
  useEffect(() => {
    const interval = setInterval(() => {
      setPhaseIndex((prev) => (prev + 1) % phases.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [phases.length]);

  return (
    <div className="flex justify-start msg-fade">
      <div
        className="px-4 py-2.5 rounded-xl thinking-bubble"
        style={{
          borderRadius: isRtl ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
          direction: isRtl ? 'rtl' : 'ltr',
          background: 'rgba(15, 22, 36, 0.72)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          border: '1px solid rgba(0, 229, 255, 0.12)',
          boxShadow: '0 0 0 1px rgba(0, 229, 255, 0.05), 0 8px 24px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div className="flex items-center gap-3" style={{ direction: isRtl ? 'rtl' : 'ltr' }}>
          {/* Neural Orbiting Orbs */}
          <div className="neural-orbs-container" style={{ position: 'relative', width: '32px', height: '32px' }}>
            {/* Core center orb */}
            <div
              className="neural-orb neural-orb-core"
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'rgba(0, 229, 255, 0.6)',
                boxShadow: '0 0 8px rgba(0, 229, 255, 0.6)',
              }}
            />
            {/* Orbiting orbs — orbit animation */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                animation: 'neural-orbit-1 2s linear infinite',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '0',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: 'rgba(0, 229, 255, 0.8)',
                  boxShadow: '0 0 6px rgba(0, 229, 255, 0.8)',
                }}
              />
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                animation: 'neural-orbit-2 2.5s linear infinite',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: '0',
                  transform: 'translateY(-50%)',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: 'rgba(139, 92, 246, 0.8)',
                  boxShadow: '0 0 6px rgba(139, 92, 246, 0.8)',
                }}
              />
            </div>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                animation: 'neural-orbit-3 3s linear infinite',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: '0',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '5px',
                  height: '5px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.8)',
                  boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)',
                }}
              />
            </div>
            {/* Brain icon on top */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 2,
              }}
            >
              <BrainIcon size={16} color="#00E5FF" pulse={true} />
            </div>
          </div>

          {/* Phase label */}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: '#9CA3AF',
              whiteSpace: 'nowrap',
              animation: 'fade-in 0.5s ease-out',
            }}
          >
            {phases[phaseIndex]}
          </span>
        </div>
      </div>

      {/* keyframes للـ orbiting */}
      <style jsx>{`
        @keyframes neural-orbit-1 {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes neural-orbit-2 {
          0% { transform: rotate(120deg); }
          100% { transform: rotate(480deg); }
        }
        @keyframes neural-orbit-3 {
          0% { transform: rotate(240deg); }
          100% { transform: rotate(600deg); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
