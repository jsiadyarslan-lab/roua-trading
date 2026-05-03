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
 * Available models (up to 7):
 * - Groq/Llama 3.3 70B  (GROQ_API_KEY)        → محلل المشاعر
 * - Gemini 2.0 Flash     (GOOGLE_AI_STUDIO_API_KEY) → المحلل الفني
 * - GLM-4 (Zhipu AI)    (GLM_API_KEY)          → خبير الماكرو
 * - HuggingFace/Mistral  (HUGGINGFACE_API_KEY)  → خبير الأنماط
 * - Ollama/Qwen2.5      (OLLAMA_BASE_URL)       → استراتيجي التنفيذ (non-localhost only)
 * - Bedrock/Claude 3.5   (AWS_ACCESS_KEY_ID)     → خبير المخاطر (direct call with AWS SigV4)
 * - OpenRouter/DeepSeek  (OPENROUTER_API_KEY)    → محلل التباين (free models)
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
  const MODEL_BASE: Record<string, number> = { groq: 0, gemini: 0.05, glm: 0.02, huggingface: -0.05, ollama: 0.03, bedrock: 0.08, openrouter: 0.01 }
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

const MODEL_TIMEOUT = 15_000 // FIX: Reduced from 20s to 15s — faster failure, quicker Layer 2 completion
const OLLAMA_CLOUD_TIMEOUT = 30_000 // 30s for Ollama cloud (slower than local)
const OLLAMA_LOCAL_TIMEOUT = 8_000 // 8s for local Ollama (fail faster if unreachable)

// ─── Live Market Data ────────────────────────────────────────────

/**
 * FIX: Fetch quick market data (price, RSI, MACD) to prevent AI hallucinations.
 * Models were inventing prices (e.g., saying BTC is $28,500 when it's much higher).
 * Uses Binance public API for crypto — no auth required.
 * Falls back gracefully if fetch fails.
 */
async function fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
  try {
    // Normalize symbol for Binance: BTC/USD → BTCUSDT
    const binanceSymbol = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase()

    // Fetch 24hr ticker for current price
    const tickerRes = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!tickerRes.ok) return { price: 0, rsi: 50, macd: 'غير متوفر' }
    const tickerData = await tickerRes.json()
    const price = parseFloat(tickerData?.lastPrice || '0')

    if (price === 0) return { price: 0, rsi: 50, macd: 'غير متوفر' }

    // Fetch klines for RSI and MACD calculation — 30 candles on 1h timeframe
    const klinesRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=30`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!klinesRes.ok) return { price, rsi: 50, macd: 'غير متوفر' }
    const klinesData = await klinesRes.json()
    const closes: number[] = (klinesData || []).map((k: any) => parseFloat(k[4])).filter((v: number) => !isNaN(v))

    const rsi = calcRSI(closes)
    const macd = calcMACD(closes)

    return { price, rsi, macd }
  } catch {
    return { price: 0, rsi: 50, macd: 'غير متوفر' }
  }
}

/** Calculate RSI (Relative Strength Index) from closing prices */
function calcRSI(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1]
    if (change > 0) gains += change
    else losses += Math.abs(change)
  }
  if (losses === 0) return 100
  const rs = gains / losses
  return Math.round(100 - (100 / (1 + rs)))
}

/** Calculate MACD summary from closing prices */
function calcMACD(closes: number[]): string {
  if (closes.length < 26) return 'غير متوفر (بيانات غير كافية)'
  const ema12 = calcEMA(closes, 12)
  const ema26 = calcEMA(closes, 26)
  const macdLine = ema12 - ema26
  const direction = macdLine > 0 ? 'صاعد' : 'هبوطي'
  return `${direction} (القيمة: ${macdLine.toFixed(2)})`
}

/** Calculate Exponential Moving Average */
function calcEMA(data: number[], period: number): number {
  const multiplier = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema
  }
  return ema
}

// ─── Model Call Functions ────────────────────────────────────────

async function callGroq(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GROQ_API_KEY')
  if (!apiKey) return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  // FIX: Model fallback chain — llama-3.3-70b hits daily limits fast.
  // Try multiple models in order: fast → capable → lightweight
  const modelCandidates = [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',     // Higher daily limits, very fast
    'llama3-70b-8192',
    'mixtral-8x7b-32768',
    'llama3-8b-8192',
    'gemma2-9b-it',              // Google Gemma 2, good multilingual
  ]

  const start = Date.now()
  const systemMsg = 'You are a financial analysis AI. Respond in Arabic. Be concise. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'

  for (const model of modelCandidates) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        // 429 = rate limited on this model, try next
        if (res.status === 429) continue
        // 401/403 = auth error, no point trying other models
        if (res.status === 401 || res.status === 403) {
          return { model: `Groq/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Groq auth failed (${res.status})` }
        }
        continue // Try next model for other errors
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''
      if (content.trim().length > 0) {
        return { model: `Groq/${model}`, content, confidence: calcConfidence(content, 'groq'), processingTimeMs: Date.now() - start, success: true }
      }
    } catch {
      continue // Try next model
    }
  }

  // All models failed
  return { model: 'Groq/Llama-3.3-70B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All Groq models failed (rate limited or unavailable)' }
}

async function callGemini(prompt: string): Promise<DirectAIResponse> {
  // FIX: Check both GOOGLE_AI_STUDIO_API_KEY and GEMINI_API_KEY
  const apiKey = getKey('GOOGLE_AI_STUDIO_API_KEY') || getKey('GEMINI_API_KEY')
  if (!apiKey) return { model: 'Gemini/unavailable', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key (tried GOOGLE_AI_STUDIO_API_KEY and GEMINI_API_KEY)' }

  const start = Date.now()
  // FIX: Model fallback chain — updated May 2025 to use current stable models.
  // Models with higher free-tier quotas listed first to reduce 429 errors.
  const modelCandidates = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash-001', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.5-flash-preview-04-17']
  
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
        // FIX: 429 can mean rate-limit OR quota exhaustion — try next model!
        // Different Gemini models may have separate quota pools.
        // Previously returned immediately on 429, causing premature failure.
        if (res.status === 429) {
          continue // Try next model — different models have separate quotas
        }
        // 404 = model not available, try next
        if (res.status === 404) {
          continue
        }
        return { model: `Gemini/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Gemini ${res.status}: ${errBody.slice(0, 150)}` }
      }

      const data = await res.json()
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
      return { model: `Gemini/${model}`, content, confidence: calcConfidence(content, 'gemini'), processingTimeMs: Date.now() - start, success: content.trim().length > 0 }
    } catch (e: any) {
      continue // Try next model
    }
  }
  
  return { model: 'Gemini/unavailable', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All Gemini models unavailable (quota exhausted or all 429)' }
}

async function callGLM(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('GLM_API_KEY')
  if (!apiKey) return { model: 'GLM-4/glm-4-flash', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key' }

  // FIX: Model fallback chain — glm-4 hits rate limits when balance is low.
  // glm-4-flash is cheaper and more available.
  const modelCandidates = ['glm-4-flash', 'glm-4', 'glm-3-turbo']

  const start = Date.now()
  const systemMsg = 'أنت محلل مالي ذكي. أجب بالعربية باختصار. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'

  for (const model of modelCandidates) {
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
          model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        // 429 = rate limited/balance exhausted, try next model
        if (res.status === 429) continue
        // 401/403 = auth error, no point trying other models
        if (res.status === 401 || res.status === 403) {
          return { model: `GLM-4/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `GLM auth failed (${res.status})` }
        }
        continue
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''
      if (content.trim().length > 0) {
        return { model: `GLM-4/${model}`, content, confidence: calcConfidence(content, 'glm'), processingTimeMs: Date.now() - start, success: true }
      }
    } catch {
      continue // Try next model
    }
  }

  // All models failed
  return { model: 'GLM-4/glm-4-flash', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All GLM models failed (rate limited or balance exhausted)' }
}

async function callHuggingFace(prompt: string): Promise<DirectAIResponse> {
  // FIX: Check both HUGGINGFACE_API_KEY and HF_API_KEY, then try OpenRouter as fallback
  const hfApiKey = getKey('HUGGINGFACE_API_KEY') || getKey('HF_API_KEY')
  const openrouterApiKey = getKey('OPENROUTER_API_KEY')

  if (!hfApiKey && !openrouterApiKey) {
    return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No API key (tried HUGGINGFACE_API_KEY, HF_API_KEY, OPENROUTER_API_KEY)' }
  }

  const start = Date.now()

  // ── Strategy 1: HuggingFace Auto-Router (if HF key available) ──
  if (hfApiKey) {
    const hfModelCandidates = ['Qwen/Qwen2.5-7B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3', 'HuggingFaceH4/zephyr-7b-beta']

    for (const model of hfModelCandidates) {
      try {
        // FIX: Use auto-router URL instead of direct model URL
        // Auto-router: router.huggingface.co/v1/chat/completions
        // Direct:      api-inference.huggingface.co/models/... (limited, often fails)
        const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير أنماط مالي. كن موجزاً ومبنياً على البيانات. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(MODEL_TIMEOUT),
        })

        if (!res.ok) {
          const errBody = await res.text().catch(() => '')
          if (res.status === 404 || res.status === 429) continue
          if (res.status === 401) break // Auth error — try OpenRouter instead
          continue
        }

        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''
        if (content.trim().length > 0) {
          return { model: `HuggingFace/${model.split('/').pop()}`, content, confidence: calcConfidence(content, 'huggingface'), processingTimeMs: Date.now() - start, success: true }
        }
      } catch {
        continue
      }
    }
  }

  // ── Strategy 2: OpenRouter fallback (if OR key available) ──
  if (openrouterApiKey) {
    const orModels = ['meta-llama/llama-3.1-8b-instruct:free', 'qwen/qwen-2.5-7b-instruct:free', 'google/gemma-2-9b-it:free']
    for (const model of orModels) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openrouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
            'X-Title': 'Roua Trading AI',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: 'أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير أنماط مالي. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
              { role: 'user', content: prompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(MODEL_TIMEOUT),
        })

        if (!res.ok) {
          if (res.status === 404 || res.status === 429) continue
          break
        }

        const data = await res.json()
        const content = data.choices?.[0]?.message?.content || ''
        if (content.trim().length > 0) {
          return { model: `OpenRouter/${model.split('/').pop()}`, content, confidence: calcConfidence(content, 'huggingface'), processingTimeMs: Date.now() - start, success: true }
        }
      } catch {
        continue
      }
    }
  }

  return { model: 'HuggingFace/Mistral-7B', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All HuggingFace/OpenRouter models failed' }
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

  // FIX: Resolve model name based on the Ollama server type
  // ollama.com cloud API has different models than local Ollama
  let model = getKey('OLLAMA_MODEL') || 'qwen2.5:7b'
  if (!getKey('OLLAMA_MODEL') && baseUrl.includes('ollama.com')) {
    // ollama.com doesn't have qwen2.5:7b — use gemma3:4b as default
    model = 'gemma3:4b'
  }

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
          { role: 'system', content: 'أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت استراتيجي تنفيذ محترف. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
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
          { role: 'system', content: 'أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت استراتيجي تنفيذ محترف. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
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
      signal: AbortSignal.timeout(baseUrl.includes('ollama.com') ? OLLAMA_CLOUD_TIMEOUT : OLLAMA_LOCAL_TIMEOUT),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      return { model: `Ollama/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Ollama ${res.status}: ${errBody.slice(0, 150)}` }
    }

    const data = await res.json()
    // Handle both native Ollama response and OpenAI-compatible response
    const content = data?.message?.content || data?.choices?.[0]?.message?.content || ''
    return { model: `Ollama/${data?.model || model}`, content, confidence: calcConfidence(content, 'ollama'), processingTimeMs: Date.now() - start, success: content.trim().length > 0 }
  } catch (e: any) {
    return { model: `Ollama/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `Ollama unreachable: ${e.message}` }
  }
}

/**
 * OpenRouter — Direct call for 7th model (محلل التباين / Divergence Analyst)
 * Uses free models with diverse perspectives to find counter-signals.
 * Also serves as fallback within HuggingFace service (NestJS layer).
 */
async function callOpenRouter(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('OPENROUTER_API_KEY')
  if (!apiKey) return { model: 'OpenRouter/unavailable', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No OPENROUTER_API_KEY' }

  const start = Date.now()
  // Free model candidates — diverse perspectives for divergence analysis
  // FIX: Removed invalid model IDs — 'google/gemma-2-2b-it:free' is NOT a valid OpenRouter model.
  // Added more reliable free models. DeepSeek V3 was removed as it may not be free.
  const modelCandidates = [
    'qwen/qwen-2.5-7b-instruct:free',           // Free — good Arabic + reasoning
    'meta-llama/llama-3.1-8b-instruct:free',     // Free — fast, capable
    'google/gemma-2-9b-it:free',                 // Free — good multilingual
    'mistralai/mistral-7b-instruct:free',         // Free — fast, diverse
    'huggingfaceh4/zephyr-7b-beta:free',          // Free — chat-optimized
  ]

  for (const model of modelCandidates) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
          'X-Title': 'Roua Trading AI Council',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: 'أنت محلل تباين مالي محترف. دورك هو البحث عن إشارات معاكسة وأسباب لعدم اتباع الاتجاه السائد. أجب بالعربية. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.5,
          max_tokens: 512,
        }),
        signal: AbortSignal.timeout(MODEL_TIMEOUT),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        // 404/429 = model not available, try next
        if (res.status === 404 || res.status === 429) continue
        return { model: `OpenRouter/${model}`, content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `OpenRouter ${res.status}: ${errBody.slice(0, 150)}` }
      }

      const data = await res.json()
      const content = data.choices?.[0]?.message?.content || ''
      if (content.trim().length > 0) {
        return { model: `OpenRouter/${model}`, content, confidence: calcConfidence(content, 'openrouter'), processingTimeMs: Date.now() - start, success: true }
      }
      // Empty response, try next model
      continue
    } catch {
      continue // Try next model
    }
  }

  return { model: 'OpenRouter/unavailable', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All OpenRouter models unavailable' }
}

/**
 * Bedrock — Direct call with AWS SigV4 signing.
 * Previously marked "too complex for direct" but now implemented
 * so ALL 7 models work even when NestJS is down (Layer 2).
 *
 * Uses the same SigV4 signing as the NestJS BedrockService.
 */
async function callBedrock(prompt: string): Promise<DirectAIResponse> {
  const accessKeyId = getKey('AWS_ACCESS_KEY_ID')
  const secretAccessKey = getKey('AWS_SECRET_ACCESS_KEY')
  const sessionToken = getKey('AWS_SESSION_TOKEN')
  const region = getKey('AWS_REGION') || getKey('AWS_DEFAULT_REGION') || 'us-east-1'

  if (!accessKeyId || !secretAccessKey) {
    return { model: 'Bedrock/Claude-3.5-Sonnet', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'AWS credentials not configured' }
  }

  const start = Date.now()
  // FIX: Model fallback chain — try cross-region inference IDs first (more available),
  // then direct model IDs, then cheaper models.
  // FIX: Increased Bedrock timeout — Bedrock takes 12+ seconds for Claude Sonnet.
  // 15s was too tight, causing timeout failures in the council.
  const modelCandidates = [
    'us.anthropic.claude-3-5-sonnet-20241022-v2:0',  // Cross-region inference (more available)
    'us.anthropic.claude-3-haiku-20240307-v1:0',      // Cross-region Haiku (faster/cheaper)
    'anthropic.claude-3-5-sonnet-20241022-v2:0',      // Direct model ID
    'anthropic.claude-3-haiku-20240307-v1:0',         // Direct Haiku
    'amazon.nova-micro-v1:0',                          // Amazon Nova Micro — fast, cheap
    'amazon.nova-lite-v1:0',                           // Amazon Nova Lite — newer than Titan
    'amazon.titan-text-premier-v1:0',                  // Amazon Titan — usually available
  ]

  for (const modelId of modelCandidates) {
    try {
      const isClaude = modelId.includes('anthropic')
      const isTitan = modelId.includes('titan')
      
      let body: any
      if (isClaude) {
        const systemPrompt = 'أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير مخاطر. قدّم تحليلاً حذراً مع التركيز على المخاطر. أبرز الجوانب السلبية دائماً. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'
        body = {
          anthropic_version: 'bedrock-2023-05-31',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }
      } else if (isTitan) {
        const systemPrompt = 'أنت محلل مالي. أجب بالعربية فقط. أنت خبير مخاطر. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'
        body = {
          inputText: `${systemPrompt}\n\n${prompt}`,
          textGenerationConfig: { maxTokenCount: 1024, temperature: 0.3, topP: 0.9 },
        }
      } else {
        body = { prompt: prompt, max_gen_len: 1024, temperature: 0.3 }
      }

      // FIX: AWS Bedrock requires the model ID to be URL-encoded in the HTTP path
      // (colons must be %3A). However, the SigV4 canonical URI must use the EXACT
      // same encoded path (no double-encoding). So we encode the model ID in the URL,
      // then let the URL parser give us the pathname for SigV4 signing.
      const encodedModelId = encodeURIComponent(modelId)
      const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodedModelId}/invoke`
      const headers = await signAwsRequestV4(endpoint, body, accessKeyId, secretAccessKey, sessionToken, region)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000), // FIX: 30s timeout for Bedrock (was 15s, too short)
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        // 403 = IAM lacks permission, model not enabled, or signing error
        // Log the error for diagnostics but continue to next model
        console.warn(`[Bedrock] Model ${modelId} failed (${res.status}): ${errBody.slice(0, 200)}`)
        if (res.status === 403 || res.status === 404) continue
        // 429 = throttled, try next
        if (res.status === 429) continue
        // For other errors, also try next model
        continue
      }

      const data = await res.json()
      // Extract content based on model type
      let content = ''
      if (data.content && Array.isArray(data.content)) {
        // Claude response format
        content = data.content[0]?.text || ''
      } else if (data.results && Array.isArray(data.results) && data.results.length > 0) {
        // Titan response format
        content = data.results[0].outputText || ''
      } else if (data.generation) {
        // Llama/Mistral response format
        content = data.generation
      } else {
        content = data.completion || data.text || data.outputText || ''
      }

      if (content.trim().length > 0) {
        const modelShort = modelId.split('.').pop() || modelId
        return { model: `Bedrock/${modelShort}`, content, confidence: calcConfidence(content, 'bedrock'), processingTimeMs: Date.now() - start, success: true }
      }
    } catch {
      continue // Try next model
    }
  } // end for loop

  // All Bedrock models failed
  return { model: 'Bedrock/Claude-3.5-Sonnet', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All Bedrock models failed (IAM permissions may be missing or Model Access not enabled)' }
}

/**
 * AWS SigV4 signing for Bedrock InvokeModel API
 * Ported from NestJS BedrockService to enable direct Layer 2 calls.
 */
async function signAwsRequestV4(
  endpoint: string,
  body: any,
  accessKeyId: string,
  secretAccessKey: string,
  sessionToken: string,
  region: string,
): Promise<Record<string, string>> {
  const crypto = await import('crypto')
  const service = 'bedrock'
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.substring(0, 8)

  const bodyStr = JSON.stringify(body)
  const payloadHash = crypto.createHash('sha256').update(bodyStr).digest('hex')

  const host = new URL(endpoint).host
  // FIX: AWS SigV4 canonical URI encoding — must NOT double-encode.
  // The model ID contains colons (anthropic.claude-3-5-sonnet-20241022-v2:0)
  // which are already percent-encoded in the URL by encodeURIComponent above.
  // Previous code double-encoded by doing encodeURIComponent(decodeURIComponent(s))
  // which broke the signature for model IDs with special chars.
  // AWS SigV4 spec: use the URI path as-is (already encoded in the URL).
  const canonicalUri = new URL(endpoint).pathname

  let canonicalHeaders: string
  let signedHeaders: string

  if (sessionToken) {
    canonicalHeaders = `accept:application/json\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\nx-amz-security-token:${sessionToken}\n`
    signedHeaders = 'accept;content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token'
  } else {
    canonicalHeaders = `accept:application/json\ncontent-type:application/json\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
    signedHeaders = 'accept;content-type;host;x-amz-content-sha256;x-amz-date'
  }

  const canonicalRequest = [
    'POST',
    canonicalUri,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n')

  const sign = (key: Buffer, msg: string) =>
    crypto.createHmac('sha256', key).update(msg).digest()

  let signingKey = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest()
  signingKey = sign(signingKey, region)
  signingKey = sign(signingKey, service)
  signingKey = sign(signingKey, 'aws4_request')

  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex')

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Host': host,
    'X-Amz-Content-Sha256': payloadHash,
    'X-Amz-Date': amzDate,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }

  if (sessionToken) {
    headers['X-Amz-Security-Token'] = sessionToken
  }

  return headers
}

function getBedrockStatus(): { available: boolean; reason: string } {
  const hasAwsKeyId = !!getKey('AWS_ACCESS_KEY_ID')
  const hasAwsSecret = !!getKey('AWS_SECRET_ACCESS_KEY')

  if (hasAwsKeyId && hasAwsSecret) {
    return { available: true, reason: 'AWS credentials configured — direct call enabled' }
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
 * Role assignment based on model strengths (7 models → 7 roles):
 * - Groq:       محلل المشاعر (sentiment analysis — fastest model) + استراتيجي التنفيذ (when Ollama absent)
 * - Gemini:     المحلل الفني (technical analysis) + خبير الماكرو (macro)
 * - GLM-4:      خبير الماكرو (macro expert — takes macro role) + خبير المخاطر (secondary)
 * - HuggingFace: خبير الأنماط (pattern recognition — matches NestJS orchestrator)
 * - Ollama:     استراتيجي التنفيذ (execution strategy — if available)
 * - Bedrock:    خبير المخاطر (risk expert — via NestJS only, too complex for direct)
 * - OpenRouter: محلل التباين (divergence analyst — free models with diverse perspectives)
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

  // FIX: Fetch live market data before building prompts to prevent hallucinations
  // (e.g., models inventing BTC price as $28,500 when it's actually much higher)
  const marketData = await fetchQuickMarketData(symbol)
  const marketDataPrefix = marketData.price > 0
    ? `\nبيانات السوق الحية:\n- السعر الحالي: ${marketData.price.toLocaleString()}$\n- مؤشر RSI: ${marketData.rsi}\n- مؤشر MACD: ${marketData.macd}\n\nاستخدم هذه البيانات الحية كأساس لتحليلك. لا تخترع أسعاراً أو مؤشرات من عندك.\n`
    : ''

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
      callFn: () => callGroq(`${marketDataPrefix}حلل مشاعر السوق والتوجه العام حول ${symbol}. قيّم الزخم والمشاعر العامة ونقطة الدخول المثالية. هل السوق صعودي أم هبوطي من ناحية المشاعر؟`),
      roles: ['محلل المشاعر'],
      prompt: 'sentiment',
      primaryOnly: false,
    },
    {
      modelName: 'Gemini',
      callFn: () => callGemini(`${marketDataPrefix}حلل الشارت الفني لـ ${symbol}. قيّم الاتجاه والمقاومات والدعم ومستويات الأسعار الرئيسية. ما هو الاتجاه الفني السائد؟`),
      roles: ['المحلل الفني'],
      prompt: 'technical',
      primaryOnly: false,
    },
    {
      modelName: 'GLM-4',
      callFn: () => callGLM(`${marketDataPrefix}حلل الوضع الاقتصادي الكلي وتأثيره على ${symbol}. قيّم العوامل الكلية المؤثرة على الأصول الرقمية والسياق العربي. هل البيئة الماكروية مواتية؟`),
      roles: ['خبير الماكرو'],
      prompt: 'macro',
      primaryOnly: false,
    },
    {
      modelName: 'HuggingFace',
      callFn: () => callHuggingFace(`${marketDataPrefix}هل ترى أي أنماط تاريخية متكررة في حركة ${symbol} الحالية؟ ما النمط السائد وهل يتكرر بشكل موثوق؟ قدم رأياً مستقلاً.`),
      roles: ['خبير الأنماط'],
      prompt: 'patterns',
      primaryOnly: false,
    },
    {
      modelName: 'Ollama',
      callFn: () => callOllama(`${marketDataPrefix}أنت استراتيجي تنفيذ محترف. حلل أفضل توقيت وأسلوب لتنفيذ صفقة على ${symbol}. قيّم نقاط الدخول والخروج وحجم الصفقة المناسب وإدارة المخاطر.`),
      roles: ['استراتيجي التنفيذ'],
      prompt: 'execution',
      primaryOnly: false,
    },
    {
      modelName: 'Bedrock',
      callFn: () => callBedrock(`${marketDataPrefix}حدد المخاطر المحتملة لصفقة على ${symbol}. قيّم مستوى التذبذب والسيناريو الأسوأ ومستويات وقف الخسارة. ما هي المخاطر الرئيسية وكيف يمكن التحوط ضدها؟`),
      roles: ['خبير المخاطر'],
      prompt: 'risk',
      primaryOnly: false,
    },
    {
      modelName: 'OpenRouter',
      callFn: () => callOpenRouter(`${marketDataPrefix}ابحث عن إشارات معاكسة أو تباينات في تحليل ${symbol} — هل هناك سبب لعدم اتباع الاتجاه السائد؟ حلل من منظور مختلف وقدم رأياً مستقلاً.`),
      roles: ['محلل التباين'],
      prompt: 'divergence',
      primaryOnly: false,
    },
  ]

  // Filter out Ollama if it shouldn't be attempted (localhost on cloud)
  // All other models are always attempted (keys checked inside each callFn)
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

  // ── Log AI usage to AiUsageLog (same table as NestJS AiUsageLoggerService) ──
  // This ensures costs are tracked even when NestJS is down and the direct fallback path runs.
  try {
    const { db, ensureDbReady } = await import('@/lib/db')
    const dbReady = await ensureDbReady()
    if (dbReady) {
      const COST_PER_1K: Record<string, { input: number; output: number }> = {
        groq: { input: 0.00059, output: 0.00079 },
        gemini: { input: 0.000075, output: 0.00030 },
        glm: { input: 0.00140, output: 0.00140 },
        huggingface: { input: 0, output: 0 },
        ollama: { input: 0, output: 0 },
        bedrock: { input: 0.00300, output: 0.01500 },
        openrouter: { input: 0, output: 0 },
      }
      const extractProvider = (model: string): string => {
        const lower = model.toLowerCase()
        if (lower.includes('groq')) return 'groq'
        if (lower.includes('gemini')) return 'gemini'
        if (lower.includes('glm')) return 'glm'
        if (lower.includes('huggingface') || lower.includes('hf')) return 'huggingface'
        if (lower.includes('ollama')) return 'ollama'
        if (lower.includes('bedrock') || lower.includes('claude')) return 'bedrock'
        if (lower.includes('openrouter') || lower.includes('deepseek')) return 'openrouter'
        return 'unknown'
      }
      const calcCost = (provider: string, inputTokens: number, outputTokens: number): number => {
        const rates = COST_PER_1K[provider] || { input: 0, output: 0 }
        return (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output
      }

      const records = callResults
        .filter(r => r.status === 'fulfilled')
        .map(r => {
          const { modelName, prompt: promptType, response } = r.value
          const provider = extractProvider(response.model)
          // FIX: Estimate input tokens from actual prompt text in modelCalls, not role type key
          // Average ~3 chars per token (mixed Arabic/English)
          const estimatedInputTokens = Math.ceil(response.success ? 300 : 0) // ~100 tokens per consensus prompt (approximate)
          const outputTokens = Math.ceil(response.content.length / 3)
          return {
            id: `aul_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            model: response.model,
            provider,
            endpoint: 'consensus',
            inputTokens: estimatedInputTokens,
            outputTokens: response.success ? outputTokens : 0,
            costUsd: response.success ? calcCost(provider, estimatedInputTokens, outputTokens) : 0,
            latencyMs: response.processingTimeMs,
            cached: false,
            success: response.success,
            errorMessage: response.success ? null : (response.error || 'failed').substring(0, 500),
          }
        })

      if (records.length > 0) {
        await db.aiUsageLog.createMany({ data: records })
        console.log(`[direct-council] Logged ${records.length} AI usage records to AiUsageLog`)
      }
    }
  } catch (logError: any) {
    // Don't crash the consensus if logging fails — it's non-critical
    console.warn(`[direct-council] Failed to log AI usage: ${logError?.message || logError}`)
  }

  // Collect successful models — each fills exactly 1 role now
  const successfulModels: Array<{
    modelName: string
    roles: string[]
    response: DirectAIResponse
  }> = []

  for (const res of callResults) {
    if (res.status !== 'fulfilled') continue
    const { modelName, roles, response } = res.value
    if (!response.success || response.confidence <= 0) continue
    successfulModels.push({ modelName, roles, response })
  }

  // FIX: Role redistribution — when models fail, redistribute their roles
  // to working models with a 15% confidence penalty.
  // This ensures all 7 council roles are filled even if some providers fail.
  const CONFIDENCE_PENALTY = 0.85 // 15% penalty for redistributed roles
  const ROLE_REDISTRIBUTION_MAP: Record<string, string[]> = {
    // When a model fails, its role can be taken over by these models (in priority order)
    'استراتيجي التنفيذ': ['Groq', 'Gemini', 'GLM-4'],  // Was Ollama's role
    'خبير المخاطر': ['GLM-4', 'Gemini', 'Groq'],        // Was Bedrock's role
    'خبير الأنماط': ['Groq', 'GLM-4', 'Gemini'],        // Was HuggingFace's role
    'محلل التباين': ['Groq', 'GLM-4', 'Gemini'],        // Was OpenRouter's role
    'محلل المشاعر': ['Gemini', 'GLM-4', 'Groq'],        // Was Groq's role
    'المحلل الفني': ['GLM-4', 'Groq', 'Bedrock'],       // Was Gemini's role
    'خبير الماكرو': ['Gemini', 'Groq', 'HuggingFace'],  // Was GLM-4's role
  }

  // Identify which roles were filled and which are missing
  const filledRoleNames = new Set(successfulModels.flatMap(m => m.roles))
  const allRoleNames = activeModelCalls.flatMap(mc => mc.roles)
  const missingRoles = allRoleNames.filter(r => !filledRoleNames.has(r))
  console.log(`[direct-council] Role redistribution: filled=${JSON.stringify([...filledRoleNames])}, missing=${JSON.stringify(missingRoles)}, successfulModels=${successfulModels.map(m => m.modelName).join(',')}`)

  // Redistribute missing roles to successful models
  let redistributedCount = 0
  if (missingRoles.length > 0 && successfulModels.length > 0) {
    for (const missingRole of missingRoles) {
      const candidates = ROLE_REDISTRIBUTION_MAP[missingRole] || []
      // Find the first candidate model that succeeded and doesn't already have this role
      const redistributor = candidates.find(candName => {
        const model = successfulModels.find(m => m.modelName === candName)
        return model && !model.roles.includes(missingRole)
      })

      if (redistributor) {
        const model = successfulModels.find(m => m.modelName === redistributor)!
        model.roles.push(missingRole)
        redistributedCount++
        console.log(`[direct-council] Redistributing role "${missingRole}" to ${redistributor} (with 15% confidence penalty)`)
      }
    }
  }
  console.log(`[direct-council] After redistribution: total redistributed=${redistributedCount}, model roles: ${successfulModels.map(m => `${m.modelName}=[${m.roles.join(',')}]`).join(' | ')}`)

  // Build analyses — each successful model fills its assigned role(s)
  // FIX: Redistributed roles get a 15% confidence penalty
  const analyses: CouncilVote[] = []
  let buyWeight = 0, sellWeight = 0, holdWeight = 0, totalConfidence = 0
  // FIX: Track individual confidences per vote type for accurate consensus calculation
  let buyConfidences: number[] = []
  let sellConfidences: number[] = []
  let holdConfidences: number[] = []

  for (const modelData of successfulModels) {
    const { roles: modelRoles, response } = modelData
    const vote = parseVote(response.content)

    // Each model fills all its assigned roles (primary + any redistributed)
    for (const roleName of modelRoles) {
      // Apply 15% confidence penalty for redistributed roles (roles beyond the first/primary)
      const isPrimaryRole = modelRoles.indexOf(roleName) === 0
      const conf = isPrimaryRole ? response.confidence : response.confidence * CONFIDENCE_PENALTY

      if (vote === 'BUY') { buyWeight += conf; buyConfidences.push(conf) }
      else if (vote === 'SELL') { sellWeight += conf; sellConfidences.push(conf) }
      else { holdWeight += conf; holdConfidences.push(conf) }
      totalConfidence += conf

      analyses.push({
        role: roleName,
        model: response.model + (isPrimaryRole ? '' : ' (بديل)'),
        vote,
        confidence: Math.round(conf * 100),
        reason: response.content.slice(0, 300) + (response.content.length > 300 ? '...' : ''),
      })
    }
  }

  // FIX: Consensus score = average confidence of models that agreed on the final recommendation
  // Previously, HOLD used (1 - |buyPct - sellPct|) * 50 which capped at 50%
  // Now: BUY score = avg confidence of BUY voters, SELL score = avg of SELL voters, HOLD = avg of HOLD voters
  let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let consensusScore = 0

  if (totalConfidence > 0) {
    const buyPct = buyWeight / totalConfidence
    const sellPct = sellWeight / totalConfidence
    if (buyPct > 0.6) {
      recommendation = 'BUY'
      consensusScore = buyConfidences.length > 0
        ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
        : Math.round(buyPct * 100)
    } else if (sellPct > 0.6) {
      recommendation = 'SELL'
      consensusScore = sellConfidences.length > 0
        ? Math.round(sellConfidences.reduce((a, b) => a + b, 0) / sellConfidences.length * 100)
        : Math.round(sellPct * 100)
    } else {
      recommendation = 'HOLD'
      consensusScore = holdConfidences.length > 0
        ? Math.round(holdConfidences.reduce((a, b) => a + b, 0) / holdConfidences.length * 100)
        : Math.round((1 - Math.abs(buyPct - sellPct)) * 50)
    }
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
    if (mc.modelName === 'Gemini') return !!(getKey('GOOGLE_AI_STUDIO_API_KEY') || getKey('GEMINI_API_KEY'))
    if (mc.modelName === 'GLM-4') return !!getKey('GLM_API_KEY')
    if (mc.modelName === 'HuggingFace') return !!(getKey('HUGGINGFACE_API_KEY') || getKey('HF_API_KEY') || getKey('OPENROUTER_API_KEY'))
    if (mc.modelName === 'Ollama') return shouldTryOllama
    if (mc.modelName === 'Bedrock') return !!(getKey('AWS_ACCESS_KEY_ID') && getKey('AWS_SECRET_ACCESS_KEY'))
    if (mc.modelName === 'OpenRouter') return !!getKey('OPENROUTER_API_KEY')
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
        price: marketData.price,
        rsi: marketData.rsi,
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        aiEngine: `Direct-AI (${filledRoles} roles from ${modelsRespondedCount} models)`,
        modelsUsed: uniqueModels,
        modelsResponded: modelsRespondedCount,
        modelsExpected: 7, // 7 roles in the full council
        modelsWithKeys: expectedDirectModels,
        bedrockAvailable: bedrockStatus.available,
        bedrockNote: bedrockStatus.available ? 'Direct call enabled (AWS SigV4)' : 'AWS credentials not configured',
        redistributedRoles: redistributedCount,
        ollamaAttempted: shouldTryOllama,
        ollamaUrl: shouldTryOllama ? ollamaBaseUrl : 'skipped (localhost on cloud)',
      },
    },
    errors,
  }
}

/**
 * Quick health check: which AI models have API keys configured?
 * All 7 models checked including Bedrock and OpenRouter (direct call now supported).
 */
export function getAvailableModelKeys(): { model: string; hasKey: boolean; note?: string }[] {
  const ollamaBaseUrl = getKey('OLLAMA_BASE_URL') || 'http://localhost:11434'
  const ollamaSkipped = isCloudEnvironment() && isLocalhostUrl(ollamaBaseUrl)
  const bedrockStatus = getBedrockStatus()

  return [
    { model: 'Groq', hasKey: !!getKey('GROQ_API_KEY') },
    { model: 'Gemini', hasKey: !!(getKey('GOOGLE_AI_STUDIO_API_KEY') || getKey('GEMINI_API_KEY')), note: 'Accepts GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY' },
    { model: 'GLM-4', hasKey: !!getKey('GLM_API_KEY') },
    { model: 'HuggingFace', hasKey: !!(getKey('HUGGINGFACE_API_KEY') || getKey('HF_API_KEY') || getKey('OPENROUTER_API_KEY')), note: 'Accepts HUGGINGFACE_API_KEY, HF_API_KEY, or uses OPENROUTER_API_KEY as fallback' },
    {
      model: 'Ollama',
      hasKey: !ollamaSkipped && (!!getKey('OLLAMA_API_KEY') || !isLocalhostUrl(ollamaBaseUrl)),
      note: ollamaSkipped ? 'localhost unreachable on cloud — set OLLAMA_BASE_URL to cloud URL' : `URL: ${ollamaBaseUrl}`,
    },
    {
      model: 'Bedrock',
      hasKey: bedrockStatus.available,
      note: bedrockStatus.available ? 'Direct call enabled (AWS SigV4)' : 'AWS credentials not configured',
    },
    {
      model: 'OpenRouter',
      hasKey: !!getKey('OPENROUTER_API_KEY'),
      note: 'Free models — divergence analyst',
    },
  ]
}
