#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * Roua Trading — AI Provider Diagnostic Script
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Tests ALL 8 AI providers individually by making actual API calls.
 * Reports: provider name, key available, API working, response time, errors.
 *
 * Usage:
 *   node scripts/diagnose-ai-providers.mjs
 *
 * Or with a .env file loaded via dotenv (optional):
 *   node -e "import('dotenv').then(d=>d.config())" && node scripts/diagnose-ai-providers.mjs
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

import { createHmac } from 'crypto';

// ── Constants ──────────────────────────────────────────────────
const TEST_PROMPT = 'Say OK in one word';
const TIMEOUT_MS = 15_000;
const HEADERS_JSON = { 'Content-Type': 'application/json' };

// ── Result storage ─────────────────────────────────────────────
const results = [];

// ── Utility: fetch with timeout ────────────────────────────────
async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// ── Utility: extract error message from fetch response ─────────
async function extractError(response) {
  try {
    const text = await response.text();
    // Try to parse as JSON for cleaner error
    try {
      const json = JSON.parse(text);
      const msg = json.error?.message || json.message || json.detail || json.msg || JSON.stringify(json);
      return msg.substring(0, 200);
    } catch {
      return text.substring(0, 200);
    }
  } catch {
    return `HTTP ${response.status}`;
  }
}

// ── Utility: mask API key for display ──────────────────────────
function maskKey(key) {
  if (!key) return '(none)';
  if (key.length <= 8) return '****';
  return `${key.substring(0, 4)}***${key.substring(key.length - 4)}`;
}

// ══════════════════════════════════════════════════════════════
// Provider test functions
// ══════════════════════════════════════════════════════════════

/**
 * 1. Groq — Llama 3.3 70B Versatile
 * Env: GROQ_API_KEY
 * Endpoint: https://api.groq.com/openai/v1/chat/completions
 */
async function testGroq() {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const keyAvailable = !!apiKey;

  if (!keyAvailable) {
    return { provider: 'Groq', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'GROQ_API_KEY not set', status: '❌' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { ...HEADERS_JSON, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: TEST_PROMPT },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'Groq', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      return { provider: 'Groq', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'Groq', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'Groq', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

/**
 * 2. Gemini — Google AI Studio (Gemini 2.0 Flash)
 * Env: GOOGLE_AI_STUDIO_API_KEY or GEMINI_API_KEY
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent
 * Auth: Try header x-goog-api-key first, then query param ?key=
 */
async function testGemini() {
  const apiKey = process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim();
  const keyAvailable = !!apiKey;

  if (!keyAvailable) {
    return { provider: 'Gemini', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'GOOGLE_AI_STUDIO_API_KEY / GEMINI_API_KEY not set', status: '❌' };
  }

  const model = 'gemini-2.0-flash';
  const baseUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: TEST_PROMPT }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 10,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  const start = Date.now();

  // Strategy 1: Header auth (x-goog-api-key)
  try {
    const response = await fetchWithTimeout(baseUrl, {
      method: 'POST',
      headers: { ...HEADERS_JSON, 'x-goog-api-key': apiKey },
      body: JSON.stringify(requestBody),
    });

    const elapsed = Date.now() - start;

    if (response.ok) {
      const data = await response.json();
      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;

      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `Blocked (finishReason: ${finishReason})`, status: '⚠️' };
      }

      const content = candidate?.content?.parts?.[0]?.text || '';
      if (content.trim().length > 0) {
        return { provider: 'Gemini', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
      }
    }

    // If header auth failed (401/403), try query param auth
    if (response.status === 401 || response.status === 403) {
      // fall through to Strategy 2
    } else if (response.ok) {
      return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
    } else {
      const errMsg = await extractError(response);
      // For 404, try query-param auth as fallback
      if (response.status !== 404) {
        return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
      }
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    if (err.name !== 'AbortError') {
      // Fall through to query param strategy
    } else {
      return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Timeout (15s)', status: '⚠️' };
    }
  }

  // Strategy 2: Query param auth (?key=)
  const start2 = Date.now();
  try {
    const response = await fetchWithTimeout(`${baseUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: HEADERS_JSON,
      body: JSON.stringify(requestBody),
    });

    const elapsed = Date.now() - start2;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status} (query-param auth): ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const finishReason = candidate?.finishReason;

    if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
      return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `Blocked (finishReason: ${finishReason})`, status: '⚠️' };
    }

    const content = candidate?.content?.parts?.[0]?.text || '';
    if (content.trim().length > 0) {
      return { provider: 'Gemini', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - start2;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'Gemini', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

/**
 * 3. GLM-4 — Zhipu AI (GLM-4 Flash)
 * Env: GLM_API_KEY
 * Endpoint: https://open.bigmodel.cn/api/paas/v4/chat/completions
 * Auth: JWT generation from API key (id.secret format)
 */
async function testGLM() {
  const apiKey = process.env.GLM_API_KEY?.trim();
  const keyAvailable = !!apiKey;

  if (!keyAvailable) {
    return { provider: 'GLM-4', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'GLM_API_KEY not set', status: '❌' };
  }

  // Generate JWT token
  let authToken;
  const parts = apiKey.split('.');
  if (parts.length === 2) {
    const [id, secret] = parts;
    const now = Date.now();
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }), 'utf8').toString('base64url');
    const payload = Buffer.from(JSON.stringify({ api_key: id, exp: Math.floor(now / 1000) + 3600, timestamp: Math.floor(now / 1000) }), 'utf8').toString('base64url');
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    authToken = `${header}.${payload}.${signature}`;
  } else {
    authToken = apiKey;
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { ...HEADERS_JSON, Authorization: `Bearer ${authToken}` },
      body: JSON.stringify({
        model: 'glm-4-flash',
        messages: [
          { role: 'user', content: TEST_PROMPT },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'GLM-4', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      return { provider: 'GLM-4', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'GLM-4', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'GLM-4', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

/**
 * 4. HuggingFace — Mistral 7B Instruct v0.3
 * Env: HUGGINGFACE_API_KEY or HF_API_KEY
 * Endpoint: https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3
 */
async function testHuggingFace() {
  const apiKey = process.env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_API_KEY?.trim();
  const keyAvailable = !!apiKey;

  if (!keyAvailable) {
    return { provider: 'HuggingFace', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'HUGGINGFACE_API_KEY / HF_API_KEY not set', status: '❌' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout('https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3', {
      method: 'POST',
      headers: { ...HEADERS_JSON, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        inputs: TEST_PROMPT,
        parameters: {
          max_new_tokens: 10,
          temperature: 0.1,
          return_full_text: false,
        },
        options: { wait_for_model: true },
      }),
    });

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'HuggingFace', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    // Classic HF API returns array: [{ generated_text: "..." }]
    let content = '';
    if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
      content = data[0].generated_text;
    } else if (data?.generated_text) {
      content = data.generated_text;
    } else if (data?.choices?.[0]?.message?.content) {
      // OpenAI-compatible format (from router)
      content = data.choices[0].message.content;
    }

    if (content.trim().length > 0) {
      return { provider: 'HuggingFace', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'HuggingFace', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'HuggingFace', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

/**
 * 5. Ollama — Self-hosted (qwen2.5:7b)
 * Env: OLLAMA_BASE_URL (default: http://localhost:11434)
 * Endpoint: {baseUrl}/api/chat
 */
async function testOllama() {
  const baseUrl = process.env.OLLAMA_BASE_URL?.trim() || 'http://localhost:11434';
  const keyAvailable = !!baseUrl;

  // Check if URL is reachable first
  const start = Date.now();
  try {
    // Quick reachability check
    const healthCheck = await fetchWithTimeout(`${baseUrl}/api/tags`, {
      method: 'GET',
      headers: process.env.OLLAMA_API_KEY ? { Authorization: `Bearer ${process.env.OLLAMA_API_KEY.trim()}` } : {},
    }, 5_000);

    if (!healthCheck.ok && healthCheck.status !== 200) {
      const elapsed = Date.now() - start;
      return { provider: 'Ollama', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `Server at ${baseUrl} not reachable (HTTP ${healthCheck.status})`, status: '⚠️' };
    }
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError' ? 'Timeout — server not reachable' : `Connection refused: ${baseUrl}`;
    return { provider: 'Ollama', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }

  // Server is reachable, now test actual chat
  const chatStart = Date.now();
  try {
    const headers = { ...HEADERS_JSON };
    if (process.env.OLLAMA_API_KEY?.trim()) {
      headers['Authorization'] = `Bearer ${process.env.OLLAMA_API_KEY.trim()}`;
    }

    // Use native Ollama API format
    const response = await fetchWithTimeout(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'qwen2.5:7b',
        messages: [
          { role: 'user', content: TEST_PROMPT },
        ],
        stream: false,
        options: { temperature: 0.1, num_predict: 10 },
      }),
    });

    const elapsed = Date.now() - chatStart;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'Ollama', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    const content = data?.message?.content || data?.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      return { provider: 'Ollama', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'Ollama', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - chatStart;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'Ollama', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

/**
 * 6. Bedrock — AWS Bedrock (key check only)
 * Env: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY
 * No API call — just check if both keys are present
 */
async function testBedrock() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const keyAvailable = !!(accessKeyId && secretAccessKey);
  const region = process.env.AWS_REGION?.trim() || 'us-east-1';

  if (!accessKeyId && !secretAccessKey) {
    return { provider: 'Bedrock', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY not set', status: '❌' };
  }
  if (!accessKeyId) {
    return { provider: 'Bedrock', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'AWS_ACCESS_KEY_ID not set', status: '❌' };
  }
  if (!secretAccessKey) {
    return { provider: 'Bedrock', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'AWS_SECRET_ACCESS_KEY not set', status: '❌' };
  }

  // Both keys present — note that Bedrock also requires:
  //   1. Model Access enabled in AWS Console → Bedrock → Model Access
  //   2. IAM policy with bedrock:InvokeModel
  return {
    provider: 'Bedrock',
    keyAvailable: true,
    apiWorking: false,
    responseTime: 0,
    error: `Keys present (region: ${region}). Requires: (1) Model Access enabled in AWS Console, (2) IAM policy with bedrock:InvokeModel. Skipped actual call — SigV4 signing too complex for this script.`,
    status: '⚠️',
  };
}

/**
 * 7. OpenRouter — qwen/qwen-2.5-7b-instruct:free
 * Env: OPENROUTER_API_KEY
 * Endpoint: https://openrouter.ai/api/v1/chat/completions
 */
async function testOpenRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() || process.env.OPEN_ROUTER_API_KEY?.trim();
  const keyAvailable = !!apiKey;

  if (!keyAvailable) {
    return { provider: 'OpenRouter', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'OPENROUTER_API_KEY not set', status: '❌' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        ...HEADERS_JSON,
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://roua-trading-production.up.railway.app',
        'X-Title': 'Roua Trading AI Diagnostics',
      },
      body: JSON.stringify({
        model: 'qwen/qwen-2.5-7b-instruct:free',
        messages: [
          { role: 'user', content: TEST_PROMPT },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'OpenRouter', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    if (content.trim().length > 0) {
      return { provider: 'OpenRouter', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'OpenRouter', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'OpenRouter', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

/**
 * 8. DeepSeek — deepseek-chat
 * Env: DEEPSEEK_API_KEY
 * Endpoint: https://api.deepseek.com/v1/chat/completions
 */
async function testDeepSeek() {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const keyAvailable = !!apiKey;

  if (!keyAvailable) {
    return { provider: 'DeepSeek', keyAvailable: false, apiWorking: false, responseTime: 0, error: 'DEEPSEEK_API_KEY not set', status: '❌' };
  }

  const start = Date.now();
  try {
    const response = await fetchWithTimeout('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { ...HEADERS_JSON, Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: TEST_PROMPT },
        ],
        temperature: 0.1,
        max_tokens: 10,
      }),
    });

    const elapsed = Date.now() - start;

    if (!response.ok) {
      const errMsg = await extractError(response);
      return { provider: 'DeepSeek', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: `HTTP ${response.status}: ${errMsg}`, status: '⚠️' };
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    let content = message?.content || '';
    const reasoningContent = message?.reasoning_content || '';

    // DeepSeek reasoner may put answer in reasoning_content
    if (!content.trim() && reasoningContent.trim()) {
      content = reasoningContent;
    }

    if (content.trim().length > 0) {
      return { provider: 'DeepSeek', keyAvailable: true, apiWorking: true, responseTime: elapsed, error: null, status: '✅', response: content.trim().substring(0, 50) };
    }
    return { provider: 'DeepSeek', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: 'Empty response content', status: '⚠️' };
  } catch (err) {
    const elapsed = Date.now() - start;
    const msg = err.name === 'AbortError' ? 'Timeout (15s)' : err.message;
    return { provider: 'DeepSeek', keyAvailable: true, apiWorking: false, responseTime: elapsed, error: msg, status: '⚠️' };
  }
}

// ══════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Roua Trading — AI Provider Diagnostics');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Prompt: "${TEST_PROMPT}"`);
  console.log(`  Timeout: ${TIMEOUT_MS / 1000}s per provider`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Show key presence (masked) before running tests
  console.log('  API Key Status:');
  const keyChecks = [
    { name: 'GROQ_API_KEY', key: process.env.GROQ_API_KEY?.trim() },
    { name: 'GOOGLE_AI_STUDIO_API_KEY', key: process.env.GOOGLE_AI_STUDIO_API_KEY?.trim() },
    { name: 'GEMINI_API_KEY', key: process.env.GEMINI_API_KEY?.trim() },
    { name: 'GLM_API_KEY', key: process.env.GLM_API_KEY?.trim() },
    { name: 'HUGGINGFACE_API_KEY', key: process.env.HUGGINGFACE_API_KEY?.trim() },
    { name: 'HF_API_KEY', key: process.env.HF_API_KEY?.trim() },
    { name: 'OLLAMA_BASE_URL', key: process.env.OLLAMA_BASE_URL?.trim() },
    { name: 'AWS_ACCESS_KEY_ID', key: process.env.AWS_ACCESS_KEY_ID?.trim() },
    { name: 'AWS_SECRET_ACCESS_KEY', key: process.env.AWS_SECRET_ACCESS_KEY?.trim() },
    { name: 'OPENROUTER_API_KEY', key: process.env.OPENROUTER_API_KEY?.trim() },
    { name: 'OPEN_ROUTER_API_KEY', key: process.env.OPEN_ROUTER_API_KEY?.trim() },
    { name: 'DEEPSEEK_API_KEY', key: process.env.DEEPSEEK_API_KEY?.trim() },
  ];

  for (const { name, key } of keyChecks) {
    const icon = key ? '🔑' : '  ';
    const display = key ? maskKey(key) : '(not set)';
    console.log(`  ${icon} ${name.padEnd(28)} ${display}`);
  }
  console.log('');

  // Run tests in order
  console.log('  Running provider tests...\n');

  const testFunctions = [
    { name: 'Groq', fn: testGroq },
    { name: 'Gemini', fn: testGemini },
    { name: 'GLM-4', fn: testGLM },
    { name: 'HuggingFace', fn: testHuggingFace },
    { name: 'Ollama', fn: testOllama },
    { name: 'Bedrock', fn: testBedrock },
    { name: 'OpenRouter', fn: testOpenRouter },
    { name: 'DeepSeek', fn: testDeepSeek },
  ];

  for (const { name, fn } of testFunctions) {
    process.stdout.write(`  Testing ${name}... `);
    const result = await fn();
    results.push(result);
    const timeStr = result.responseTime > 0 ? `${result.responseTime}ms` : '-';
    console.log(`${result.status} ${result.apiWorking ? 'WORKING' : result.keyAvailable ? 'FAILED' : 'NO KEY'} (${timeStr})`);
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Results Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');

  // Table header
  const col1 = 'Provider'.padEnd(14);
  const col2 = 'Key'.padEnd(6);
  const col3 = 'API OK'.padEnd(8);
  const col4 = 'Time'.padEnd(10);
  const col5 = 'Status';
  console.log(`  ${col1} ${col2} ${col3} ${col4} ${col5}`);
  console.log(`  ${'─'.repeat(14)} ${'─'.repeat(6)} ${'─'.repeat(8)} ${'─'.repeat(10)} ${'─'.repeat(4)}`);

  for (const r of results) {
    const provider = r.provider.padEnd(14);
    const key = (r.keyAvailable ? 'yes' : 'no').padEnd(6);
    const apiOk = (r.apiWorking ? 'yes' : 'no').padEnd(8);
    const time = (r.responseTime > 0 ? `${r.responseTime}ms` : '-').padEnd(10);
    console.log(`  ${provider} ${key} ${apiOk} ${time} ${r.status}`);
  }

  console.log('');

  // Error details
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.log('  Error Details:');
    for (const r of errors) {
      const maxErrorLen = 100;
      const errMsg = r.error.length > maxErrorLen ? r.error.substring(0, maxErrorLen) + '...' : r.error;
      console.log(`    ${r.status} ${r.provider}: ${errMsg}`);
    }
    console.log('');
  }

  // Response preview for working providers
  const working = results.filter(r => r.apiWorking && r.response);
  if (working.length > 0) {
    console.log('  Response Preview:');
    for (const r of working) {
      console.log(`    ${r.status} ${r.provider}: "${r.response}"`);
    }
    console.log('');
  }

  // Summary stats
  const keysPresent = results.filter(r => r.keyAvailable).length;
  const apisWorking = results.filter(r => r.apiWorking).length;
  const totalProviders = results.length;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Providers with keys: ${keysPresent} / ${totalProviders}`);
  console.log(`  Providers working:   ${apisWorking} / ${totalProviders}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  console.log('  Legend:  ✅ Working  ⚠️ Key available but API failing  ❌ No key');
  console.log('');

  // Exit with code based on results
  if (apisWorking === 0) {
    console.log('  ⚠️  No AI providers are working! Check your API keys and network.');
    process.exit(1);
  } else if (apisWorking < totalProviders / 2) {
    console.log(`  ⚠️  Only ${apisWorking} of ${totalProviders} providers working — some may need attention.`);
    process.exit(0);
  } else {
    console.log(`  ✅ ${apisWorking} of ${totalProviders} providers are working.`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
