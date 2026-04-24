'use client'

import { Bot, Brain, ScanSearch, ShieldCheck } from 'lucide-react'
import { formatFreshness } from '@/lib/dashboard-live'
import { useDecisionFlow } from '@/hooks/useDecisionFlow'

function stateColor(state?: string) {
  if (state === 'buy' || state === 'BUY') return '#00C853'
  if (state === 'sell' || state === 'SELL') return '#FF3B30'
  if (state === 'HOLD' || state === 'cooldown') return '#FFB800'
  return '#00E5FF'
}

export function SmartSetupBar({ compact = false }: { compact?: boolean }) {
  const { selectedSymbol, scanner, council, narrator, engineState, summary } = useDecisionFlow()

  const scannerColor = stateColor(scanner?.dir)
  const councilColor = stateColor(council?.recommendation)
  const botColor = stateColor(engineState)

  return (
    <div
      className="card"
      style={{
        padding: compact ? '10px 12px' : '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: summary.tone,
              boxShadow: `0 0 14px ${summary.tone}80`,
              animation: 'live-dot 1.8s ease-in-out infinite',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: compact ? 11 : 12, fontWeight: 800, color: 'var(--foreground)', fontFamily: "'Cairo', sans-serif", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {summary.title}
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>
          {selectedSymbol}
        </span>
      </div>

      <div style={{ fontSize: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
        {summary.detail}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {[
          {
            id: 'scanner',
            icon: ScanSearch,
            color: scannerColor,
            label: 'السكانر',
            value: scanner ? `${scanner.strength}%` : '—',
            detail: scanner?.signalClass || 'watch',
          },
          {
            id: 'council',
            icon: ShieldCheck,
            color: councilColor,
            label: 'المجلس',
            value: council?.recommendation || '—',
            detail: council ? `${council.consensusScore}%` : 'waiting',
          },
          {
            id: 'bot',
            icon: Bot,
            color: botColor,
            label: 'البوت',
            value: engineState,
            detail: scanner?.entryBias || 'policy',
          },
          {
            id: 'ai',
            icon: Brain,
            color: '#B388FF',
            label: 'AI',
            value: narrator?.confidence ? `${narrator.confidence}%` : '—',
            detail: narrator?.nextTrigger ? 'next trigger' : 'summary',
          },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div
              key={item.id}
              style={{
                minWidth: 0,
                borderRadius: 12,
                padding: '10px 10px 9px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Icon size={13} color={item.color} />
                  <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>{item.label}</span>
                </div>
                <span style={{ fontSize: 9, color: item.color, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap' }}>
                  {item.value}
                </span>
              </div>
              <div style={{ fontSize: 8, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace", whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {item.detail}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 9, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{scanner?.source || council?.meta?.source || 'scanner-engine'}</span>
        <span>{scanner?.timestamp ? formatFreshness(scanner.timestamp) : narrator?.timestamp ? formatFreshness(narrator.timestamp) : '—'}</span>
      </div>
    </div>
  )
}
