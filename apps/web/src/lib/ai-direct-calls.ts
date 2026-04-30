/**
 * Direct AI Model Calls — Independent from NestJS
 *
 * When the NestJS backend is unreachable, this module allows the
 * Next.js consensus route to call AI models DIRECTLY.
 *
 * Strategy: Call ALL available models ONCE each, then assign each
 * model's response to one or more council roles. This prevents
 * rate-limiting from calling the same model 6 times.
 *
 * Available cloud models:
 * - Groq/Llama 3.3 70B  (GROQ_API_KEY)
 * - Gemini 2.0 Flash     (GOOGLE_AI_STUDIO_API_KEY)
 * - GLM-4 (Zhipu AI)    (GLM_API_KEY)
 * - HuggingFace/Mistral  (HUGGINGFACE_API_KEY)
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
  const decisionMatch = content.match(/DECISION:\s*(BUY|SELL|HOLD)/i)
  if (decisionMatch) return decisionMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'HOLD'

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

const MODEL_TIMEOUT = 20_000 // 20s per model

// ─── Model Call Functions ────────────────────────────────────────

async function callGroq(prompt: string): Promise<DirectAIResponse> {
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
      const errBody = await res.text().catch(() => '')
      return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Groq ${res.status}: ${errBody.slice(0, 150)}` }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    return { model: 'Groq/Llama-3.3-70B', content, confidence: calcConfidence(content, 'groq'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

async function callGemini(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GOOGLE_AI_STUDIO_API_KEY')
  if (!apiKey) return { model: 'Gemini/2.0-Flash', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `You are a financial AI analyst. Respond in Arabic. Provide analysis. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"\n\n${prompt}` }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { model: 'Gemini/2.0-Flash', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Gemini ${res.status}: ${errBody.slice(0, 150)}` }
    }

    const data = await res.json()
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    return { model: 'Gemini/2.0-Flash', content, confidence: calcConfidence(content, 'gemini'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'Gemini/2.0-Flash', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

async function callGLM(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GLM_API_KEY')
  if (!apiKey) return { model: 'GLM-4/glm-4', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  try {
    let authToken: string
    const parts = apiKey.split('.')
    if (parts.length === 2) {
      const [id, secret] = parts
      const now = Date.now()
      const crypto = await import('crypto')
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }), 'utf8').toString('base64url')
      const payload = Buffer.from(JSON.stringify({ api_key: id, exp: Math.floor(now / 1000) + 3600, timestamp: Math.floor(now / 1000) }), 'utf8').toString('base64url')
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
      const errBody = await res.text().catch(() => '')
      return { model: 'GLM-4/glm-4', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `GLM ${res.status}: ${errBody.slice(0, 150)}` }
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content || ''
    return { model: 'GLM-4/glm-4', content, confidence: calcConfidence(content, 'glm'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'GLM-4/glm-4', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

async function callHuggingFace(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('HUGGINGFACE_API_KEY')
  if (!apiKey) return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  try {
    const fullPrompt = `<s>[INST] You are a financial AI analyst. Respond in Arabic. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"\n\n${prompt} [/INST]`
    const res = await fetch('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: fullPrompt,
        parameters: { max_new_tokens: 512, temperature: 0.3, do_sample: true, return_full_text: false },
      }),
      signal: AbortSignal.timeout(MODEL_TIMEOUT),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `HF ${res.status}: ${errBody.slice(0, 150)}` }
    }

    const data = await res.json()
    let content = ''
    if (Array.isArray(data) && data.length > 0) content = data[0].generated_text || ''
    else if (typeof data === 'string') content = data
    content = content.replace(/\[\/INST\]/g, '').trim()
    return { model: 'HuggingFace/Mistral-7B', content, confidence: calcConfidence(content, 'huggingface'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: e.message }
  }
}

// ─── Master Council — Full Consensus ─────────────────────────────

/**
 * Run ALL available AI models ONCE each in parallel, then assign
 * each model's response to one or more council roles.
 *
 * This prevents rate-limiting from calling the same model multiple times.
 * Each model is called with a DIFFERENT prompt for diversity.
 *
 * Role assignment based on model strengths:
 * - Groq:  محلل المشاعر (sentiment) + استراتيجي التنفيذ (execution)
 * - Gemini: المحلل الفني (technical) + خبير الماكرو (macro)
 * - GLM-4:  خبير المخاطر (risk) + خبير الأنماط (patterns)
 * - HF:     (if available, supplements any missing role)
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

  // Define prompts for each model — each model gets a different perspective
  const modelCalls: Array<{
    modelName: string
    callFn: () => Promise<DirectAIResponse>
    roles: string[] // This model fills these roles
    prompt: string
  }> = [
    {
      modelName: 'Groq',
      callFn: () => callGroq(`حلل مشاعر السوق وأفضل توقيت للتنفيذ على ${symbol}. قيّم الزخم والمشاعر العامة ونقطة الدخول المثالية.`),
      roles: ['محلل المشاعر', 'استراتيجي التنفيذ'],
      prompt: 'sentiment+execution',
    },
    {
      modelName: 'Gemini',
      callFn: () => callGemini(`حلل الشارت الفني والوضع الاقتصادي لـ ${symbol}. قيّم الاتجاه والمقاومات والعوامل الكلية المؤثرة.`),
      roles: ['المحلل الفني', 'خبير الماكرو'],
      prompt: 'technical+macro',
    },
    {
      modelName: 'GLM-4',
      callFn: () => callGLM(`حدد مخاطر الدخول في صفقة على ${symbol} والأنماط التاريخية المتكررة. قيّم التذبذب والأنماط الفنية.`),
      roles: ['خبير المخاطر', 'خبير الأنماط'],
      prompt: 'risk+patterns',
    },
    {
      modelName: 'HuggingFace',
      callFn: () => callHuggingFace(`حلل تحليلياً حركة ${symbol}. هل هناك نمط واضح؟ ما توقعاتك؟`),
      roles: ['محلل إضافي'],
      prompt: 'supplementary',
    },
  ]

  // Call ALL models in parallel — each model is called ONLY ONCE
  const callResults = await Promise.allSettled(
    modelCalls.map(async (mc) => {
      const response = await mc.callFn()
      if (!response.success) {
        errors.push(`${mc.modelName}: ${response.error || 'failed'}`)
      }
      return { ...mc, response }
    })
  )

  // Build analyses — each successful model fills its assigned roles
  const analyses: CouncilVote[] = []
  let buyWeight = 0, sellWeight = 0, totalConfidence = 0

  for (const res of callResults) {
    if (res.status !== 'fulfilled') continue
    const { roles: modelRoles, response } = res.value
    if (!response.success || response.confidence <= 0) continue

    const vote = parseVote(response.content)
    const conf = response.confidence

    // This model's response fills all its assigned roles
    for (const roleName of modelRoles) {
      if (vote === 'BUY') buyWeight += conf
      else if (vote === 'SELL') sellWeight += conf
      totalConfidence += conf

      analyses.push({
        role: roleName,
        model: response.model,
        vote,
        confidence: Math.round(conf * 100),
        reason: response.content.slice(0, 300) + (response.content.length > 300 ? '...' : ''),
      })
    }
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

  const masterStrategy = `إجماع مجلس الذكاء الاصطناعي (${analyses.length} أدوار): ${recommendation === 'BUY' ? 'شراء' : recommendation === 'SELL' ? 'بيع' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`
  const conflictExplanation = analyses.length < 4
    ? `بعض النماذج لم تستجب — النماذج المتاحة توصلت لإجماع.`
    : 'الأدوار متوافقة نسبياً.'

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
        aiEngine: `Direct-AI (${analyses.length} roles from ${new Set(analyses.map(a => a.model)).size} models)`,
        modelsUsed: [...new Set(analyses.map(a => a.model))],
        modelsResponded: new Set(analyses.map(a => a.model)).size,
        modelsExpected: 4,
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
