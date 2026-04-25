'use client'

import { useEffect, useRef, useState } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore, type PaperTrade } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'

const PAPER_TRADING_MODE = process.env.NEXT_PUBLIC_PAPER_TRADING === 'true'
const COOLDOWN_MS = 5 * 60 * 1000
const MAX_OPEN_BOT_POSITIONS = 3
const MAX_TRADES_PER_HOUR = 6
const MAX_SESSION_LOSS = -250

type SmartSignalLike = {
  pair: string
  dir: 'buy' | 'sell' | 'neutral'
  strength: number
  price: number
  reasons?: string[]
  freshness?: 'fresh' | 'stale' | 'degraded'
}

export function BotEngine() {
  const { isOn, addLog, settings, setEngineState, patchStats } = useBotStore()
  const addPaperTrade = usePaperTradesStore((state) => state.addTrade)
  const updatePaperTradePrice = usePaperTradesStore((state) => state.updatePrice)
  const removePaperTrade = usePaperTradesStore((state) => state.removeTrade)
  const addNotification = useNotificationStore((state) => state.addNotification)

  const tradesRef = useRef(usePaperTradesStore.getState().trades)
  const lastExecutionRef = useRef<Record<string, number>>({})
  const executionTimestampsRef = useRef<number[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    const unsubscribe = usePaperTradesStore.subscribe((state) => {
      tradesRef.current = state.trades
      const openBotTrades = state.trades.filter((trade) => trade.source === 'bot').length
      patchStats({ openPositions: openBotTrades })
    })
    return () => unsubscribe()
  }, [patchStats])

  useEffect(() => {
    if (!hydrated) return
    setEngineState(isOn ? 'armed' : 'idle')
    if (isOn) {
      const mode = PAPER_TRADING_MODE ? '[Paper Trading 📄]' : '[Live Trading ⚡]'
      addLog(`${mode} تم تسليح المحرك — استراتيجية: ${settings.strategy}`, 'info')
    }
  }, [isOn, hydrated, settings.strategy, addLog, setEngineState])

  useEffect(() => {
    if (!hydrated || !isOn) return

    let isBusy = false

    const manageOpenTrades = async () => {
      const botTrades = tradesRef.current.filter((trade) => trade.source === 'bot')
      if (botTrades.length === 0) return

      setEngineState('managing')

      for (const trade of botTrades) {
        try {
          const res = await fetch(`/api/market-scan?pair=${encodeURIComponent(trade.symbol)}&tf=15m`, { cache: 'no-store' })
          const payload = await res.json()
          const signal = Array.isArray(payload?.data) ? payload.data[0] : null
          const latestPrice = Number(signal?.price || trade.currentPrice || trade.entryPrice)

          updatePaperTradePrice(trade.symbol, latestPrice)

          const shouldTakeProfit = trade.side === 'long'
            ? typeof trade.tp === 'number' && latestPrice >= trade.tp
            : typeof trade.tp === 'number' && latestPrice <= trade.tp
          const shouldStopLoss = trade.side === 'long'
            ? typeof trade.sl === 'number' && latestPrice <= trade.sl
            : typeof trade.sl === 'number' && latestPrice >= trade.sl

          if (shouldTakeProfit || shouldStopLoss) {
            setEngineState('exiting')
            closeBotTrade(trade, latestPrice, shouldTakeProfit ? 'TP' : 'SL')
          }
        } catch (error) {
          console.error('[BotEngine] manageOpenTrades failed', error)
        }
      }

      setEngineState('armed')
    }

    const scanAndExecute = async () => {
      if (isBusy) return
      isBusy = true
      setEngineState('scanning')

      try {
        await manageOpenTrades()

        const currentStats = useBotStore.getState().stats
        if (currentStats.sessionLoss <= MAX_SESSION_LOSS) {
          addLog('[الحماية] تم إيقاف دخول صفقات جديدة بسبب تجاوز حد خسارة الجلسة', 'warn')
          setEngineState('cooldown')
          return
        }

        const recentExecutions = executionTimestampsRef.current.filter((time) => Date.now() - time < 60 * 60 * 1000)
        executionTimestampsRef.current = recentExecutions
        if (recentExecutions.length >= MAX_TRADES_PER_HOUR) {
          addLog('[الحماية] تم الوصول إلى الحد الأقصى للصفقات خلال الساعة', 'warn')
          setEngineState('cooldown')
          return
        }

        const res = await fetch('/api/market-scan', { cache: 'no-store' })
        const payload = await res.json()
        const signals = Array.isArray(payload?.data) ? payload.data : []

        let executedCount = 0
        for (const signal of signals as SmartSignalLike[]) {
          if (!isOn) break
          if (!shouldExecuteSignal(signal)) continue

          setEngineState('entering')
          executeTrade(signal)
          executionTimestampsRef.current.push(Date.now())
          lastExecutionRef.current[`${signal.pair}:${signal.dir}`] = Date.now()
          executedCount += 1

          if (executedCount >= 2) break
        }

        if (executedCount === 0) {
          addLog(`[تحليل] لا توجد فرص منسجمة مع سياسة البوت الآن (${new Date().toLocaleTimeString('ar-SA')})`, 'info')
          setEngineState('armed')
        } else {
          addLog(`[تنفيذ آلي] تم فتح ${executedCount} صفقة من محرك السكانر`, 'buy')
          setEngineState('cooldown')
          window.setTimeout(() => {
            if (useBotStore.getState().isOn) setEngineState('armed')
          }, 2500)
        }
      } catch (error) {
        console.error('[BotEngine] scan failed', error)
        addLog('[خطأ] فشل البوت في قراءة طبقة الإشارات الموحدة', 'warn')
        setEngineState('armed')
      } finally {
        isBusy = false
      }
    }

    scanAndExecute()
    const interval = setInterval(scanAndExecute, 30000)
    return () => clearInterval(interval)
  }, [hydrated, isOn, settings.confLimit, settings.riskPct, settings.strategy, addLog, addNotification, addPaperTrade, updatePaperTradePrice, removePaperTrade, patchStats, setEngineState])

  const shouldExecuteSignal = (signal: SmartSignalLike) => {
    const confidence = Number(signal.strength || 0)
    const price = Number(signal.price || 0)
    if (!price || signal.dir === 'neutral' || confidence < settings.confLimit) return false
    if (signal.freshness && signal.freshness !== 'fresh') return false

    const executionKey = `${signal.pair}:${signal.dir}`
    const lastExecutedAt = lastExecutionRef.current[executionKey] || 0
    if (Date.now() - lastExecutedAt < COOLDOWN_MS) return false

    const botTrades = tradesRef.current.filter((trade) => trade.source === 'bot')
    if (botTrades.length >= MAX_OPEN_BOT_POSITIONS) return false

    return !botTrades.some((trade) =>
      trade.symbol === signal.pair &&
      ((trade.side === 'long' && signal.dir === 'buy') || (trade.side === 'short' && signal.dir === 'sell'))
    )
  }

  const executeTrade = (signal: SmartSignalLike) => {
    const price = Number(signal.price || 0)
    const confidence = Number(signal.strength || 0)
    const tradeAmount = Math.max(10, settings.riskPct * 50)
    const qty = parseFloat((tradeAmount / price).toFixed(6))
    const isBuy = signal.dir === 'buy'
    const tp = isBuy ? price * 1.02 : price * 0.98
    const sl = isBuy ? price * 0.99 : price * 1.01

    if (PAPER_TRADING_MODE) {
      addPaperTrade({
        symbol: signal.pair,
        side: isBuy ? 'long' : 'short',
        qty,
        entryPrice: price,
        currentPrice: price,
        tp,
        sl,
        entryTime: Date.now(),
        strategy: settings.strategy,
        source: 'bot',
      })

      const currentStats = useBotStore.getState().stats
      patchStats({
        trades: currentStats.trades + 1,
        openPositions: currentStats.openPositions + 1,
      })

      addLog(
        `[دخول] ${isBuy ? 'شراء' : 'بيع'} ${signal.pair} @ $${price.toFixed(2)} | ثقة ${confidence}% | ${signal.reasons?.[0] || 'إشارة موحدة'}`,
        isBuy ? 'buy' : 'sell'
      )

      addNotification({
        source: 'bot',
        priority: confidence >= 80 ? 'high' : 'medium',
        action: isBuy ? 'BUY' : 'SELL',
        title: `البوت فتح مركز ${isBuy ? 'شراء' : 'بيع'} على ${signal.pair}`,
        body: `${signal.reasons?.[0] || 'إشارة scanner-engine'} · ثقة ${confidence}%`,
        pair: signal.pair,
        price,
        confidence,
      })
      return
    }

    addLog(`[Live] محاولة تنفيذ ${isBuy ? 'شراء' : 'بيع'} على ${signal.pair}`, 'info')
  }

  const closeBotTrade = (trade: PaperTrade, exitPrice: number, reason: 'TP' | 'SL') => {
    const diff = trade.side === 'long'
      ? exitPrice - trade.entryPrice
      : trade.entryPrice - exitPrice
    const pnl = diff * trade.qty
    const currentStats = useBotStore.getState().stats
    const wins = currentStats.wins + (pnl >= 0 ? 1 : 0)
    const losses = currentStats.losses + (pnl < 0 ? 1 : 0)
    const closedTrades = wins + losses
    const profit = currentStats.profit + pnl
    const winRate = closedTrades > 0 ? Math.round((wins / closedTrades) * 100) : 0
    const sessionLoss = pnl < 0 ? currentStats.sessionLoss + pnl : currentStats.sessionLoss

    removePaperTrade(trade.id)
    patchStats({
      profit: Number(profit.toFixed(2)),
      wins,
      losses,
      winRate,
      sessionLoss: Number(sessionLoss.toFixed(2)),
      openPositions: Math.max(0, currentStats.openPositions - 1),
    })

    const profitable = pnl >= 0
    addLog(
      `[خروج] ${trade.symbol} أُغلق عبر ${reason} @ $${exitPrice.toFixed(2)} | PnL ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}`,
      profitable ? 'buy' : 'sell'
    )
    addNotification({
      source: 'bot',
      priority: profitable ? 'medium' : 'high',
      action: profitable ? 'BUY' : 'SELL',
      title: `تم إغلاق مركز البوت على ${trade.symbol}`,
      body: `${reason} · ${pnl >= 0 ? 'ربح' : 'خسارة'} ${pnl.toFixed(2)}$`,
      pair: trade.symbol,
      price: exitPrice,
      confidence: 80,
    })
  }

  return null
}
