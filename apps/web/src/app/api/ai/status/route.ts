import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/ai/status
 *
 * Returns the status of AI models by checking NestJS /api/ai/models.
 * Falls back to a local status check if NestJS is unavailable.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin

  try {
    // Try NestJS models endpoint
    const res = await fetch(`${origin}/api/ai/models`, {
      signal: AbortSignal.timeout(5000),
    })

    if (res.ok) {
      const data = await res.json()
      if (data.success && data.data) {
        return NextResponse.json({
          success: true,
          data: {
            source: 'nestjs',
            models: data.data,
            connected: true,
          },
        })
      }
    }
  } catch {
    // NestJS unavailable
  }

  // Fallback: return local status
  return NextResponse.json({
    success: true,
    data: {
      source: 'local',
      connected: false,
      models: [
        { model: 'Groq/Llama 3.3 70B', available: false, specialty: 'سرعة فائقة — تحليل المشاعر' },
        { model: 'GLM-4 (Zhipu AI)', available: false, specialty: 'تحليل عربي — سياق طويل 200k' },
        { model: 'Gemini 2.0 Flash', available: false, specialty: 'تحليل إبداعي — استراتيجية' },
      ],
    },
  })
}
