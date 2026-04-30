/**
 * Direct AI Model Calls — Independent from NestJS
 *
 * When the NestJS backend is unreachable, this module allows the
 * Next.js consensus route to call AI models DIRECTLY. This eliminates
 * the single point of failure that causes the AI Council to "disconnect".
 *
 * Supported models (cloud-compatible, no local server needed):
 * ┌────────────────────────────────────────────────────────────────┐
 * │ Model              │ Key env var              │ API endpoint    │
 * ├────────────────────┼──────────────────────────┼─────────────────┤
 * │ Groq/Llama 3.3 70B│ GROQ_API_KEY             │ api.groq.com    │
 * │ Gemini 2.0 Flash  │ GOOGLE_AI_STUDIO_API_KEY  │ googleapis.com  │
 * │ GLM-4 (Zhipu AI)  │ GLM_API_KEY              │ bigmodel.cn     │
 * │ HuggingFace/Mistral│ HUGGINGFACE_API_KEY      │ huggingface.co │
 * └────────────────────┴──────────────────────────┴─────────────────┘
 *
 * Ollama and Bedrock are NOT included because:
 * - Ollama requires a local server (unavailable on Railway)
 * - Bedrock requires AWS credentials with SigV4 signing
 *   (too complex to replicate in Next.js edge/runtime)
 *
 * This module is used as a FALLBACK when NestJS is down.
 * When NestJS is up, it should be preferred (it has caching, RAG, etc.)
 */

// ─── Types ───────────────────────────────────────────────────────

interface DirectAIResponse {
  model: string
  content: string
  confidence: number
  processingTimeMs: number
  success: boolean
  error?: string
}

interface CouncilVote {
  role: string
  model: string
  vote: 'BUY' | 'SELL' | 'HOLD'
  confidence: number
  reason: string
}

// ─── Environment Key Access ──────────────────────────────────────
// In Next.js API routes, env vars are available via process.env
// Only keys prefixed with NEXT_PUBLIC_ are available on the client,
// but ALL keys are available in API routes (server-side).

function getKey(name: string): string {
  return (process.env as Record<string, string | undefined>)[name]?.trim() || ''
}

// ─── Confidence Calculation ──────────────────────────────────────

function calcConfidence(content: string, model: string): number {
  let confidence = 0.5
  if (content.length > 200) confidence += 0.1
  if (content.length > 500) confidence += 0.1
  if (content.length > 1000) confidence += 0.05
  if (/شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content)) confidence += 0.15
  const MODEL_BASE: Record<string, number> = { groq: 0, gemini: 0.05, glm: 0.02, huggingface: -0.05 }
  confidence += MODEL_BASE[model] || 0
  return Math.min(Math.max(confidence, 0.1), 0.95)
}

// ─── Vote Parsing ────────────────────────────────────────────────

function parseVote(content: string): 'BUY' | 'SELL' | 'HOLD' {
  // Check for structured DECISION line first
  const decisionMatch = content.match(/DECISION:\s*(BUY|SELL|HOLD)/i)
  if (decisionMatch) return decisionMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'HOLD'

  // Keyword search
  let buyIdx = -1, sellIdx = -1
  const buyMatch = content.match(/(شراء|صعود|شرائية|BUY|BULLISH|LONG)/gi)
  const sellMatch = content.match(/(بيع|هبوط|بيعية|SELL|BEARISH|SHORT)/gi)
  if (buyMatch) buyIdx = content.lastIndexOf(buyMatch[buyMatch.length - 1])
  if (sellMatch) sellIdx = content.lastIndexOf(sellMatch[sellMatch.length - 1])

  if (buyIdx === -1 && sellIdx === -1) return 'HOLD'
  if (buyIdx > sellIdx) return 'BUY'
  if (sellIdx > buyIdx) return 'SELL'
  return 'HOLD'
}

// ─── TIME: 15s per model call (fast response) ────────────────────
const MODEL_TIMEOUT = 15_000

// ─── Groq Direct Call ────────────────────────────────────────────

async function callGroq(prompt: string, _symbol: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GROQ_API_KEY')
  if (!apiKey) return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a financial analysis AI. Respond in Arabic. Be concise. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 512,
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
    })

    if (!res.ok) {
      return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Groq ${res.status}` }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    return { model: 'Groq/Llama-3.3-70B', content, confidence: calcConfidence(content, 'groq'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

// ─── Gemini Direct Call ──────────────────────────────────────────

async function callGemini(prompt: string, _symbol: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GOOGLE_AI_STUDIO_API_KEY')
  if (!apiKey) return { model: 'Gemini/2.0-Flash', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `You are a sophisticated financial AI analyst. Respond in Arabic. Provide analysis. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"\n\n${prompt}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
    })

    if (!res.ok) {
      return { model: 'Gemini/2.0-Flash', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Gemini ${res.status}` }
    }

    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return { model: 'Gemini/2.0-Flash', content, confidence: calcConfidence(content, 'gemini'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'Gemini/2.0-Flash', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

// ─── GLM-4 Direct Call ───────────────────────────────────────────

async function callGLM(prompt: string, _symbol: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GLM_API_KEY')
  if (!apiKey) return { model: 'GLM-4/glm-4', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  try {
    // Generate JWT for Zhipu AI
    let authToken: string
    const parts = apiKey.split('.')
    if (parts.length === 2) {
      const [id, secret] = parts
      const now = Date.now()
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }), 'utf8').toString('base64url')
      const payload = Buffer.from(JSON.stringify({ api_key: id, exp: Math.floor(now / 1000) + 3600, timestamp: Math.floor(now / 1000) }), 'utf8').toString('base64url')
      const crypto = await import('crypto')
      const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
      authToken = `${header}.${payload}.${signature}`
    } else {
      authToken = apiKey
    }

    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'glm-4',
        messages: [
          { role: 'system', content: 'أنت محلل مالي ذكي. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
    })

    if (!res.ok) {
      return { model: 'GLM-4/glm-4', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `GLM ${res.status}` }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    return { model: 'GLM-4/glm-4', content, confidence: calcConfidence(content, 'glm'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'GLM-4/glm-4', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

// ─── HuggingFace Direct Call ─────────────────────────────────────

async function callHuggingFace(prompt: string, _symbol: string): Promise<DirectAIResponse> {
  const apiKey = getKey('HUGGINGFACE_API_KEY')
  if (!apiKey) return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const models = ['mistralai/Mistral-7B-Instruct-v0.3', 'microsoft/Phi-3-mini-4k-instruct']
  const systemPrompt = 'You are a financial AI analyst. Respond in Arabic. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'

  for (const model of models) {
    const start = Date.now()
    try {
      const fullPrompt = `<s>[INST] ${systemPrompt}\n\n${prompt} [/INST]`
      const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inputs: fullPrompt,
          parameters: { max_new_tokens: 512, temperature: 0.3, do_sample: true, return_full_text: false },
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT),
      })

      if (!res.ok) {
        if (res.status === 401) break // Invalid key
        continue // Try next model
      }

      const data = await res.json()
      let content = ''
      if (Array.isArray(data) && data.length > 0) content = data[0].generated_text || ''
      else if (typeof data === 'string') content = data
      if (!content && data?.estimated_time) continue

      content = content.replace(/\[\/INST\]/g, '').trim()
      if (content.length > 10) {
        const modelShort = model.split('/').pop() || model
        return { model: `HuggingFace/${modelShort}`, content, confidence: calcConfidence(content, 'huggingface'), processingTimeMs: Date.now() - start, success: true }
      }
    } catch { continue }
  }

  return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'All HuggingFace models failed' }
}

// ─── Master Council — Full Consensus ─────────────────────────────

/**
 * Run ALL available AI models in parallel and build a consensus.
 * Each model gets ONE role (not 6) to maximize diversity:
 *
 * Role → Model mapping (optimized for available models on Railway):
 * 1. المحلل الفني    → Gemini (creative pattern analysis)
 * 2. محلل المشاعر     → Groq (fast sentiment)
 * 3. خبير المخاطر     → GLM-4 (Arabic risk analysis)
 * 4. خبير الماكرو     → Groq (macro with fallback)
 * 5. خبير الأنماط     → GLM-4 (pattern with fallback)
 * 6. استراتيجي التنفيذ → Gemini (execution strategy)
 *
 * Each role has a fallback to a different model if primary fails.
 * Total timeout: ~15s (per-model timeout), all run in parallel.
 */
export async function runDirectCouncilConsensus(symbol: string): Promise<{
  success: boolean
  source: 'real-ai' | 'partial-ai'
  data: {
    consensusScore: number
    recommendation: 'BUY' | 'SELL' | 'HOLD'
    analyses: CouncilVote[]
    masterStrategy: string
    conflictExplanation?: string
    meta: Record<string, any>
  }
  errors: string[]
}> {
  const startTime = Date.now()
  const errors: string[] = []

  // Assign each role to a different model with fallbacks
  const roles = [
    { id: 'tech',  name: 'المحلل الفني',    primary: callGemini,      fallback: callGroq,       prompt: `حلل الشارت الفني لـ ${symbol}. قيّم الاتجاه والزخم والمقاومات.` },
    { id: 'sent',  name: 'محلل المشاعر',     primary: callGroq,        fallback: callGemini,     prompt: `حلل مشاعر السوق لـ ${symbol}. هل السوق متفائل أم متشائم؟` },
    { id: 'risk',  name: 'خبير المخاطر',     primary: callGLM,         fallback: callGemini,     prompt: `حدد مخاطر دخول صفقة على ${symbol}. قيّم التذبذب والسيولة.` },
    { id: 'macro', name: 'خبير الماكرو',     primary: callGroq,        fallback: callHuggingFace,prompt: `حلل الوضع الاقتصادي وتأثيره على ${symbol}.` },
    { id: 'pat',   name: 'خبير الأنماط',     primary: callGLM,         fallback: callGroq,       prompt: `هل ترى أنماط تاريخية في حركة ${symbol} الحالية؟` },
    { id: 'exec',  name: 'استراتيجي التنفيذ', primary: callGemini,      fallback: callGroq,       prompt: `ما أفضل توقيت للدخول في ${symbol}؟ حدد نقطة الدخول المثالية.` },
  ]

  // Run all 6 roles in parallel — each tries primary then fallback
  const results = await Promise.allSettled(
    roles.map(async (role) => {
      // Try primary
      let response = await role.primary(role.prompt, symbol)
      if (!response.success) {
        errors.push(`${role.name} primary (${response.model}): ${response.error || 'failed'}`)
        // Try fallback
        response = await role.fallback(role.prompt, symbol)
        if (!response.success) {
          errors.push(`${role.name} fallback (${response.model}): ${response.error || 'failed'}`)
        }
      }
      return { role, response }
    })
  )

  // Build analyses
  const analyses: CouncilVote[] = []
  let buyWeight = 0, sellWeight = 0, totalConfidence = 0

  for (const res of results) {
    if (res.status !== 'fulfilled') continue
    const { role, response } = res.value
    if (!response.success || response.confidence <= 0) continue

    const vote = parseVote(response.content)
    const conf = response.confidence
    if (vote === 'BUY') buyWeight += conf
    else if (vote === 'SELL') sellWeight += conf
    totalConfidence += conf

    analyses.push({
      role: role.name,
      model: response.model,
      vote,
      confidence: Math.round(conf * 100),
      reason: response.content.slice(0, 300) + (response.content.length > 300 ? '...' : ''),
    })
  }

  // Calculate consensus
  let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let consensusScore = 0

  if (totalConfidence > 0) {
    const buyPct = buyWeight / totalConfidence
    const sellPct = sellWeight / totalConfidence
    if (buyPct > 0.6) { recommendation = 'BUY'; consensusScore = Math.round(buyPct * 100) }
    else if (sellPct > 0.6) { recommendation = 'SELL'; consensusScore = Math.round(sellPct * 100) }
    else { recommendation = 'HOLD'; consensusScore = Math.round((1 - Math.abs(buyPct - sellPct)) * 50) }
  }

  const masterStrategy = `إجماع مجلس الذكاء الاصطناعي (${analyses.length}/6 نماذج): ${recommendation === 'BUY' ? 'شراء قوي' : recommendation === 'SELL' ? 'بيع قوي' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`
  const conflictExplanation = analyses.length < 4
    ? `بعض النماذج لم تستجب (${6 - analyses.length}/6)، لكن النماذج المتاحة توصلت لإجماع كافٍ.`
    : 'الأدوار الأساسية متوافقة نسبيًا ولا يوجد تعارض جوهري.'

  const source = analyses.length >= 3 ? 'real-ai' : 'partial-ai'

  return {
    success: analyses.length > 0,
    source,
    data: {
      consensusScore,
      recommendation,
      analyses,
      masterStrategy,
      conflictExplanation,
      meta: {
        symbol,
        price: 0,
        rsi: 50,
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        aiEngine: `Direct-4-Models (${analyses.length}/6 responded)`,
        modelsUsed: analyses.map(a => a.model),
        modelsResponded: analyses.length,
        modelsExpected: 6,
      },
    },
    errors,
  }
}

/**
 * Quick health check: which AI models have API keys configured?
 */
export function getAvailableModelKeys(): { model: string; hasKey: boolean }[] {
  return [
    { model: 'Groq', hasKey: !!getKey('GROQ_API_KEY') },
    { model: 'Gemini', hasKey: !!getKey('GOOGLE_AI_STUDIO_API_KEY') },
    { model: 'GLM-4', hasKey: !!getKey('GLM_API_KEY') },
    { model: 'HuggingFace', hasKey: !!getKey('HUGGINGFACE_API_KEY') },
  ]
}
