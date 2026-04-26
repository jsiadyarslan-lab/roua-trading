import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/coach/ask
 *
 * Ask the AI coach a specific question about trading performance
 * Body: { question, context? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { question, context = '' } = body

    if (!question || !question.trim()) {
      return NextResponse.json({ success: false, error: 'Question is required' }, { status: 400 })
    }

    const origin = req.nextUrl.origin

    // Fetch user's recent trades for context
    let statsSummary = 'لا توجد بيانات أداء متاحة.'
    try {
      const tradesRes = await fetch(`${origin}/api/trading/trades?limit=30`, {
        signal: AbortSignal.timeout(5000),
      })
      if (tradesRes.ok) {
        const tradesData = await tradesRes.json()
        const trades = Array.isArray(tradesData) ? tradesData : (tradesData.data || tradesData.trades || [])

        if (trades.length > 0) {
          const allPnl = trades.map((t: any) => t.pnl || 0)
          const winningTrades = allPnl.filter((p: number) => p > 0)
          const winRate = allPnl.length > 0 ? Math.round((winningTrades.length / allPnl.length) * 100) : 0
          const totalPnl = allPnl.reduce((s: number, v: number) => s + v, 0)

          statsSummary = `إجمالي الصفقات: ${allPnl.length} | نسبة الفوز: ${winRate}% | إجمالي ربح/خسارة: $${Math.round(totalPnl * 100) / 100}`
        }
      }
    } catch { /* non-critical */ }

    // Try NestJS AI orchestrator
    const aiPrompt = `أنت مُدرّب تداول خبير في منصة "رؤى". المتداول يسألك سؤالاً حول أدائه. أجب بالعربية بشكل مهني ومفيد ومباشر. قدم خطوات عملية واضحة.

إحصائيات المتداول:
${statsSummary}
${context ? `\nسياق إضافي:\n${context}` : ''}

سؤال المتداول: ${question}

أجب بشكل مفصل وعملي. قدم خطوات واضحة إن لزم الأمر.`

    try {
      const aiRes = await fetch(`${origin}/api/ai/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          type: 'general',
          language: 'ar',
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (aiRes.ok) {
        const aiData = await aiRes.json()
        if (aiData.success && aiData.data?.confidence > 0) {
          return NextResponse.json({
            success: true,
            data: {
              question,
              answer: aiData.data.content,
              model: aiData.data.model,
              source: 'ai-orchestrator',
            },
          })
        }
      }
    } catch (e: any) {
      console.log('[coach/ask] AI unavailable, using fallback:', e?.message)
    }

    // Fallback response
    return NextResponse.json({
      success: true,
      data: {
        question,
        answer: generateFallbackAnswer(question, statsSummary),
        model: 'rule-based',
        source: 'local-fallback',
      },
    })
  } catch (error: any) {
    console.error('[coach/ask] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: 'فشل في معالجة السؤال. يرجى المحاولة لاحقاً.',
    }, { status: 500 })
  }
}

function generateFallbackAnswer(question: string, stats: string): string {
  if (question.includes('وقفة') || question.includes('وقف') || question.includes('stop loss') || question.includes('وقف خسارة')) {
    return 'وقف الخسارة أداة أساسية لحماية رأس المال. يجب تحديد مستوى وقف الخسارة قبل فتح الصفقة بناءً على مستويات الدعم والمقاومة، وليس بشكل عشوائي. القاعدة العامة: لا تخاطر بأكثر من 1-2% من رأس المال في الصفقة الواحدة. إذا كان وقف الخسارة بعيداً جداً عن نقطة الدخول، قلل حجم الصفقة بدلاً من توسيع وقف الخسارة.'
  }
  if (question.includes('حجم') || question.includes('position size') || question.includes('حجم الصفقة')) {
    return 'حجم الصفقة يجب أن يتناسب مع رأس المال ومستوى المخاطرة. استخدم قاعدة 1%: لا تخاطر بأكثر من 1% من رأس المال في أي صفقة. احسب حجم الصفقة بناءً على المسافة بين نقطة الدخول ووقف الخسارة. إذا كانت المسافة كبيرة، قلل حجم الصفقة.'
  }
  if (question.includes('نفسية') || question.includes('psychology') || question.includes('خوف') || question.includes('طمع')) {
    return 'التحكم بالنفسيات هو الفاصل بين المتداول الناجح والخاسر. أهم القواعد: لا تتداول وأنت في حالة انفعال، لا تلاحق السوق بالتعويض بعد خسارة، التزم بخطتك بغض النظر عن المشاعر، واحتفظ بمذكرات تداول لتتبع حالتك النفسية عند كل صفقة.'
  }
  return `بناءً على بياناتك (${stats}). أنصحك بالتركيز على تحسين نقاط الدخول والخروج، واستخدام وقف الخسارة دائماً، وعدم المخاطرة بأكثر من 2% من رأس المال في الصفقة الواحدة. راجع صفقاتك الخاسرة لتحديد الأنماط المتكررة وتجنبها. كن أكثر تحديداً في سؤالك لأعطيك نصيحة أدق.`
}
