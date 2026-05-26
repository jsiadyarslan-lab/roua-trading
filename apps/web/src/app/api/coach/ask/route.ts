import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * POST /api/coach/ask
 *
 * Ask the AI coach a specific question about trading performance
 * Body: { question, context? }
 */
export async function POST(req: NextRequest) {
  let locale: 'ar' | 'en' | 'fr' | 'tr' | 'es' = 'ar'
  try {
    const body = await req.json()
    const { question, context = '' } = body
    const rawLocale = body.locale || 'ar'
    locale = (['ar', 'en', 'fr', 'tr', 'es'].includes(rawLocale) ? rawLocale : 'ar') as 'ar' | 'en' | 'fr' | 'tr' | 'es'

    if (!question || !question.trim()) {
      return NextResponse.json({ success: false, error: 'Question is required' }, { status: 400 })
    }

    const origin = req.nextUrl.origin

    // Resolve userId from session cookie
    const sessionToken = req.cookies.get('roua_session')?.value
    let userId: string | undefined
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

    // Fetch user's recent trades for context via direct DB query
    let statsSummary = locale === 'es' ? 'No hay datos de rendimiento disponibles.' : 'لا توجد بيانات أداء متاحة.'
    try {
      const trades = userId
        ? await db.trade.findMany({
            where: { userId },
            orderBy: { executedAt: 'desc' },
            take: 30,
            select: { pnl: true },
          })
        : []

      if (trades.length > 0) {
        const allPnl = trades.map((t) => Number(t.pnl) || 0)
        const winningTrades = allPnl.filter((p) => p > 0)
        const winRate = allPnl.length > 0 ? Math.round((winningTrades.length / allPnl.length) * 100) : 0
        const totalPnl = allPnl.reduce((s, v) => s + v, 0)

        statsSummary = locale === 'es'
          ? `Total de operaciones: ${allPnl.length} | Tasa de victoria: ${winRate}% | Beneficio/Pérdida total: $${Math.round(totalPnl * 100) / 100}`
          : `إجمالي الصفقات: ${allPnl.length} | نسبة الفوز: ${winRate}% | إجمالي ربح/خسارة: $${Math.round(totalPnl * 100) / 100}`
      }
    } catch (dbError: any) {
      console.warn('[coach/ask] DB query failed, proceeding without trades:', dbError?.message || dbError)
    }

    // Try NestJS AI orchestrator
    const aiPrompt = locale === 'es'
      ? `Eres un entrenador de trading experto en la plataforma "Roua". El trader te hace una pregunta sobre su rendimiento. Responde en español de forma profesional, útil y directa. Proporciona pasos prácticos claros.

Estadísticas del trader:
${statsSummary}
${context ? `\nContexto adicional:\n${context}` : ''}

Pregunta del trader: ${question}

Responde de forma detallada y práctica. Proporciona pasos claros si es necesario.`
      : `أنت مُدرّب تداول خبير في منصة "رؤى". المتداول يسألك سؤالاً حول أدائه. أجب بالعربية بشكل مهني ومفيد ومباشر. قدم خطوات عملية واضحة.

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
          language: locale === 'es' ? 'es' : 'ar',
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
        answer: generateFallbackAnswer(question, statsSummary, locale),
        model: 'rule-based',
        source: 'local-fallback',
      },
    })
  } catch (error: any) {
    console.error('[coach/ask] Error:', error?.message || error)
    return NextResponse.json({
      success: false,
      error: locale === 'es' ? 'Error al procesar la pregunta. Por favor, inténtelo más tarde.' : 'فشل في معالجة السؤال. يرجى المحاولة لاحقاً.',
    }, { status: 500 })
  }
}

function generateFallbackAnswer(question: string, stats: string, locale: 'ar' | 'en' | 'fr' | 'tr' | 'es' = 'ar'): string {
  if (locale === 'es') {
    if (question.toLowerCase().includes('stop loss') || question.toLowerCase().includes('stop loss') || question.includes('pérdida')) {
      return 'El Stop Loss es una herramienta esencial para proteger el capital. Debes determinar el nivel de Stop Loss antes de abrir la operación basándote en los niveles de Soporte y Resistencia, no de forma aleatoria. La regla general: no arriesgues más del 1-2% del capital en una sola operación. Si el Stop Loss está muy lejos del punto de Entrada, reduce el tamaño de la posición en lugar de ampliar el Stop Loss.'
    }
    if (question.toLowerCase().includes('tamaño') || question.toLowerCase().includes('position size') || question.includes('posición')) {
      return 'El tamaño de la posición debe ser proporcional al capital y al nivel de riesgo. Usa la regla del 1%: no arriesgues más del 1% del capital en ninguna operación. Calcula el tamaño de la posición basándote en la distancia entre el punto de Entrada y el Stop Loss. Si la distancia es grande, reduce el tamaño de la posición.'
    }
    if (question.toLowerCase().includes('psicología') || question.toLowerCase().includes('psychology') || question.includes('miedo') || question.includes('codicia')) {
      return 'El control psicológico es lo que separa al trader exitoso del perdedor. Las reglas más importantes: no operes bajo estado emocional, no persigas al mercado para recuperar pérdidas, cumple tu plan independientemente de las emociones, y lleva un diario de trading para rastrear tu estado psicológico en cada operación.'
    }
    return `Basándote en tus datos (${stats}). Te aconsejo enfocarte en mejorar los puntos de Entrada y salida, usar siempre Stop Loss, y no arriesgar más del 2% del capital en una sola operación. Revisa tus operaciones perdedoras para identificar patrones recurrentes y evitarlos. Sé más específico en tu pregunta para darte un consejo más preciso.`
  }
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
