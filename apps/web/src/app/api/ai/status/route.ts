import { NextRequest, NextResponse } from 'next/server'
import { getAvailableModelKeys } from '@/lib/ai-direct-calls'

/**
 * GET /api/ai/status
 *
 * Returns the status of AI models.
 * 1. Try NestJS /api/ai/models (full status with all 6 models)
 * 2. If NestJS is down, check API keys directly and report which
 *    models are available via direct calls.
 */
export async function GET(req: NextRequest) {
  let lastError: string | null = null

  // FIX: Include the user's session token from cookies so NestJS AuthGuard
  // doesn't reject with 401. Previously sent a fake 'status-check' token
  // which AuthGuard couldn't validate → always returned 401.
  const sessionToken = req.cookies.get('roua_session')?.value || ''

  // Try NestJS models endpoint
  try {
    const baseUrl = process.env.API_INTERNAL_URL || 'http://localhost:3001'
    const modelsUrl = `${baseUrl}/api/ai/models`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (sessionToken) {
      headers['Authorization'] = `Bearer ${sessionToken}`
      headers['x-roua-session'] = sessionToken
      headers['Cookie'] = `roua_session=${sessionToken}`
    }
    const res = await fetch(modelsUrl, {
      signal: AbortSignal.timeout(15000),
      headers,
    })

    if (res.ok) {
      const data = await res.json()
      if (data.success && data.data) {
        // Enhance NestJS response with direct-call availability
        const directKeys = getAvailableModelKeys()
        return NextResponse.json({
          success: true,
          data: {
            source: 'nestjs',
            models: data.data,
            connected: true,
            directCallAvailable: directKeys.filter(k => k.hasKey).map(k => k.model),
            totalDirectModels: directKeys.filter(k => k.hasKey).length,
          },
        })
      }
    }
    lastError = `NestJS returned ${res.status}`
  } catch (error: any) {
    lastError = error?.message || String(error)
    console.warn('[ai/status] NestJS models endpoint unavailable:', lastError)
  }

  // Fallback: check API keys directly
  const directKeys = getAvailableModelKeys()
  const availableDirect = directKeys.filter(k => k.hasKey)

  return NextResponse.json({
    success: true,
    data: {
      source: 'direct',
      connected: availableDirect.length > 0,
      error: lastError || 'NestJS unreachable',
      models: [
        { model: 'Groq/Llama 3.3 70B', available: !!directKeys.find(k => k.model === 'Groq')?.hasKey, specialty: 'سرعة فائقة — تحليل المشاعر' },
        { model: 'Gemini 2.0 Flash', available: !!directKeys.find(k => k.model === 'Gemini')?.hasKey, specialty: 'تحليل إبداعي — استراتيجية' },
        { model: 'GLM-4 (Zhipu AI)', available: !!directKeys.find(k => k.model === 'GLM-4')?.hasKey, specialty: 'تحليل عربي — سياق طويل 200k' },
        { model: 'HuggingFace/Mistral-7B', available: !!directKeys.find(k => k.model === 'HuggingFace')?.hasKey, specialty: 'مجاني مفتوح المصدر — متعدد اللغات' },
        { model: 'Ollama/Qwen2.5', available: !!directKeys.find(k => k.model === 'Ollama')?.hasKey, specialty: directKeys.find(k => k.model === 'Ollama')?.note || 'محلي — يحتاج خادم Ollama' },
        { model: 'Bedrock/Claude 3.5 Sonnet', available: !!directKeys.find(k => k.model === 'Bedrock')?.hasKey, specialty: directKeys.find(k => k.model === 'Bedrock')?.note || 'مؤسسي — يتطلب AWS credentials' },
      ],
      directCallAvailable: availableDirect.map(k => k.model),
      totalDirectModels: availableDirect.length,
    },
  })
}
