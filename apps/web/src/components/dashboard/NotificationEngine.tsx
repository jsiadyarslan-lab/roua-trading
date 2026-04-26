'use client'

import { useEffect, useRef, useState } from 'react'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useBotStore } from '@/hooks/useBotStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'

/* ══════════════════════════════════════════════════════
   NotificationEngine — مكوّن خفي يعمل دائماً في الخلفية
   يراقب مصادر متعددة ويُطلق تنبيهات تلقائية
══════════════════════════════════════════════════════ */

export function NotificationEngine({ quotes = new Map() }: { quotes?: Map<string, any> }) {
  const { addNotification, settings } = useNotificationStore()
  const { isOn: botOn, logs: botLogs } = useBotStore()
  const { selectedSymbol } = useSymbolStore()
  const prevLogLengthRef = useRef(0)
  const lastAiCheckRef = useRef(0)
  const lastScanCheckRef = useRef(0)
  const quotesRef = useRef(quotes)
  const [hydrated, setHydrated] = useState(false)

  // On hydration, skip all existing logs — only process NEW ones after mount
  // Also initialize ALL timestamp refs to now() to prevent phantom alerts on page load
  useEffect(() => {
    setHydrated(true)
    // Initialize ref to current length so old persisted logs are NOT treated as new
    const currentLogs = useBotStore.getState().logs
    prevLogLengthRef.current = currentLogs.length
    // CRITICAL: Initialize timestamp refs to now so the first interval check
    // doesn't fire immediately (which was causing phantom alerts)
    lastAiCheckRef.current = Date.now()
    lastScanCheckRef.current = Date.now()
  }, [])
  useEffect(() => { quotesRef.current = quotes }, [quotes])

  // ── 1. مراقبة سجلات البوت وتحويلها لتنبيهات ──────────────
  useEffect(() => {
    if (!hydrated || !botOn) return
    if (botLogs.length === 0 || botLogs.length <= prevLogLengthRef.current) {
      prevLogLengthRef.current = botLogs.length
      return
    }

    const newLogs = botLogs.slice(0, botLogs.length - prevLogLengthRef.current)
    prevLogLengthRef.current = botLogs.length

    for (const log of newLogs) {
      if (log.type === 'buy' || log.type === 'sell') {
        addNotification({
          source: 'bot',
          priority: 'urgent',
          action: log.type === 'buy' ? 'BUY' : 'SELL',
          title: `🤖 البوت: إشارة ${log.type === 'buy' ? 'شراء' : 'بيع'}`,
          body: log.msg,
          pair: selectedSymbol,
        })
      }
    }
  }, [botLogs, botOn, hydrated, addNotification, selectedSymbol])

  // ── 2. مراقبة AI Narrator كل 10 دقائق ────────────────────
  useEffect(() => {
    if (!hydrated || !settings.aiAlerts) return

    const AI_ALERT_COOLDOWN = 600_000 // 10 minutes — was 90s which caused spam

    const fetchAiAlert = async () => {
      const now = Date.now()
      if (now - lastAiCheckRef.current < AI_ALERT_COOLDOWN) return
      lastAiCheckRef.current = now

      try {
        const res = await fetch(`/api/ai/narrator?symbol=${encodeURIComponent(selectedSymbol)}`)
        const data = await res.json()
        if (!data.success) return
        const { narrative, sentiment, confidence } = data.data
        if (!narrative || (confidence ?? 0) < settings.minConfidence) return

        addNotification({
          source: 'ai',
          priority: confidence >= 85 ? 'high' : 'medium',
          action: sentiment === 'bullish' ? 'BUY' : sentiment === 'bearish' ? 'SELL' : 'INFO',
          title: `🧠 تحليل AI: ${sentiment === 'bullish' ? 'توقع صعود' : sentiment === 'bearish' ? 'توقع هبوط' : 'تحليل محايد'}`,
          body: narrative.slice(0, 120) + (narrative.length > 120 ? '...' : ''),
          confidence: confidence ?? 70,
          pair: selectedSymbol,
        })
      } catch {}
    }

    // Don't fire immediately on mount to avoid spamming on refresh
    const iv = setInterval(fetchAiAlert, 60_000) // check every 60s, but only fires if 10min cooldown passed
    return () => clearInterval(iv)
  }, [hydrated, settings.aiAlerts, settings.minConfidence, addNotification, selectedSymbol])

  // ── 3. مراقبة السكانر كل 2 دقيقة ──────────────────────────
  useEffect(() => {
    if (!hydrated || !settings.scannerAlerts) return

    const fetchScanAlert = async () => {
      const now = Date.now()
      if (now - lastScanCheckRef.current < 300_000) return // 5 min cooldown (was 2min)
      lastScanCheckRef.current = now

      try {
        const res = await fetch('/api/scanner/scan?timeframe=1h')
        const data = await res.json()
        if (!data.success || !data.items?.length) return

        const top = data.items[0]
        if (top.confidence < settings.minConfidence) return

        addNotification({
          source: 'scanner',
          priority: top.confidence >= 80 ? 'high' : 'medium',
          action: top.direction === 'STRONG_BUY' || top.direction === 'BUY' ? 'BUY' : top.direction === 'STRONG_SELL' || top.direction === 'SELL' ? 'SELL' : 'INFO',
          title: `📡 سكانر: ${top.symbol} — ${top.direction === 'STRONG_BUY' || top.direction === 'BUY' ? 'إشارة شراء' : top.direction === 'STRONG_SELL' || top.direction === 'SELL' ? 'إشارة بيع' : 'مراقبة'}`,
          body: `قوة الإشارة ${top.confidence}% | ${(top.reasonsAr || top.reasons || []).slice(0, 2).join(' · ')}`,
          pair: top.symbol,
          price: top.price,
          confidence: top.confidence,
        })
      } catch {}
    }

    // Don't fire immediately on mount to avoid phantom alerts on page load
    const iv = setInterval(fetchScanAlert, 60_000) // check every 60s, but skips if < 5min since last fire
    return () => clearInterval(iv)
  }, [hydrated, settings.scannerAlerts, settings.minConfidence, addNotification])

  // ── 4. مراقبة تغيرات حادة في أسعار السوق ─────────────────
  useEffect(() => {
    if (!hydrated || !settings.tradeAlerts) return

    let lastTradeAlerts: Record<string, number> = {}
    const iv = setInterval(() => {
      const currentQuotes = quotesRef.current
      currentQuotes.forEach((q, symbol) => {
        const change = Math.abs(q.changePercent || 0)
        const now = Date.now()
        // Only alert once per symbol per 5 minutes to avoid spam
        if (change > 4 && (!lastTradeAlerts[symbol] || now - lastTradeAlerts[symbol] > 300_000)) {
          lastTradeAlerts[symbol] = now
          addNotification({
            source: 'trade',
            priority: change > 8 ? 'urgent' : 'high',
            action: (q.changePercent || 0) > 0 ? 'BUY' : 'SELL',
            title: `⚡ تحرك حاد: ${symbol}`,
            body: `السعر تغيّر بنسبة ${q.changePercent?.toFixed(2)}% — قد تكون فرصة تداول`,
            pair: symbol,
            price: q.price,
          })
        }
      })
    }, 30_000)

    return () => clearInterval(iv)
  }, [hydrated, settings.tradeAlerts, addNotification])

  return null
}
