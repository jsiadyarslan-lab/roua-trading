'use client'

import { useEffect, useRef, useState } from 'react'
import { useBotStore } from '@/hooks/useBotStore'
import { usePaperTradesStore, type PaperTrade } from '@/hooks/usePaperTradesStore'
import { useNotificationStore } from '@/hooks/useNotificationStore'
import { useTabAlertStore } from '@/hooks/useTabAlertStore'
import { useMarketStore } from '@/hooks/useMarketStore'
import { usePositionsStore } from '@/hooks/usePositionsStore'
import { isMarketOpen } from '@/lib/market-hours'

// Default to paper trading for safety — only go live if explicitly enabled
const PAPER_TRADING_MODE = process.env.NEXT_PUBLIC_PAPER_TRADING !== 'false'
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
  const closePaperTrade = usePaperTradesStore((state) => state.closeTrade)
  const addNotification = useNotificationStore((state) => state.addNotification)

  const tradesRef = useRef(usePaperTradesStore.getState().trades)
  const lastExecutionRef = useRef<Record<string, number>>({})
  const executionTimestampsRef = useRef<number[]>([])
  /** Track the last time we logged a market-closed message per symbol to avoid spam */
  const lastMarketClosedLogRef = useRef<Record<string, number>>({})
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
      const aiMode = settings.useAIConsensus ? '[AI Consensus 🧠]' : '[Technical Only 📊]'
      addLog(`${mode} ${aiMode} تم تسليح المحرك — استراتيجية: ${settings.strategy}`, 'info')
    }
  }, [isOn, hydrated, settings.strategy, settings.useAIConsensus, addLog, setEngineState])

  /**
   * Consult the REAL NestJS AI Council for a given symbol.
   * Returns the consensus recommendation or null if unavailable.
   */
  const consultAICouncil = async (symbol: string): Promise<{
    recommendation: 'BUY' | 'SELL' | 'HOLD'
    consensusScore: number
    isRealAI: boolean
  } | null> => {
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
        signal: AbortSignal.timeout(30000),
      })

      if (!res.ok) return null
      const j = await res.json()
      if (!j.success || !j.data) return null

      return {
        recommendation: j.data.recommendation,
        consensusScore: j.data.consensusScore,
        isRealAI: j.source === 'real-ai',
      }
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!hydrated || !isOn) return

    let isBusy = false

    const manageOpenTrades = async () => {
      const botTrades = tradesRef.current.filter((trade) => trade.source === 'bot')
      if (botTrades.length === 0) return

      setEngineState('managing')

      for (const trade of botTrades) {
        try {
          // Use REAL market price from the market store (updated every 1s by GlobalLogicEngine)
          // NOT the scanner price which can be stale/fallback
          const quotes = useMarketStore.getState().quotes
          const quoteKey = Object.keys(quotes).find(k =>
            k.toUpperCase().replace('/', '') === trade.symbol.toUpperCase().replace('/', '')
          )
          const livePrice = quoteKey ? Number(quotes[quoteKey]?.price) : 0
          const latestPrice = livePrice > 0 ? livePrice : trade.currentPrice || trade.entryPrice

          if (livePrice > 0) {
            updatePaperTradePrice(trade.symbol, latestPrice)
          }

          // For non-crypto markets, check if market is still open before managing
          // If market is closed, we still need to manage existing positions but with caution
          const marketStatus = isMarketOpen(trade.symbol)
          if (!marketStatus.open) {
            // Market is closed — don't update prices or trigger TP/SL with stale data
            // Wait for market to reopen. Only close if we have a real live price.
            continue
          }

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
        let marketClosedCount = 0

        for (const signal of signals as SmartSignalLike[]) {
          if (!isOn) break

          // ═══════════════════════════════════════════════════
          // MARKET HOURS GATE: Check if the market for this
          // symbol is currently open. Skip if market is closed.
          // ═══════════════════════════════════════════════════
          const marketStatus = isMarketOpen(signal.pair)
          if (!marketStatus.open) {
            marketClosedCount++
            // Log market-closed message at most once per symbol per 10 minutes to avoid spam
            const lastLogTime = lastMarketClosedLogRef.current[signal.pair] || 0
            if (Date.now() - lastLogTime > 10 * 60 * 1000) {
              addLog(`[حماية السوق] ${signal.pair} — ${marketStatus.reason} — تم تخطي الإشارة`, 'warn')
              lastMarketClosedLogRef.current[signal.pair] = Date.now()
            }
            continue
          }

          // ═══════════════════════════════════════════════════
          // DATA QUALITY GATE: Block signals that rely on
          // degraded/fallback data (fake prices generated when
          // real APIs are unavailable, e.g. on weekends).
          // ═══════════════════════════════════════════════════
          if (signal.freshness === 'degraded') {
            // Only allow degraded data for crypto (24/7 market — data should be fresh)
            // For forex/stocks/commodities, degraded data means fake prices
            const marketType = marketStatus.marketType
            if (marketType !== 'crypto') {
              continue
            }
          }

          if (!shouldExecuteSignal(signal)) continue

          // ═══════════════════════════════════════════════════
          // AI CONSENSUS GATE: If enabled, consult AI Council
          // before executing. Only execute if AI agrees.
          // ═══════════════════════════════════════════════════
          if (settings.useAIConsensus) {
            setEngineState('scanning')
            addLog(`[AI Council] جاري استشارة النماذج لـ ${signal.pair}...`, 'info')

            const councilResult = await consultAICouncil(signal.pair)

            if (!councilResult) {
              addLog(`[AI Council] ⚠️ المجلس غير متاح — تخطي ${signal.pair} للسلامة`, 'warn')
              continue
            }

            const aiDirection = councilResult.recommendation === 'BUY' ? 'buy' : councilResult.recommendation === 'SELL' ? 'sell' : 'neutral'
            const aiSource = councilResult.isRealAI ? '🧠 AI حقيقي' : '📊 تحليل فني'

            if (councilResult.recommendation === 'HOLD') {
              addLog(`[AI Council] ${aiSource} — المجلس يوصي بالانتظار على ${signal.pair} (إجماع ${councilResult.consensusScore}%)`, 'warn')
              continue
            }

            if (aiDirection !== signal.dir) {
              addLog(`[AI Council] ${aiSource} — تعارض: السكانر=${signal.dir} لكن المجلس=${councilResult.recommendation} — تخطي ${signal.pair}`, 'warn')
              continue
            }

            addLog(`[AI Council] ${aiSource} — ✅ المجلس يؤكد ${councilResult.recommendation} على ${signal.pair} (إجماع ${councilResult.consensusScore}%)`, 'buy')
          }

          setEngineState('entering')
          executeTrade(signal, settings.useAIConsensus ? 'ai-consensus' : 'scanner')
          executionTimestampsRef.current.push(Date.now())
          lastExecutionRef.current[`${signal.pair}:${signal.dir}`] = Date.now()
          executedCount += 1

          if (executedCount >= 2) break
        }

        if (executedCount === 0) {
          if (marketClosedCount > 0 && marketClosedCount === signals.length) {
            // All signals were for closed markets — don't spam, just note it once
            addLog(`[حماية السوق] جميع الأسواق مغلقة حالياً — سيتم استئناف التداول عند الافتتاح`, 'warn')
          } else {
            addLog(`[تحليل] لا توجد فرص منسجمة مع ${settings.useAIConsensus ? 'إجماع AI و' : ''}سياسة البوت الآن (${new Date().toLocaleTimeString('ar-SA')})`, 'info')
          }
          setEngineState('armed')
        } else {
          addLog(`[تنفيذ آلي] تم فتح ${executedCount} صفقة من محرك ${settings.useAIConsensus ? 'AI + السكانر' : 'السكانر'}`, 'buy')
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

    // Don't fire immediately on mount — wait 15 seconds to let the system stabilize
    // and avoid generating fake notifications on page refresh
    const startupDelay = window.setTimeout(() => {
      scanAndExecute()
    }, 15000)

    const interval = setInterval(scanAndExecute, 30000)
    return () => {
      window.clearTimeout(startupDelay)
      clearInterval(interval)
    }
  }, [hydrated, isOn, settings.confLimit, settings.riskPct, settings.strategy, settings.useAIConsensus, addLog, addNotification, addPaperTrade, updatePaperTradePrice, closePaperTrade, patchStats, setEngineState])

  const shouldExecuteSignal = (signal: SmartSignalLike) => {
    const confidence = Number(signal.strength || 0)
    const price = Number(signal.price || 0)
    if (!price || signal.dir === 'neutral') return false

    // Apply confidence penalty for non-fresh data instead of blocking entirely
    const freshnessPenalty = signal.freshness === 'degraded' ? 10 : signal.freshness === 'stale' ? 5 : 0
    const effectiveConfidence = confidence - freshnessPenalty
    if (effectiveConfidence < settings.confLimit) return false

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

  const executeTrade = (signal: SmartSignalLike, strategySource: string = 'scanner') => {
    const price = Number(signal.price || 0)
    const confidence = Number(signal.strength || 0)
    // BUG-006 FIX: Use actual account balance instead of hardcoded 50.
    // Read imperatively (no subscription) to avoid unnecessary re-renders.
    const account = usePositionsStore.getState().account
    const buyingPower = Number(account?.buyingPower) || 500 // Fallback $500 paper
    const tradeAmount = Math.max(10, buyingPower * (settings.riskPct / 100))
    const qty = parseFloat((tradeAmount / price).toFixed(6))
    const isBuy = signal.dir === 'buy'
    // Wider TP/SL: 2.5% TP, 1.5% SL — gives trades room to breathe
    // Risk:Reward = 1.5:2.5 ≈ 1:1.67
    const tp = isBuy ? price * 1.025 : price * 0.975
    const sl = isBuy ? price * 0.985 : price * 1.015

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
        `[دخول] ${isBuy ? 'شراء' : 'بيع'} ${signal.pair} @ $${price.toFixed(2)} | ثقة ${confidence}% | ${strategySource === 'ai-consensus' ? '🧠 AI إجماع' : '📊 فني'} | ${signal.reasons?.[0] || 'إشارة موحدة'}`,
        isBuy ? 'buy' : 'sell'
      )

      // Push tab alert for bot trade
      useTabAlertStore.getState().pushAlert('bot', {
        action: isBuy ? 'BUY' : 'SELL',
        label: `${isBuy ? '⬆' : '⬇'} ${signal.pair} $${price.toFixed(0)}`,
        color: isBuy ? '#00C853' : '#FF3B30',
      })

      addNotification({
        source: 'bot',
        priority: confidence >= 80 ? 'high' : 'medium',
        action: isBuy ? 'BUY' : 'SELL',
        title: `البوت فتح مركز ${isBuy ? 'شراء' : 'بيع'} على ${signal.pair}`,
        body: `${strategySource === 'ai-consensus' ? '🧠 إجماع AI' : '📊 فني'} · ${signal.reasons?.[0] || 'إشارة scanner-engine'} · ثقة ${confidence}%`,
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

    // Properly archive the trade to closedTrades[] instead of just deleting it
    closePaperTrade(trade.id)
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

    // Push tab alert for bot exit
    useTabAlertStore.getState().pushAlert('bot', {
      action: profitable ? 'BUY' : 'SELL',
      label: `${reason === 'TP' ? '✅ ربح' : '❌ خسارة'} ${trade.symbol} ${pnl >= 0 ? '+' : ''}${pnl.toFixed(0)}$`,
      color: profitable ? '#00C853' : '#FF3B30',
    })
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
