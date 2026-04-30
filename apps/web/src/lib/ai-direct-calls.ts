/**
 * Direct AI Model Calls — Independent from NestJS
 *
 * When the NestJS backend is unreachable, this module allows the
 * Next.js consensus route to call AI models DIRECTLY.
 *
 * Strategy: Call ALL available models ONCE each in parallel, then assign each
 * model's response to one or more council roles. This prevents rate-limiting
 * from calling the same model 6 times.
 *
 * Available models (up to 6):
 * - Groq/Llama 3.3 70B  (GROQ_API_KEY)        → محلل المشاعر
 * - Gemini 2.0 Flash     (GOOGLE_AI_STUDIO_API_KEY) → المحلل الفني
 * - GLM-4 (Zhipu AI)    (GLM_API_KEY)          → خبير الأنماط
 * - HuggingFace/Mistral  (HUGGINGFACE_API_KEY)  → محلل إضافي
 * - Ollama/Qwen2.5      (OLLAMA_BASE_URL)       → استراتيجي التنفيذ (non-localhost only)
 * - Bedrock/Claude       (AWS_ACCESS_KEY_ID)     → خبير المخاطر (via NestJS only — too complex for direct)
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

/** Check if we're running on a cloud platform (Railway, Render, etc.) */
function isCloudEnvironment(): boolean {
  return !!(
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RENDER ||
    process.env.AWS_EXECUTION_ENV ||
    process.env.VERCEL ||
    process.env.DYNO // Heroku
  )
}

/** Check if an Ollama URL points to a local/non-routable address */
function isLocalhostUrl(url: string): boolean {
  return url.includes('localhost') || url.includes('127.0.0.1') || url.includes('0.0.0.0')
}

// ─── Confidence Calculation ──────────────────────────────────────

function calcConfidence(content: string, model: string): number {
  let confidence = 0.5
  if (content.length > 200) confidence += 0.1
  if (content.length > 500) confidence += 0.1
  if (content.length > 1000) confidence += 0.05
  if (/شراء|بيع|انتظار|BUY|SELL|HOLD|صعود|هبوط/i.test(content)) confidence += 0.15
  const MODEL_BASE: Record<string, number> = { groq: 0, gemini: 0.05, glm: 0.02, huggingface: -0.05, ollama: 0.03, bedrock: 0.08 }
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
const OLLAMA_TIMEOUT = 8_000 // 8s for Ollama (fail faster if unreachable)

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
  if (!apiKey) return { model: 'Gemini/unavailable', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  const start = Date.now()
  // FIX: Model fallback chain — try multiple model names since availability varies
  const modelCandidates = ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-1.5-flash', 'gemini-2.0-flash-lite']
  
  for (const model of modelCandidates) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
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
        // 404 = model not available, try next
        if (res.status === 404) {
          continue
        }
        return { model: `Gemini/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Gemini ${res.status}: ${errBody.slice(0, 150)}` }
      }

      const data = await res.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { model: `Gemini/${model}`, content, confidence: calcConfidence(content, 'gemini'), processingTimeMs: Date.now() - start, success: content.length > 10 }
    } catch (e: any) {
      continue // Try next model
    }
  }
  
  return { model: 'Gemini/unavailable', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All Gemini models unavailable (404)' }
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

/**
 * Call Ollama — only works if:
 * 1. OLLAMA_BASE_URL is set to a non-localhost URL, OR
 * 2. We're running locally (not on cloud)
 *
 * On cloud with localhost URL, Ollama is unreachable, so we skip it.
 */
async function callOllama(prompt: string): Promise<DirectAIResponse> {
  const baseUrl = getKey('OLLAMA_BASE_URL') || 'http://localhost:11434'

  // Skip if on cloud and URL is localhost — it will never work
  if (isCloudEnvironment() && isLocalhostUrl(baseUrl)) {
    return {
      model: 'Ollama/Qwen2.5',
      content: '',
      confidence: 0,
      processingTimeMs: 0,
      success: false,
      error: 'Ollama localhost unreachable on cloud',
    }
  }

  const apiKey = getKey('OLLAMA_API_KEY') // Optional — some Ollama servers use auth
  const model = getKey('OLLAMA_MODEL') || 'qwen2.5:7b'

  const start = Date.now()
  try {
    // FIX: Support both native Ollama API (/api/chat) and OpenAI-compatible API (/v1/chat/completions)
    // If the base URL ends with /v1, use the OpenAI-compatible endpoint instead.
    let apiEndpoint: string
    let requestBody: any
    let requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' }

    if (baseUrl.endsWith('/v1') || baseUrl.endsWith('/v1/')) {
      // OpenAI-compatible endpoint (used by Ollama cloud proxies and some providers)
      apiEndpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`
      requestBody = {
        model,
        messages: [
          { role: 'system', content: 'أنت محلل مالي محترف. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }
      if (apiKey) requestHeaders['Authorization'] = `Bearer ${apiKey}`
    } else {
      // Native Ollama API endpoint
      apiEndpoint = `${baseUrl}/api/chat`
      requestBody = {
        model,
        messages: [
          { role: 'system', content: 'أنت محلل مالي محترف. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.3, num_predict: 1024 },
      }
      if (apiKey) requestHeaders['Authorization'] = `Bearer ${apiKey}`
    }

    const res = await fetch(apiEndpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(OLLAMA_TIMEOUT),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { model: `Ollama/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Ollama ${res.status}: ${errBody.slice(0, 150)}` }
    }

    const data = await res.json()
    // Handle both native Ollama response and OpenAI-compatible response
    const content = data?.message?.content || data?.choices?.[0]?.message?.content || ''
    return { model: `Ollama/${data?.model || model}`, content, confidence: calcConfidence(content, 'ollama'), processingTimeMs: Date.now() - start, success: content.length > 10 }
  } catch (e: any) {
    return { model: `Ollama/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Ollama unreachable: ${e.message}` }
  }
}

/**
 * Bedrock — Too complex to implement directly (requires AWS SigV4 signing).
 * We report its availability status but don't call it directly.
 * Bedrock is available only through NestJS backend (Layer 1).
 */
function getBedrockStatus(): { available: boolean; reason: string } {
  const hasAwsKeyId = !!getKey('AWS_ACCESS_KEY_ID')
  const hasAwsSecret = !!getKey('AWS_SECRET_ACCESS_KEY')
  const hasAwsRegion = !!getKey('AWS_REGION') || !!getKey('AWS_DEFAULT_REGION')

  if (hasAwsKeyId && hasAwsSecret) {
    return { available: true, reason: 'AWS credentials configured — available via NestJS backend' }
  }
  return { available: false, reason: 'AWS credentials not configured' }
}

// ─── Master Council — Full Consensus ─────────────────────────────

/**
 * Run ALL available AI models ONCE each in parallel, then assign
 * each model's response to one or more council roles.
 *
 * This prevents rate-limiting from calling the same model multiple times.
 * Each model is called with a DIFFERENT prompt for diversity.
 *
 * Role assignment based on model strengths (6 models → 6+ roles):
 * - Groq:       محلل المشاعر (sentiment analysis — fastest model)
 * - Gemini:     المحلل الفني (technical analysis) + خبير الماكرو (macro)
 * - GLM-4:      خبير الأنماط (pattern recognition — 200k context)
 * - HuggingFace: محلل إضافي (supplementary — open source)
 * - Ollama:     استراتيجي التنفيذ (execution strategy — if available)
 * - Bedrock:    خبير المخاطر (risk expert — via NestJS only, too complex for direct)
 *
 * When fewer models respond, remaining roles are redistributed:
 * - If Ollama is unavailable → Groq takes استراتيجي التنفيذ
 * - If Bedrock is unavailable → GLM-4 takes خبير المخاطر
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

  // Check Bedrock status (for reporting only — we don't call it directly)
  const bedrockStatus = getBedrockStatus()
  if (bedrockStatus.available) {
    // Note: Bedrock is available but only via NestJS — mention it in meta
    console.log(`[direct-council] Bedrock: ${bedrockStatus.reason}`)
  }

  // Determine if Ollama should be attempted
  const ollamaBaseUrl = getKey('OLLAMA_BASE_URL') || 'http://localhost:11434'
  const shouldTryOllama = !isCloudEnvironment() || !isLocalhostUrl(ollamaBaseUrl)

  // Define prompts for each model — each model gets a different perspective
  // Primary role assignment for 6 models
  const modelCalls: Array<{
    modelName: string
    callFn: () => Promise<DirectAIResponse>
    roles: string[] // This model fills these roles
    prompt: string
    primaryOnly: boolean // If true, secondary roles are dropped when 6+ models respond
  }> = [
    {
      modelName: 'Groq',
      callFn: () => callGroq(`حلل مشاعر السوق والتوجه العام حول ${symbol}. قيّم الزخم والمشاعر العامة ونقطة الدخول المثالية. هل السوق صعودي أم هبوطي من ناحية المشاعر؟`),
      roles: ['محلل المشاعر', 'استراتيجي التنفيذ'], // استراتيجي التنفيذ is shared with Ollama
      prompt: 'sentiment',
      primaryOnly: false, // Groq always keeps execution as secondary
    },
    {
      modelName: 'Gemini',
      callFn: () => callGemini(`حلل الشارت الفني والوضع الاقتصادي الكلي لـ ${symbol}. قيّم الاتجاه والمقاومات والدعم والعوامل الكلية المؤثرة على الأصول الرقمية.`),
      roles: ['المحلل الفني', 'خبير الماكرو'],
      prompt: 'technical+macro',
      primaryOnly: false,
    },
    {
      modelName: 'GLM-4',
      callFn: () => callGLM(`حدد الأنماط التاريخية المتكررة والمخاطر المحتملة لصفقة على ${symbol}. قيّم الأنماط الفنية المتكررة ومستوى التذبذب الحالي. هل هناك نمط واضح؟`),
      roles: ['خبير الأنماط', 'خبير المخاطر'], // خبير المخاطر is shared with Bedrock
      prompt: 'patterns',
      primaryOnly: false, // GLM-4 always keeps risk as secondary
    },
    {
      modelName: 'HuggingFace',
      callFn: () => callHuggingFace(`حلل تحليلياً حركة ${symbol}. هل هناك نمط واضح؟ ما توقعاتك للاتجاه القادم؟ قدم رأياً مستقلاً ومختلفاً.`),
      roles: ['محلل إضافي'],
      prompt: 'supplementary',
      primaryOnly: false,
    },
    {
      modelName: 'Ollama',
      callFn: () => callOllama(`أنت استراتيجي تنفيذ محترف. حلل أفضل توقيت وأسلوب لتنفيذ صفقة على ${symbol}. قيّم نقاط الدخول والخروج وحجم الصفقة المناسب وإدارة المخاطر.`),
      roles: ['استراتيجي التنفيذ'], // Takes execution role from Groq when available
      prompt: 'execution',
      primaryOnly: true, // This role overlaps with Groq's secondary
    },
  ]

  // Filter out Ollama if it shouldn't be attempted
  const activeModelCalls = shouldTryOllama
    ? modelCalls
    : modelCalls.filter(mc => mc.modelName !== 'Ollama')

  // Call ALL models in parallel — each model is called ONLY ONCE
  const callResults = await Promise.allSettled(
    activeModelCalls.map(async (mc) => {
      const response = await mc.callFn()
      if (!response.success) {
        errors.push(`${mc.modelName}: ${response.error || 'failed'}`)
      }
      return { ...mc, response }
    })
  )

  // Collect successful models for role reassignment
  const successfulModels: Array<{
    modelName: string
    roles: string[]
    response: DirectAIResponse
    primaryOnly: boolean
  }> = []

  for (const res of callResults) {
    if (res.status !== 'fulfilled') continue
    const { modelName, roles, response, primaryOnly } = res.value
    if (!response.success || response.confidence <= 0) continue
    successfulModels.push({ modelName, roles, response, primaryOnly })
  }

  // Determine which models responded for role reassignment
  const respondedModelNames = new Set(successfulModels.map(m => m.modelName))
  const hasOllama = respondedModelNames.has('Ollama')
  // Bedrock is never in direct calls, so we check if GLM-4 should keep risk role

  // Role assignment logic:
  // - If Ollama responded → Groq drops استراتيجي التنفيذ, Ollama keeps it
  // - If Ollama did NOT respond → Groq keeps استراتيجي التنفيذ
  // - Bedrock is always via NestJS only → GLM-4 always keeps خبير المخاطر in direct calls

  // Build analyses — each successful model fills its assigned roles
  const analyses: CouncilVote[] = []
  let buyWeight = 0, sellWeight = 0, totalConfidence = 0

  for (const modelData of successfulModels) {
    const { roles: modelRoles, response, modelName, primaryOnly } = modelData
    const vote = parseVote(response.content)
    const conf = response.confidence

    // Determine which roles this model actually fills
    let assignedRoles = [...modelRoles]

    if (primaryOnly && modelName === 'Ollama' && hasOllama) {
      // Ollama takes استراتيجي التنفيذ — this is its only role
      assignedRoles = ['استراتيجي التنفيذ']
    }

    // If Ollama is present, Groq should NOT fill استراتيجي التنفيذ
    if (modelName === 'Groq' && hasOllama) {
      assignedRoles = assignedRoles.filter(r => r !== 'استراتيجي التنفيذ')
    }

    // If Ollama is absent, Groq keeps استراتيجي التنفيذ (already in its roles)

    // This model's response fills all its assigned roles
    for (const roleName of assignedRoles) {
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

  const filledRoles = analyses.length
  const uniqueModels = [...new Set(analyses.map(a => a.model))]
  const modelsRespondedCount = uniqueModels.length

  const masterStrategy = `إجماع مجلس الذكاء الاصطناعي (${filledRoles} أدوار من ${modelsRespondedCount} نماذج): ${recommendation === 'BUY' ? 'شراء' : recommendation === 'SELL' ? 'بيع' : 'انتظار'} بنسبة ثقة ${consensusScore}%.`

  const conflictExplanation = filledRoles < 4
    ? `بعض النماذج لم تستجب — النماذج المتاحة (${uniqueModels.join('، ')}) توصلت لإجماع.`
    : filledRoles >= 5
      ? 'الأدوار متوافقة نسبياً مع تغطية واسعة.'
      : 'الأدوار الأساسية متوافقة نسبياً.'

  // Source determination: real-ai if 3+ roles filled, partial-ai if 1-2
  const source = analyses.length >= 3 ? 'real-ai' : 'partial-ai'

  // Calculate expected models (how many had keys configured)
  const expectedDirectModels = activeModelCalls.filter(mc => {
    if (mc.modelName === 'Groq') return !!getKey('GROQ_API_KEY')
    if (mc.modelName === 'Gemini') return !!getKey('GOOGLE_AI_STUDIO_API_KEY')
    if (mc.modelName === 'GLM-4') return !!getKey('GLM_API_KEY')
    if (mc.modelName === 'HuggingFace') return !!getKey('HUGGINGFACE_API_KEY')
    if (mc.modelName === 'Ollama') return shouldTryOllama
    return false
  }).length

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
        aiEngine: `Direct-AI (${filledRoles} roles from ${modelsRespondedCount} models)`,
        modelsUsed: uniqueModels,
        modelsResponded: modelsRespondedCount,
        modelsExpected: 6, // 6 roles in the full council
        modelsWithKeys: expectedDirectModels,
        bedrockAvailable: bedrockStatus.available,
        bedrockNote: bedrockStatus.available ? 'Available via NestJS only' : 'Not configured',
        ollamaAttempted: shouldTryOllama,
        ollamaUrl: shouldTryOllama ? ollamaBaseUrl : 'skipped (localhost on cloud)',
      },
    },
    errors,
  }
}

/**
 * Quick health check: which AI models have API keys configured?
 * Includes Ollama and Bedrock status.
 */
export function getAvailableModelKeys(): { model: string; hasKey: boolean; note?: string }[] {
  const ollamaBaseUrl = getKey('OLLAMA_BASE_URL') || 'http://localhost:11434'
  const ollamaSkipped = isCloudEnvironment() && isLocalhostUrl(ollamaBaseUrl)
  const bedrockStatus = getBedrockStatus()

  return [
    { model: 'Groq', hasKey: !!getKey('GROQ_API_KEY') },
    { model: 'Gemini', hasKey: !!getKey('GOOGLE_AI_STUDIO_API_KEY') },
    { model: 'GLM-4', hasKey: !!getKey('GLM_API_KEY') },
    { model: 'HuggingFace', hasKey: !!getKey('HUGGINGFACE_API_KEY') },
    {
      model: 'Ollama',
      hasKey: !ollamaSkipped, // "available" if not skipped
      note: ollamaSkipped ? 'localhost unreachable on cloud' : `URL: ${ollamaBaseUrl}`,
    },
    {
      model: 'Bedrock',
      hasKey: bedrockStatus.available,
      note: bedrockStatus.available ? 'Via NestJS only (AWS SigV4 required)' : 'AWS credentials not configured',
    },
  ]
}
