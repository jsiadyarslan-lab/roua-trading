'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
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
══════════════════════════════════════════════════════ */

export function NotificationEngine({ quotes = new Map() }: { quotes?: Map<string, any> }) {
  const { addNotification, settings } = useNotificationStore()
  const { isOn: botOn, logs: botLogs } = useBotStore()
  const { selectedSymbol } = useSymbolStore()
  const { registerAutoExecuteHandler } = useNotificationSocket()
  const prevLogLengthRef = useRef(0)
  const lastAiCheckRef = useRef(0)
  const lastScanCheckRef = useRef(0)
  const quotesRef = useRef(quotes)
  const [hydrated, setHydrated] = useState(false)
  const [autoExecuting, setAutoExecuting] = useState<Set<string>>(new Set())

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
    if (autoExecuting.has(data.signalId)) return
    setAutoExecuting(prev => new Set(prev).add(data.signalId))

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
          title: 'تنفيذ تلقائي فشل',
          body: `لا توجد بيانات اعتماد بورصة مرتبطة. يرجى ربط حسابك أولاً.`,
          pair: data.pair,
        })
        return
      }

      // Execute signal via v2 pipeline
      const idempotencyKey = crypto.randomUUID()
      const side = data.action === 'BUY' ? 'BUY' : 'SELL'
      const entryPrice = data.entryPrice || 0
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
          title: `⚡ تنفيذ تلقائي: ${side === 'BUY' ? 'شراء' : 'بيع'} ${data.pair}`,
          body: `تم تنفيذ الإشارة تلقائياً (ثقة: ${data.confidence}%) — الأمر: ${j.data?.orderId?.slice(0, 8) || 'قيد المعالجة'}...`,
          pair: data.pair,
          price: entryPrice,
          confidence: data.confidence,
        })
      } else {
        addNotification({
          source: 'system',
          priority: 'high',
          action: 'WARN',
          title: 'تنفيذ تلقائي مرفوض',
          body: `لم يتم التنفيذ التلقائي لـ ${data.pair}: ${j.message || 'تم الرفض من حارس المخاطر'}`,
          pair: data.pair,
        })
      }
    } catch (error: any) {
      addNotification({
        source: 'system',
        priority: 'medium',
        action: 'WARN',
        title: 'خطأ في التنفيذ التلقائي',
        body: `فشل الاتصال: ${error.message || 'خطأ في الشبكة'}`,
        pair: data.pair,
      })
    } finally {
      // Clean up after 30 seconds to prevent memory leak
      setTimeout(() => {
        setAutoExecuting(prev => {
          const next = new Set(prev)
          next.delete(data.signalId)
          return next
        })
      }, 30000)
    }
  }, [addNotification, autoExecuting])

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

    const AI_ALERT_COOLDOWN = 600_000

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

    const iv = setInterval(fetchAiAlert, 60_000)
    return () => clearInterval(iv)
  }, [hydrated, settings.aiAlerts, settings.minConfidence, addNotification, selectedSymbol])

  // ── 3. مراقبة السكانر كل 5 دقائق ──────────────────────────
  useEffect(() => {
    if (!hydrated || !settings.scannerAlerts) return

    const fetchScanAlert = async () => {
      const now = Date.now()
      if (now - lastScanCheckRef.current < 300_000) return
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

    const iv = setInterval(fetchScanAlert, 60_000)
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
