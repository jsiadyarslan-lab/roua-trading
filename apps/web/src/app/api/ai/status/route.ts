import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/ai/status
 *
 * Returns the status of AI models by checking NestJS /api/ai/models.
 * Falls back to a local status check if NestJS is unavailable.
 *
 * FIX: Increased timeout from 5s to 15s to handle cold starts on Railway.
 * FIX: Added all 6 models to the fallback response.
 * FIX: Added error details to fallback response for debugging.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin
  let lastError: string | null = null

  try {
    // Try NestJS models endpoint directly (internal URL if available)
    // FIX: API_INTERNAL_URL is just the base (e.g. http://127.0.0.1:3001),
    // we must append /api/ai/models to it.
    const baseUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001'
    const modelsUrl = `${baseUrl}/api/ai/models`
    const res = await fetch(modelsUrl, {
      signal: AbortSignal.timeout(15000), // Increased from 5s to 15s for cold starts
      headers: {
        // The NestJS AuthGuard auto-authenticates, but adding a cookie
        // helps it find existing sessions faster
        'x-roua-session': 'status-check',
      },
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
    lastError = `NestJS returned ${res.status}`
  } catch (error: any) {
    // NestJS unavailable — log the reason with details
    lastError = error?.message || String(error)
    console.warn('[ai/status] NestJS models endpoint unavailable:', lastError)
  }

  // Fallback: return local status with all 6 models and error details
  return NextResponse.json({
    success: true,
    data: {
      source: 'local',
      connected: false,
      error: lastError || 'NestJS unreachable',
      models: [
        { model: 'Groq/Llama 3.3 70B', available: false, specialty: 'سرعة فائقة — تحليل المشاعر' },
        { model: 'GLM-4 (Zhipu AI)', available: false, specialty: 'تحليل عربي — سياق طويل 200k' },
        { model: 'Gemini 2.0 Flash', available: false, specialty: 'تحليل إبداعي — استراتيجية' },
        { model: 'HuggingFace/Mistral-7B', available: false, specialty: 'مجاني مفتوح المصدر — متعدد اللغات' },
        { model: 'Ollama/Qwen2.5', available: false, specialty: 'محلي — بدون تكلفة' },
        { model: 'Bedrock/Claude 3.5 Sonnet', available: false, specialty: 'مؤسسي AWS — مخاطر وامتثال' },
      ],
    },
  })
}
