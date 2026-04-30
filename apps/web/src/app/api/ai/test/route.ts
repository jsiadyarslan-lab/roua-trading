import { NextRequest, NextResponse } from 'next/server'
import { getAvailableModelKeys } from '@/lib/ai-direct-calls'

/**
 * GET /api/ai/test
 * Debug endpoint to test direct AI model calls
 */
export async function GET(req: NextRequest) {
  const keys = getAvailableModelKeys()
  const results: Record<string, any> = {
    keysDetected: keys,
    hasGroqKey: !!process.env.GROQ_API_KEY,
    hasGeminiKey: !!process.env.GOOGLE_AI_STUDIO_API_KEY,
    hasGLMKey: !!process.env.GLM_API_KEY,
    hasHFKey: !!process.env.HUGGINGFACE_API_KEY,
  }

  // Test Groq API directly
  const groqKey = process.env.GROQ_API_KEY?.trim() || ''
  if (groqKey) {
    try {
      const start = Date.now()
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: 'You are a financial AI. Respond in Arabic. End with: DECISION: BUY or DECISION: SELL or DECISION: HOLD' },
            { role: 'user', content: 'Is BTC a buy right now?' },
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
        content: data.choices?.[0]?.message?.content?.slice(0, 200) || 'NO CONTENT',
        error: data.error?.message || null,
      }
    } catch (e: any) {
      results.groqTest = { error: e.message, timeMs: Date.now() - start }
    }
  } else {
    results.groqTest = { skipped: 'No API key' }
  }

  return NextResponse.json({ success: true, results })
}

// Need this for the 'start' variable in catch block
let start = Date.now()
