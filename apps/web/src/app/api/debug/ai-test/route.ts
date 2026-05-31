import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAuth } from '@/lib/admin-auth'

/**
 * GET /api/debug/ai-test
 * Comprehensive debug endpoint — tests ALL AI models directly
 * to reveal the actual errors (not hidden behind stubs)
 *
 * 🔒 SECURITY: Requires admin authentication.
 * This endpoint exposes API key lengths and tests external services.
 * It MUST NOT be accessible without authentication.
 */
export async function GET(req: NextRequest) {
  // 🔒 Require admin auth — this endpoint exposes sensitive key info
  const authError = await verifyAdminAuth(req)
  if (authError) return authError

  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    keys: {
      groq: !!(process.env.GROQ_API_KEY),
      gemini: !!(process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY),
      geminiKeySource: process.env.GEMINI_API_KEY ? 'GEMINI_API_KEY' : process.env.GOOGLE_AI_STUDIO_API_KEY ? 'GOOGLE_AI_STUDIO_API_KEY' : 'none',
      glm: !!(process.env.GLM_API_KEY),
      huggingface: !!(process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY),
      hfKeySource: process.env.HF_API_KEY ? 'HF_API_KEY' : process.env.HUGGINGFACE_API_KEY ? 'HUGGINGFACE_API_KEY' : 'none',
      openrouter: !!(process.env.OPENROUTER_API_KEY),
      ollama: !!(process.env.OLLAMA_API_KEY),
      aws: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY),
    },
    tests: {},
  }

  const testPrompt = 'Is BTC bullish or bearish today? Answer briefly in 1-2 sentences. End with: DECISION: HOLD'

  // ═══ TEST GROQ ═══
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
            { role: 'user', content: testPrompt },
          ],
          temperature: 0.3,
          max_tokens: 128,
        }),
        signal: AbortSignal.timeout(20000),
      })
      const data = await res.json()
      results.tests.groq = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: (data.choices?.[0]?.message?.content || '').slice(0, 200),
        error: data.error?.message || null,
        model: data.model || null,
      }
    } catch (e: any) {
      results.tests.groq = { error: e.message, timeMs: Date.now() - start }
    }
  } else {
    results.tests.groq = { skipped: true, reason: 'No API key' }
  }

  // ═══ TEST GEMINI ═══
  // FIX: Check both GOOGLE_AI_STUDIO_API_KEY and GEMINI_API_KEY
  const geminiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim() || ''
  if (geminiKey) {
    const start = Date.now()
    // FIX: Try multiple model names — gemini-2.5-flash-preview-04-17 is the latest
    const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash']
    let geminiResult: any = null

    for (const model of geminiModels) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
          }),
          signal: AbortSignal.timeout(30000),
        })
        const data = await res.json()
        if (res.ok) {
          geminiResult = {
            status: res.status,
            ok: true,
            timeMs: Date.now() - start,
            model,
            contentPreview: (data.candidates?.[0]?.content?.parts?.[0]?.text || '').slice(0, 200),
          }
          break // Success — stop trying other models
        }
        // If not ok, try next model
        if (res.status === 404) continue
        geminiResult = {
          status: res.status,
          ok: false,
          timeMs: Date.now() - start,
          model,
          error: data.error?.message || null,
          errorCode: data.error?.code || null,
          errorStatus: data.error?.status || null,
          rawError: data.error ? JSON.stringify(data.error).slice(0, 500) : null,
        }
        break // Non-404 error — don't try other models
      } catch (e: any) {
        geminiResult = { error: e.message, model, timeMs: Date.now() - start }
      }
    }
    results.tests.gemini = geminiResult || { skipped: true, reason: 'All Gemini models failed' }
  } else {
    results.tests.gemini = { skipped: true, reason: 'No API key (tried GOOGLE_AI_STUDIO_API_KEY and GEMINI_API_KEY)' }
  }

  // ═══ TEST GLM-4 ═══
  const glmKey = process.env.GLM_API_KEY?.trim() || ''
  if (glmKey) {
    const start = Date.now()
    try {
      // Generate JWT
      let authToken: string
      const parts = glmKey.split('.')
      if (parts.length === 2) {
        const [id, secret] = parts
        const now = Date.now()
        const crypto = await import('crypto')
        const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }), 'utf8').toString('base64url')
        const payload = Buffer.from(JSON.stringify({ api_key: id, exp: Math.floor(now / 1000) + 3600, timestamp: Math.floor(now / 1000) }), 'utf8').toString('base64url')
        const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
        authToken = `${header}.${payload}.${signature}`
      } else {
        authToken = glmKey
      }

      const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'glm-4',
          messages: [{ role: 'user', content: testPrompt }],
          temperature: 0.4,
          max_tokens: 256,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      results.tests.glm = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: (data.choices?.[0]?.message?.content || '').slice(0, 200),
        error: data.error?.message || data.message || null,
        errorCode: data.error?.code || data.code || null,
        rawError: data.error ? JSON.stringify(data.error).slice(0, 500) : (data.message ? JSON.stringify(data).slice(0, 500) : null),
        keyFormat: parts.length === 2 ? 'id.secret (JWT)' : 'raw token',
      }
    } catch (e: any) {
      results.tests.glm = { error: e.message, timeMs: Date.now() - start }
    }
  } else {
    results.tests.glm = { skipped: true, reason: 'No API key' }
  }

  // ═══ TEST HUGGINGFACE ═══
  // FIX: Check both HUGGINGFACE_API_KEY and HF_API_KEY, try auto-router
  const hfKey = process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_API_KEY?.trim() || ''
  const orKey = process.env.OPENROUTER_API_KEY?.trim() || ''
  if (hfKey) {
    const start = Date.now()
    try {
      // FIX: Use auto-router URL instead of direct API — much more reliable
      const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'Qwen/Qwen2.5-7B-Instruct',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 128,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''
      results.tests.huggingface = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: content.slice(0, 200),
        error: data.error?.message || data.message || null,
        model: data.model || null,
        url: 'auto-router',
      }
    } catch (e: any) {
      results.tests.huggingface = { error: e.message, timeMs: Date.now() - start }
    }
  } else if (orKey) {
    // Fallback: try OpenRouter if no HF key
    const start = Date.now()
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${orKey}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://roua-trading-production.up.railway.app' },
        body: JSON.stringify({
          model: 'qwen/qwen-2.5-7b-instruct:free',
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 128,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''
      results.tests.huggingface = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: content.slice(0, 200),
        note: 'Used OpenRouter as fallback (no HF key)',
      }
    } catch (e: any) {
      results.tests.huggingface = { error: e.message, timeMs: Date.now() - start, note: 'OpenRouter fallback failed' }
    }
  } else {
    results.tests.huggingface = { skipped: true, reason: 'No API key (tried HUGGINGFACE_API_KEY, HF_API_KEY, OPENROUTER_API_KEY)' }
  }

  // ═══ TEST OLLAMA ═══
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
  const isLocalhost = ollamaUrl.includes('localhost') || ollamaUrl.includes('127.0.0.1')
  const isCloud = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.VERCEL)

  if (isCloud && isLocalhost) {
    results.tests.ollama = { skipped: true, reason: 'localhost URL on cloud platform' }
  } else {
    const start = Date.now()
    try {
      const res = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen2.5:7b',
          messages: [{ role: 'user', content: testPrompt }],
          stream: false,
        }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      results.tests.ollama = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: (data.message?.content || '').slice(0, 200),
        error: data.error || null,
        url: ollamaUrl,
      }
    } catch (e: any) {
      results.tests.ollama = { error: e.message, timeMs: Date.now() - start, url: ollamaUrl }
    }
  }

  // ═══ TEST BEDROCK ═══
  const awsKeyId = process.env.AWS_ACCESS_KEY_ID?.trim() || ''
  const awsSecret = process.env.AWS_SECRET_ACCESS_KEY?.trim() || ''
  const awsRegion = process.env.AWS_REGION || 'us-east-1'

  if (awsKeyId && awsSecret) {
    const start = Date.now()
    try {
      const modelId = 'anthropic.claude-3-5-sonnet-20241022-v2:0'
      const encodedModelId = encodeURIComponent(modelId)
      const endpoint = `https://bedrock-runtime.${awsRegion}.amazonaws.com/model/${encodedModelId}/invoke`

      // Minimal SigV4 signing
      const crypto = await import('crypto')
      const body = JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 128,
        messages: [{ role: 'user', content: testPrompt }],
        temperature: 0.3,
      })
      const payloadHash = crypto.createHash('sha256').update(body).digest('hex')
      const host = new URL(endpoint).host
      const canonicalUri = new URL(endpoint).pathname.split('/').map(s => encodeURIComponent(decodeURIComponent(s))).join('/')
      const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
      const dateStamp = amzDate.substring(0, 8)
      const canonicalHeaders = `accept:application/json\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
      const signedHeaders = 'accept;content-type;host;x-amz-content-sha256;x-amz-date'
      const canonicalRequest = ['POST', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n')
      const credentialScope = `${dateStamp}/${awsRegion}/bedrock/aws4_request`
      const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n')
      const sign = (key: Buffer, msg: string) => crypto.createHmac('sha256', key).update(msg).digest()
      let signingKey = crypto.createHmac('sha256', `AWS4${awsSecret}`).update(dateStamp).digest()
      signingKey = sign(signingKey, awsRegion)
      signingKey = sign(signingKey, 'bedrock')
      signingKey = sign(signingKey, 'aws4_request')
      const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Host': host,
          'X-Amz-Content-Sha256': payloadHash,
          'X-Amz-Date': amzDate,
          'Authorization': `AWS4-HMAC-SHA256 Credential=${awsKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      results.tests.bedrock = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: (data.content?.[0]?.text || data.message || '').slice(0, 200),
        error: data.message || null,
        region: awsRegion,
      }
    } catch (e: any) {
      results.tests.bedrock = { error: e.message, timeMs: Date.now() - start, region: awsRegion }
    }
  } else {
    results.tests.bedrock = { skipped: true, reason: 'AWS credentials not set' }
  }

  return NextResponse.json({ success: true, results })
}
