'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useVisibleInterval } from '@/hooks/useVisibleInterval'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useBotStore } from '@/hooks/useBotStore'
import { useSymbolStore } from '@/hooks/useSymbolStore'
import { useNotificationSocket } from '@/hooks/useNotificationSocket'
import { ensureAuth } from '@/lib/api-fetch'

/* ══════════════════════════════════════════════════════
   NotificationEngine — مكوّن خفي يعمل دائماً في الخلفية
   يراقب مصادر متعددة ويُطلق تنبيهات تلقائية

   UX Improvements (v2):
   - Real-time Socket.IO push (instant notifications)
   - Auto-execute signals when enabled
   - Real order execution from toast cards (not just paper trading)

   i18n Strategy (v3):
   - ALL notifications include notificationType + params
   - useLocalizedNotif translates at DISPLAY time
   - This ensures correct language regardless of when the
     notification was created or which locale was active
══════════════════════════════════════════════════════ */

export function NotificationEngine({ quotes = new Map() }: { quotes?: Map<string, any> }) {
  const t = useTranslations('dashboard.notificationEngine')
  const tc = useTranslations('common')
  const locale = useLocale()
  const { addNotification, settings } = useNotificationStore()
  const { isOn: botOn, logs: botLogs } = useBotStore()
  const { selectedSymbol } = useSymbolStore()
  const { registerAutoExecuteHandler } = useNotificationSocket()
  const prevLogLengthRef = useRef(0)
  const lastAiCheckRef = useRef(0)
  const lastScanCheckRef = useRef(0)
  const lastTradeAlertsRef = useRef<Record<string, number>>({})
  const quotesRef = useRef(quotes)
  const [hydrated, setHydrated] = useState(false)
  // FIX: Use ref instead of state for autoExecuting — it doesn't need to
  // trigger re-renders. State caused: (1) new Set() on every update,
  // (2) handleAutoExecute recreation, (3) useEffect re-registration churn.
  const autoExecutingRef = useRef<Set<string>>(new Set())

  // On hydration, skip all existing logs — only process NEW ones after mount
  useEffect(() => {
    setHydrated(true)
    const currentLogs = useBotStore.getState().logs
    prevLogLengthRef.current = currentLogs.length
    lastAiCheckRef.current = Date.now()
    lastScanCheckRef.current = Date.now()
  }, [])
  useEffect(() => { quotesRef.current = quotes }, [quotes])

  // ── Auto-Execute Handler ──────────────────────────────────
  const handleAutoExecute = useCallback(async (data: {
    notificationId: string
    signalId: string
    pair: string
    action: string
    confidence: number
    entryPrice?: number
    stopLoss?: number
    takeProfit?: number
    maxPositionSizePercent?: number
  }) => {
    // Prevent double-execution
    if (autoExecutingRef.current.has(data.signalId)) return
    autoExecutingRef.current.add(data.signalId)

    const side = data.action === 'BUY' ? 'BUY' : 'SELL'
    const sideLabel = side === 'BUY' ? tc('buy') : tc('sell')
    const entryPrice = data.entryPrice || 0

    try {
      await ensureAuth()

      // Get user's credentials
      const credRes = await fetch('/api/portfolio/credentials')
      const credData = await credRes.json()
      const credentials = credData.data || credData.credentials || []
      const credentialId = credentials[0]?.id || credentials[0]?.credentialId

      if (!credentialId) {
        addNotification({
          source: 'system',
          priority: 'high',
          action: 'WARN',
          title: t('autoExecuteFailed'),
          body: t('noExchangeCredentials'),
          pair: data.pair,
          // i18n translation data — frontend uses these to translate to user's locale
          notificationType: 'autoExecuteFailed',
          params: { pair: data.pair },
        })
        return
      }

      // Execute signal via v2 pipeline
      const idempotencyKey = crypto.randomUUID()
      const sl = data.stopLoss || (entryPrice > 0 ? (side === 'BUY' ? entryPrice * 0.98 : entryPrice * 1.02) : undefined)

      const res = await fetch('/api/trading/v2/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credentialId,
          symbol: data.pair,
          side,
          type: 'MARKET',
          quantity: 0.01, // Safe minimum for auto-execute
          stopLoss: sl,
          takeProfit: data.takeProfit,
          idempotencyKey,
          clientOrderId: idempotencyKey,
          signalId: data.signalId,
        }),
      })

      const j = await res.json()

      if (res.ok && j.success) {
        addNotification({
          source: 'trade',
          priority: 'urgent',
          action: side === 'BUY' ? 'BUY' : 'SELL',
          title: t('autoExecuteSuccess', { side: sideLabel, pair: data.pair }),
          body: t('autoExecuteSuccessBody', { confidence: data.confidence, orderId: j.data?.orderId?.slice(0, 8) || '' }),
          pair: data.pair,
          price: entryPrice,
          confidence: data.confidence,
          // i18n translation data
          notificationType: 'autoExecuteSuccess',
          params: { side: sideLabel, pair: data.pair, confidence: data.confidence, orderId: j.data?.orderId?.slice(0, 8) || '' },
        })
      } else {
        const reason = j.message || t('rejectedByRiskGuard')
        addNotification({
          source: 'system',
          priority: 'high',
          action: 'WARN',
          title: t('autoExecuteRejected'),
          body: t('autoExecuteRejectedBody', { pair: data.pair, reason }),
          pair: data.pair,
          // i18n translation data
          notificationType: 'autoExecuteRejected',
          params: { pair: data.pair, reason },
        })
      }
    } catch (error: any) {
      const errorMsg = error.message || tc('error')
      addNotification({
        source: 'system',
        priority: 'medium',
        action: 'WARN',
        title: t('autoExecuteError'),
        body: t('connectionFailed', { error: errorMsg }),
        pair: data.pair,
        // i18n translation data
        notificationType: 'autoExecuteError',
        params: { error: errorMsg },
      })
    } finally {
      // Clean up after 30 seconds to prevent memory leak
      setTimeout(() => {
        autoExecutingRef.current.delete(data.signalId)
      }, 30000)
    }
  }, [addNotification])

  // Register auto-execute handler with socket hook
  useEffect(() => {
    registerAutoExecuteHandler(handleAutoExecute)
  }, [handleAutoExecute, registerAutoExecuteHandler])

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
        const sideLabel = log.type === 'buy' ? tc('buy') : tc('sell')
        addNotification({
          source: 'bot',
          priority: 'urgent',
          action: log.type === 'buy' ? 'BUY' : 'SELL',
          title: `🤖 ${t('botSignal', { side: sideLabel })}`,
          body: log.msg,
          pair: selectedSymbol,
          // i18n translation data
          notificationType: 'botSignal',
          params: { side: sideLabel, message: log.msg || '' },
        })
      }
    }
  }, [botLogs, botOn, hydrated, addNotification, selectedSymbol])

  // ── 2. مراقبة AI Narrator كل 10 دقائق ────────────────────
  const fetchAiAlert = useCallback(async () => {
    if (!hydrated || !settings.aiAlerts) return
    const AI_ALERT_COOLDOWN = 600_000
    const now = Date.now()
    if (now - lastAiCheckRef.current < AI_ALERT_COOLDOWN) return
    lastAiCheckRef.current = now

    try {
      const res = await fetch(`/api/ai/narrator?symbol=${encodeURIComponent(selectedSymbol)}&lang=${locale}`)
      const data = await res.json()
      if (!data.success) return
      // Block degraded/fake data from creating phantom notifications
      if (data.data?.degraded) return
      const { narrative, sentiment, confidence } = data.data
      if (!narrative || (confidence ?? 0) < settings.minConfidence) return

      const sentimentLabel = sentiment === 'bullish' ? t('bullishPrediction') : sentiment === 'bearish' ? t('bearishPrediction') : t('neutralAnalysis')
      const summary = narrative.slice(0, 120) + (narrative.length > 120 ? '...' : '')

      addNotification({
        source: 'ai',
        priority: confidence >= 85 ? 'high' : 'medium',
        action: sentiment === 'bullish' ? 'BUY' : sentiment === 'bearish' ? 'SELL' : 'INFO',
        title: `🧠 ${t('aiAnalysis', { sentiment: sentimentLabel })}`,
        body: summary,
        confidence: confidence ?? 70,
        pair: selectedSymbol,
        // i18n translation data
        notificationType: 'aiAnalysis',
        params: { sentiment: sentimentLabel, summary },
      })
    } catch {}
  }, [hydrated, settings.aiAlerts, settings.minConfidence, selectedSymbol, addNotification, locale])

  useEffect(() => { fetchAiAlert() }, [fetchAiAlert])
  // Poll AI alerts every 60s — pauses when tab hidden
  useVisibleInterval(fetchAiAlert, 60_000)

  // ── 3. مراقبة السكانر كل 5 دقائق ──────────────────────────
  const fetchScanAlert = useCallback(async () => {
    if (!hydrated || !settings.scannerAlerts) return
    const now = Date.now()
    if (now - lastScanCheckRef.current < 300_000) return
    lastScanCheckRef.current = now

    try {
      const res = await fetch('/api/scanner/scan?timeframe=1h')
      const data = await res.json()
      if (!data.success || !data.items?.length) return

      const top = data.items[0]
      if (top.confidence < settings.minConfidence) return

      const directionLabel = top.direction === 'STRONG_BUY' || top.direction === 'BUY' ? tc('buySignal') : top.direction === 'STRONG_SELL' || top.direction === 'SELL' ? tc('sellSignal') : t('monitoring')
      const reasons = (top.reasonsAr || top.reasons || []).slice(0, 2).join(' · ')

      addNotification({
        source: 'scanner',
        priority: top.confidence >= 80 ? 'high' : 'medium',
        action: top.direction === 'STRONG_BUY' || top.direction === 'BUY' ? 'BUY' : top.direction === 'STRONG_SELL' || top.direction === 'SELL' ? 'SELL' : 'INFO',
        title: `📡 ${t('scannerSignal', { symbol: top.symbol, direction: directionLabel })}`,
        body: t('signalStrength', { confidence: top.confidence, reasons }),
        pair: top.symbol,
        price: top.price,
        confidence: top.confidence,
        // i18n translation data
        notificationType: 'scannerSignal',
        params: { symbol: top.symbol, direction: directionLabel, confidence: top.confidence, reasons },
      })
    } catch {}
  }, [hydrated, settings.scannerAlerts, settings.minConfidence, addNotification])

  useEffect(() => { fetchScanAlert() }, [fetchScanAlert])
  // Poll scanner alerts every 60s — pauses when tab hidden
  useVisibleInterval(fetchScanAlert, 60_000)

  // ── 4. مراقبة تغيرات حادة في أسعار السوق ─────────────────
  // Replaces manual setInterval with useVisibleInterval — pauses when tab hidden
  useVisibleInterval(() => {
    if (!hydrated || !settings.tradeAlerts) return
    const currentQuotes = quotesRef.current
    const now = Date.now()
    // FIX: Prune stale entries from lastTradeAlertsRef to prevent unbounded growth.
    // Remove entries older than the 5-minute cooldown window.
    for (const sym of Object.keys(lastTradeAlertsRef.current)) {
      if (now - lastTradeAlertsRef.current[sym] > 300_000) {
        delete lastTradeAlertsRef.current[sym]
      }
    }
    currentQuotes.forEach((q, symbol) => {
      const change = Math.abs(q.changePercent || 0)
      if (change > 4 && (!lastTradeAlertsRef.current[symbol] || now - lastTradeAlertsRef.current[symbol] > 300_000)) {
        lastTradeAlertsRef.current[symbol] = now
        const changeStr = q.changePercent?.toFixed(2) || '0'
        addNotification({
          source: 'trade',
          priority: change > 8 ? 'urgent' : 'high',
          action: (q.changePercent || 0) > 0 ? 'BUY' : 'SELL',
          title: `⚡ ${t('sharpMove', { symbol })}`,
          body: t('priceChangeOpportunity', { change: changeStr }),
          pair: symbol,
          price: q.price,
          // i18n translation data
          notificationType: 'sharpMove',
          params: { symbol, change: changeStr },
        })
      }
    })
  }, 30_000)

  return null
}
