import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/coach/performance
 *
 * Get AI-powered performance advice by:
 * 1. Fetching user's trades and closed positions directly from DB
 * 2. Computing statistics
 * 3. Sending to NestJS AI orchestrator for analysis
 * 4. Falling back to rule-based advice if AI unavailable
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { userId: bodyUserId, closedPaperTrades = [], openPaperTrades = [] } = body

    // DATA ISOLATION: Always resolve userId from session cookie.
    // Never trust bodyUserId from the request body — it allows user spoofing.
    let userId: string | undefined
    const sessionToken = req.cookies.get('roua_session')?.value
    if (sessionToken) {
      try {
        const session = await db.session.findUnique({
          where: { token: sessionToken },
          select: { userId: true, expiresAt: true },
        })
        if (session && session.expiresAt > new Date()) {
          userId = session.userId
        }
      } catch { /* non-critical — DB may be unavailable */ }
    }

    if (!userId) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    const origin = req.nextUrl.origin

    // 1. Fetch trades from database
    let trades: any[] = []
    try {
      trades = await db.trade.findMany({
        where: { userId },
        orderBy: { executedAt: 'desc' },
        take: 50,
        select: {
          symbol: true,
          side: true,
          pnl: true,
          executedAt: true,
        },
      })
    } catch (dbError: any) {
      console.warn('[coach/performance] Trades query failed:', dbError?.message || dbError)
    }

    // 2. Fetch closed positions from database
    let closedPositions: any[] = []
    try {
      closedPositions = await db.position.findMany({
        where: { userId, status: 'CLOSED' },
        orderBy: { closedAt: 'desc' },
        take: 50,
        select: {
          symbol: true,
          side: true,
          realizedPnl: true,
          closedAt: true,
        },
      })
    } catch (dbError: any) {
      console.warn('[coach/performance] Closed positions query failed:', dbError?.message || dbError)
    }

    // 3. Fetch paper orders (the primary trading data for this platform)
    let paperOrders: any[] = []
    try {
      paperOrders = await db.paperOrder.findMany({
        where: { userId, status: 'FILLED' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          symbol: true,
          side: true,
          quantity: true,
          averagePrice: true,
          fee: true,
          createdAt: true,
        },
      })
    } catch (dbError: any) {
      console.warn('[coach/performance] Paper orders query failed:', dbError?.message || dbError)
    }

    // 4. Calculate statistics
    // Combine all PnL sources: Trade.pnl + Position.realizedPnl + PaperOrder pairs + Client-side closedTrades
    const paperPnl = calculatePaperPnl(paperOrders)
    const clientClosedPnl = (closedPaperTrades || []).map((t: any) => Number(t.realizedPnl) || 0)
    const allPnl = [
      ...trades.map((t: any) => t.pnl || 0),
      ...closedPositions.map((p: any) => Number(p.realizedPnl) || 0),
      ...paperPnl,
      ...clientClosedPnl,
    ]

    const winningTrades = allPnl.filter((p: number) => p > 0)
    const losingTrades = allPnl.filter((p: number) => p < 0)
    const totalTrades = allPnl.length
    const winRate = totalTrades > 0 ? Math.round((winningTrades.length / totalTrades) * 1000) / 10 : 0
    const avgWin = winningTrades.length > 0 ? Math.round((winningTrades.reduce((s: number, v: number) => s + v, 0) / winningTrades.length) * 100) / 100 : 0
    const avgLoss = losingTrades.length > 0 ? Math.round((Math.abs(losingTrades.reduce((s: number, v: number) => s + v, 0)) / losingTrades.length) * 100) / 100 : 0
    const profitFactor = avgLoss > 0 ? Math.round((avgWin / avgLoss) * 100) / 100 : avgWin > 0 ? -1 : 0
    const totalPnl = Math.round(allPnl.reduce((s: number, v: number) => s + v, 0) * 100) / 100
    const biggestWin = winningTrades.length > 0 ? Math.max(...winningTrades) : 0
    const biggestLoss = losingTrades.length > 0 ? Math.min(...losingTrades) : 0

    // Max drawdown
    let peak = 0, maxDrawdown = 0, cumPnl = 0
    const sortedPnl = [...allPnl].reverse()
    sortedPnl.forEach(pnl => {
      cumPnl += pnl
      if (cumPnl > peak) peak = cumPnl
      const dd = peak - cumPnl
      if (dd > maxDrawdown) maxDrawdown = dd
    })

    // Consecutive wins/losses
    let consecutiveWins = 0, consecutiveLosses = 0, tempW = 0, tempL = 0
    allPnl.forEach((pnl: number) => {
      if (pnl > 0) { tempW++; tempL = 0; consecutiveWins = Math.max(consecutiveWins, tempW) }
      else if (pnl < 0) { tempL++; tempW = 0; consecutiveLosses = Math.max(consecutiveLosses, tempL) }
      else { tempW = 0; tempL = 0 }
    })

    // Most traded symbol
    const symbolCounts: Record<string, number> = {}
    trades.forEach((t: any) => { symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1 })
    paperOrders.forEach((o: any) => { symbolCounts[o.symbol] = (symbolCounts[o.symbol] || 0) + 1 })
    ;(closedPaperTrades || []).forEach((t: any) => { symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1 })
    const mostTradedSymbol = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    // Long vs short — include paper orders and client-side trades
    const allTrades = [
      ...trades,
      ...paperOrders.map((o: any) => ({ symbol: o.symbol, side: o.side, pnl: 0 })),
      ...(closedPaperTrades || []).map((t: any) => ({ symbol: t.symbol, side: t.side || 'BUY', pnl: Number(t.realizedPnl) || 0 })),
    ]
    const longTrades = allTrades.filter((t: any) => t.side === 'BUY')
    const shortTrades = allTrades.filter((t: any) => t.side === 'SELL')
    const longWinRate = longTrades.length > 0 ? Math.round((longTrades.filter((t: any) => (t.pnl || 0) > 0).length / longTrades.length) * 1000) / 10 : 0
    const shortWinRate = shortTrades.length > 0 ? Math.round((shortTrades.filter((t: any) => (t.pnl || 0) > 0).length / shortTrades.length) * 1000) / 10 : 0

    const stats = {
      totalTrades, winningTrades: winningTrades.length, losingTrades: losingTrades.length,
      winRate, avgWin, avgLoss, profitFactor, totalPnl,
      maxDrawdown: Math.round(maxDrawdown * 100) / 100,
      biggestWin: Math.round(biggestWin * 100) / 100,
      biggestLoss: Math.round(biggestLoss * 100) / 100,
      consecutiveWins, consecutiveLosses, mostTradedSymbol,
      longWinRate, shortWinRate,
    }

    // Determine rating
    let rating = 'insufficient_data'
    if (totalTrades >= 10) {
      let score = 0
      if (winRate >= 60) score += 3; else if (winRate >= 45) score += 2; else score += 1
      if (profitFactor >= 2) score += 3; else if (profitFactor >= 1.5) score += 2; else if (profitFactor >= 1) score += 1
      if (maxDrawdown < 500) score += 2; else if (maxDrawdown < 2000) score += 1
      if (score >= 7) rating = 'excellent'; else if (score >= 4) rating = 'good'; else rating = 'needs_improvement'
    }

    // 4. Try NestJS AI orchestrator
    const contextSummary = `إجمالي الصفقات: ${totalTrades}
صفقات رابحة: ${winningTrades.length} | خاسرة: ${losingTrades.length}
نسبة الفوز: ${winRate}%
متوسط الربح: $${avgWin} | متوسط الخسارة: $${avgLoss}
عامل الربح: ${profitFactor === -1 ? '∞' : profitFactor}
إجمالي ربح/خسارة: $${totalPnl}
أقصى تراجع: $${Math.round(maxDrawdown * 100) / 100}
أكبر ربح: $${Math.round(biggestWin * 100) / 100} | أكبر خسارة: $${Math.round(biggestLoss * 100) / 100}
سلسلة أرباح: ${consecutiveWins} | سلسلة خسائر: ${consecutiveLosses}
نسبة فوز الشراء: ${longWinRate}% | البيع: ${shortWinRate}%
الأكثر تداولاً: ${mostTradedSymbol}`

    const aiPrompt = `أنت مُدرّب تداول خبير في منصة "رؤى". حلل أداء المتداول بناءً على الإحصائيات التالية. قدم 3-5 نصائح محددة وقابلة للتنفيذ لتحسين الأداء. ركز على إدارة المخاطر، الانضباط، حجم الصفقات، واختيار الأصول. اذكر نقاط القوة والضعف. اجعل النصائح بالعربية ومباشرة.

الإحصائيات:
${contextSummary}

أجب بالصيغة التالية بالضبط:
تقييم_عام: [ممتاز/جيد/يحتاج_تحسين]
---
1. [تحذير/فرصة/تعليم] نص النصيحة الأولى
2. [تحذير/فرصة/تعليم] نص النصيحة الثانية
3. [تحذير/فرصة/تعليم] نص النصيحة الثالثة
---
نقاط_القوة: [نقاط القوة]
نقاط_الضعف: [نقاط الضعف]`

    let adviceText = ''
    let adviceItems: { type: string; icon: string; text: string }[] = []

    try {
      const aiRes = await fetch(`${origin}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          type: 'risk_analysis',
          language: 'ar',
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (aiRes.ok) {
        const aiData = await aiRes.json()
        if (aiData.success && aiData.data?.confidence > 0) {
          adviceText = aiData.data.content
          adviceItems = parseAdviceItems(aiData.data.content)
        }
      }
    } catch (e: any) {
      console.log('[coach/performance] AI unavailable, using rule-based fallback:', e?.message)
    }

    // Fallback to rule-based advice
    if (!adviceText || adviceItems.length === 0) {
      const fallback = generateRuleBasedAdvice(stats)
      adviceText = fallback.text
      adviceItems = fallback.items
    }

    return NextResponse.json({
      success: true,
      data: {
        rating,
        statistics: stats,
        adviceText,
        adviceItems,
        totalTrades,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[coach/performance] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: 'فشل في تحليل الأداء. يرجى المحاولة لاحقاً.',
    }, { status: 500 })
  }
}

// ── Helper: Parse advice items from AI text ──
function parseAdviceItems(text: string): { type: string; icon: string; text: string }[] {
  const items: { type: string; icon: string; text: string }[] = []
  const lines = text.split('\n').filter(l => l.trim())

  for (const line of lines) {
    const match = line.match(/^\d+\.\s*\[?(تحذير|فرصة|تعليم|خطر)\]?\s*(.+)/)
    if (match) {
      const rawType = match[1]
      const content = match[2].trim()
      let type = 'education', icon = 'book'
      if (rawType === 'تحذير' || rawType === 'خطر') { type = 'warning'; icon = 'alert' }
      else if (rawType === 'فرصة') { type = 'opportunity'; icon = 'trending-up' }
      items.push({ type, icon, text: content })
    }
  }

  if (items.length === 0) {
    const sentences = text.split(/[.؟!]/).filter(s => s.trim().length > 15)
    sentences.slice(0, 5).forEach(s => {
      items.push({ type: 'education', icon: 'book', text: s.trim() })
    })
  }

  return items
}

// ── Helper: Rule-based fallback advice ──
function generateRuleBasedAdvice(stats: any): { text: string; items: { type: string; icon: string; text: string }[] } {
  const items: { type: string; icon: string; text: string }[] = []

  if (stats.totalTrades < 10) {
    items.push({ type: 'education', icon: 'book', text: 'أنت بحاجة إلى 10 صفقات على الأقل ليقدم المُدرّب تحليلاً دقيقاً. استمر في التداول مع الالتزام بخطة واضحة.' })
    return { text: items.map((item, i) => `${i + 1}. [تعليم] ${item.text}`).join('\n'), items }
  }

  if (stats.winRate < 40) {
    items.push({ type: 'warning', icon: 'alert', text: 'نسبة فوزك أقل من 40%. راجع استراتيجية الدخول وتأكد من استخدام التحليل المتعدد الأطر الزمنية قبل فتح أي صفقة.' })
  }
  if (stats.profitFactor < 1 && stats.profitFactor > 0) {
    items.push({ type: 'warning', icon: 'alert', text: 'عامل الربح أقل من 1.0 مما يعني أن خسائرك تتجاوز أرباحك. قلل حجم الصفقات وحدد وقف خسارة صارم.' })
  }
  if (stats.consecutiveLosses >= 3) {
    items.push({ type: 'warning', icon: 'alert', text: `سلسلة خسائر متتالية (${stats.consecutiveLosses}). توقف عن التداول لفترة، راجع الصفقات الخاسرة، ولا تلاحق السوق.` })
  }
  if (stats.maxDrawdown > 1000) {
    items.push({ type: 'warning', icon: 'alert', text: `أقصى تراجع مرتفع ($${stats.maxDrawdown}). استخدم وقف خسارة لكل صفقة ولا تخاطر بأكثر من 2% من رأس المال.` })
  }
  if (stats.longWinRate > stats.shortWinRate + 20) {
    items.push({ type: 'opportunity', icon: 'trending-up', text: `أداء الشراء أفضل بكثير من البيع (${stats.longWinRate}% مقابل ${stats.shortWinRate}%). ركز على صفقات الشراء حتى تحسن استراتيجية البيع.` })
  }
  if (stats.winRate >= 55 && stats.profitFactor >= 1.5) {
    items.push({ type: 'opportunity', icon: 'trending-up', text: 'أداؤك جيد! حافظ على الانضباط وزِد حجم الصفقات تدريجياً مع الحفاظ على إدارة المخاطر.' })
  }
  if (items.length === 0) {
    items.push({ type: 'education', icon: 'book', text: 'استمر في التداول مع الالتزام بخطة واضحة. سجل كل صفقة وراجع أداءك أسبوعياً لتحديد الأنماط.' })
  }

  const text = items.map((item, i) => `${i + 1}. [${item.type === 'warning' ? 'تحذير' : item.type === 'opportunity' ? 'فرصة' : 'تعليم'}] ${item.text}`).join('\n')
  return { text, items }
}

/**
 * Calculate PnL from paper orders by matching buy/sell pairs per symbol.
 * 
 * PaperOrders don't have explicit PnL, so we estimate it by:
 * 1. Grouping orders by symbol
 * 2. Matching BUY+SELL pairs (FIFO)
 * 3. PnL = (sell_price - buy_price) * qty - fees
 * 
 * Unpaired orders (open positions) get PnL = 0 (not counted as closed trades).
 */
function calculatePaperPnl(paperOrders: any[]): number[] {
  // Group by symbol
  const bySymbol: Record<string, any[]> = {}
  for (const order of paperOrders) {
    const sym = order.symbol
    if (!bySymbol[sym]) bySymbol[sym] = []
    bySymbol[sym].push({
      side: order.side,
      price: Number(order.averagePrice) || 0,
      qty: Number(order.quantity) || 0,
      fee: Number(order.fee) || 0,
    })
  }

  const pnlResults: number[] = []

  for (const [symbol, orders] of Object.entries(bySymbol)) {
    // Sort by time (oldest first) — orders are already sorted desc, so reverse
    orders.reverse()

    // FIFO matching: pair BUY with SELL
    const buyQueue: { price: number; qty: number; fee: number }[] = []

    for (const order of orders) {
      if (order.side === 'BUY') {
        buyQueue.push({ price: order.price, qty: order.qty, fee: order.fee })
      } else if (order.side === 'SELL' && buyQueue.length > 0) {
        let remainingQty = order.qty
        let totalPnl = -order.fee // Deduct sell fee

        while (remainingQty > 0 && buyQueue.length > 0) {
          const buy = buyQueue[0]
          const matchedQty = Math.min(remainingQty, buy.qty)

          // PnL for this pair
          const pairPnl = (order.price - buy.price) * matchedQty
          totalPnl += pairPnl
          totalPnl -= buy.fee * (matchedQty / buy.qty) // Proportional buy fee

          buy.qty -= matchedQty
          remainingQty -= matchedQty

          if (buy.qty <= 0) {
            buyQueue.shift()
          }
        }

        // Each sell creates one PnL entry (one closed trade)
        pnlResults.push(Math.round(totalPnl * 100) / 100)
      }
    }
  }

  return pnlResults
}
