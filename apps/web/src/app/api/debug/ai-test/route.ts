import { NextResponse } from 'next/server'
import { getAvailableModelKeys } from '@/lib/ai-direct-calls'

/**
 * GET /api/debug/ai-test
 * Debug endpoint to test direct AI model calls (outside /api/ai/ catch-all)
 */
export async function GET() {
  const keys = getAvailableModelKeys()
  const results: Record<string, any> = {
    keysDetected: keys,
    groqKeyLength: (process.env.GROQ_API_KEY || '').length,
    geminiKeyLength: (process.env.GOOGLE_AI_STUDIO_API_KEY || '').length,
    glmKeyLength: (process.env.GLM_API_KEY || '').length,
    hfKeyLength: (process.env.HUGGINGFACE_API_KEY || '').length,
  }

  // Test Groq API directly
  const groqKey = process.env.GROQ_API_KEY?.trim() || ''
  if (groqKey) {
    const start = Date.now()
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a financial AI. Respond in Arabic briefly. End with: DECISION: BUY or DECISION: SELL or DECISION: HOLD' },
            { role: 'user', content: 'Is BTC a buy?' },
          ],
          temperature: 0.3,
          max_tokens: 128,
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      results.groqTest = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: (data.choices?.[0]?.message?.content || '').slice(0, 200),
        error: data.error?.message || null,
      }
    } catch (e: any) {
      results.groqTest = { error: e.message, timeMs: Date.now() - start }
    }
  }

  return NextResponse.json({ success: true, results })
}
