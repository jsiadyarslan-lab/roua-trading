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
 * Available models (up to 8):
 * - Groq/Llama 3.3 70B  (GROQ_API_KEY)        → محلل المشاعر
 * - Gemini 2.0 Flash     (GOOGLE_AI_STUDIO_API_KEY) → المحلل الفني
 * - GLM-4 (Zhipu AI)    (GLM_API_KEY)          → خبير الماكرو
 * - HuggingFace/Mistral  (HUGGINGFACE_API_KEY)  → خبير الأنماط
 * - Ollama/Qwen2.5      (OLLAMA_BASE_URL)       → استراتيجي التنفيذ (non-localhost only)
 * - Bedrock/Claude 3.5   (AWS_ACCESS_KEY_ID)     → خبير المخاطر (direct call with AWS SigV4)
 * - OpenRouter/DeepSeek  (OPENROUTER_API_KEY)    → محلل التباين (free models)
 * - DeepSeek V3          (DEEPSEEK_API_KEY)       → محلل السيناريوهات (8th model)
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

// Last-known-good price cache — prevents price hallucination when all sources fail
const lastKnownPriceCache = new Map<string, { price: number; rsi: number; macd: string; timestamp: number }>()
const PRICE_CACHE_MAX_AGE = 30 * 60 * 1000 // 30 minutes — stale price is better than no price

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
  const MODEL_BASE: Record<string, number> = { groq: 0, gemini: 0.05, glm: 0.02, huggingface: -0.05, ollama: 0.03, bedrock: 0.08, openrouter: 0.01, deepseek: 0.03 }
  confidence += MODEL_BASE[model] || 0
  return Math.min(Math.max(confidence, 0.1), 0.95)
}

// ─── Vote Parsing ────────────────────────────────────────────────

function parseVote(content: string): 'BUY' | 'SELL' | 'HOLD' {
  // ═══════════════════════════════════════════════════════════════
  // FIX: Improved vote parsing — prevents false HOLD classification
  //
  // Previous bug: When AI gives nuanced analysis mentioning both
  // bullish/bearish factors, parser defaulted to HOLD. This caused
  // 89% consensus to be labeled "Neutral — Wait" because most votes
  // were misclassified as HOLD.
  //
  // New approach: Weighted keyword scoring + stronger directional
  // detection + final conclusion extraction.
  // ═══════════════════════════════════════════════════════════════

  // Priority 1: Explicit DECISION: BUY/SELL/HOLD format (strongest signal)
  const decisionMatch = content.match(/DECISION:\s*(BUY|SELL|HOLD)/i)
  if (decisionMatch) return decisionMatch[1].toUpperCase() as 'BUY' | 'SELL' | 'HOLD'

  // Priority 2: Arabic explicit recommendation patterns (expanded)
  const arBuyPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:الشراء|بالشراء|بشراء|شراء|الدخول|بالشراء)/i
  const arSellPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:البيع|بالبيع|ببيع|بيع|الخروج|بالبيع)/i
  const arHoldPatterns = /(?:أنصح|أوصي|التوصية|توصيتي|رأيي|أرى|أميل|أرتئي|ننصح|نوصي)\s*(?:بـ)?(?:الانتظار|بالانتظار|بانتظار|الحياد|بالحشد|بالتوقف|التوقف|الحذر|الترقب)/i

  const hasArBuy = arBuyPatterns.test(content)
  const hasArSell = arSellPatterns.test(content)
  const hasArHold = arHoldPatterns.test(content)

  if (hasArBuy && !hasArSell && !hasArHold) return 'BUY'
  if (hasArSell && !hasArBuy && !hasArHold) return 'SELL'
  if (hasArHold && !hasArBuy && !hasArSell) return 'HOLD'
  // If both buy and hold/sell and hold, prioritize the directional signal
  if (hasArBuy && hasArHold && !hasArSell) return 'BUY'  // "أميل للشراء مع الحذر" → BUY
  if (hasArSell && hasArHold && !hasArBuy) return 'SELL' // "أوصي بالبيع مع الترقب" → SELL

  // Priority 3: English recommendation patterns (expanded)
  const engBuy = /(?:I\s+recommend\s+(?:buying|a\s+buy|to\s+buy)|my\s+recommendation\s+is\s+(?:to\s+)?buy|recommend\s+BUY|go\s+long|enter\s+long|buy\s+signal|bullish\s+outlook|upside|buy\s+on\s+dips|accumulate)/i.test(content)
  const engSell = /(?:I\s+recommend\s+(?:selling|a\s+sell|to\s+sell)|my\s+recommendation\s+is\s+(?:to\s+)?sell|recommend\s+SELL|go\s+short|enter\s+short|sell\s+signal|bearish\s+outlook|downside|sell\s+on\s+rally|distribute)/i.test(content)
  if (engBuy && !engSell) return 'BUY'
  if (engSell && !engBuy) return 'SELL'

  // Priority 4: Weighted keyword scoring (replaces simple last-occurrence)
  // FIX: Count ALL directional keywords with weights — bullish words
  // near the end of the response get extra weight (conclusion emphasis).
  const contentLen = content.length
  const buyKeywords = /(شراء|صعود|شرائية|إيجابي|ارتفاع|BUY|BULLISH|LONG|UPWARD|UPTREND|أميل\s*للشراء|توقع\s*صعود|مستهدف\s*صعودي|استمرار\s*الصعود)/gi
  const sellKeywords = /(بيع|هبوط|بيعية|سلبي|انخفاض|SELL|BEARISH|SHORT|DOWNWARD|DOWNTREND|أميل\s*للبيع|توقع\s*هبوط|مستهدف\s*هبوطي|استمرار\s*الهبوط)/gi

  let buyScore = 0, sellScore = 0
  let match: RegExpExecArray | null

  // Score buy keywords — words near the end count more
  buyKeywords.lastIndex = 0
  while ((match = buyKeywords.exec(content)) !== null) {
    const position = match.index / contentLen // 0=start, 1=end
    const weight = 1 + position * 1.5 // Words at end get 2.5x weight
    buyScore += weight
  }

  // Score sell keywords — same weighting
  sellKeywords.lastIndex = 0
  while ((match = sellKeywords.exec(content)) !== null) {
    const position = match.index / contentLen
    const weight = 1 + position * 1.5
    sellScore += weight
  }

  // Priority 5: Final conclusion extraction
  // Look at the LAST 200 chars of the response — this is where the
  // model usually states its conclusion. If the conclusion has a
  // clear direction, trust it over the body analysis.
  const conclusion = content.slice(-200)
  const conclusionBuy = /(?:شراء|صعود|BUY|BULLISH|LONG|إيجابي|ارتفاع)/i.test(conclusion)
  const conclusionSell = /(?:بيع|هبوط|SELL|BEARISH|SHORT|سلبي|انخفاض)/i.test(conclusion)

  if (conclusionBuy && !conclusionSell) return 'BUY'
  if (conclusionSell && !conclusionBuy) return 'SELL'

  // Final: Use weighted scores to decide
  if (buyScore > sellScore * 1.2) return 'BUY'  // Need 20% more sell to override
  if (sellScore > buyScore * 1.2) return 'SELL'
  if (buyScore > 0 && sellScore === 0) return 'BUY'  // FIX: Any buy signal with no sell → BUY (was HOLD)
  if (sellScore > 0 && buyScore === 0) return 'SELL' // FIX: Any sell signal with no buy → SELL (was HOLD)
  if (buyScore > sellScore) return 'BUY'  // FIX: Even slight buy edge → BUY (was HOLD)
  if (sellScore > buyScore) return 'SELL' // FIX: Even slight sell edge → SELL (was HOLD)

  return 'HOLD' // Only if truly no directional signal found
}

const MODEL_TIMEOUT = 15_000 // FIX: Reduced from 20s to 15s — faster failure, quicker Layer 2 completion
const OLLAMA_CLOUD_TIMEOUT = 30_000 // 30s for Ollama cloud (slower than local)
const OLLAMA_LOCAL_TIMEOUT = 8_000 // 8s for local Ollama (fail faster if unreachable)

// ─── Live Market Data ────────────────────────────────────────────

/**
 * Map trading symbol to CoinGecko asset ID.
 * CoinGecko uses different IDs than Binance (e.g., BTC/USD → bitcoin).
 */
function symbolToCoingeckoId(symbol: string): string {
  const map: Record<string, string> = {
    'BTC/USD': 'bitcoin', 'BTC/USDT': 'bitcoin', 'BTCUSDT': 'bitcoin',
    'ETH/USD': 'ethereum', 'ETH/USDT': 'ethereum', 'ETHUSDT': 'ethereum',
    'SOL/USD': 'solana', 'SOL/USDT': 'solana', 'SOLUSDT': 'solana',
    'XRP/USD': 'ripple', 'XRP/USDT': 'ripple', 'XRPUSDT': 'ripple',
    'BNB/USD': 'binancecoin', 'BNB/USDT': 'binancecoin', 'BNBUSDT': 'binancecoin',
    'ADA/USD': 'cardano', 'ADA/USDT': 'cardano', 'ADAUSDT': 'cardano',
    'DOGE/USD': 'dogecoin', 'DOGE/USDT': 'dogecoin', 'DOGEUSDT': 'dogecoin',
    'DOT/USD': 'polkadot', 'DOT/USDT': 'polkadot', 'DOTUSDT': 'polkadot',
    'AVAX/USD': 'avalanche-2', 'AVAX/USDT': 'avalanche-2', 'AVAXUSDT': 'avalanche-2',
    'MATIC/USD': 'matic-network', 'MATIC/USDT': 'matic-network', 'MATICUSDT': 'matic-network',
    'LINK/USD': 'chainlink', 'LINK/USDT': 'chainlink', 'LINKUSDT': 'chainlink',
  }
  const normalized = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase()
  // Try direct match first
  for (const [key, id] of Object.entries(map)) {
    if (key.toUpperCase() === normalized || key.toUpperCase() === symbol.toUpperCase()) return id
  }
  // Fallback: extract base currency
  const base = symbol.split('/')[0].toUpperCase()
  for (const [key, id] of Object.entries(map)) {
    if (key.startsWith(base)) return id
  }
  return base.toLowerCase()
}

/**
 * FIX: Fetch quick market data (price, RSI, MACD) to prevent AI hallucinations.
 * Models were inventing prices (e.g., saying BTC is $28,500 when it's much higher).
 *
 * Strategy: Try multiple price sources in parallel for reliability:
 * 1. Binance public API (fastest, most accurate) — often blocked on Railway/cloud
 * 2. CoinGecko (free, no auth) — strict rate limits
 * 3. CoinCap (free, no auth) — reliable on cloud platforms
 * 4. Bybit public API — alternative exchange, works on cloud
 *
 * First valid response wins. RSI/MACD calculated from Binance klines if available,
 * otherwise default to RSI=50.
 */
async function fetchQuickMarketData(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
  // Normalize symbol for Binance: BTC/USD → BTCUSDT
  const binanceSymbol = symbol.replace(/[\/\-]/g, '').replace('USD', 'USDT').toUpperCase()

  // Try ALL price sources in parallel — first valid price wins
  const pricePromise = Promise.any([
    // Source 1: Binance (most accurate, but often blocked on Railway)
    (async () => {
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${binanceSymbol}`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) throw new Error(`Binance ${res.status}`)
      const data = await res.json()
      const price = parseFloat(data?.lastPrice || '0')
      if (price <= 0) throw new Error('Binance price=0')
      return { price, source: 'binance' }
    })(),
    // Source 2: CoinGecko (reliable, free, no auth)
    (async () => {
      const coingeckoId = symbolToCoingeckoId(symbol)
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`)
      const data = await res.json()
      const price = data[coingeckoId]?.usd
      if (!price || price <= 0) throw new Error('CoinGecko no price')
      return { price, source: 'coingecko' }
    })(),
    // Source 3: CoinCap (free, no auth, works on cloud platforms)
    (async () => {
      const base = symbol.split('/')[0].toLowerCase()
      const res = await fetch(`https://api.coincap.io/v2/assets/${base}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`CoinCap ${res.status}`)
      const data = await res.json()
      const price = parseFloat(data?.data?.priceUsd || '0')
      if (price <= 0) throw new Error('CoinCap price=0')
      return { price, source: 'coincap' }
    })(),
    // Source 4: Bybit (alternative exchange, works on cloud)
    (async () => {
      const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase()
      const res = await fetch(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${bybitSymbol}`, {
        signal: AbortSignal.timeout(4000),
      })
      if (!res.ok) throw new Error(`Bybit ${res.status}`)
      const data = await res.json()
      const price = parseFloat(data?.result?.list?.[0]?.lastPrice || '0')
      if (price <= 0) throw new Error('Bybit price=0')
      return { price, source: 'bybit' }
    })(),
    // Source 5: TwelveData (API key available, reliable on cloud)
    (async () => {
      const tdApiKey = getKey('TWELVE_DATA_API_KEY')
      if (!tdApiKey) throw new Error('No TwelveData key')
      const tdSymbol = symbol.replace('/', '').replace('-', '')
      const res = await fetch(`https://api.twelvedata.com/price?symbol=${tdSymbol}&apikey=${tdApiKey}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) throw new Error(`TwelveData ${res.status}`)
      const data = await res.json()
      const price = parseFloat(data?.price || '0')
      if (price <= 0) throw new Error('TwelveData price=0')
      return { price, source: 'twelvedata' }
    })(),
  ]).catch(() => null)

  // Also try to get klines for RSI/MACD (Binance only)
  let rsi = 50
  let macd = 'غير متوفر'
  try {
    const klinesRes = await fetch(`https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=30`, {
      signal: AbortSignal.timeout(4000),
    })
    if (klinesRes.ok) {
      const klinesData = await klinesRes.json()
      const closes: number[] = (klinesData || []).map((k: any) => parseFloat(k[4])).filter((v: number) => !isNaN(v))
      if (closes.length > 14) {
        rsi = calcRSI(closes)
        macd = calcMACD(closes)
      }
    }
  } catch {
    // Klines unavailable — use defaults
  }

  // FIX: Try Bybit klines as fallback for RSI/MACD when Binance is blocked (common on Railway)
  if (rsi === 50) {
    try {
      const bybitSymbol = symbol.replace(/[\/\-]/g, '').toUpperCase()
      const bybitKlinesRes = await fetch(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${bybitSymbol}&interval=60&limit=30`, {
        signal: AbortSignal.timeout(4000),
      })
      if (bybitKlinesRes.ok) {
        const bybitData = await bybitKlinesRes.json()
        const closes: number[] = (bybitData?.result?.list || [])
          .map((k: any) => parseFloat(k[4]))
          .filter((v: number) => !isNaN(v))
          .reverse() // Bybit returns newest-first, we need oldest-first for RSI
        if (closes.length > 14) {
          rsi = calcRSI(closes)
          macd = calcMACD(closes)
        }
      }
    } catch {
      // Bybit klines also unavailable
    }
  }

  const priceResult = await pricePromise
  if (priceResult && priceResult.price > 0) {
    console.log(`[market-data] ${symbol} price=$${priceResult.price} from ${priceResult.source}`)
    // Save to last-known-good cache
    lastKnownPriceCache.set(symbol, { price: priceResult.price, rsi, macd, timestamp: Date.now() })
    // Clean old entries periodically
    if (lastKnownPriceCache.size > 50) {
      const now = Date.now()
      for (const [key, entry] of lastKnownPriceCache) {
        if (now - entry.timestamp > PRICE_CACHE_MAX_AGE) lastKnownPriceCache.delete(key)
      }
    }
    return { price: priceResult.price, rsi, macd }
  }

  // All fresh sources failed — try last-known-good price cache
  const cached = lastKnownPriceCache.get(symbol)
  if (cached && (Date.now() - cached.timestamp) < PRICE_CACHE_MAX_AGE) {
    console.log(`[market-data] ${symbol} using cached price=$${cached.price} (${Math.round((Date.now() - cached.timestamp) / 1000)}s old)`)
    return { price: cached.price, rsi: cached.rsi, macd: cached.macd }
  }

  console.warn(`[market-data] ALL price sources failed for ${symbol} — AI may hallucinate prices`)
  return { price: 0, rsi: 50, macd: 'غير متوفر' }
}

/**
 * CoinGecko fallback for when Binance is blocked/unreachable (common on Railway).
 * Free, no auth required, works on cloud platforms.
 */
async function _fetchCoinGeckoFallback(symbol: string): Promise<{ price: number; rsi: number; macd: string }> {
  try {
    const coingeckoId = symbolToCoingeckoId(symbol)
    const cgRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=usd&include_24hr_change=true`, {
      signal: AbortSignal.timeout(5000),
    })
    if (cgRes.ok) {
      const cgData = await cgRes.json()
      const cgPrice = cgData[coingeckoId]?.usd
      if (cgPrice && cgPrice > 0) {
        return { price: cgPrice, rsi: 50, macd: 'غير متوفر' }
      }
    }
  } catch {
    // CoinGecko also failed — return defaults
  }
  return { price: 0, rsi: 50, macd: 'غير متوفر' }
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
  const modelCandidates = ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.0-flash-001', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-2.5-flash-preview-04-17', 'gemini-2.5-flash-preview-05-20', 'gemini-2.0-flash-exp']
  const errors: string[] = []

  for (const model of modelCandidates) {
    // FIX: Try BOTH auth methods — header auth first, then query-param auth
    for (const authMethod of ['header', 'queryparam'] as const) {
      try {
        const url = authMethod === 'queryparam'
          ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
          : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (authMethod === 'header') headers['x-goog-api-key'] = apiKey

        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: `You are a financial AI analyst. Respond in Arabic. Provide analysis. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"\n\n${prompt}` }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
            // FIX: safetySettings — prevent financial content from being blocked as "dangerous"
            // Without these, Gemini frequently blocks financial analysis with finishReason: SAFETY
            safetySettings: [
              { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
              { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
              { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
            ],
          }),
          signal: AbortSignal.timeout(MODEL_TIMEOUT),
        })

        if (!res.ok) {
          const errBody = await res.text().catch(() => '')
          if (res.status === 429) {
            errors.push(`${model} (${authMethod}): 429 rate-limited`)
            if (authMethod === 'header') break // Try query-param for this model
            continue // Both methods failed for this model, try next
          }
          if (res.status === 404) {
            errors.push(`${model}: not found (404)`)
            break // Model doesn't exist regardless of auth method
          }
          if (res.status === 401 || res.status === 403) {
            errors.push(`${model} (${authMethod}): auth failed (${res.status})`)
            if (authMethod === 'header') break // Try query-param
            continue // Both auth methods failed, try next model
          }
          errors.push(`${model} (${authMethod}): ${res.status} — ${errBody.slice(0, 100)}`)
          if (authMethod === 'header') break // Try query-param
          continue
        }

        const data = await res.json()

        // FIX: Detect blocked responses (finishReason: SAFETY or RECITATION)
        // Previously, blocked responses returned empty content and were treated as failures
        const candidate = data.candidates?.[0]
        const finishReason = candidate?.finishReason
        if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
          errors.push(`${model}: blocked (${finishReason}) — trying next model`)
          break // This model blocks financial content, try next model
        }

        const content = candidate?.content?.parts?.[0]?.text || ''
        if (content.trim().length > 0) {
          return { model: `Gemini/${model}`, content, confidence: calcConfidence(content, 'gemini'), processingTimeMs: Date.now() - start, success: true }
        }
        errors.push(`${model}: empty content (finishReason: ${finishReason || 'UNKNOWN'})`)
        break // Try query-param for this model
      } catch (e: any) {
        errors.push(`${model}: ${e.message?.slice(0, 80)}`)
        if (authMethod === 'header') continue // Try query-param
        continue // Try next model
      }
    }
  }

  return { model: 'Gemini/unavailable', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: `All Gemini models failed: ${errors.slice(0, 3).join(' | ')}` }
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
  const TOTAL_HF_TIMEOUT = 40_000 // FIX: Increased from 25s to 40s — cold models need more time to load
  const deadline = Date.now() + TOTAL_HF_TIMEOUT
  const systemMsg = 'أنت محلل مالي. أجب بالعربية فقط. لا تستخدم الإنجليزية. أنت خبير أنماط مالي. كن موجزاً ومبنياً على البيانات. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'

  // ── Strategy 1: Classic Inference API (MOST RELIABLE — works with ANY token!) ──
  // FIX: Moved Classic API to FIRST strategy because it works with ANY valid HF token,
  // including read-only tokens. The router-based endpoints (old Strategy 1 & 2) require
  // "Inference Providers" permission which most tokens don't have.
  if (hfApiKey) {
    const classicModels = [
      'mistralai/Mistral-7B-Instruct-v0.3',
      'Qwen/Qwen2.5-7B-Instruct',
      'HuggingFaceH4/zephyr-7b-beta',
      'microsoft/Phi-3-mini-4k-instruct',
    ]
    for (const model of classicModels) {
      if (Date.now() > deadline) break // Total timeout check
      try {
        const remaining = deadline - Date.now()
        const res = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            inputs: prompt,
            parameters: {
              max_new_tokens: 512,
              temperature: 0.3,
              return_full_text: false,
            },
            options: { wait_for_model: true },
          }),
          signal: AbortSignal.timeout(Math.min(15_000, remaining)),
        })

        if (!res.ok) {
          if (res.status === 401) break // Bad key — stop trying HF
          if (res.status === 429 || res.status === 404 || res.status === 503) continue
          continue
        }

        const data = await res.json()
        let content = ''
        if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
          content = data[0].generated_text
        } else if (typeof data === 'object' && data.generated_text) {
          content = data.generated_text
        }

        if (content.trim().length > 0) {
          return { model: `HF-Classic/${model.split('/').pop()}`, content, confidence: calcConfidence(content, 'huggingface'), processingTimeMs: Date.now() - start, success: true }
        }
      } catch {
        continue
      }
    }
  }

  // ── Strategy 2: HuggingFace Auto-Router (needs "Inference Providers" permission) ──
  // Only try if we still have time and Strategy 1 didn't get 401
  if (hfApiKey && Date.now() < deadline) {
    const hfModelCandidates = ['Qwen/Qwen2.5-7B-Instruct', 'mistralai/Mistral-7B-Instruct-v0.3']

    for (const model of hfModelCandidates) {
      if (Date.now() > deadline) break
      try {
        const remaining = deadline - Date.now()
        const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${hfApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemMsg },
              { role: 'user', content: prompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(Math.min(10_000, remaining)),
        })

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) break // No permission — stop router
          if (res.status === 404 || res.status === 429) continue
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

  // ── Strategy 3: OpenRouter fallback (if OR key available) ──
  if (openrouterApiKey && Date.now() < deadline) {
    const orModels = ['meta-llama/llama-3.1-8b-instruct:free', 'qwen/qwen-2.5-7b-instruct:free', 'google/gemma-2-9b-it:free']
    for (const model of orModels) {
      if (Date.now() > deadline) break
      try {
        const remaining = deadline - Date.now()
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
              { role: 'system', content: systemMsg },
              { role: 'user', content: prompt },
            ],
            max_tokens: 1024,
            temperature: 0.3,
          }),
          signal: AbortSignal.timeout(Math.min(10_000, remaining)),
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
 * Call Ollama — works with both local and cloud Ollama instances.
 *
 * FIX: Previous code auto-skipped Ollama on cloud if URL was localhost.
 * This was correct but too aggressive — if the user has set OLLAMA_BASE_URL
 * to a cloud URL (like ollama.com or a custom server), it should work!
 *
 * Now properly supports:
 * - Local Ollama (localhost:11434) — only works in development
 * - Cloud Ollama (ollama.com, custom server) — works everywhere
 * - OpenAI-compatible endpoints (any /v1 endpoint)
 */
async function callOllama(prompt: string): Promise<DirectAIResponse> {
  const baseUrl = getKey('OLLAMA_BASE_URL') || ''
  
  // FIX: If no OLLAMA_BASE_URL is set at all, check if we're on cloud
  // On cloud without a configured URL, Ollama is definitely unreachable
  // On local without a configured URL, try the default localhost
  const effectiveBaseUrl = baseUrl || (isCloudEnvironment() ? '' : 'http://localhost:11434')
  
  if (!effectiveBaseUrl) {
    return {
      model: 'Ollama/Qwen2.5',
      content: '',
      confidence: 0,
      processingTimeMs: 0,
      success: false,
      error: 'Ollama not configured — set OLLAMA_BASE_URL to your Ollama server URL',
    }
  }

  // Skip localhost on cloud — it will never work
  if (isCloudEnvironment() && isLocalhostUrl(effectiveBaseUrl)) {
    return {
      model: 'Ollama/Qwen2.5',
      content: '',
      confidence: 0,
      processingTimeMs: 0,
      success: false,
      error: `Ollama localhost (${effectiveBaseUrl}) unreachable on cloud — set OLLAMA_BASE_URL to a cloud URL`,
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
      signal: AbortSignal.timeout(isCloudEnvironment() ? OLLAMA_CLOUD_TIMEOUT : OLLAMA_LOCAL_TIMEOUT),
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
 * DeepSeek — 8th AI provider (محلل السيناريوهات / Scenario Analyst)
 * DeepSeek V3 is excellent at reasoning and Arabic support.
 * Uses the official DeepSeek API (also works via OpenRouter as fallback).
 */
async function callDeepSeek(prompt: string): Promise<DirectAIResponse> {
  const apiKey = getKey('DEEPSEEK_API_KEY')
  if (!apiKey) return { model: 'DeepSeek/unavailable', content: '', confidence: 0, processingTimeMs: 0, success: false, error: 'No DEEPSEEK_API_KEY' }

  const start = Date.now()
  // FIX: Try deepseek-chat FIRST — deepseek-reasoner returns empty content
  // and puts the actual answer in reasoning_content, which is hard to extract.
  const modelCandidates = ['deepseek-chat', 'deepseek-reasoner']
  const systemMsg = 'أنت محلل سيناريوهات مالي محترف. دورك هو تحليل السيناريوهات المحتملة وتقدير احتمالاتها. أجب بالعربية فقط. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'

  for (const model of modelCandidates) {
    try {
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: prompt },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(25_000), // FIX: Increased from 20s — DeepSeek can be slow
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        if (res.status === 429) continue
        // FIX: Don't break on 401/403 — try next model
        if (res.status === 401 || res.status === 403) {
          console.warn(`[DeepSeek] ${model} auth failed (${res.status}): ${errBody.slice(0, 100)}`)
          continue
        }
        if (res.status === 402) {
          console.warn(`[DeepSeek] ${model} requires payment (402) — balance may be exhausted`)
          continue
        }
        continue
      }

      const data = await res.json()
      const message = data.choices?.[0]?.message
      let content = message?.content || ''
      const reasoningContent = message?.reasoning_content || ''

      // FIX: DeepSeek reasoner returns reasoning_content instead of content
      if (!content.trim() && reasoningContent.trim()) {
        content = reasoningContent
      }
      // FIX: If both present for reasoner, combine them
      if (content.trim() && reasoningContent.trim() && model === 'deepseek-reasoner') {
        const reasoningSummary = reasoningContent.length > 300
          ? reasoningContent.slice(0, 300) + '...'
          : reasoningContent
        content = `[تحليل منطقي]: ${reasoningSummary}\n\n[التوصية]: ${content}`
      }

      if (content.trim().length > 0) {
        return { model: `DeepSeek/${model}`, content, confidence: calcConfidence(content, 'deepseek'), processingTimeMs: Date.now() - start, success: true }
      }
      // FIX: Log why content is empty for debugging
      console.warn(`[DeepSeek] ${model} returned empty content — message: ${JSON.stringify(message)?.substring(0, 200)}`)
    } catch {
      continue
    }
  }

  return { model: 'DeepSeek/deepseek-chat', content: '', confidence: 0, processingTimeMs: Date.now() - start, success: false, error: 'All DeepSeek models failed' }
}

/**
 * Bedrock — Direct call with AWS SigV4 signing.
 * Previously marked "too complex for direct" but now implemented
 * so ALL 8 models work even when NestJS is down (Layer 2).
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
      const isNova = modelId.includes('nova')
      
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
      } else if (isNova) {
        // FIX: Amazon Nova model format — messages + inferenceConfig
        // Nova uses a different API format than Claude/Titan. Without this,
        // Nova models return validation errors and fail silently.
        const systemPrompt = 'أنت محلل مالي. أجب بالعربية فقط. أنت خبير مخاطر. IMPORTANT: Respond in Arabic only. End with: "DECISION: BUY" or "DECISION: SELL" or "DECISION: HOLD"'
        body = {
          messages: [
            { role: 'user', content: [{ text: `${systemPrompt}\n\n${prompt}` }] },
          ],
          inferenceConfig: {
            maxTokens: 1024,
            temperature: 0.3,
            topP: 0.9,
          },
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
        console.warn(`[Bedrock] Model ${modelId} failed (${res.status}): ${errBody.slice(0, 300)}`)
        // FIX: Check for common IAM issues and log helpful diagnostics
        if (res.status === 403) {
          if (errBody.includes('validation')) {
            console.warn(`[Bedrock] Model ${modelId} validation error — model may not be enabled in AWS console. Enable it at: https://console.aws.amazon.com/bedrock/ → Model Access`)
          } else if (errBody.includes('not authorized')) {
            console.warn(`[Bedrock] IAM not authorized for ${modelId} — add bedrock:InvokeModel permission to your IAM role`)
          }
        }
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
      } else if (isNova && data.output?.message?.content) {
        // FIX: Amazon Nova response format
        // Nova returns: { output: { message: { content: [{ text: "..." }] } } }
        const novaContent = data.output.message.content
        if (Array.isArray(novaContent) && novaContent.length > 0) {
          content = novaContent[0].text || ''
        }
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
  // FIX: AWS SigV4 canonical URI encoding — CRITICAL BUG FIX!
  //
  // BUG: new URL(endpoint).pathname DECODES percent-encoded characters!
  // Example: /model/us.anthropic.claude-3-5-sonnet-20241022-v2%3A0/invoke
  //       → /model/us.anthropic.claude-3-5-sonnet-20241022-v2:0/invoke (WRONG!)
  //
  // This caused ALL Bedrock calls to fail with 403 because the SigV4 signature
  // was computed with the decoded path (containing raw colons), but AWS expected
  // the encoded path (with %3A). The signature mismatch = 403 Forbidden.
  //
  // FIX: Extract the path directly from the URL string without decoding.
  // We find the path by locating the first '/' after '://'.
  const urlObj = new URL(endpoint)
  const pathStart = endpoint.indexOf(urlObj.host) + urlObj.host.length
  const canonicalUri = endpoint.substring(pathStart) || '/'
  // This preserves %3A in the path, producing the correct canonical URI for SigV4

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

// ─── AI Usage Logger (works independently from NestJS) ───────────

/**
 * Log AI usage to database from Next.js direct calls.
 * Mirrors the AiUsageLoggerService in NestJS but works independently.
 *
 * Uses Arabic-aware token estimation: Arabic text takes ~2 chars/token
 * while English takes ~4 chars/token. The ratio is used to weight the estimate.
 */
async function logDirectAiUsage(params: {
  model: string;
  endpoint: string;
  inputPrompt: string;
  outputContent: string;
  latencyMs: number;
  success: boolean;
  cached?: boolean;
}): Promise<void> {
  try {
    const { db, ensureDbReady } = await import('@/lib/db');
    const dbReady = await ensureDbReady();
    if (!dbReady) return;

    const provider = params.model.toLowerCase().includes('groq') ? 'groq'
      : params.model.toLowerCase().includes('gemini') ? 'gemini'
      : params.model.toLowerCase().includes('glm') ? 'glm'
      : params.model.toLowerCase().includes('huggingface') || params.model.toLowerCase().includes('hf') ? 'huggingface'
      : params.model.toLowerCase().includes('ollama') ? 'ollama'
      : params.model.toLowerCase().includes('bedrock') || params.model.toLowerCase().includes('claude') ? 'bedrock'
      : params.model.toLowerCase().includes('openrouter') ? 'openrouter'
      : 'unknown';

    const COST_PER_1K: Record<string, { input: number; output: number }> = {
      groq:        { input: 0.00059,  output: 0.00079 },
      gemini:      { input: 0.000075, output: 0.00030 },
      glm:         { input: 0.00140,  output: 0.00140 },
      huggingface: { input: 0,        output: 0 },
      ollama:      { input: 0,        output: 0 },
      bedrock:     { input: 0.00300,  output: 0.01500 },
      openrouter:  { input: 0,        output: 0 },
    };

    const arabicRegex = /[\u0600-\u06FF]/g;
    const inputArabicRatio = params.inputPrompt.length > 0
      ? (params.inputPrompt.match(arabicRegex) || []).length / params.inputPrompt.length : 0;
    const outputArabicRatio = params.outputContent.length > 0
      ? (params.outputContent.match(arabicRegex) || []).length / params.outputContent.length : 0;
    const inputTokens = Math.ceil(params.inputPrompt.length / (2 * inputArabicRatio + 4 * (1 - inputArabicRatio)));
    const outputTokens = params.success ? Math.ceil(params.outputContent.length / (2 * outputArabicRatio + 4 * (1 - outputArabicRatio))) : 0;
    const rates = COST_PER_1K[provider] || { input: 0, output: 0 };
    const costUsd = (inputTokens / 1000) * rates.input + (outputTokens / 1000) * rates.output;

    await db.aiUsageLog.create({
      data: {
        id: `aul_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        model: params.model,
        provider,
        endpoint: params.endpoint,
        inputTokens,
        outputTokens,
        costUsd,
        latencyMs: params.latencyMs,
        cached: params.cached || false,
        success: params.success,
        errorMessage: params.success ? null : (params.outputContent || '').substring(0, 500),
        createdAt: new Date(),
      },
    });
  } catch {
    // Non-critical — don't crash AI calls if logging fails
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
  const ollamaBaseUrl = getKey('OLLAMA_BASE_URL') || ''
  const effectiveOllamaBaseUrl = ollamaBaseUrl || (isCloudEnvironment() ? '' : 'http://localhost:11434')
  const shouldTryOllama = !!effectiveOllamaBaseUrl && !(isCloudEnvironment() && isLocalhostUrl(effectiveOllamaBaseUrl))

  // FIX: Fetch live market data before building prompts to prevent hallucinations
  // (e.g., models inventing BTC price as $28,500 when it's actually much higher)
  const marketData = await fetchQuickMarketData(symbol)
  const marketDataPrefix = marketData.price > 0
    ? `\n⛔⛔⛔ تحذير حرج — بيانات السوق الحية (ممنوع اختراع أسعار!):\n- 🔴 السعر الحالي الفعلي: ${marketData.price.toLocaleString()}$ — استخدم هذا الرقم فقط! أي سعر آخر تذكره سيكون كاذباً!\n- مؤشر RSI الحقيقي: ${marketData.rsi} (استخدم هذه القيمة فقط)\n- مؤشر MACD: ${marketData.macd}\n\n⚠️ تحذير نهائي: إذا ذكرت أي سعر غير ${marketData.price.toLocaleString()}$ فتحليلك كله سيكون مرفوضاً وكاذباً. السعر هو ${marketData.price.toLocaleString()}$ فقط لا غير.\n`
    : '\n⚠️⚠️⚠️ لم نتمكن من جلب بيانات السوق الحية — ممنوع تماماً اختراع أي سعر أو رقم من عندك. إذا احتجت لذكر السعر اكتب "السعر غير متاح". أي سعر تختلقه سيجعل تحليلك غير موثوق.\n'

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
    {
      modelName: 'DeepSeek',
      callFn: () => callDeepSeek(`${marketDataPrefix}حلل السيناريوهات المحتملة لـ ${symbol}. ما السيناريو الصعودي والسيناريو الهبوطي والسيناريو المحايد؟ قيّم احتمال كل سيناريو وقدم توصية واضحة.`),
      roles: ['محلل السيناريوهات'],
      prompt: 'scenario',
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

  // ── Log AI usage to AiUsageLog for each model call ──
  // This ensures costs are tracked even when NestJS is down and the direct fallback path runs.
  // Uses the logDirectAiUsage function for per-model-call logging with Arabic-aware token estimation.
  for (const res of callResults) {
    if (res.status === 'fulfilled') {
      const { response } = res.value
      // Find the original prompt for this model call
      const mc = activeModelCalls.find(m => m.modelName === res.value.modelName)
      await logDirectAiUsage({
        model: response.model,
        endpoint: 'consensus',
        inputPrompt: mc?.prompt || 'consensus',
        outputContent: response.content,
        latencyMs: response.processingTimeMs,
        success: response.success,
      })
    }
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
    'محلل السيناريوهات': ['DeepSeek', 'GLM-4', 'Groq'],  // Was DeepSeek's role
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

  // FIX: Majority vote — threshold lowered from 0.6 to majority wins.
  // Previously, 59% BUY would be labeled HOLD which is contradictory!
  // Now: whichever direction has the highest weighted percentage wins.
  let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD'
  let consensusScore = 0

  if (totalConfidence > 0) {
    const buyPct = buyWeight / totalConfidence
    const sellPct = sellWeight / totalConfidence
    const holdPct = holdWeight / totalConfidence

    if (buyPct > sellPct && buyPct > holdPct) {
      recommendation = 'BUY'
      consensusScore = buyConfidences.length > 0
        ? Math.round(buyConfidences.reduce((a, b) => a + b, 0) / buyConfidences.length * 100)
        : Math.round(buyPct * 100)
    } else if (sellPct > buyPct && sellPct > holdPct) {
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

    // Ensure minimum score when majority is clear
    if (recommendation !== 'HOLD' && consensusScore < 50) {
      const votersForRec = recommendation === 'BUY' ? buyConfidences : sellConfidences
      const totalVoters = analyses.length
      if (votersForRec.length >= Math.ceil(totalVoters / 2)) {
        consensusScore = Math.max(consensusScore, Math.round((votersForRec.length / totalVoters) * 100))
      }
    }
  }

  const filledRoles = analyses.length
  const uniqueModels = [...new Set(analyses.map(a => a.model))]
  const modelsRespondedCount = uniqueModels.length

  const recLabel = recommendation === 'BUY' ? 'شراء' : recommendation === 'SELL' ? 'بيع' : 'انتظار'
  const recStrength = consensusScore >= 80 ? 'قوي' : consensusScore >= 60 ? 'واضح' : 'محتمل'
  const masterStrategy = `إجماع مجلس الذكاء الاصطناعي (${filledRoles} أدوار من ${modelsRespondedCount} نماذج): ${recLabel} ${recStrength} بنسبة ثقة ${consensusScore}%.`

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
    if (mc.modelName === 'DeepSeek') return !!getKey('DEEPSEEK_API_KEY')
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
        modelsExpected: activeModelCalls.length, // Dynamic: reflects actual models attempted (may exclude Ollama on cloud)
        modelsWithKeys: expectedDirectModels,
        bedrockAvailable: bedrockStatus.available,
        bedrockNote: bedrockStatus.available ? 'Direct call enabled (AWS SigV4)' : 'AWS credentials not configured',
        redistributedRoles: redistributedCount,
        ollamaAttempted: shouldTryOllama,
        ollamaUrl: shouldTryOllama ? effectiveOllamaBaseUrl : 'skipped (not configured or localhost on cloud)',
      },
    },
    errors,
  }
}

/**
 * Quick health check: which AI models have API keys configured?
 * All 8 models checked including Bedrock, OpenRouter, and DeepSeek (direct call now supported).
 */
export function getAvailableModelKeys(): { model: string; hasKey: boolean; note?: string }[] {
  const ollamaBaseUrl = getKey('OLLAMA_BASE_URL') || ''
  const ollamaSkipped = isCloudEnvironment() && (!ollamaBaseUrl || isLocalhostUrl(ollamaBaseUrl))
  const bedrockStatus = getBedrockStatus()

  return [
    { model: 'Groq', hasKey: !!getKey('GROQ_API_KEY') },
    { model: 'Gemini', hasKey: !!(getKey('GOOGLE_AI_STUDIO_API_KEY') || getKey('GEMINI_API_KEY')), note: 'Accepts GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY' },
    { model: 'GLM-4', hasKey: !!getKey('GLM_API_KEY') },
    { model: 'HuggingFace', hasKey: !!(getKey('HUGGINGFACE_API_KEY') || getKey('HF_API_KEY') || getKey('OPENROUTER_API_KEY')), note: 'Accepts HUGGINGFACE_API_KEY, HF_API_KEY, or uses OPENROUTER_API_KEY as fallback' },
    {
      model: 'Ollama',
      hasKey: !ollamaSkipped && (!!getKey('OLLAMA_API_KEY') || !!ollamaBaseUrl),
      note: ollamaSkipped ? 'localhost unreachable on cloud — set OLLAMA_BASE_URL to cloud URL' : ollamaBaseUrl ? `URL: ${ollamaBaseUrl}` : 'local only',
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
    {
      model: 'deepseek',
      hasKey: !!getKey('DEEPSEEK_API_KEY'),
      note: 'DeepSeek V3 — scenario analysis',
    },
  ]
}
