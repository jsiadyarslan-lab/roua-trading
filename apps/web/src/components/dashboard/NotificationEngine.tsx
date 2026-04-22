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

  useEffect(() => { setHydrated(true) }, [])
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

  // ── 2. مراقبة AI Narrator كل 90 ثانية ─────────────────────
  useEffect(() => {
    if (!hydrated || !settings.aiAlerts) return

    const fetchAiAlert = async () => {
      const now = Date.now()
      if (now - lastAiCheckRef.current < 90_000) return
      lastAiCheckRef.current = now

      try {
        const res = await fetch('/api/ai/narrator')
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
        })
      } catch {}
    }

    fetchAiAlert()
    const iv = setInterval(fetchAiAlert, 10_000) // check every 10s, but skips if < 90s since last fire
    return () => clearInterval(iv)
  }, [hydrated, settings.aiAlerts, settings.minConfidence, addNotification])

  // ── 3. مراقبة السكانر كل 2 دقيقة ──────────────────────────
  useEffect(() => {
    if (!hydrated || !settings.scannerAlerts) return

    const fetchScanAlert = async () => {
      const now = Date.now()
      if (now - lastScanCheckRef.current < 120_000) return
      lastScanCheckRef.current = now

      try {
        const res = await fetch('/api/market-scan')
        const data = await res.json()
        if (!data.success || !data.data?.length) return

        const top = data.data[0]
        if (top.strength < settings.minConfidence) return

        addNotification({
          source: 'scanner',
          priority: top.strength >= 80 ? 'high' : 'medium',
          action: top.dir === 'buy' ? 'BUY' : 'SELL',
          title: `📡 سكانر: ${top.pair} — ${top.dir === 'buy' ? 'إشارة شراء' : 'إشارة بيع'}`,
          body: `قوة الإشارة ${top.strength}% | ${(top.reasons || []).slice(0, 2).join(' · ')}`,
          pair: top.pair,
          price: top.price,
          confidence: top.strength,
        })
      } catch {}
    }

    fetchScanAlert()
    const iv = setInterval(fetchScanAlert, 10_000)
    return () => clearInterval(iv)
  }, [hydrated, settings.scannerAlerts, settings.minConfidence, addNotification])

  // ── 4. مراقبة تغيرات حادة في أسعار السوق ─────────────────
  useEffect(() => {
    if (!hydrated || !settings.tradeAlerts) return

    const iv = setInterval(() => {
      const currentQuotes = quotesRef.current
      currentQuotes.forEach((q, symbol) => {
        const change = Math.abs(q.changePercent || 0)
        if (change > 4) {
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
