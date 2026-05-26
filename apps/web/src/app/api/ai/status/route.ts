import { NextRequest, NextResponse } from 'next/server'
import { getAvailableModelKeys } from '@/lib/ai-direct-calls'

/**
 * GET /api/ai/status
 *
 * Returns the status of AI models.
 * 1. Try NestJS /api/ai/models (full status with all 11 models)
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
    const baseUrl = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001'
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
        { name: 'Groq', available: !!directKeys.find(k => k.model === 'Groq')?.hasKey, latency: null, specialty: 'سرعة فائقة — تحليل المشاعر' },
        { name: 'Gemini', available: !!directKeys.find(k => k.model === 'Gemini')?.hasKey, latency: null, specialty: 'تحليل إبداعي — استراتيجية' },
        { name: 'GLM-4', available: !!directKeys.find(k => k.model === 'GLM-4')?.hasKey, latency: null, specialty: 'تحليل عربي — سياق طويل 200k' },
        { name: 'HuggingFace', available: !!directKeys.find(k => k.model === 'HuggingFace')?.hasKey, latency: null, specialty: 'مجاني مفتوح المصدر — متعدد اللغات' },
        { name: 'Ollama', available: !!directKeys.find(k => k.model === 'Ollama')?.hasKey, latency: null, specialty: directKeys.find(k => k.model === 'Ollama')?.note || 'محلي — يحتاج خادم Ollama' },
        { name: 'Bedrock', available: !!directKeys.find(k => k.model === 'Bedrock')?.hasKey, latency: null, specialty: directKeys.find(k => k.model === 'Bedrock')?.note || 'مؤسسي — يتطلب AWS credentials' },
        { name: 'DeepSeek', available: !!directKeys.find(k => k.model === 'deepseek')?.hasKey, latency: null, specialty: 'تحليل السيناريوهات — نموذج V3' },
        { name: 'OpenRouter', available: !!directKeys.find(k => k.model === 'OpenRouter')?.hasKey, latency: null, specialty: 'نماذج مجانية — محلل التباين' },
        { name: 'Cerebras', available: !!directKeys.find(k => k.model === 'Cerebras')?.hasKey, latency: null, specialty: 'سرعة فائقة — Llama 3.1 على محرك wafer-scale' },
        { name: 'NVIDIA', available: !!directKeys.find(k => k.model === 'NVIDIA')?.hasKey, latency: null, specialty: 'بنية تحتية NVIDIA — Llama 3.3 70B' },
        { name: 'Mistral', available: !!directKeys.find(k => k.model === 'Mistral')?.hasKey, latency: null, specialty: 'متعدد اللغات — Mistral Small/Nemo' },
      ],
      directCallAvailable: availableDirect.map(k => k.model),
      totalDirectModels: availableDirect.length,
    },
  })
}
