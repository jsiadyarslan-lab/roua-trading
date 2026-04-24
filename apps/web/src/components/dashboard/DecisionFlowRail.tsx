'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bot, Brain, ScanSearch, ShieldCheck, Sparkles } from 'lucide-react'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useBotStore } from '@/hooks/useBotStore'
import { formatFreshness, getStatusTone } from '@/lib/dashboard-live'

type ScannerSnapshot = {
  pair: string
  dir: 'buy' | 'sell' | 'neutral'
  strength: number
  signalClass?: string
  entryBias?: string
  reasons?: string[]
  timestamp?: string
  freshness?: 'fresh' | 'stale' | 'degraded'
}

type CouncilSnapshot = {
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  consensusScore: number
  conflictExplanation?: string
  meta?: { timestamp?: string; freshness?: string }
}

type NarratorSnapshot = {
  summary?: string
  nextTrigger?: string
  timestamp?: string
  confidence?: number
}

function badgeColor(status: string) {
  if (status === 'active' || status === 'ready' || status === 'buy') return '#00C853'
  if (status === 'sell' || status === 'rejected') return '#FF3B30'
  if (status === 'watch' || status === 'mixed' || status === 'cooldown') return '#FFB800'
  return '#00E5FF'
}

export function DecisionFlowRail({ compact = false }: { compact?: boolean }) {
  const selectedSymbol = useSymbolStore((state) => state.selectedSymbol)
  const { engineState, isOn } = useBotStore()
  const [scanner, setScanner] = useState<ScannerSnapshot | null>(null)
  const [council, setCouncil] = useState<CouncilSnapshot | null>(null)
  const [narrator, setNarrator] = useState<NarratorSnapshot | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        if (mounted) setLoading(true)
        const [scanRes, councilRes, narratorRes] = await Promise.all([
          fetch(`/api/market-scan?pair=${encodeURIComponent(selectedSymbol)}&tf=1h`, { cache: 'no-store' }),
          fetch('/api/ai/consensus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: selectedSymbol }),
          }),
          fetch(`/api/ai/narrator?symbol=${encodeURIComponent(selectedSymbol)}`, { cache: 'no-store' }),
        ])

        const [scanJson, councilJson, narratorJson] = await Promise.all([
          scanRes.json(),
          councilRes.json(),
          narratorRes.json(),
        ])

        if (!mounted) return
        setScanner(Array.isArray(scanJson?.data) ? scanJson.data[0] ?? null : null)
        setCouncil(councilJson?.success ? councilJson.data : null)
        setNarrator(narratorJson?.success ? narratorJson.data : null)
      } catch (error) {
        console.error('[DecisionFlowRail] failed to load', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void load()
    const interval = setInterval(() => void load(), 30000)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [selectedSymbol])

  const stages = useMemo(() => {
    const signalActive = scanner && scanner.dir !== 'neutral' && scanner.strength >= 60
    return [
      {
        id: 'scanner',
        label: 'السكانر',
        icon: ScanSearch,
        color: badgeColor(scanner?.dir || 'idle'),
        state: loading ? 'يمسح' : scanner?.dir === 'buy' ? 'رصد شراء' : scanner?.dir === 'sell' ? 'رصد بيع' : 'مراقبة',
        detail: scanner
          ? `${scanner.signalClass || 'watch'} · ${scanner.entryBias || 'wait'} · ${scanner.reasons?.[0] || 'لا توجد فرصة قوية'}`
          : 'انتظار القراءة الأولى',
        stamp: scanner?.timestamp,
      },
      {
        id: 'signal',
        label: 'الإشارة',
        icon: Sparkles,
        color: badgeColor(signalActive ? scanner?.dir || 'watch' : 'watch'),
        state: signalActive ? `${scanner?.strength}%` : 'لا توجد',
        detail: signalActive
          ? `الأصل ${selectedSymbol} صالح للتقييم التنفيذي`
          : `لا توجد إشارة كافية على ${selectedSymbol} الآن`,
        stamp: scanner?.timestamp,
      },
      {
        id: 'council',
        label: 'المجلس',
        icon: ShieldCheck,
        color: badgeColor(council?.recommendation?.toLowerCase?.() || 'watch'),
        state: council?.recommendation === 'BUY' ? 'شراء' : council?.recommendation === 'SELL' ? 'بيع' : 'انتظار',
        detail: council?.conflictExplanation || `إجماع ${council?.consensusScore ?? '--'}%`,
        stamp: council?.meta?.timestamp,
      },
      {
        id: 'bot',
        label: 'البوت',
        icon: Bot,
        color: badgeColor(engineState),
        state: isOn ? engineState : 'متوقف',
        detail: isOn
          ? `المحرك ${engineState === 'armed' ? 'جاهز' : engineState === 'scanning' ? 'يفحص' : engineState === 'cooldown' ? 'في تبريد' : 'يتفاعل'} مع ${selectedSymbol}`
          : 'التنفيذ الآلي معطّل',
        stamp: Date.now().toString(),
      },
      {
        id: 'ai',
        label: 'AI',
        icon: Brain,
        color: getStatusTone('fallback'),
        state: narrator?.confidence ? `${narrator.confidence}%` : 'سرد',
        detail: narrator?.nextTrigger || narrator?.summary || `شرح حي لحالة ${selectedSymbol}`,
        stamp: narrator?.timestamp,
      },
    ]
  }, [selectedSymbol, scanner, council, narrator, engineState, isOn, loading])

  return (
    <div
      className="card"
      style={{
        padding: compact ? '10px' : '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#00E5FF',
              boxShadow: '0 0 14px rgba(0,229,255,0.6)',
              animation: 'live-dot 1.8s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: compact ? 11 : 12, fontWeight: 800, color: 'var(--foreground)', fontFamily: "'Cairo', sans-serif" }}>
            سلسلة القرار الحية
          </span>
        </div>
        <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>
          {selectedSymbol}
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : 'repeat(5, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {stages.map((stage) => {
          const Icon = stage.icon
          return (
            <div
              key={stage.id}
              style={{
                minWidth: 0,
                padding: compact ? '10px' : '12px',
                borderRadius: 14,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid var(--card-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <Icon size={14} color={stage.color} />
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, fontFamily: "'Cairo', sans-serif" }}>
                    {stage.label}
                  </span>
                </div>
                <span
                  style={{
                    fontSize: 9,
                    padding: '2px 6px',
                    borderRadius: 999,
                    background: `${stage.color}16`,
                    border: `1px solid ${stage.color}30`,
                    color: stage.color,
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {stage.state}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--foreground)', lineHeight: 1.6, minHeight: compact ? 'auto' : 46 }}>
                {stage.detail}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text3)', fontFamily: "'JetBrains Mono', monospace" }}>
                {stage.stamp ? formatFreshness(stage.stamp) : '—'}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
