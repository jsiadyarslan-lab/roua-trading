'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

export interface SmartScore {
  trendScore: number
  momentumScore: number
  volatilityScore: number
  volumeScore: number
  compositeScore: number
  signalType: 'STRONG_TREND' | 'REVERSAL' | 'BREAKOUT' | 'CONSOLIDATION' | 'DIVERGENCE'
  confidence: number
  action: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL'
  tradeTimeframe: 'SCALP' | 'DAY' | 'SWING' | 'POSITION'
}

export interface ScannerItem {
  symbol: string; name: string; category: string
  price: number; change: number; changePercent: number
  volume: number; high: number; low: number
  rsi: number | null; macdSignal: string | null; macdHistogram: number | null
  bollingerPosition: string | null; stochK: number | null; stochD: number | null
  adx: number | null; atr: number | null; atrVolatility: string | null
  direction: string; signalClass: string; technicalScore: number; confidence: number
  smartScore: SmartScore | null
  sparkline: number[]; reasons: string[]; reasonsAr: string[]
  aiOpinion: string | null
  marketOpen: boolean; source: string; timestamp: string
}

export interface HeatmapItem {
  symbol: string; name: string; category: string
  price: number; changePercent: number; volume: number
  direction: string; technicalScore: number; marketCap: number | null
}

export interface ScannerOverview {
  totalScanned: number; bullish: number; bearish: number; neutral: number
  topGainers: { symbol: string; changePercent: number }[]
  topLosers: { symbol: string; changePercent: number }[]
  sectorStrength: Record<string, number>
}

interface UseScannerDataOptions {
  timeframe?: string
  category?: string
  intervalMs?: number
}

export function useScannerData(options: UseScannerDataOptions = {}) {
  const { timeframe = '1h', category = 'ALL', intervalMs = 60000 } = options

  const [scanData, setScanData] = useState<ScannerItem[]>([])
  const [heatmapData, setHeatmapData] = useState<HeatmapItem[]>([])
  const [overview, setOverview] = useState<ScannerOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [countdown, setCountdown] = useState(intervalMs / 1000)
  const [error, setError] = useState<string | null>(null)

  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const countdownRef = useRef<NodeJS.Timeout | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const fetchScanData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(
        `/api/scanner/scan?timeframe=${timeframe}&category=${category}`,
        { signal, headers: { 'Content-Type': 'application/json' } } as RequestInit
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.success && j.items) {
        setScanData(j.items)
        setError(null)
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[ScannerData] Scan error:', e)
        setError('فشل تحميل بيانات المسح')
      }
    }
  }, [timeframe, category])

  const fetchHeatmapData = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(
        `/api/scanner/heatmap?category=${category}`,
        { signal, headers: { 'Content-Type': 'application/json' } } as RequestInit
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.success && j.data) setHeatmapData(j.data)
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[ScannerData] Heatmap error:', e)
      }
    }
  }, [category])

  const fetchOverview = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch(
        '/api/scanner/overview',
        { signal, headers: { 'Content-Type': 'application/json' } } as RequestInit
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j.success && j.data) setOverview(j.data)
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('[ScannerData] Overview error:', e)
      }
    }
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    await Promise.all([
      fetchScanData(ctrl.signal),
      fetchHeatmapData(ctrl.signal),
      fetchOverview(ctrl.signal),
    ])
    setLastUpdate(new Date())
    setLoading(false)
    setCountdown(intervalMs / 1000)
  }, [fetchScanData, fetchHeatmapData, fetchOverview, intervalMs])

  // Initial + deps change
  useEffect(() => {
    refresh()
  }, [refresh])

  // Auto-refresh interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refresh()
    }, intervalMs)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [intervalMs, refresh])

  // Countdown ticker
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? intervalMs / 1000 : prev - 1))
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [intervalMs])

  return {
    scanData, heatmapData, overview,
    loading, lastUpdate, countdown, refresh, error,
  }
}
