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
      groqKeyLength: (process.env.GROQ_API_KEY || '').length,
      geminiKeyLength: (process.env.GOOGLE_AI_STUDIO_API_KEY || '').length,
      glmKeyLength: (process.env.GLM_API_KEY || '').length,
      hfKeyLength: (process.env.HUGGINGFACE_API_KEY || '').length,
      ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'not set',
      ollamaKeyLength: (process.env.OLLAMA_API_KEY || '').length,
      awsAccessKeyLength: (process.env.AWS_ACCESS_KEY_ID || '').length,
      awsSecretKeyLength: (process.env.AWS_SECRET_ACCESS_KEY || '').length,
      awsRegion: process.env.AWS_REGION || 'not set',
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
  const geminiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || ''
  if (geminiKey) {
    const start = Date.now()
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: testPrompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      results.tests.gemini = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: (data.candidates?.[0]?.content?.parts?.[0]?.text || '').slice(0, 200),
        error: data.error?.message || null,
        errorCode: data.error?.code || null,
        errorStatus: data.error?.status || null,
        rawError: data.error ? JSON.stringify(data.error).slice(0, 500) : null,
      }
    } catch (e: any) {
      results.tests.gemini = { error: e.message, timeMs: Date.now() - start }
    }
  } else {
    results.tests.gemini = { skipped: true, reason: 'No API key' }
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
  const hfKey = process.env.HUGGINGFACE_API_KEY?.trim() || ''
  if (hfKey) {
    const start = Date.now()
    try {
      const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${hfKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: `<s>[INST] ${testPrompt} [/INST]`,
          parameters: { max_new_tokens: 128, temperature: 0.3 },
        }),
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      let content = ''
      if (Array.isArray(data) && data.length > 0) content = data[0].generated_text || ''
      else if (typeof data === 'string') content = data
      results.tests.huggingface = {
        status: res.status,
        ok: res.ok,
        timeMs: Date.now() - start,
        contentPreview: content.slice(0, 200),
        error: data.error || null,
        estimatedTime: data.estimated_time || null,
        rawPreview: JSON.stringify(data).slice(0, 500),
      }
    } catch (e: any) {
      results.tests.huggingface = { error: e.message, timeMs: Date.now() - start }
    }
  } else {
    results.tests.huggingface = { skipped: true, reason: 'No API key (HUGGINGFACE_API_KEY not set)' }
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
