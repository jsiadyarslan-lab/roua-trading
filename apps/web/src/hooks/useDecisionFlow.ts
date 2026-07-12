'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale } from 'next-intl'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useBotStore } from '@/hooks/useBotStore'

export type ScannerSnapshot = {
  pair: string
  dir: 'buy' | 'sell' | 'neutral'
  strength: number
  signalClass?: string
  entryBias?: string
  reasons?: string[]
  timestamp?: string
  freshness?: 'fresh' | 'stale' | 'degraded'
  source?: string
}

export type CouncilSnapshot = {
  recommendation: 'BUY' | 'SELL' | 'HOLD'
  consensusScore: number
  conflictExplanation?: string
  masterStrategy?: string
  meta?: { timestamp?: string; freshness?: string; source?: string }
}

export type NarratorSnapshot = {
  summary?: string
  nextTrigger?: string
  timestamp?: string
  confidence?: number
  keyRisk?: string
}

export function useDecisionFlow() {
  const locale = useLocale()
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
        const [scanRes, councilRes, narratorRes] = await Promise.allSettled([
          fetch(`/api/market-scan?pair=${encodeURIComponent(selectedSymbol)}&tf=1h`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          }),
          fetch('/api/ai/consensus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: selectedSymbol, language: locale || 'en' }),
            signal: AbortSignal.timeout(20000),
          }),
          fetch(`/api/ai/narrator?symbol=${encodeURIComponent(selectedSymbol)}&language=${encodeURIComponent(locale)}`, {
            cache: 'no-store',
            signal: AbortSignal.timeout(15000),
          }),
        ])

        if (!mounted) return

        // Process scanner result
        if (scanRes.status === 'fulfilled') {
          try {
            const scanJson = await scanRes.value.json()
            setScanner(Array.isArray(scanJson?.data) ? scanJson.data[0] ?? null : null)
          } catch { /* ignore parse errors */ }
        }

        // Process council result
        if (councilRes.status === 'fulfilled') {
          try {
            const councilJson = await councilRes.value.json()
            setCouncil(councilJson?.success ? councilJson.data : null)
          } catch { /* ignore parse errors */ }
        }

        // Process narrator result
        if (narratorRes.status === 'fulfilled') {
          try {
            const narratorJson = await narratorRes.value.json()
            setNarrator(narratorJson?.success ? narratorJson.data : null)
          } catch { /* ignore parse errors */ }
        }
      } catch {
        // Error handled silently
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

  const signalActive = Boolean(scanner && scanner.dir !== 'neutral' && scanner.strength >= 60)

  const summary = useMemo(() => {
    if (loading) {
      return {
        tone: '#00D4FF',
        title: 'محرك القرار يفحص السوق',
        detail: `جاري جمع قراءة ${selectedSymbol} من السكانر والمجلس والبوت`,
      }
    }

    if (council?.recommendation === 'BUY' && signalActive) {
      return {
        tone: '#00FFA3',
        title: `${selectedSymbol} جاهز هجوميًا`,
        detail: council.conflictExplanation || scanner?.reasons?.[0] || 'الطبقات الأساسية متوافقة على الشراء',
      }
    }

    if (council?.recommendation === 'SELL' && signalActive) {
      return {
        tone: '#FF3B30',
        title: `${selectedSymbol} تحت ضغط بيعي`,
        detail: council.conflictExplanation || scanner?.reasons?.[0] || 'الطبقات الأساسية متوافقة على البيع',
      }
    }

    if (council?.conflictExplanation) {
      return {
        tone: '#FFB800',
        title: 'تعارض يمنع الاندفاع',
        detail: council.conflictExplanation,
      }
    }

    return {
      tone: '#00D4FF',
      title: `${selectedSymbol} قيد المراقبة`,
      detail: narrator?.summary || scanner?.reasons?.[0] || 'لا توجد فرصة واضحة كفاية بعد',
    }
  }, [loading, selectedSymbol, council, signalActive, scanner, narrator])

  return {
    selectedSymbol,
    engineState,
    isOn,
    scanner,
    council,
    narrator,
    loading,
    signalActive,
    summary,
  }
}
