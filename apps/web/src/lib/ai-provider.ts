// ═══════════════════════════════════════════════════════════════
// Copyright © 2024–2026 Rouaa (رؤى). All rights reserved.
// PROPRIETARY AND CONFIDENTIAL — See LICENSE file for terms.
// Patent Pending: "Multi-Provider AI Cascade System with
// Per-Provider Circuit Breakers and Degraded Mode Operation"
// ═══════════════════════════════════════════════════════════════
// ─── Unified AI Provider Service V900 ──────────────────────
// Real cloud AI providers: Amazon Bedrock (Claude), Groq, Gemini, DeepSeek, GLM, HuggingFace, Ollama
// Fallback: z-ai-web-dev-sdk (always available, no API key needed)
// V258: Fixed Gemini 2.5 Flash thinking mode — added thinkingConfig to disable thinking,
//       handle thought parts in response parsing, aligned deprecated preview detection,
//       added gemini-2.5-flash to model fallback chain.
// V66: BEDROCK IS NOW #1 — Claude via Bedrock is the BEST Arabic financial model.
//       Moved from #9 → #1. Default model upgraded from Haiku → Sonnet V2.
//       User has Bedrock key with Claude access — this is the primary provider.
// V63: Fixed Gemini — deprecated model detection + API version fallback (v1beta→v1),
//       Fixed Ollama — ollama.com cloud model auto-detect + native API fallback,
//       Fixed Bedrock — try direct model ID without cross-region prefix as fallback,
//       Fixed DeepSeek — use /v1 as primary path (official SDK format)

import { createHmac, createHash } from 'crypto';
import { BedrockRuntimeClient, InvokeModelCommand, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

// ─── z-ai-web-dev-sdk (Always-Available Fallback) ──────────
// This provider requires NO API key and is always available.
// It is used as the LAST fallback when all other providers fail.
let zaiInstance: any = null;
let zaiInitFailed = false;
let zaiInitAttempt = 0;
const ZAI_INIT_RETRY_INTERVAL = 10_000; // V45: Reduced from 30s — faster recovery after failures
let zaiActuallyAvailable = false; // Track actual availability — V7: set true on ANY successful init

// ─── Gemini Daily Quota Tracker ──────────────────────────────
// Supports both free and paid tiers via GEMINI_TIER env var.
// V392: Paid tier support — much higher limits, shorter cooldowns.
let geminiDailyCount = 0;
let geminiDailyResetDate = new Date().toDateString();
// V60: Track hard quota exhaustion — when API returns limit:0,
// the key is permanently exhausted (not just over-usage).
// V64: But also track per-HOUR cooldown, not just per-day.
let geminiHardQuotaExhausted = false;
let geminiHardQuotaExhaustedAt = 0;

// V392: Detect Gemini tier from env var. Paid tier has much higher limits.
function getGeminiTier(): 'free' | 'paid' {
  const tier = (process.env.GEMINI_TIER || '').toLowerCase().trim();
  if (tier === 'paid' || tier === 'pro' || tier === 'billing' || tier === 'enabled') return 'paid';
  return 'free';
}

// V392: Tier-aware quota limits
function getGeminiDailyLimit(): number {
  if (getGeminiTier() === 'paid') return 50000; // Paid tier: essentially unlimited for our use case
  return 1200; // Free tier: ~1,500/day, buffer at 1,200
}

function getGeminiQuotaCooldownMs(): number {
  if (getGeminiTier() === 'paid') return 60 * 1000; // Paid: 1 minute cooldown (quota resets fast on paid)
  return 10 * 60 * 1000; // Free: 10 minutes cooldown
}

function isGeminiDailyQuotaAvailable(): boolean {
  const cooldownMs = getGeminiQuotaCooldownMs();
  const tier = getGeminiTier();
  // If hard quota was hit, wait for cooldown before retrying
  if (geminiHardQuotaExhausted) {
    const timeSinceExhausted = Date.now() - geminiHardQuotaExhaustedAt;
    if (timeSinceExhausted < cooldownMs) {
      return false; // Still in cooldown
    }
    // Cooldown elapsed — reset and try again
    geminiHardQuotaExhausted = false;
    geminiDailyCount = 0;
    console.log(`[AI] V392: Gemini (${tier} tier) quota cooldown elapsed (${Math.round(timeSinceExhausted / 1000)}s) — retrying`);
  }
  // Reset counter at midnight
  const today = new Date().toDateString();
  if (today !== geminiDailyResetDate) {
    geminiDailyCount = 0;
    geminiDailyResetDate = today;
  }
  const dailyLimit = getGeminiDailyLimit();
  return geminiDailyCount < dailyLimit;
}

function markGeminiHardQuotaExhausted(): void {
  const tier = getGeminiTier();
  const cooldownMs = getGeminiQuotaCooldownMs();
  geminiHardQuotaExhausted = true;
  geminiHardQuotaExhaustedAt = Date.now();
  console.warn(`[AI] V392: Gemini (${tier} tier) quota exhausted — cooling down for ${cooldownMs / 1000}s`);
}

// V258: Export a manual reset function for Gemini quota — similar to Bedrock circuit breaker.
// This allows the diagnostics/pipeline API to reset Gemini's quota state
// without requiring a full app restart.
// V392: Also export getGeminiTier for diagnostics.
export { getGeminiTier };
export function resetGeminiQuota(): void {
  geminiHardQuotaExhausted = false;
  geminiHardQuotaExhaustedAt = 0;
  geminiDailyCount = 0;
  console.log('[AI] V258: Gemini quota MANUALLY RESET — will retry on next call');
}

function recordGeminiDailyCall(): void {
  const today = new Date().toDateString();
  if (today !== geminiDailyResetDate) {
    geminiDailyCount = 0;
    geminiDailyResetDate = today;
  }
  geminiDailyCount++;
}

// ─── Circuit Breaker for z-ai-sdk ─────────────────────────────
// When z-ai-sdk fails (timeout, connection error, fetch failed), mark it as temporarily
// unavailable so subsequent calls skip it immediately instead of waiting
// for another timeout.
let zaiCircuitOpen = false;
let zaiCircuitOpenAt = 0;
const ZAI_CIRCUIT_RESET_MS = 30_000; // V61: 30s balance between avoiding hammering and allowing retry

// V801: Permanent unavailability flag for z-ai-sdk.
// On Railway (non-Z.ai platforms), the SDK uses internal-api.z.ai which is unreachable.
// Instead of retrying every 10s and wasting 15s per timeout, we mark it permanently unavailable.
let zaiPermanentlyUnavailable = false;

// V801: Detect if we're running on Z.ai platform (where internal-api.z.ai is accessible)
// vs Railway/Vercel/etc (where it's NOT accessible and z-ai-sdk will always fail)
function isZaiPlatform(): boolean {
  // If ZAI_BASE_URL or ZAI_API_KEY are explicitly set, the user WANTS z-ai-sdk
  if (process.env.ZAI_BASE_URL || process.env.ZAI_API_KEY) return true;
  // If .z-ai-config file exists, we're likely on Z.ai platform
  try {
    const fs = require('fs');
    if (fs.existsSync('.z-ai-config')) return true;
  } catch {}
  // Check for Z.ai platform environment indicators
  if (process.env.ZAI_CHAT_ID || process.env.ZAI_USER_ID || process.env.ZAI_TOKEN) return true;
  // No indicators — likely NOT on Z.ai platform
  return false;
}

// ─── V391: Circuit Breaker for OpenRouter ─────────────────────────
// When ALL OpenRouter free models fail (429 rate-limited or 402 no credits),
// temporarily skip OpenRouter to avoid wasting 5-10s per call trying dead models.
// This prevents the "death spiral" where every pipeline call wastes time on OpenRouter
// before falling through to Bedrock/Gemini/Groq.
// V394: Extended reset to 5min for daily rate limits (free tier = 50/day).
let openrouterCircuitOpen = false;
let openrouterCircuitOpenAt = 0;
const OPENROUTER_CIRCUIT_RESET_MS = 5 * 60_000; // V394: 5min — daily rate limits need longer reset

function isOpenrouterCircuitOpen(): boolean {
  if (!openrouterCircuitOpen) return false;
  if (Date.now() - openrouterCircuitOpenAt > OPENROUTER_CIRCUIT_RESET_MS) {
    openrouterCircuitOpen = false;
    console.log('[AI] V391: OpenRouter circuit breaker reset — will retry on next call');
    return false;
  }
  return true;
}

function tripOpenrouterCircuit(): void {
  openrouterCircuitOpen = true;
  openrouterCircuitOpenAt = Date.now();
  console.warn(`[AI] V391: OpenRouter circuit breaker TRIPPED — all free models failed. Skipping for ${OPENROUTER_CIRCUIT_RESET_MS / 1000}s`);
}

// ─── V72: Circuit Breaker for Bedrock ─────────────────────────────
// When Bedrock fails consecutively, temporarily skip it to prevent death spiral.
// V94: Made much more resilient — 5 failures (was 3) and 30s cooldown (was 2min).
// The old 3-failure/2min combo was too aggressive: a single AWS blip would
// disable Bedrock for 2 minutes, during which ALL articles fall to weaker
// providers (Gemini quota → Groq → low quality → publisher rejects → pipeline stalls).
// 30s cooldown means we retry quickly while still avoiding hammering.
let bedrockConsecutiveFailures = 0;
const BEDROCK_CIRCUIT_THRESHOLD = 5; // V94: Trip after 5 consecutive failures (was 3)
const BEDROCK_CIRCUIT_RESET_MS = 30 * 1000; // V94: 30 seconds (was 2 min) — retry much faster
// V253: DAILY QUOTA COMPLETELY REMOVED — it was blocking all content generation
// (reports, infographics, news) unnecessarily. AWS Bedrock has its own rate
// limiting and quota resets automatically. We only keep the circuit breaker
// for transient failures (5 consecutive → 30s cooldown).
let bedrockCircuitOpenAt = 0;

// ─── Bedrock Daily Token Budget: DISABLED ─────────────────────────
// V252: Daily token budget tracking REMOVED — it was causing unnecessary
// blocks that prevented generating reports, infographics, and even news.
// The AWS Bedrock quota resets automatically and has its own rate limiting.
// We only keep the circuit breaker for consecutive failures (above).
// V94: Export a manual reset function so the pipeline API can reset the circuit breaker
// without requiring a full app restart
export function resetBedrockCircuitBreaker(): void {
  bedrockConsecutiveFailures = 0;
  bedrockCircuitOpenAt = 0;
  console.log('[AI] V253: Bedrock circuit breaker MANUALLY RESET — will retry on next call');
}

function isBedrockCircuitOpen(): boolean {
  if (bedrockConsecutiveFailures < BEDROCK_CIRCUIT_THRESHOLD) return false;
  // V253: Daily quota check REMOVED — only transient failure cooldown (30s)
  if (Date.now() - bedrockCircuitOpenAt > BEDROCK_CIRCUIT_RESET_MS) {
    bedrockConsecutiveFailures = 0;
    console.log('[AI] V253: Bedrock circuit breaker reset (temporary) — will retry on next call');
    return false;
  }
  return true;
}

function recordBedrockSuccess(): void {
  if (bedrockConsecutiveFailures > 0) {
    console.log(`[AI] V94: Bedrock succeeded after ${bedrockConsecutiveFailures} failures — circuit breaker reset`);
  }
  bedrockConsecutiveFailures = 0;
}

function recordBedrockFailure(errorMsg?: string): void {
  bedrockConsecutiveFailures++;
  // V256: Daily quota FULLY REMOVED — only transient failure circuit breaker.
  // AWS resets quotas automatically. No internal daily limit exists.
  if (bedrockConsecutiveFailures >= BEDROCK_CIRCUIT_THRESHOLD) {
    bedrockCircuitOpenAt = Date.now();
    const note = errorMsg && (errorMsg.includes('tokens per day') || errorMsg.includes('daily quota'))
      ? ' (AWS-side quota note — our daily limit is REMOVED, V256)'
      : '';
    console.warn(`[AI] V256: Bedrock circuit breaker TRIPPED — ${bedrockConsecutiveFailures} consecutive failures. Skipping Bedrock for ${BEDROCK_CIRCUIT_RESET_MS / 1000}s${note}`);
  }
}

// ─── V900: Universal Runtime Health Tracker ─────────────────────
// Tracks health of ALL providers at runtime — not just Bedrock/Gemini/OpenRouter.
// When a provider fails with a permanent error (402, 403, credits depleted,
// insufficient balance, unauthorized), it's marked as unavailable for 1 hour.
// When a provider fails with a transient error (429, timeout), it's cooled down for 60s.
// This prevents the "death spiral" where every request wastes 2-5s on dead providers.

interface ProviderHealthRecord {
  lastError: string;        // The error message
  lastErrorTime: number;    // When the error occurred
  cooldownUntil: number;    // Don't try this provider until this timestamp
  failureCount: number;     // Total failures since last success
  isPermanent: boolean;     // true = credits/auth issue, false = rate limit/timeout
}

const providerHealthMap = new Map<string, ProviderHealthRecord>();

// Error patterns that indicate PERMANENT unavailability (credits/auth/billing issues)
const PERMANENT_ERROR_PATTERNS = [
  'insufficient balance', 'credits depleted', 'depleted your monthly',
  'credit limit exceeded', 'add credits', 'add balance',
  'unauthorized', 'invalid api key', 'invalid_api_key',
  'billing', 'payment required', 'subscribe',
  'trial key', 'upgrade', 'plan',
  'model_not_found', 'model not found',
  '余额不足', // Chinese: insufficient balance
  'not available on your', // plan restriction
];

// Error patterns that indicate TRANSIENT issues (rate limits, quotas)
const TRANSIENT_ERROR_PATTERNS = [
  'rate limit', 'rate_limit', '429', 'too many requests',
  'quota', 'too many tokens', 'daily', 'per day',
  'cooldown', 'resource_exhausted', 'RESOURCE_EXHAUSTED',
];

function classifyError(errorMsg: string): { isPermanent: boolean; cooldownMs: number } {
  const lower = errorMsg.toLowerCase();
  
  // Check permanent patterns first
  for (const pattern of PERMANENT_ERROR_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return { isPermanent: true, cooldownMs: 60 * 60 * 1000 }; // 1 hour cooldown for billing/credit issues
    }
  }
  
  // Check transient patterns
  for (const pattern of TRANSIENT_ERROR_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) {
      return { isPermanent: false, cooldownMs: 60 * 1000 }; // 60s cooldown for rate limits
    }
  }
  
  // HTTP status codes in error messages
  if (/\b40[12]\b/.test(errorMsg)) return { isPermanent: true, cooldownMs: 60 * 60 * 1000 };
  if (/\b403\b/.test(errorMsg)) return { isPermanent: true, cooldownMs: 60 * 60 * 1000 };
  if (/\b429\b/.test(errorMsg)) return { isPermanent: false, cooldownMs: 60 * 1000 };
  
  // Default: treat as transient, 60s cooldown
  return { isPermanent: false, cooldownMs: 60 * 1000 };
}

function recordProviderFailure(providerName: string, errorMsg: string): void {
  const { isPermanent, cooldownMs } = classifyError(errorMsg);
  const existing = providerHealthMap.get(providerName);
  const failureCount = (existing?.failureCount || 0) + 1;
  
  providerHealthMap.set(providerName, {
    lastError: errorMsg.slice(0, 200),
    lastErrorTime: Date.now(),
    cooldownUntil: Date.now() + cooldownMs,
    failureCount,
    isPermanent,
  });
  
  const cooldownLabel = isPermanent ? '1h (permanent)' : `${cooldownMs / 1000}s (transient)`;
  console.warn(`[AI] V900: Provider "${providerName}" failed — ${errorMsg.slice(0, 80)} — cooldown: ${cooldownLabel} (failures: ${failureCount})`);
}

function recordProviderSuccess(providerName: string): void {
  const existing = providerHealthMap.get(providerName);
  if (existing && existing.failureCount > 0) {
    console.log(`[AI] V900: Provider "${providerName}" recovered after ${existing.failureCount} failures`);
  }
  providerHealthMap.delete(providerName); // Clear health record on success
}

function isProviderHealthy(providerName: string): boolean {
  const record = providerHealthMap.get(providerName);
  if (!record) return true; // No record = healthy
  
  if (Date.now() >= record.cooldownUntil) {
    // Cooldown elapsed — try again
    providerHealthMap.delete(providerName);
    console.log(`[AI] V900: Provider "${providerName}" cooldown elapsed — will retry`);
    return true;
  }
  
  return false; // Still in cooldown
}

function getProviderHealthSummary(): Record<string, { healthy: boolean; lastError: string; cooldownRemainingMs: number }> {
  const summary: Record<string, { healthy: boolean; lastError: string; cooldownRemainingMs: number }> = {};
  for (const [name, record] of providerHealthMap) {
    const remaining = Math.max(0, record.cooldownUntil - Date.now());
    summary[name] = {
      healthy: remaining === 0,
      lastError: record.lastError.slice(0, 100),
      cooldownRemainingMs: remaining,
    };
  }
  return summary;
}

function isZaiCircuitOpen(): boolean {
  if (!zaiCircuitOpen) return false;
  // Auto-reset after cooldown period
  if (Date.now() - zaiCircuitOpenAt > ZAI_CIRCUIT_RESET_MS) {
    zaiCircuitOpen = false;
    console.log('[AI] z-ai-sdk circuit breaker reset — will retry on next call');
    return false;
  }
  return true;
}

function tripZaiCircuit(): void {
  zaiCircuitOpen = true;
  zaiCircuitOpenAt = Date.now();
  console.warn(`[AI] z-ai-sdk circuit breaker TRIPPED — skipping for ${ZAI_CIRCUIT_RESET_MS / 1000}s`);
}

async function getZAI() {
  // V801: If permanently unavailable (not on Z.ai platform), skip immediately
  if (zaiPermanentlyUnavailable) {
    return null;
  }

  // If initialization previously failed, retry periodically
  if (zaiInitFailed && zaiInitAttempt > 0) {
    const timeSinceLastAttempt = Date.now() - zaiInitAttempt;
    if (timeSinceLastAttempt < ZAI_INIT_RETRY_INTERVAL) {
      return null; // Not enough time has passed to retry
    }
    console.log(`[AI] Retrying z-ai-web-dev-sdk init after ${Math.round(timeSinceLastAttempt / 1000)}s...`);
  }

  if (!zaiInstance) {
    try {
      const ZAI = (await import('z-ai-web-dev-sdk')).default;

      // Try ZAI.create() first (reads from .z-ai-config file)
      try {
        // V801: Add a 5-second timeout to ZAI.create() — if it takes too long,
        // the platform auto-config is probably trying to reach an unreachable endpoint
        const initPromise = ZAI.create();
        zaiInstance = await Promise.race([
          initPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        
        if (zaiInstance) {
          zaiInitFailed = false;
          zaiActuallyAvailable = true;
          console.log('[AI] ✓ z-ai-web-dev-sdk initialized from config file');
        } else {
          // Timed out — ZAI.create() is hanging (likely unreachable internal API)
          throw new Error('ZAI.create() timed out after 5s — likely not on Z.ai platform');
        }
      } catch (configErr: any) {
        // Config file not found - try creating it from environment variables
        const zaiBaseUrl = process.env.ZAI_BASE_URL;
        const zaiApiKey = process.env.ZAI_API_KEY;

        if (zaiBaseUrl && zaiApiKey) {
          // Write a .z-ai-config file from environment variables so ZAI.create() can read it
          const fs = await import('fs/promises');
          const path = await import('path');
          const configData: Record<string, string> = {
            baseUrl: zaiBaseUrl,
            apiKey: zaiApiKey,
          };
          if (process.env.ZAI_CHAT_ID) configData.chatId = process.env.ZAI_CHAT_ID;
          if (process.env.ZAI_USER_ID) configData.userId = process.env.ZAI_USER_ID;
          if (process.env.ZAI_TOKEN) configData.token = process.env.ZAI_TOKEN;

          const configPath = path.join(process.cwd(), '.z-ai-config');
          await fs.writeFile(configPath, JSON.stringify(configData), 'utf-8');
          console.log('[AI] Created .z-ai-config from environment variables');

          // Now try ZAI.create() again
          zaiInstance = await ZAI.create();
          zaiInitFailed = false;
          zaiActuallyAvailable = true;
          console.log('[AI] ✓ z-ai-web-dev-sdk initialized from env vars config');
        } else {
          // V801: Check if we're on Z.ai platform before trying auto-config
          // If not on Z.ai platform, auto-config will always fail — skip it entirely
          if (!isZaiPlatform()) {
            zaiPermanentlyUnavailable = true;
            zaiInitFailed = true;
            zaiInitAttempt = Date.now();
            console.warn('[AI] V801: z-ai-web-dev-sdk SKIPPED — not on Z.ai platform (no ZAI_BASE_URL/ZAI_API_KEY/config). ' +
              'Set ZAI_BASE_URL and ZAI_API_KEY env vars to enable it, or configure another AI provider.');
            return null;
          }
          
          // V6: Try ZAI.create() one more time without any config
          // Some environments auto-configure the SDK
          try {
            const autoInitPromise = ZAI.create();
            zaiInstance = await Promise.race([
              autoInitPromise,
              new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
            ]);
            
            if (zaiInstance) {
              zaiInitFailed = false;
              zaiActuallyAvailable = true;
              console.log('[AI] ✓ z-ai-web-dev-sdk initialized (auto-config)');
            } else {
              throw new Error('ZAI.create() auto-config timed out after 5s');
            }
          } catch (autoErr: any) {
            // V801: Auto-config failed — likely not on Z.ai platform. Mark as permanently unavailable.
            zaiPermanentlyUnavailable = true;
            throw new Error(`Auto-config failed: ${autoErr.message}`);
          }
        }
      }
    } catch (err: any) {
      zaiInitFailed = true;
      zaiInitAttempt = Date.now();
      zaiActuallyAvailable = false;
      if (!zaiPermanentlyUnavailable) {
        console.error('[AI] z-ai-web-dev-sdk init FAILED:', err.message);
      }
    }
  }
  return zaiInstance;
}

async function zaiChat(
  messages: ChatMessage[],
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();
  const zai = await getZAI();

  if (!zai) {
    throw new Error(`z-ai-web-dev-sdk not available (initFailed=${zaiInitFailed}, lastAttempt=${zaiInitAttempt ? new Date(zaiInitAttempt).toISOString() : 'never'})`);
  }

  // Check circuit breaker first — skip immediately if z-ai-sdk recently failed
  if (isZaiCircuitOpen()) {
    throw new Error('z-ai-sdk circuit breaker open — temporarily unavailable');
  }

  // V61: 15s timeout — enough for SDK init + response, but not so long it blocks fallback chain
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('z-ai-sdk chat completion timed out after 15s')), 15000);
  });

  try {
    const completion = await Promise.race([
      zai.chat.completions.create({
        model: 'claudflare',
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      timeoutPromise
    ]) as any;

    const content = completion.choices?.[0]?.message?.content || '';

    // V54: Track which model was actually used (if reported)
    const actualModel = completion.model || 'z-ai-default';

    return {
      content,
      provider: 'z-ai-sdk',
      model: actualModel,
      duration: Date.now() - startTime,
      tokensUsed: completion.usage?.total_tokens,
    };
  } catch (error: any) {
    // V61: Trip circuit breaker on network errors. Don't trip on timeout —
    // timeouts might be transient (server busy), while fetch failed means unreachable.
    if (error.message?.includes('ECONNREFUSED') || error.message?.includes('Connect Timeout')
        || error.message?.includes('ENOTFOUND') || error.message?.includes('fetch failed')) {
      tripZaiCircuit();
    }
    throw error;
  }
}

// ─── Types ──────────────────────────────────────────────────
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResult {
  content: string;
  provider: string;
  model: string;
  duration: number;
  tokensUsed?: number;
  stopReason?: string; // V226: 'max_tokens' means content was truncated
}

export type AIProvider = 'z-ai-sdk' | 'groq' | 'gemini' | 'deepseek' | 'glm' | 'bedrock' | 'ollama' | 'hf' | 'cerebras' | 'mistral' | 'nvidia' | 'openrouter' | 'sambanova' | 'cohere' | 'cloudflare' | 'siliconflow' | 'deepinfra' | 'zukijourney' | 'nagaai' | 'acytoo' | 'grok';

// ─── Provider Configuration ─────────────────────────────────
interface ProviderConfig {
  name: string;
  apiKey: string | undefined;
  baseUrl: string;
  model: string;
  available: boolean;
  extra?: Record<string, string | undefined>;
}

// ─── Multi-Key Rotation System (V399) ─────────────────────
// Supports multiple API keys per provider for load balancing and rate limit avoidance.
// Env var format: PROVIDER_KEY=key1,key2,key3 (comma-separated)
// Or: PROVIDER_KEY_1=key1, PROVIDER_KEY_2=key2, PROVIDER_KEY_3=key3 (numbered)
// The system rotates keys using round-robin and auto-skips exhausted keys.

const keyRotationCounters: Record<string, number> = {};

/**
 * Parse multiple API keys from environment variables.
 * Supports three formats:
 *   1. Comma-separated: XAI_API_KEY=key1,key2,key3
 *   2. Numbered: XAI_API_KEY_1=key1, XAI_API_KEY_2=key2
 *   3. DB-stored: provider_key_PROVIDER_1, provider_key_PROVIDER_2 (loaded at runtime)
 * Returns array of trimmed keys (empty strings removed).
 */
function parseMultiKeys(baseEnvVar: string): string[] {
  const keys: string[] = [];

  // Method 1: Comma-separated in single env var
  const mainValue = (process.env[baseEnvVar] || '').trim();
  if (mainValue) {
    for (const k of mainValue.split(',')) {
      const trimmed = k.trim();
      if (trimmed) keys.push(trimmed);
    }
  }

  // Method 2: Numbered env vars (XAI_API_KEY_1, XAI_API_KEY_2, etc.)
  for (let i = 1; i <= 10; i++) {
    const numberedKey = (process.env[`${baseEnvVar}_${i}`] || '').trim();
    if (numberedKey && !keys.includes(numberedKey)) {
      keys.push(numberedKey);
    }
  }

  return keys;
}

/**
 * V400: Get all keys for a provider from both env vars and DB-stored keys.
 * Used by provider functions to support multi-key rotation for ALL providers.
 * DB keys are stored as SiteSetting entries: provider_key_{providerName}_{N}
 */
// In-memory cache for DB keys (refreshed every 60s)
let dbKeysCache: Record<string, string[]> = {};
let dbKeysCacheTime = 0;
const DB_KEYS_CACHE_TTL = 60_000; // 1 minute

async function loadDbKeysForProvider(providerName: string): Promise<string[]> {
  try {
    const now = Date.now();
    if (now - dbKeysCacheTime > DB_KEYS_CACHE_TTL) {
      // Refresh cache from DB
      const { db } = await import('@/lib/db');
      const settings = await db.siteSetting.findMany({
        where: { key: { startsWith: 'provider_key_' } },
      });
      const newCache: Record<string, string[]> = {};
      for (const s of settings) {
        const match = s.key.match(/^provider_key_(.+?)_(\d+)$/);
        if (match) {
          const provider = match[1];
          if (!newCache[provider]) newCache[provider] = [];
          if (s.value && s.value.trim()) newCache[provider].push(s.value.trim());
        }
      }
      dbKeysCache = newCache;
      dbKeysCacheTime = now;
    }
    return dbKeysCache[providerName] || [];
  } catch {
    return [];
  }
}

/**
 * V400: Get all keys for a provider — combines env vars + DB-stored keys.
 * Returns deduplicated array of all available API keys.
 */
function getAllKeysForProvider(envVarName: string, providerName: string): string[] {
  const keys = parseMultiKeys(envVarName);
  // DB keys will be added asynchronously in the provider functions
  // For synchronous access (getProviders), we only use env vars
  return keys;
}

/**
 * Get the next API key for a provider using round-robin rotation.
 * If only one key exists, returns it directly.
 * If multiple keys exist, rotates through them evenly.
 */
function getRotatedKey(providerName: string, keys: string[]): string | undefined {
  if (keys.length === 0) return undefined;
  if (keys.length === 1) return keys[0];

  const counter = keyRotationCounters[providerName] || 0;
  const index = counter % keys.length;
  keyRotationCounters[providerName] = counter + 1;

  // Log key rotation (only show first 8 chars for security)
  const keyPreview = keys[index].slice(0, 8) + '...';
  console.log(`[AI] V399: ${providerName} using key #${index + 1}/${keys.length} (${keyPreview})`);

  return keys[index];
}

export function getProviders(): ProviderConfig[] {
  // V400: Export DB key loader for API routes and provider functions
  // This allows the keys management API to trigger cache refresh
  // V66: BEDROCK IS NOW #1 — Claude produces the BEST Arabic financial content.
  // The user has an Amazon Bedrock key with Claude model access.
  // Claude 3.5 Sonnet V2 is far superior to Gemini/Llama for Arabic financial analysis:
  // - Best Arabic quality (no fabricated numbers, no Spanish/French word leakage)
  // - Best financial reasoning (correct path classification, proper trading scenarios)
  // - Best at following complex multi-gate prompts
  //
  // V66 Priority logic:
  // 1. Bedrock  — Claude 3.5 Sonnet V2 via Bedrock, BEST Arabic financial quality
  // 2. Gemini   — BEST free Arabic quality, good backup when Bedrock quota is hit
  // 3. Groq     — FASTEST (106ms), decent Arabic, good backup
  // 4. Cerebras — ULTRA-FAST inference (Llama models), good Arabic via Llama 3.3 70B
  // 5. Mistral  — Good multilingual including Arabic, mistral-small-latest
  // 6. DeepSeek — Good Arabic when paid
  // 7. NVIDIA   — NIM endpoint, Llama 3.1 8B, decent quality
  // 8. GLM      — Decent but weak Arabic (Chinese model)
  // 9. HF       — Small model (8B), poor Arabic, low rate limit
  // 10. z-ai-sdk — Fallback, not available on Railway
  // 11. Ollama  — V394: ollama.com/v1 IS a valid cloud API. Works with Bearer token auth.
  const awsRegion = process.env.AWS_REGION || 'us-east-1';
  const bedrockProfilePrefix = awsRegion.startsWith('eu') ? 'eu' : 'us';
  // V69: Claude 4.5 Haiku requires cross-region inference (us. prefix).
  // Direct model ID (without us.) fails with "on-demand throughput not supported".
  // Always use us.anthropic.claude-haiku-4-5-20251001-v1:0 for cross-region inference.
  // Haiku 4.5: ~$1/M input, ~$5/M output. Best Arabic quality per dollar.
  // Override via BEDROCK_MODEL env var:
  //   Haiku 4.5: us.anthropic.claude-haiku-4-5-20251001-v1:0  (default — $1/M input, $5/M output)
  //   Sonnet 4:  us.anthropic.claude-sonnet-4-20250514-v1:0   ($3/M input, $15/M output)
  const defaultBedrockModel = `${bedrockProfilePrefix}.anthropic.claude-haiku-4-5-20251001-v1:0`;

  // V64: Detect if GEMINI_MODEL env var points to a deprecated preview model.
  // If so, ignore it and use the stable model instead. This prevents the common
  // misconfiguration where GEMINI_MODEL=gemini-2.5-flash-preview-05-20 (shut down Nov 2025)
  // from blocking the entire Gemini provider.
  const rawGeminiModel = process.env.GEMINI_MODEL || '';
  const DEPRECATED_PREVIEW_PATTERNS = [
    'preview-05-20', 'preview-04-17', 'preview-03-25', 'preview-02-05',
    'exp-01-21', 'preview-08-27',
  ];
  const isDeprecatedModel = DEPRECATED_PREVIEW_PATTERNS.some(p => rawGeminiModel.includes(p));
  const effectiveGeminiModel = isDeprecatedModel
    ? 'gemini-2.5-flash'  // Override deprecated preview → stable
    : (rawGeminiModel || 'gemini-2.5-flash');

  if (isDeprecatedModel) {
    console.warn(`[AI] V64: GEMINI_MODEL="${rawGeminiModel}" is deprecated/obsolete → using "${effectiveGeminiModel}" instead. Please update your env var.`);
  }

  // V395: Ollama Cloud — ollama.com/v1 IS a valid cloud API (confirmed working).
  // V393 incorrectly disabled it due to ECONNREFUSED errors on Railway.
  // V394 fixed the cloud config but OLLAMA_BASE_URL=localhost:11434 overrode it.
  // V395: When API key exists, ALWAYS prefer ollama.com cloud over localhost.
  //        On Railway, localhost:11434 is never reachable (no local Ollama).
  // ollama.com/v1/chat/completions works with Bearer token auth.
  // api.ollama.com 301-redirects to ollama.com, so normalize to ollama.com.
  const rawOllamaBaseUrl = process.env.OLLAMA_BASE_URL || '';
  const ollamaApiKey = process.env.OLLAMA_API_KEY;
  let effectiveOllamaBaseUrl = rawOllamaBaseUrl;
  let isOllamaUnreachable = false;
  const isRailway = !!(process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN);

  // V395: Normalize api.ollama.com → ollama.com (api.ollama.com 301-redirects to ollama.com)
  if (effectiveOllamaBaseUrl.includes('api.ollama.com')) {
    effectiveOllamaBaseUrl = effectiveOllamaBaseUrl.replace('api.ollama.com', 'ollama.com');
  }

  // V395: Auto-add /v1 suffix for ollama.com if missing
  if (effectiveOllamaBaseUrl.includes('ollama.com') && !effectiveOllamaBaseUrl.includes('/v1')) {
    effectiveOllamaBaseUrl = effectiveOllamaBaseUrl.replace(/\/?$/, '/v1');
  }

  // V395: When OLLAMA_API_KEY is set, ALWAYS prefer ollama.com cloud over localhost.
  // On Railway, localhost:11434 is never reachable — no local Ollama possible.
  // If user set OLLAMA_BASE_URL to localhost, that's a misconfiguration on Railway.
  if (ollamaApiKey && (effectiveOllamaBaseUrl.includes('localhost') || effectiveOllamaBaseUrl.includes('127.0.0.1'))) {
    if (isRailway) {
      console.warn(`[AI] V395: OLLAMA_BASE_URL="${rawOllamaBaseUrl}" is localhost — unreachable on Railway. Switching to ollama.com/v1 cloud.`);
      effectiveOllamaBaseUrl = 'https://ollama.com/v1';
    }
    // On non-Railway: keep localhost but ollamaChat() will add ollama.com as fallback
  }

  // V395: Ollama is available when URL or API key is set
  if (!effectiveOllamaBaseUrl && !ollamaApiKey) {
    isOllamaUnreachable = true;
  }
  // V395: If only API key is set (no URL), default to ollama.com/v1
  if (!effectiveOllamaBaseUrl && ollamaApiKey) {
    effectiveOllamaBaseUrl = 'https://ollama.com/v1';
  }

  return [
    {
      // V69: Bedrock IS #1 — Claude 4.5 Haiku via Bedrock, best Arabic quality per dollar.
      // Claude 4.5 Haiku: best Arabic quality per dollar, $1/M input, $5/M output.
      // - Haiku 4.5 handles translation, classification & analysis well
      // - For complex analysis, switch to Sonnet 4 via BEDROCK_MODEL env var
      // V72: Check circuit breaker — if Bedrock failed 3+ times, temporarily skip it
      name: 'bedrock',
      apiKey: process.env.AWS_ACCESS_KEY_ID,
      baseUrl: `https://bedrock-runtime.${awsRegion}.amazonaws.com`,
      model: process.env.BEDROCK_MODEL || defaultBedrockModel,
      available: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) && !isBedrockCircuitOpen(),
      extra: {
        secretKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: awsRegion,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      },
    },
    {
      // V392: Gemini supports both free and paid tiers.
      // Set GEMINI_TIER=paid on Railway when using a paid subscription.
      // Paid tier: 50K daily limit, 500 RPM, 1-min cooldown — much more resilient.
      // Free tier: 1,200 daily limit, 28 RPM, 10-min cooldown.
      name: 'gemini',
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: effectiveGeminiModel,
      available: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY) && isGeminiDailyQuotaAvailable(),
    },
    {
      name: 'groq',
      apiKey: process.env.GROQ_API_KEY,
      baseUrl: 'https://api.groq.com/openai/v1',
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      available: !!process.env.GROQ_API_KEY,
    },
    {
      // V65: Cerebras — ultra-fast inference (faster than Groq for Llama models)
      // Uses Llama 3.3 70B (same as Groq) but with Cerebras's custom silicon.
      // Free tier: generous rate limits, OpenAI-compatible API.
      name: 'cerebras',
      apiKey: process.env.CEREBRAS_API_KEY,
      baseUrl: 'https://api.cerebras.ai/v1',
      model: process.env.CEREBRAS_MODEL || 'gpt-oss-120b', // V396: Updated from llama-4-scout (404) → gpt-oss-120b
      available: !!process.env.CEREBRAS_API_KEY,
    },
    {
      // V65: Mistral — good multilingual support including Arabic
      // mistral-small-latest: fast, good quality, supports Arabic
      // open-mistral-nemo: free tier model, decent multilingual
      name: 'mistral',
      apiKey: process.env.MISTRAL_API_KEY,
      baseUrl: 'https://api.mistral.ai/v1',
      model: process.env.MISTRAL_MODEL || 'mistral-small-latest',
      available: !!process.env.MISTRAL_API_KEY,
    },
    {
      name: 'deepseek',
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      available: !!process.env.DEEPSEEK_API_KEY,
    },
    {
      name: 'glm',
      apiKey: process.env.GLM_API_KEY,
      baseUrl: process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
      model: process.env.GLM_MODEL || 'glm-4-plus',
      available: !!process.env.GLM_API_KEY,
    },
    {
      // V65: NVIDIA NIM — Llama models via NVIDIA's inference API
      // meta/llama-3.1-8b-instruct: good quality, fast
      // Free credits available on NVIDIA build.nvidia.com
      name: 'nvidia',
      apiKey: process.env.NVIDIA_API_KEY,
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct',
      available: !!process.env.NVIDIA_API_KEY,
    },
    {
      name: 'hf',
      apiKey: process.env.HF_API_KEY || process.env.HF_API_TOKEN || process.env.HF_TOKEN,
      baseUrl: 'https://router.huggingface.co/v1',
      model: process.env.HF_MODEL || 'meta-llama/Llama-3.1-8B-Instruct:novita',
      available: !!(process.env.HF_API_KEY || process.env.HF_API_TOKEN || process.env.HF_TOKEN),
    },
    {
      // V386: OpenRouter — unified API gateway to 200+ models.
      // Supports Claude, GPT-4, Llama, Mistral, DeepSeek, Qwen, etc.
      // Excellent for Turkish/French/Spanish content — can route to best model per language.
      // Pricing: pay-per-token, often cheaper than direct API access.
      // Model selection: OPENROUTER_MODEL env var (default: anthropic/claude-3.5-haiku for quality/cost).
      // Other good options:
      //   - google/gemini-2.5-flash: free tier, good multilingual
      //   - meta-llama/llama-3.3-70b-instruct: cheap, good Turkish/French/Spanish
      //   - mistralai/mistral-small-24b-instruct-2501: excellent French
      //   - deepseek/deepseek-chat-v3-0324: good multilingual, cheap
      name: 'openrouter',
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: 'https://openrouter.ai/api/v1',
      model: process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free', // V391: Default to free model since paid credits exhausted
      available: !!process.env.OPENROUTER_API_KEY && !isOpenrouterCircuitOpen(), // V391: Skip when circuit breaker tripped
      extra: {
        siteUrl: process.env.OPENROUTER_SITE_URL || 'https://rouaa.news',
        siteName: process.env.OPENROUTER_SITE_NAME || 'Rouaa Financial News',
      },
    },
    {
      name: 'z-ai-sdk',
      apiKey: 'z-ai-sdk',
      baseUrl: 'z-ai-sdk',
      model: 'claudflare', // V397: claudflare model for smart assistant
      // V801: z-ai-sdk is ONLY available on Z.ai platform (internal-api.z.ai).
      // On Railway/Vercel, it's permanently unavailable (internal API not reachable).
      // available = true if: (1) NOT permanently unavailable, AND (2) circuit not open,
      //                       AND (3) not init-failed OR retry interval passed
      available: !zaiPermanentlyUnavailable && !isZaiCircuitOpen() && (!zaiInitFailed || (Date.now() - zaiInitAttempt > ZAI_INIT_RETRY_INTERVAL)),
    },
    {
      name: 'ollama',
      apiKey: ollamaApiKey || 'ollama',
      baseUrl: effectiveOllamaBaseUrl,
      // V394: Ollama Cloud (ollama.com) uses cloud model names; local uses simple names.
      model: effectiveOllamaBaseUrl.includes('ollama.com')
        ? (process.env.OLLAMA_MODEL || 'gemma3:12b') // Cloud default — free tier
        : (process.env.OLLAMA_MODEL || 'llama3.1'),   // Local default
      // V394: Available when URL or API key is set (cloud or local).
      available: !isOllamaUnreachable && !!(effectiveOllamaBaseUrl || ollamaApiKey),
    },
    {
      // V396: SambaNova — FREE ultra-fast inference for developers.
      // Meta-Llama-3.3-70B-Instruct, DeepSeek-R1, Qwen-2.5-72B — all FREE.
      // OpenAI-compatible API, very fast custom SN40L silicon.
      // Sign up: developers.sambanova.ai
      name: 'sambanova',
      apiKey: process.env.SAMBANOVA_API_KEY,
      baseUrl: 'https://api.sambanova.ai/v1',
      model: process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.3-70B-Instruct',
      available: !!process.env.SAMBANOVA_API_KEY,
    },
    {
      // V396: Cohere — FREE tier with 1000 calls/month.
      // V396e: Updated models — command-r-plus and command-r were REMOVED Sep 2025.
      // Current models: command-a (flagship), command-r-plus-08-2024, command-r7b.
      // Sign up: dashboard.cohere.com
      name: 'cohere',
      apiKey: process.env.COHERE_API_KEY,
      baseUrl: 'https://api.cohere.com/compatibility/v1', // V396c: OpenAI-compatible endpoint (not /v2 which returns 405)
      model: process.env.COHERE_MODEL || 'command-a', // V396e: command-r-plus REMOVED → command-a (current flagship)
      available: !!process.env.COHERE_API_KEY,
    },
    {
      // V396: Cloudflare Workers AI — FREE 10,000 neurons/day.
      // Multiple models: llama-3.3-70b, mistral-7b, qwen1.5-14b, etc.
      // Requires Cloudflare account + API token with Workers AI permission.
      // Sign up: dash.cloudflare.com
      // V398: Robust env var check — trim whitespace, log missing vars.
      name: 'cloudflare',
      apiKey: (process.env.CLOUDFLARE_API_TOKEN || '').trim() || undefined,
      baseUrl: `https://api.cloudflare.com/client/v4/accounts/${(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() || 'UNKNOWN'}/ai/v1`,
      model: (process.env.CLOUDFLARE_MODEL || '').trim() || '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      available: (() => {
        const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
        const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
        const isAvailable = !!(token && accountId);
        if (!isAvailable) {
          const missing = [];
          if (!token) missing.push('CLOUDFLARE_API_TOKEN');
          if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
          console.warn(`[AI] V398: Cloudflare NOT available — missing env var(s): ${missing.join(', ')}`);
        } else {
          console.log(`[AI] V398: Cloudflare available ✓ (account=${accountId.slice(0, 8)}..., token=${token.slice(0, 6)}...)`);
        }
        return isAvailable;
      })(),
    },
    {
      // V399: xAI Grok — Grok-3 and Grok-3 Mini models.
      // Supports multi-key rotation for multiple accounts:
      //   XAI_API_KEY=key1,key2,key3 (comma-separated)
      //   or XAI_API_KEY_1=key1, XAI_API_KEY_2=key2 (numbered)
      // Sign up: console.x.ai
      name: 'grok',
      apiKey: (() => {
        const keys = parseMultiKeys('XAI_API_KEY');
        // V399-fix: Use keys[0] instead of getRotatedKey() to avoid consuming
        // a rotation cycle at init time — grokChat() handles rotation at call time.
        return keys.length > 0 ? keys[0] : undefined;
      })(),
      baseUrl: 'https://api.x.ai/v1',
      model: process.env.XAI_MODEL || 'grok-3-mini-beta',
      available: (() => {
        const keys = parseMultiKeys('XAI_API_KEY');
        return keys.length > 0;
      })(),
    },
    {
      // V396d: SiliconFlow — FREE tier with 15 RPM.
      // DeepSeek-V3, Qwen-2.5-72B, Llama-3.3-70B — all strong multilingual models.
      // V396d: Use .com endpoint (international) — .cn rejects non-China API keys!
      // Sign up: cloud.siliconflow.com (international) or cloud.siliconflow.cn (China)
      name: 'siliconflow',
      apiKey: process.env.SILICONFLOW_API_KEY,
      baseUrl: 'https://api.siliconflow.com/v1', // V396d: .com works, .cn rejects international keys
      model: process.env.SILICONFLOW_MODEL || 'deepseek-ai/DeepSeek-V3',
      available: !!process.env.SILICONFLOW_API_KEY,
    },
    {
      // V396: DeepInfra — FREE tier with 1M tokens/day on open-source models.
      // llama-3.3-70b, mixtral-8x7b, Qwen-2.5-72B, DeepSeek-V3 — strong models, free tier.
      // OpenAI-compatible API. Good multilingual support.
      // Sign up: deepinfra.com
      name: 'deepinfra',
      apiKey: process.env.DEEPINFRA_API_KEY,
      baseUrl: 'https://api.deepinfra.com/v1/openai',
      model: process.env.DEEPINFRA_MODEL || 'Qwen/Qwen2.5-72B-Instruct', // V800: Qwen best for Arabic
      available: !!process.env.DEEPINFRA_API_KEY,
    },
    {
      // V800: Zukijourney — FREE tier, 22.5K tokens/day, OpenAI-compatible.
      // Has GPT-4o-mini, Claude-3, Gemini models — great for Arabic.
      // API key via Discord bot (/key command) → zu-... prefix
      // Rate: 12 RPM on /v1/ endpoints. IP-locked on free tier.
      // Sign up: discord.gg/zukijourney
      name: 'zukijourney',
      apiKey: process.env.ZUKIJOURNEY_API_KEY,
      baseUrl: 'https://api.zukijourney.com/v1',
      model: process.env.ZUKIJOURNEY_MODEL || 'gpt-4o-mini', // Best Arabic quality on free tier
      available: !!process.env.ZUKIJOURNEY_API_KEY,
    },
    {
      // V800: NagaAI — FREE zero-cost models, OpenAI-compatible.
      // 220+ models: GPT-4o-mini, Claude Sonnet, Gemini, etc.
      // Free tier has zero-cost model variants (:free suffix).
      // Sign up: naga.ac
      name: 'nagaai',
      apiKey: process.env.NAGAAI_API_KEY,
      baseUrl: 'https://api.naga.ac/v1',
      model: process.env.NAGAAI_MODEL || 'gpt-4o-mini', // Good Arabic, free tier
      available: !!process.env.NAGAAI_API_KEY,
    },
    {
      // V800: Acytoo — REMOVED V802. DNS does not resolve, no API key available.
      // Was dead code — provider never worked. Removed to reduce confusion.
      name: 'acytoo',
      apiKey: '',
      baseUrl: 'https://api.acytoo.com/v1',
      model: 'gpt-4o-mini',
      available: false,
    },
  ];
}

// ─── V398: Startup Diagnostics for Cloudflare ─────────────────
// Log Cloudflare env var status at module load time (server startup).
// This runs ONCE when the server starts, making it easy to spot
// missing env vars in Railway deploy logs.
(function logCloudflareStartupDiagnostics() {
  const token = (process.env.CLOUDFLARE_API_TOKEN || '').trim();
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim();
  const model = (process.env.CLOUDFLARE_MODEL || '').trim() || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

  if (token && accountId) {
    console.log(`[AI] V398-STARTUP: ✅ Cloudflare Workers AI READY — account=${accountId.slice(0, 8)}...${accountId.slice(-4)}, token=${token.slice(0, 4)}...${token.slice(-4)}, model=${model}`);
  } else {
    const missing = [];
    if (!token) missing.push('CLOUDFLARE_API_TOKEN');
    if (!accountId) missing.push('CLOUDFLARE_ACCOUNT_ID');
    console.error(`[AI] V398-STARTUP: ❌ Cloudflare Workers AI NOT READY — missing: ${missing.join(', ')}. ` +
      `Current values: CLOUDFLARE_API_TOKEN=${token ? `"${token.slice(0, 6)}..." (${token.length} chars)` : '(empty)'}, ` +
      `CLOUDFLARE_ACCOUNT_ID=${accountId ? `"${accountId.slice(0, 8)}..." (${accountId.length} chars)` : '(empty)'}`);
  }
})();

// ─── Groq Chat Completion (OpenAI-compatible) ───────────────
async function groqChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Groq API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  return {
    content,
    provider: 'groq',
    model: config.model,
    duration: Date.now() - startTime,
    tokensUsed: data.usage?.total_tokens,
    stopReason: data.choices?.[0]?.finish_reason || undefined, // V226: capture truncation signal
  };
}

// ─── Gemini Chat Completion ────────────────────────────────
// V61: Added model fallback — tries multiple Gemini models if primary fails
async function geminiChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V63→V258: Updated model fallback chain with current valid models.
  // gemini-2.5-flash-preview-05-20 was shut down Nov 2025 — removed from chain.
  // gemini-2.5-flash is the stable replacement (GA since Jun 2025).
  // gemini-2.0-flash is the reliable fallback.
  // gemini-pro removed — deprecated by Google, returns 404.
  // V258: Added gemini-2.5-flash to fallback chain for completeness.
  // V392: Updated model fallback chain — removed deprecated models that cause 404.
  // gemini-1.5-flash and gemini-1.5-flash-001 are NO LONGER AVAILABLE on v1 API.
  // They also return 404 on v1beta for generateContent (only listing works).
  // Keep the chain short to avoid wasting quota on dead models.
  const modelFallbacks = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite'];
  // Start with the configured model, then try fallbacks
  // V258: If the configured model looks like a deprecated preview, skip it
  // Aligned with DEPRECATED_PREVIEW_PATTERNS from getProviders() (6 patterns, not just 2)
  const DEPRECATED_PREVIEW_PATTERNS_IN_CHAT = [
    'preview-05-20', 'preview-04-17', 'preview-03-25', 'preview-02-05',
    'exp-01-21', 'preview-08-27',
  ];
  const isDeprecatedPreview = DEPRECATED_PREVIEW_PATTERNS_IN_CHAT.some(p => config.model.includes(p));
  const modelsToTry = isDeprecatedPreview
    ? modelFallbacks  // Skip the deprecated model entirely
    : [config.model, ...modelFallbacks.filter(m => m !== config.model)];

  // Convert messages to Gemini format
  const contents: any[] = [];
  let systemInstruction: string | undefined;

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemInstruction = msg.content;
    } else {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      });
    }
  }

  // V258: thinkingConfig is now added inside the model loop below,
  // since we need to check each model's version (2.5 vs 2.0/1.5).

  // V63: Try both API versions — v1beta first, then v1 as fallback.
  // Some models (especially stable ones like gemini-2.5-flash) work on v1,
  // while preview models only work on v1beta.
  const apiVersions = ['v1beta', 'v1'];

  // V63: Try each model × API version combination until one works
  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    for (const apiVersion of apiVersions) {
      try {
        const baseUrl = config.baseUrl.replace(/\/v1beta$/, `/${apiVersion}`).replace(/\/v1$/, `/${apiVersion}`);

        // V63→V258: Build request body per API version.
        // v1beta supports systemInstruction natively.
        // v1 may not support systemInstruction for all models — use user message fallback.
        // V258: Gemini 2.5 models have thinking mode enabled by DEFAULT.
        // Without thinkingConfig, the model uses dynamic thinking which:
        //   1. Consumes maxOutputTokens for thinking → actual content is shorter
        //   2. Returns 'thought' parts in response → parts[0].text may be thinking, not answer
        //   3. Wastes quota on reasoning we don't need for pipeline tasks
        // Fix: Set thinkingBudget=0 for 2.5 models to disable thinking.
        // Reference: https://ai.google.dev/gemini-api/docs/thinking
        const is25Model = model.startsWith('gemini-2.5');
        const generationConfig: any = {
          temperature,
          maxOutputTokens: maxTokens,
        };
        if (is25Model) {
          generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }
        const requestBody: any = {
          contents,
          generationConfig,
        };

        if (systemInstruction) {
          if (apiVersion === 'v1beta') {
            // v1beta: use native systemInstruction field
            requestBody.systemInstruction = { parts: [{ text: systemInstruction }] };
          } else {
            // v1: prepend system instruction to first user message as fallback
            // Some v1 models don't support systemInstruction field
            const modifiedContents = contents.map((c: any, i: number) => {
              if (c.role === 'user' && i === 0) {
                return {
                  role: 'user',
                  parts: [{ text: `[System Instructions: ${systemInstruction}]\n\n${c.parts[0].text}` }],
                };
              }
              return c;
            });
            requestBody.contents = modifiedContents;
          }
        }

        const response = await fetch(
          `${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            signal: AbortSignal.timeout(15000),
          }
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          // V63: If 404 with "not found for API version", try next API version
          if (response.status === 404 && errorText.includes('not found for API version')) {
            console.warn(`[AI] V63: Gemini model ${model} not found on ${apiVersion}, trying next API version...`);
            lastError = new Error(`Gemini API error (${response.status}) for model ${model} on ${apiVersion}: ${errorText.slice(0, 200)}`);
            continue; // Try next API version
          }
          // V63: If 400 with "Unknown name" about systemInstruction, try without it
          if (response.status === 400 && errorText.includes('Unknown name') && errorText.includes('system')) {
            console.warn(`[AI] V63: Gemini model ${model} on ${apiVersion} doesn't support systemInstruction, retrying without it...`);
            // Retry without systemInstruction — embed it in first user message
            try {
              const retryGenerationConfig: any = { temperature, maxOutputTokens: maxTokens };
              if (is25Model) {
                retryGenerationConfig.thinkingConfig = { thinkingBudget: 0 };
              }
              const retryBody: any = {
                contents,
                generationConfig: retryGenerationConfig,
              };
              if (systemInstruction) {
                const modifiedContents = contents.map((c: any, i: number) => {
                  if (c.role === 'user' && i === 0) {
                    return {
                      role: 'user',
                      parts: [{ text: `[System Instructions: ${systemInstruction}]\n\n${c.parts[0].text}` }],
                    };
                  }
                  return c;
                });
                retryBody.contents = modifiedContents;
              }
              const retryResponse = await fetch(
                `${baseUrl}/models/${model}:generateContent?key=${config.apiKey}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify(retryBody),
                  signal: AbortSignal.timeout(15000),
                }
              );
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                // V258: Handle thought parts in retry response too
                const retryAllParts = retryData.candidates?.[0]?.content?.parts || [];
                let retryContent = '';
                for (const part of retryAllParts) {
                  if (!part.thought && part.text) {
                    retryContent += part.text;
                  }
                }
                if (!retryContent && retryAllParts.length > 0) {
                  retryContent = retryAllParts[0].text || '';
                }
                if (retryContent) {
                  console.log(`[AI] V63→V258: Gemini model ${model} on ${apiVersion} succeeded without systemInstruction`);
                  return {
                    content: retryContent,
                    provider: 'gemini',
                    model,
                    duration: Date.now() - startTime,
                    stopReason: retryData.candidates?.[0]?.finishReason || undefined, // V226
                  };
                }
              }
            } catch (retryErr: any) {
              console.warn(`[AI] V63: Gemini retry without systemInstruction also failed: ${retryErr.message?.slice(0, 100)}`);
            }
            continue; // Try next API version
          }
          // Detect hard quota exhaustion (limit: 0) for THIS specific model
          if (response.status === 429 && errorText.includes('limit: 0')) {
            console.warn(`[AI] Gemini model ${model} has limit:0 (quota exhausted), trying next model...`);
            lastError = new Error(`Gemini API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
            break; // Skip remaining API versions, try next model
          }
          // V63c: ANY 404 or 400 means this model+version combo doesn't work — try next
          // Don't throw — just log and continue to next API version or model
          if (response.status === 404 || response.status === 400) {
            console.warn(`[AI] V63c: Gemini model ${model} on ${apiVersion} returned ${response.status}, trying next...`);
            lastError = new Error(`Gemini API error (${response.status}) for model ${model} on ${apiVersion}: ${errorText.slice(0, 200)}`);
            if (apiVersion === 'v1beta') {
              continue; // Try v1 for this model
            } else {
              break; // Both API versions tried for this model, try next model
            }
          }
          throw new Error(`Gemini API error (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        // V258: Handle Gemini 2.5 thinking mode response format.
        // When thinking is enabled (default for 2.5 models), response.parts contains
        // both 'thought' parts and regular 'text' parts. We must extract only non-thought parts.
        // Even with thinkingBudget=0, some edge cases may return thought parts — handle defensively.
        const allParts = data.candidates?.[0]?.content?.parts || [];
        let content = '';
        const thoughtParts: string[] = [];

        for (const part of allParts) {
          if (part.thought) {
            // This is a thinking/reasoning part — skip it for content, but log for debugging
            thoughtParts.push(part.text || '');
          } else if (part.text) {
            content += part.text;
          }
        }

        // Fallback: if no non-thought parts found, use first text part (backward compat)
        if (!content && allParts.length > 0) {
          content = allParts[0].text || '';
        }

        if (thoughtParts.length > 0) {
          console.log(`[AI] V258: Gemini ${model} returned ${thoughtParts.length} thought parts (skipped, ${content.length} chars content extracted)`);
        }

        if (model !== config.model || apiVersion !== 'v1beta') {
          console.log(`[AI] V63→V258: Gemini model ${model} on ${apiVersion} succeeded (primary was ${config.model} on v1beta)`);
        }

        return {
          content,
          provider: 'gemini',
          model, // Return the actual model used
          duration: Date.now() - startTime,
          stopReason: data.candidates?.[0]?.finishReason || undefined, // V226
        };
      } catch (err: any) {
        lastError = err;
        // Only continue on quota/404 errors, not on other errors
        if (!err.message?.includes('429') && !err.message?.includes('quota') && !err.message?.includes('404')) {
          break; // Skip remaining API versions, try next model
        }
        console.warn(`[AI] V63: Gemini model ${model} on ${apiVersion} failed: ${err.message?.slice(0, 100)}, trying next...`);
      }
    }
  }

  // V392: Only mark quota exhausted if the failure was actually due to rate limits/quota.
  // If all models returned 404 (deprecated/removed models), marking quota exhausted is wrong —
  // it blocks Gemini for 10 minutes even though the issue is model availability, not quota.
  const isQuotaError = lastError?.message?.includes('429') || lastError?.message?.includes('quota') || lastError?.message?.includes('RESOURCE_EXHAUSTED');
  if (isQuotaError) {
    markGeminiHardQuotaExhausted();
  } else {
    // Non-quota failure (404, 400, etc.) — don't block future calls
    console.warn(`[AI] V392: Gemini failed with non-quota error — NOT marking quota exhausted. Error: ${lastError?.message?.slice(0, 150)}`);
  }
  throw lastError || new Error('All Gemini models failed');
}

// ─── DeepSeek Chat Completion (OpenAI-compatible) ──────────
// V62: Try both base URL variants — with and without /v1
async function deepseekChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V62: Try both URL variants. Some DeepSeek accounts only work with one.
  // Primary: https://api.deepseek.com/chat/completions (official docs)
  // Fallback: https://api.deepseek.com/v1/chat/completions (some OpenAI SDKs use this)
  const baseUrls = [config.baseUrl];
  if (!config.baseUrl.endsWith('/v1')) {
    baseUrls.push(config.baseUrl + '/v1');
  } else {
    baseUrls.push(config.baseUrl.replace(/\/v1$/, ''));
  }

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // If 402 (insufficient balance) or 401 (invalid key), don't retry with different URL
        if (response.status === 402 || response.status === 401 || response.status === 403) {
          throw new Error(`DeepSeek API error (${response.status}): ${errorText}`);
        }
        // For other errors (like 404), try the next URL variant
        console.warn(`[AI] DeepSeek failed with URL ${baseUrl}: ${response.status} — trying alternative...`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (baseUrl !== config.baseUrl) {
        console.log(`[AI] V62: DeepSeek worked with alternative URL ${baseUrl} (primary was ${config.baseUrl})`);
      }

      return {
        content,
        provider: 'deepseek',
        model: config.model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined, // V226
      };
    } catch (err: any) {
      // If it's an auth/balance error, throw immediately — URL change won't help
      if (err.message?.includes('402') || err.message?.includes('401') || err.message?.includes('403')) {
        throw err;
      }
      // For other errors, try the next URL
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw err;
      console.warn(`[AI] DeepSeek URL ${baseUrl} failed: ${err.message?.slice(0, 100)} — trying alternative...`);
    }
  }

  throw new Error('DeepSeek: all URL variants failed');
}

// ─── GLM (ZhipuAI) Chat Completion (OpenAI-compatible) ──────
async function glmChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V1046: Increased timeout from 30s to 90s to support long-form generation
  // (news analysis uses maxTokens: 10000, reports use maxTokens: 8000-10000)
  const timeoutMs = maxTokens > 4000 ? 90_000 : 45_000;

  // GLM API uses OpenAI-compatible format with JWT token auth
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`GLM API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  return {
    content,
    provider: 'glm',
    model: config.model,
    duration: Date.now() - startTime,
    tokensUsed: data.usage?.total_tokens,
    stopReason: data.choices?.[0]?.finish_reason || undefined, // V226
  };
}

// ─── V72: Bedrock Client Cache ──────────────────────────────
// Creating a new BedrockRuntimeClient on every call is expensive.
// Cache the client by region to avoid repeated initialization overhead.
const bedrockClientCache = new Map<string, BedrockRuntimeClient>();

function getOrCreateBedrockClient(region: string, credentials: any): BedrockRuntimeClient {
  const cacheKey = `${region}:${credentials.accessKeyId}`;
  const cached = bedrockClientCache.get(cacheKey);
  if (cached) return cached;

  const client = new BedrockRuntimeClient({ region, credentials });
  bedrockClientCache.set(cacheKey, client);

  // V72: Prevent memory leak — limit cache size
  if (bedrockClientCache.size > 5) {
    const firstKey = bedrockClientCache.keys().next().value;
    if (firstKey) bedrockClientCache.delete(firstKey);
  }

  return client;
}

// ─── Amazon Bedrock Chat Completion ─────────────────────────
// V60 FIX: Use Converse API for cross-region inference profiles.
// InvokeModel doesn't support inference profile IDs (e.g., us.anthropic.claude-3-5-haiku-*)
// Converse API supports both base model IDs AND inference profile IDs.
// V58 FIX: Use AWS SDK instead of manual HTTP (double-encoding issue).
async function bedrockChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800,
  tools?: Record<string, any>[]
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  const region = config.extra?.region || 'us-east-1';
  const accessKey = config.apiKey!;
  const secretKey = config.extra?.secretKey!;

  // V60: Build credentials
  const credentials: any = {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  };
  const sessionToken = config.extra?.sessionToken;
  if (sessionToken) {
    credentials.sessionToken = sessionToken;
  }

  // V72: Cache the Bedrock client — creating a new one on every call is expensive
  const client = getOrCreateBedrockClient(region, credentials);

  // V60: Use Converse API — supports both base model IDs and inference profiles.
  // Cross-region inference profiles like 'us.anthropic.claude-3-5-haiku-20241022-v1:0'
  // only work with the Converse API, not InvokeModel.
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const chatMessages = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: [{ text: m.content }],
    }));

  const converseInput: any = {
    modelId: config.model,
    messages: chatMessages,
    inferenceConfig: {
      maxTokens,
      temperature,
    },
  };

  if (systemMsg) {
    converseInput.system = [{ text: systemMsg }];
  }

  // V150: Pass Anthropic built-in tools (e.g., web_search) via additionalModelRequestFields
  // Only Sonnet supports web_search — Haiku does NOT.
  if (tools && tools.length > 0) {
    converseInput.additionalModelRequestFields = {
      tools,
    };
    console.log(`[AI] V150: Bedrock Converse with ${tools.length} tool(s): ${tools.map(t => t.name || t.type).join(', ')} on model ${config.model}`);
  }

  try {
    const command = new ConverseCommand(converseInput);
    const response = await client.send(command);

    // Parse Converse API response
    let content = '';
    // V69: Check multiple response formats — Claude 4.5 Haiku may use different response structure
    if (response.output?.message?.content) {
      // Try each content block — there might be multiple (text + tool_use)
      for (const block of response.output.message.content) {
        if (block.text) {
          content += block.text;
        }
      }
    }
    
    // V69: Log if content is empty for debugging
    if (!content) {
      console.warn('[AI] V69: Bedrock Converse returned empty content. Full response keys:', JSON.stringify(Object.keys(response)));
      console.warn('[AI] V69: Output:', JSON.stringify(response.output ? Object.keys(response.output) : 'null'));
      if (response.output?.message) {
        console.warn('[AI] V69: Message:', JSON.stringify(Object.keys(response.output.message)));
        console.warn('[AI] V69: Content blocks:', response.output.message.content?.length);
        if (response.output.message.content?.[0]) {
          console.warn('[AI] V69: First block keys:', JSON.stringify(Object.keys(response.output.message.content[0])));
        }
      }
      // Check stopReason — might be content_filter or max_tokens
      console.warn('[AI] V69: Stop reason:', response.stopReason);
      console.warn('[AI] V69: Usage:', JSON.stringify(response.usage));
    }

    // V252: Daily token budget tracking removed — no longer limiting Bedrock usage

    return {
      content,
      provider: 'bedrock',
      model: config.model,
      duration: Date.now() - startTime,
      tokensUsed: response.usage?.totalTokens,
      stopReason: response.stopReason || undefined, // V226: capture truncation signal
    };
  } catch (converseErr: any) {
    // V72: FAIL FAST — do NOT try direct model ID or InvokeModel fallbacks.
    // The direct model ID (without us. prefix) ALWAYS fails with "on-demand throughput not supported"
    // for Claude 4.5 Haiku. Trying it wastes 5-15 seconds per attempt, creating a death spiral
    // when Bedrock has temporary issues. Instead, let the next AI provider (Gemini/Groq) handle it.
    const errMsg = converseErr.message || '';
    // V94: Enhanced error logging — show the FULL error message and error name
    // so we can diagnose whether it's credentials, model ID, quota, or network issue
    const errName = converseErr.name || 'Unknown';
    const errCode = (converseErr as any)?.$metadata?.httpStatusCode || 'N/A';
    const errService = (converseErr as any)?.$metadata?.service || 'bedrock';
    console.warn(`[AI] V94: Bedrock Converse FAILED — name=${errName}, httpStatus=${errCode}, model=${config.model}, region=${config.extra?.region}`);
    console.warn(`[AI] V94: Bedrock error message: ${errMsg.slice(0, 500)}`);
    // Log specific AWS error types for quick diagnosis
    if (errMsg.includes('AccessDeniedException') || errMsg.includes('UnauthorizedAccess') || errMsg.includes('InvalidSignatureException')) {
      console.error(`[AI] V94: ⛔ BEDROCK CREDENTIALS ERROR — AWS key may be invalid or lack bedrock:InvokeModel permission!`);
    } else if (errMsg.includes('on-demand throughput') || errMsg.includes('ThrottlingException')) {
      console.warn(`[AI] V94: ⚠️ BEDROCK QUOTA/THROTTLING — Cross-region inference may not be enabled, or account quota exceeded`);
    } else if (errMsg.includes('ValidationException') || errMsg.includes('model not found')) {
      console.error(`[AI] V94: ⛔ BEDROCK MODEL ERROR — Model ID "${config.model}" may be invalid or unavailable in region ${config.extra?.region}`);
    } else if (errMsg.includes('ECONNREFUSED') || errMsg.includes('ECONNRESET') || errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
      console.warn(`[AI] V94: ⚠️ BEDROCK NETWORK ERROR — Temporary connectivity issue, will retry`);
    }

    // All Bedrock attempts failed — throw immediately so fallback chain continues
    throw new Error(`Bedrock Converse failed: ${errMsg.slice(0, 150)}`);
  }
}

// ─── AWS Signature V4 Signing ──────────────────────────────
async function signAwsRequest(params: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  accessKey: string;
  secretKey: string;
  body: string;
  contentType: string;
}): Promise<Record<string, string>> {
  const { method, host, path, region, service, accessKey, secretKey, body, contentType } = params;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);

  // Hash the body
  const bodyHash = await sha256Hex(body);

  // V57 FIX: Bedrock Runtime requires x-amz-content-sha256 header.
  // Without this header, AWS returns 403 "SignatureDoesNotMatch".
  // The value must be the SHA256 hash of the request body.
  // This header must also be included in the canonical headers for signing.
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${bodyHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';

  // Canonical request
  const canonicalRequest = [
    method,
    path,
    '', // no query string
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  // Signing key
  const kDate = hmacSha256(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');

  // Signature
  const signature = hmacSha256Hex(kSigning, stringToSign);

  return {
    'Content-Type': contentType,
    'Host': host,
    'X-Amz-Content-Sha256': bodyHash,
    'X-Amz-Date': amzDate,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// HMAC-SHA256 helpers using Node.js crypto (safe for standalone)

function hmacSha256(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', typeof key === 'string' ? Buffer.from(key) : key).update(data).digest();
}

function hmacSha256Hex(key: string | Buffer, data: string): string {
  return createHmac('sha256', typeof key === 'string' ? Buffer.from(key) : key).update(data).digest('hex');
}

async function sha256Hex(data: string): Promise<string> {
  return createHash('sha256').update(data).digest('hex');
}

// ─── Ollama Node.js https fallback ────────────────────────────
// V384: When Node.js native `fetch` fails with "fetch failed" (DNS/TLS issue on Railway),
// fall back to the `https` module which handles TLS differently and may succeed.
async function ollamaHttpsRequest(
  url: string,
  apiKey: string,
  body: Record<string, any>,
  timeoutMs: number = 30000,
): Promise<{ status: number; body: string }> {
  const https = await import('https');
  const http = await import('http');
  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const mod = isHttps ? https : http;
  const postData = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = mod.request({
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json',
      },
      timeout: timeoutMs,
      // V384: Allow custom CA and rejectUnauthorized for Railway compatibility
      rejectUnauthorized: true,
    }, (res) => {
      let responseBody = '';
      res.on('data', (chunk: Buffer) => { responseBody += chunk.toString(); });
      res.on('end', () => {
        resolve({ status: res.statusCode || 0, body: responseBody });
      });
    });

    req.on('error', (e: Error) => {
      reject(new Error(`Ollama https module error: ${e.message} (code: ${(e as any).code || 'unknown'})`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Ollama https module timeout after ${timeoutMs}ms`));
    });

    req.write(postData);
    req.end();
  });
}

// ─── Ollama Chat Completion (OpenAI-compatible) ─────────────
// V394: ollama.com/v1 IS a valid cloud API (confirmed working).
// Supports both Ollama Cloud (ollama.com) and local/self-hosted instances.
// Cloud models: gemma3:12b, deepseek-v4-flash, qwen3-coder:480b, etc.
// Local models: llama3.1, llama3, mistral, etc.
// Uses Bearer token auth for cloud, no auth needed for local.
async function ollamaChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V395: Detect endpoint type (cloud vs local)
  const isOllamaCloud = config.baseUrl.includes('ollama.com');
  const isLocalOllama = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1');
  const isRailway = !!(process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN);

  // V395: Cloud models — confirmed available on ollama.com
  const ollamaCloudModels = [
    'gemma3:12b',          // Primary — free tier, fast + capable
    'gemma3:4b',           // Smallest/fastest — free
    'gemma3:27b',          // Better quality, still free
    'deepseek-v4-flash',   // DeepSeek fast variant
    'glm-4.7',             // Good multilingual
    'qwen3-coder:480b',    // Powerful code model
    'gpt-oss:120b',        // Large model
    config.model,          // User-configured model
  ].filter((m, i, arr) => arr.indexOf(m) === i); // Deduplicate

  // V395: Local models
  const localOllamaModels = [config.model, 'llama3.1', 'llama3', 'mistral'];

  // V395: Build endpoint list — prioritize ollama.com cloud when API key exists
  // On Railway, localhost is NEVER reachable, so don't add it as fallback.
  const endpoints: string[] = [];
  const hasApiKey = config.apiKey && config.apiKey !== 'ollama';

  if (hasApiKey && !config.baseUrl?.includes('ollama.com')) {
    // V395: API key exists but baseUrl is not ollama.com → try ollama.com FIRST (cloud is more reliable)
    endpoints.push('https://ollama.com/v1');
  }
  if (config.baseUrl) {
    endpoints.push(config.baseUrl);
  }
  if (!config.baseUrl?.includes('ollama.com') && !hasApiKey) {
    // No API key → only option is local Ollama (no cloud access without key)
    // Already added via config.baseUrl above, but add as explicit fallback
  }
  // V395: On Railway, NEVER add localhost — it's never reachable
  if (!isRailway && !config.baseUrl?.includes('localhost') && !config.baseUrl?.includes('127.0.0.1')) {
    endpoints.push('http://localhost:11434/v1');  // Local Ollama as last fallback (non-Railway only)
  }

  // V394: Choose model list based on endpoint type
  const modelsForEndpoint = (endpoint: string): string[] => {
    if (endpoint.includes('ollama.com')) return ollamaCloudModels;
    return localOllamaModels;
  };

  // V384: Try a single model+endpoint combination with fetch first, then https fallback
  const tryOllamaRequest = async (endpoint: string, model: string): Promise<ChatCompletionResult> => {
    const requestUrl = `${endpoint}/chat/completions`;
    const requestBody = { model, messages, temperature, max_tokens: maxTokens };
    const authKey = config.apiKey || 'ollama';

    // Method 1: Node.js native fetch (preferred)
    try {
      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 401) {
          // 401 = invalid API key — no model will work with this key
          throw Object.assign(new Error(`Ollama auth error (401): ${errorText.slice(0, 150)}`), { authError: true });
        }
        if (response.status === 403) {
          // V384: 403 = model requires subscription — THIS specific model won't work,
          // but other models on the free tier might. Don't break the loop — continue.
          console.warn(`[AI] V384: Ollama model ${model} requires subscription (403) — trying next model`);
          throw Object.assign(new Error(`Ollama subscription required (403) for ${model}`), { subscriptionError: true });
        }
        if (response.status === 404) {
          throw Object.assign(new Error(`Ollama model ${model} not found (404)`), { notFoundError: true });
        }
        if (response.status === 429) {
          // V394: 429 = rate limit or weekly quota exceeded — try next model
          console.warn(`[AI] V394: Ollama model ${model} rate limited (429) — trying next model`);
          throw Object.assign(new Error(`Ollama rate limit (429) for ${model}: ${errorText.slice(0, 100)}`), { rateLimitError: true });
        }
        throw new Error(`Ollama API error (${response.status}): ${errorText.slice(0, 150)}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || data.message?.content || '';
      if (content) {
        const endpointLabel = endpoint.includes('ollama.com') ? 'Ollama Cloud' : endpoint;
        console.log(`[AI] V384: Ollama succeeded via fetch ${endpointLabel} model ${model} (${Date.now() - startTime}ms)`);
        return { content, provider: 'ollama', model, duration: Date.now() - startTime, stopReason: data.choices?.[0]?.finish_reason || undefined };
      }
      throw new Error('Ollama returned empty content');
    } catch (fetchErr: any) {
      // If it's an auth or 404 or subscription error, don't retry with https — propagate immediately
      if (fetchErr.authError || fetchErr.notFoundError || fetchErr.subscriptionError) throw fetchErr;

      // V384: "fetch failed" typically means DNS/TLS issue on Railway — try https module fallback
      const isFetchFailed = fetchErr.message?.includes('fetch failed') || fetchErr.name === 'TypeError';
      if (!isFetchFailed) throw fetchErr;

      console.warn(`[AI] V384: Ollama fetch() failed (${fetchErr.message?.slice(0, 60)}), trying https module fallback for ${endpoint}...`);

      // Method 2: Node.js https module fallback
      const httpsResult = await ollamaHttpsRequest(requestUrl, authKey, requestBody, 30000);

      if (httpsResult.status === 401) {
        throw Object.assign(new Error(`Ollama auth error (401): ${httpsResult.body.slice(0, 150)}`), { authError: true });
      }
      if (httpsResult.status === 403) {
        console.warn(`[AI] V384: Ollama model ${model} requires subscription (403) via https — trying next model`);
        throw Object.assign(new Error(`Ollama subscription required (403) for ${model}`), { subscriptionError: true });
      }
      if (httpsResult.status === 404) {
        throw Object.assign(new Error(`Ollama model ${model} not found (404)`), { notFoundError: true });
      }
      if (httpsResult.status === 429) {
        // V394: 429 = rate limit or weekly quota exceeded — try next model
        console.warn(`[AI] V394: Ollama model ${model} rate limited (429) via https — trying next model`);
        throw Object.assign(new Error(`Ollama rate limit (429) for ${model}: ${httpsResult.body.slice(0, 100)}`), { rateLimitError: true });
      }
      if (httpsResult.status !== 200) {
        throw new Error(`Ollama https fallback error (${httpsResult.status}): ${httpsResult.body.slice(0, 150)}`);
      }

      let data: any;
      try { data = JSON.parse(httpsResult.body); } catch { throw new Error('Ollama https: invalid JSON response'); }

      const content = data.choices?.[0]?.message?.content || data.message?.content || '';
      if (content) {
        const endpointLabel = endpoint.includes('ollama.com') ? 'Ollama Cloud' : endpoint;
        console.log(`[AI] V384: Ollama succeeded via https fallback ${endpointLabel} model ${model} (${Date.now() - startTime}ms)`);
        return { content, provider: 'ollama', model, duration: Date.now() - startTime, stopReason: data.choices?.[0]?.finish_reason || undefined };
      }
      throw new Error('Ollama https returned empty content');
    }
  };

  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    const models = modelsForEndpoint(endpoint);
    let endpointDead = false; // V395: Skip entire endpoint on ECONNREFUSED
    for (const model of models) {
      if (endpointDead) break; // V395: Don't waste time on dead endpoint
      try {
        return await tryOllamaRequest(endpoint, model);
      } catch (err: any) {
        lastError = err;
        // Auth error (invalid API key) — skip remaining models for this endpoint (no model will work)
        if (err.authError) {
          console.warn(`[AI] V395: Ollama auth error at ${endpoint}: ${err.message?.slice(0, 100)}`);
          endpointDead = true;
          break; // Break model loop
        }
        // Subscription error, not-found, or rate limit — continue to next model
        if (err.subscriptionError || err.notFoundError || err.rateLimitError) {
          console.warn(`[AI] V395: Ollama model ${model} unavailable — trying next model`);
          continue; // V395: Try next model (not break)
        }
        // V395: ECONNREFUSED = endpoint is completely dead — skip ALL models for this endpoint
        // Previously wasted 4 models × 2 retries × 2 methods = ~16 attempts on a dead localhost
        if (err.message?.includes('ECONNREFUSED')) {
          console.warn(`[AI] V395: Ollama endpoint ${endpoint} is unreachable (ECONNREFUSED) — skipping entire endpoint`);
          endpointDead = true;
          break;
        }
        // V395: Other transient errors — don't retry, just skip to next model
        console.warn(`[AI] V395: Ollama endpoint ${endpoint} model ${model} failed: ${err.message?.slice(0, 80)}`);
        continue; // Try next model
      }
    }
  }

  throw lastError || new Error('Ollama: all endpoints and models failed');
}

// ─── HuggingFace Chat Completion ────────────────────────────
async function hfChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V58 FIX: Use the top-level OpenAI-compatible endpoint on HuggingFace router.
  // The model name (with :provider suffix) goes in the request body, not in the URL path.
  // Endpoint: router.huggingface.co/v1/chat/completions with model in body
  // The :provider suffix (e.g., :novita) routes to the correct inference provider.
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HuggingFace API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  if (!content) {
    throw new Error('HuggingFace API returned empty content');
  }

  return {
    content,
    provider: 'hf',
    model: config.model,
    duration: Date.now() - startTime,
  };
}

// ─── Cerebras Chat Completion (OpenAI-compatible) ───────────
// V65: Cerebras provides ultra-fast inference using custom CS-3 silicon.
// API is OpenAI-compatible: same format as Groq but with Cerebras hardware.
// Models: llama-3.3-70b (best Arabic quality), llama3.1-8b (fastest)
async function cerebrasChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V395→V396: Updated Cerebras model fallback chain.
  // Old models (llama-3.3-70b, llama3.1-8b) were removed from Cerebras — all return 404.
  // Current models (as of 2026-06): gpt-oss-120b (best), qwen-3-235b-a22b-instruct-2507, zai-glm-4.7
  const modelsToTry = ['gpt-oss-120b', 'qwen-3-235b-a22b-instruct-2507', 'zai-glm-4.7'];

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // If model not found (404), try next model
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V65: Cerebras model ${model} not available, trying next...`);
          lastError = new Error(`Cerebras API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Cerebras API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V65: Cerebras fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'cerebras',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined, // V226
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break; // Don't retry on auth/network errors
      }
    }
  }

  throw lastError || new Error('All Cerebras models failed');
}

// ─── Mistral Chat Completion (OpenAI-compatible) ───────────
// V65: Mistral provides good multilingual support including Arabic.
// Models: mistral-small-latest (fast, good quality), open-mistral-nemo (free)
async function mistralChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V65: Try model fallback chain — small-latest first, then nemo as fallback
  const modelsToTry = config.model === 'mistral-small-latest'
    ? ['mistral-small-latest', 'open-mistral-nemo']
    : [config.model, 'mistral-small-latest', 'open-mistral-nemo'];

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // V395: 401 = auth error (invalid key) — don't waste time trying other models
        if (response.status === 401) {
          console.warn(`[AI] V395: Mistral API key is invalid or expired (401). Set MISTRAL_API_KEY to a valid key.`);
          throw Object.assign(new Error(`Mistral auth error (401): ${errorText.slice(0, 150)}`), { authError: true });
        }
        // If model not found, try next model
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V65: Mistral model ${model} not available, trying next...`);
          lastError = new Error(`Mistral API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Mistral API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V65: Mistral fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'mistral',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined, // V226
      };
    } catch (err: any) {
      lastError = err;
      // V395: Don't retry on auth errors (401) — key is invalid, no point trying other models
      if (err.authError) throw err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Mistral models failed');
}

// ─── NVIDIA NIM Chat Completion (OpenAI-compatible) ────────
// V65: NVIDIA NIM provides Llama models via their inference API.
// Models: meta/llama-3.1-8b-instruct (default), nvidia/llama-3.1-nemotron-70b-instruct
async function nvidiaChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V65: Try model fallback chain
  const modelsToTry = [config.model, 'meta/llama-3.1-8b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct']
    .filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // If model not found, try next model
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V65: NVIDIA model ${model} not available, trying next...`);
          lastError = new Error(`NVIDIA API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`NVIDIA API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V65: NVIDIA fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'nvidia',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined, // V226
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All NVIDIA models failed');
}

// ─── OpenRouter Chat Completion (OpenAI-compatible) ──────────
// V386: OpenRouter is a unified API gateway to 200+ models.
// It uses the OpenAI-compatible API format with extra headers for identification.
// Supports model fallback — if the primary model fails, tries cheaper alternatives.
async function openrouterChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V395: COMPLETELY REDESIGNED model fallback chain.
  // Problem: ALL paid models return 402 (no credits left on account).
  // Old chain tried 4 paid models first → each wastes 1-2s on 402 → 4-8s wasted before reaching free models.
  // Fix: Try ONLY free models since paid credits are exhausted.
  // If credits are restored, add paid models back at the top.
  //
  // V395: Fixed 429 rate limit handling — when a free model hits rate limit,
  // try the NEXT free model instead of failing the entire OpenRouter provider.
  // Per-MINUTE limits are per-model, so when hermes:free is rate-limited, nemotron:free might still work.
  // Per-DAY limit (50 total) is global across all free models.
  //
  // Current verified FREE models (verified 2026-06-11, 22 total):
  //   1. nvidia/nemotron-3-super-120b-a12b:free — 120B, 1M context, best quality/availability
  //   2. nvidia/nemotron-3-ultra-550b-a55b:free — 550B, 1M context, massive model
  //   3. meta-llama/llama-3.3-70b-instruct:free — 70B, strong multilingual, good Arabic
  //   4. qwen/qwen3-coder:free — excellent Arabic, 1M context, 262K max output
  //   5. openai/gpt-oss-120b:free — 120B, 131K context
  //   6. google/gemma-4-31b-it:free — 31B, 262K context, good multilingual
  //   7. qwen/qwen3-next-80b-a3b-instruct:free — 80B, 262K context
  //   8. nousresearch/hermes-3-llama-3.1-405b:free — 405B, often rate-limited
  //   9. google/gemma-4-26b-a4b-it:free — 26B, 262K context
  //  10. nvidia/nemotron-3-nano-30b-a3b:free — 30B, 256K context
  //
  // Paid models (currently all 402 — skipped to save time):
  //   anthropic/claude-3.5-haiku, deepseek/deepseek-chat-v3-0324, etc.
  const modelsToTry = [
    // V395: FREE models only — paid models all return 402 (no credits)
    // OpenRouter rate limits for free tier:
    //   - 50 requests/day total across ALL free models (global, NOT per-model)
    //   - Per-minute limits are per-model (so rotation helps with burst rate limits)
    //   - With $10 credits: 1000 requests/day
    // V395: When one model hits 429 (per-minute limit), try the next model.
    // Models ordered by availability + quality:
    'openai/gpt-oss-120b:free',                 // FREE — 120B, highest availability right now
    'nvidia/nemotron-3-super-120b-a12b:free',   // FREE — 120B, 1M context, best quality
    'nvidia/nemotron-3-ultra-550b-a55b:free',   // FREE — 550B, 1M context, massive model
    'meta-llama/llama-3.3-70b-instruct:free',   // FREE — 70B, strong Arabic/multilingual
    'qwen/qwen3-coder:free',                     // FREE — excellent Arabic, 1M context
    'qwen/qwen3-next-80b-a3b-instruct:free',     // FREE — 80B, efficient MoE
    'google/gemma-4-31b-it:free',                // FREE — 31B, good multilingual
    'google/gemma-4-26b-a4b-it:free',            // FREE — 26B, efficient
    'nousresearch/hermes-3-llama-3.1-405b:free', // FREE — 405B, often rate-limited
    'nvidia/nemotron-3-nano-30b-a3b:free',       // FREE — 30B, fast
    'openai/gpt-oss-20b:free',                   // FREE — 20B, fast fallback
    'meta-llama/llama-3.2-3b-instruct:free',    // FREE — 3B, last resort
  ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      // V386: OpenRouter requires specific headers for app identification.
      // See: https://openrouter.ai/docs/api-reference/overview
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      };
      // Optional: App identification headers (for rankings on openrouter.ai)
      if (config.extra?.siteUrl) {
        headers['HTTP-Referer'] = config.extra.siteUrl;
      }
      if (config.extra?.siteName) {
        headers['X-Title'] = config.extra.siteName;
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(60000), // V386: 60s — OpenRouter can route to slower models
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        // If model not found or insufficient credits, try next model (including free ones)
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V387: OpenRouter model ${model} not available, trying next...`);
          lastError = new Error(`OpenRouter API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        // V387: 402 = insufficient credits — fall through to FREE models
        if (response.status === 402) {
          console.warn(`[AI] V387: OpenRouter model ${model} requires more credits (402), trying next model...`);
          lastError = new Error(`OpenRouter 402 insufficient credits for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        // V391: Rate limit — try next model instead of failing entire provider.
        // Free models on OpenRouter have per-model rate limits, not global.
        // When one free model is rate-limited, another might still work.
        if (response.status === 429) {
          console.warn(`[AI] V391: OpenRouter model ${model} rate limited (429), trying next free model...`);
          lastError = new Error(`OpenRouter rate limited (429) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;  // Try next model instead of failing entire provider
        }
        throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V386: OpenRouter fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'openrouter',
        model: data.model || model, // OpenRouter returns the actual model used
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined, // V226
      };
    } catch (err: any) {
      lastError = err;
      // V391: Continue on model-not-found, insufficient-credits, OR rate-limit errors (try next model)
      // Previously, rate-limit (429) broke out of the loop — now we try the next free model
      if (!err.message?.includes('404') && !err.message?.includes('400') && !err.message?.includes('402')
          && !err.message?.includes('429') && !err.message?.includes('model') && !err.message?.includes('credits')
          && !err.message?.includes('rate limit') && !err.message?.includes('Rate limit')) {
        break;
      }
    }
  }

  // V391: Trip circuit breaker when ALL models fail — prevents death spiral
  tripOpenrouterCircuit();
  throw lastError || new Error('All OpenRouter models failed');
}

// ─── SambaNova Chat Completion (OpenAI-compatible) ─────────
// V396: SambaNova provides FREE ultra-fast inference on custom SN40L silicon.
// Models: Meta-Llama-3.3-70B-Instruct (best), DeepSeek-R1, Qwen-2.5-72B.
// All FREE for developers — no rate limit concerns for news pipeline volumes.
// Sign up: developers.sambanova.ai
async function sambanovaChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V396: Model fallback chain — 70B primary, then alternatives
  const modelsToTry = [
    config.model,
    'Meta-Llama-3.3-70B-Instruct',
    'DeepSeek-R1',
    'Qwen2.5-72B-Instruct',
  ].filter((m, i, arr) => arr.indexOf(m) === i); // deduplicate

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V396: SambaNova model ${model} not available, trying next...`);
          lastError = new Error(`SambaNova API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`SambaNova API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V396: SambaNova fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'sambanova',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All SambaNova models failed');
}

// ─── Cohere Chat Completion ────────────────────────────────
// V396c: Cohere OpenAI-compatible endpoint.
// Official endpoint: https://api.cohere.com/compatibility/v1/chat/completions
// Supports command-r-plus (68B), command-r, command-r7b — all good multilingual.
// Sign up: console.cohere.com
async function cohereChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V396e: Updated model chain — command-r-plus and command-r were REMOVED Sep 2025.
  // Current models: command-a (flagship), command-r-plus-08-2024, command-r7b.
  const modelsToTry = [config.model, 'command-a', 'command-r-plus-08-2024', 'command-r7b'].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V396c: Cohere model ${model} not available, trying next...`);
          lastError = new Error(`Cohere API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Cohere API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V396c: Cohere fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'cohere',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Cohere models failed');
}

// ─── Cloudflare Workers AI Chat Completion ──────────────────
// V396: Cloudflare Workers AI — FREE 10,000 neurons/day.
// Uses OpenAI-compatible endpoint under the Cloudflare API.
// Requires CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN.
// Sign up: dash.cloudflare.com → Workers AI
async function cloudflareChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // Cloudflare Workers AI uses OpenAI-compatible format
  const modelsToTry = [
    config.model,
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-3.1-8b-instruct',
    '@cf/mistral/mistral-7b-instruct',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V396: Cloudflare model ${model} not available, trying next...`);
          lastError = new Error(`Cloudflare API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Cloudflare API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V396: Cloudflare fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'cloudflare',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Cloudflare models failed');
}

// ─── xAI Grok Chat Completion (V399) ───────────────────────
// Grok-3 and Grok-3 Mini models via xAI API.
// Supports multi-key rotation for multiple accounts.
// Sign up: console.x.ai
async function grokChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // V399: Multi-key rotation — get next key for this call
  const keys = parseMultiKeys('XAI_API_KEY');
  const apiKey = getRotatedKey('grok', keys) || config.apiKey;

  // Models to try: configured model first, then fallbacks
  const modelsToTry = [
    config.model,
    'grok-3-mini-beta',
    'grok-2-1212',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(45000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V399: Grok model ${model} not available, trying next...`);
          lastError = new Error(`Grok API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        // Rate limit — try next key if available
        if (response.status === 429 && keys.length > 1) {
          console.warn(`[AI] V399: Grok key rate-limited, rotating to next key...`);
          const nextKey = getRotatedKey('grok', keys);
          if (nextKey && nextKey !== apiKey) {
            // Retry with next key
            const retryResponse = await fetch(`${config.baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${nextKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens: maxTokens,
              }),
              signal: AbortSignal.timeout(45000),
            });
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              const retryContent = retryData.choices?.[0]?.message?.content || '';
              return {
                content: retryContent,
                provider: 'grok',
                model,
                duration: Date.now() - startTime,
                tokensUsed: retryData.usage?.total_tokens,
                stopReason: retryData.choices?.[0]?.finish_reason || undefined,
              };
            }
          }
        }
        throw new Error(`Grok API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V399: Grok fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'grok',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Grok models failed');
}

// ─── SiliconFlow Chat Completion (OpenAI-compatible) ───────
// V396: SiliconFlow — FREE tier (15 RPM), strong multilingual models.
// DeepSeek-V3, Qwen-2.5-72B, Llama-3.3-70B — excellent for Chinese/English/Arabic.
// Sign up: siliconflow.cn
async function siliconflowChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  const modelsToTry = [
    config.model,
    'deepseek-ai/DeepSeek-V3',
    'Qwen/Qwen2.5-72B-Instruct',
    'meta-llama/Llama-3.3-70B-Instruct',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V396: SiliconFlow model ${model} not available, trying next...`);
          lastError = new Error(`SiliconFlow API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`SiliconFlow API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V396: SiliconFlow fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'siliconflow',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All SiliconFlow models failed');
}

// ─── DeepInfra Chat Completion (OpenAI-compatible) ─────────
// V396: DeepInfra — FREE tier (100 requests/hour).
// Llama-3.3-70B, Mixtral-8x7B, Qwen-2.5-72B — strong multilingual models.
// Sign up: deepinfra.com
async function deepinfraChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  const modelsToTry = [
    config.model,
    'meta-llama/Llama-3.3-70B-Instruct',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-72B-Instruct',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || (response.status === 400 && errorText.includes('model'))) {
          console.warn(`[AI] V396: DeepInfra model ${model} not available, trying next...`);
          lastError = new Error(`DeepInfra API error (${response.status}) for model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`DeepInfra API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V396: DeepInfra fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'deepinfra',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('model')) {
        break;
      }
    }
  }

  throw lastError || new Error('All DeepInfra models failed');
}

// ─── V800: Zukijourney Chat Completion (OpenAI-compatible) ──────
// Free tier: 22.5K tokens/day, 12 RPM. Has GPT-4o-mini, Claude, Gemini.
// API key format: zu-... (obtained via Discord bot)
async function zukijourneyChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // Model fallback chain — best Arabic quality first
  const modelsToTry = [
    config.model,
    'gpt-4o-mini',
    'claude-3-haiku-20240307',
    'gemini-pro',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || response.status === 400) {
          console.warn(`[AI] V800: Zukijourney model ${model} not available, trying next...`);
          lastError = new Error(`Zukijourney (${response.status}) model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Zukijourney API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V800: Zukijourney fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'zukijourney',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('400')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Zukijourney models failed');
}

// ─── V800: NagaAI Chat Completion (OpenAI-compatible) ──────────
// Free tier: zero-cost model variants. 220+ models including GPT-4o-mini, Claude.
// API key from dashboard at naga.ac
async function nagaaiChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // Model fallback chain — try free variants first, then standard
  const modelsToTry = [
    config.model,
    'gpt-4o-mini',
    'claude-3-haiku-20240307',
    'google/gemini-2.0-flash-exp:free',
    'meta-llama/llama-3.3-70b-instruct:free',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || response.status === 400 || response.status === 402) {
          console.warn(`[AI] V800: NagaAI model ${model} not available (${response.status}), trying next...`);
          lastError = new Error(`NagaAI (${response.status}) model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`NagaAI API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V800: NagaAI fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'nagaai',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('400') && !err.message?.includes('402')) {
        break;
      }
    }
  }

  throw lastError || new Error('All NagaAI models failed');
}

// ─── V800: Acytoo Chat Completion (OpenAI-compatible) ──────────
// Free tier: ~100 requests/day, no API key needed for basic models.
// Has GPT-4o-mini, GPT-3.5-turbo, and other models.
async function acytooChat(
  messages: ChatMessage[],
  config: ProviderConfig,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<ChatCompletionResult> {
  const startTime = Date.now();

  // Model fallback chain — try free variants first
  const modelsToTry = [
    config.model,
    'gpt-4o-mini',
    'gpt-3.5-turbo',
  ].filter((m, i, arr) => arr.indexOf(m) === i);

  let lastError: Error | null = null;
  for (const model of modelsToTry) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      // Only add auth header if we have a real API key (not the free placeholder)
      if (config.apiKey && config.apiKey !== 'acytoo-free') {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        if (response.status === 404 || response.status === 400 || response.status === 402) {
          console.warn(`[AI] V800: Acytoo model ${model} not available (${response.status}), trying next...`);
          lastError = new Error(`Acytoo (${response.status}) model ${model}: ${errorText.slice(0, 200)}`);
          continue;
        }
        throw new Error(`Acytoo API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';

      if (model !== config.model) {
        console.log(`[AI] V800: Acytoo fell back to model ${model} (primary was ${config.model})`);
      }

      return {
        content,
        provider: 'acytoo',
        model,
        duration: Date.now() - startTime,
        tokensUsed: data.usage?.total_tokens,
        stopReason: data.choices?.[0]?.finish_reason || undefined,
      };
    } catch (err: any) {
      lastError = err;
      if (!err.message?.includes('404') && !err.message?.includes('400') && !err.message?.includes('402')) {
        break;
      }
    }
  }

  throw lastError || new Error('All Acytoo models failed');
}

// ─── Server-Side Rate Limiter ───────────────────────────────
// Tracks AI calls per provider to prevent rate limit exhaustion.
// Article generation gets higher priority than translations.
const aiCallTimestamps: Map<string, number[]> = new Map();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute window
// V392: Dynamic Gemini RPM — paid tier gets much higher rate limit
function getGeminiRpmLimit(): number {
  if (getGeminiTier() === 'paid') return 500; // Paid tier: 2000+ RPM allowed, use 500 for safety
  return 28; // Free tier: 15 RPM actual, buffer at 28 (with per-second pacing)
}
const MAX_CALLS_PER_MINUTE: Record<string, number> = {
  groq: 28,       // Groq free tier: 30 RPM, small buffer
  grok: 30,       // xAI Grok — generous rate limit
  gemini: 28,     // Base limit — overridden dynamically by getGeminiRpmLimit()
  cerebras: 30,   // V65: Cerebras free tier: generous RPM
  mistral: 25,    // V65: Mistral free tier
  nvidia: 15,     // V65: NVIDIA NIM free tier
  deepseek: 25,      // V56: DeepSeek — generous rate limit
  glm: 30,        // GLM generous limit — increased from 25
  bedrock: 30,
  ollama: 60,
  hf: 10,         // HF free tier — slightly increased
  'z-ai-sdk': 25, // Increased from 20
  openrouter: 30,    // V386: OpenRouter — generous rate limit
  sambanova: 25,     // V396: SambaNova — generous free tier for developers
  cohere: 10,        // V396: Cohere — 1000/month total, conserve calls
  cloudflare: 20,    // V396: Cloudflare Workers AI — 10K neurons/day
  siliconflow: 14,   // V396: SiliconFlow — 15 RPM free tier
  deepinfra: 25,     // V396: DeepInfra — 100/hour free tier
  zukijourney: 10,   // V800: Zukijourney — 12 RPM free tier, buffer at 10
  nagaai: 20,        // V800: NagaAI — generous free tier
  acytoo: 15,        // V800: Acytoo — ~100 req/day, buffer at 15 RPM
};
const GENERATION_MIN_INTERVAL = 1500; // 1.5s minimum between generation calls

function cleanOldTimestamps(provider: string): void {
  const now = Date.now();
  const timestamps = aiCallTimestamps.get(provider) || [];
  const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  aiCallTimestamps.set(provider, recent);
}

function getCallCount(provider: string): number {
  cleanOldTimestamps(provider);
  return (aiCallTimestamps.get(provider) || []).length;
}

function recordCall(provider: string): void {
  const timestamps = aiCallTimestamps.get(provider) || [];
  timestamps.push(Date.now());
  aiCallTimestamps.set(provider, timestamps);
  // Track Gemini daily quota
  if (provider === 'gemini') {
    recordGeminiDailyCall();
  }
}

function isProviderAvailable(provider: string): boolean {
  const count = getCallCount(provider);
  // V392: Use dynamic limit for Gemini (paid vs free tier)
  const limit = provider === 'gemini' ? getGeminiRpmLimit() : (MAX_CALLS_PER_MINUTE[provider] || 20);
  return count < limit;
}

// Wait until a provider slot becomes available (with timeout)
async function waitForProviderSlot(provider: string, maxWaitMs: number = 5000): Promise<boolean> {
  const start = Date.now();
  while (!isProviderAvailable(provider)) {
    if (Date.now() - start > maxWaitMs) return false;
    await new Promise(r => setTimeout(r, 500));
  }
  return true;
}

// ─── Main Chat Completion Function ─────────────────────────
// Automatically selects the first available provider with fallback
// Includes retry logic with exponential backoff for rate limit errors (429)
// Supports priority: 'generation' calls get higher priority than 'translation'
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    provider?: AIProvider;
    maxRetries?: number;  // Max retry attempts for rate-limited requests
    priority?: 'generation' | 'translation'; // Priority level for rate limiting
    tools?: Record<string, any>[]; // V150: Anthropic built-in tools (e.g., web_search)
    bedrockModelOverride?: string; // V150: Override Bedrock model (e.g., Sonnet for web_search)
    allowFallback?: boolean; // V315: true = English/French pipeline (Groq/Cerebras/Mistral/NVIDIA), false = Arabic pipeline (Bedrock/Gemini only)
    locale?: 'ar' | 'en' | 'fr' | 'tr' | 'es'; // V352: Pipeline locale — 'fr'/'tr'/'es' uses Mistral-first + Bedrock fallback
  }
): Promise<ChatCompletionResult> {
  const { temperature = 0.3, maxTokens = 800, provider: preferredProvider, maxRetries = 2, priority = 'translation', tools, bedrockModelOverride, allowFallback = false, locale } = options || {};

  // V387: ALL locales now use OpenRouter (Haiku) as #1 choice.
  // The OpenRouter API key provides access to 200+ models.
  // Haiku (anthropic/claude-3.5-haiku) is the primary model — best quality/cost ratio.
  // If Haiku fails within OpenRouter, it automatically falls back to the next model
  // within the same key (see openrouterChat() model fallback chain).
  // Only if ALL OpenRouter models fail do we fall through to other providers.
  if (locale === 'ar' || locale === 'en' || locale === 'fr' || locale === 'tr' || locale === 'es') {
    const LOCALE_LABEL = locale === 'ar' ? 'Arabic' : locale === 'en' ? 'English' : locale === 'fr' ? 'French' : locale === 'tr' ? 'Turkish' : 'Spanish';
    // V390: When bedrockModelOverride is set (e.g., strategic reports requesting Sonnet),
    // Bedrock MUST come first — the override is meaningless for OpenRouter/Groq/etc.
    // Without this, strategic reports would use OpenRouter Haiku instead of Bedrock Sonnet,
    // producing low-quality or empty content for the 10K-token report generation.
    const bedrockFirst = !!bedrockModelOverride && locale === 'ar';
    // V399: Cloudflare REMOVED from text/chat pipeline — it's now IMAGE-ONLY.
    // Cloudflare Workers AI is reserved exclusively for image generation (SDXL).
    // Text/chat now uses OpenRouter as #1 for all locales.
    const LOCALE_PREFERRED: AIProvider[] = locale === 'ar'
      ? (bedrockFirst
        ? ['bedrock', 'openrouter', 'grok', 'glm', 'gemini'] // V1046: added GLM after Grok
        : ['openrouter', 'grok', 'glm', 'bedrock', 'gemini']) // V1046: GLM as #3 for Arabic
      : locale === 'en'
      ? ['openrouter', 'grok', 'glm', 'sambanova', 'groq', 'cerebras', 'siliconflow', 'deepinfra', 'mistral', 'cohere', 'nvidia', 'ollama'] // V1046: GLM as #3
      : locale === 'tr'
      ? ['openrouter', 'grok', 'glm', 'sambanova', 'groq', 'cerebras', 'siliconflow', 'deepinfra', 'mistral', 'cohere', 'nvidia', 'ollama'] // V1046: GLM as #3
      : ['openrouter', 'grok', 'glm', 'sambanova', 'mistral', 'cohere', 'groq', 'cerebras', 'siliconflow', 'deepinfra', 'nvidia', 'ollama']; // V1046: GLM as #3 for French/Spanish
    const LOCALE_FALLBACK: AIProvider[] = locale === 'ar' ? ['z-ai-sdk'] : ['bedrock', 'gemini', 'z-ai-sdk']; // V397: z-ai-sdk as final fallback
    const firstProvider = bedrockFirst ? `Bedrock/${bedrockModelOverride?.split('.').pop()}` : 'OpenRouter';
    console.log(`[AI] V399: ${LOCALE_LABEL} pipeline — ${firstProvider} first, then ${LOCALE_PREFERRED.slice(1).join('/')}${LOCALE_FALLBACK.length ? `, final fallback: ${LOCALE_FALLBACK.join('/')}` : ''}`);
    const freshProviders = getProviders();
    const errors: string[] = [];

    // Phase 1: Try preferred providers (OpenRouter first, then locale-specific)
    for (const providerName of LOCALE_PREFERRED) {
      let provider = freshProviders.find(p => p.name === providerName);
      if (!provider || !provider.available) {
        console.log(`[AI] V399: ${providerName} not available — skipping`);
        continue;
      }
      // V390: Apply bedrockModelOverride to Bedrock provider in locale path.
      // This was MISSING — when strategic reports request Sonnet via bedrockModelOverride,
      // the override was ignored because the locale path didn't apply it.
      // This caused strategic reports to use Haiku (OpenRouter default) instead of Sonnet,
      // producing low-quality or empty reports.
      if (providerName === 'bedrock' && bedrockModelOverride) {
        provider = { ...provider, model: bedrockModelOverride };
        console.log(`[AI] V390: Applying bedrockModelOverride in locale path: ${bedrockModelOverride}`);
      }
      try {
        if (priority === 'generation') await waitForProviderSlot(providerName, 5000);
        const result = await callProviderWithRetry(provider, messages, temperature, maxTokens, 1);
        recordCall(providerName);
        console.log(`[AI] V387: ✓ ${providerName} succeeded — ${LOCALE_LABEL} content generated`);
        return result;
      } catch (err: any) {
        console.warn(`[AI] V387: ${providerName} failed: ${err.message?.slice(0, 100)}`);
        errors.push(`${providerName}: ${err.message?.slice(0, 80)}`);
      }
    }

    // Phase 2: Fall back to Bedrock → Gemini (only for non-Arabic locales)
    if (LOCALE_FALLBACK.length > 0) {
      console.warn(`[AI] V387: All ${LOCALE_LABEL}-preferred providers failed. Falling back to Bedrock/Gemini...`);
      for (const providerName of LOCALE_FALLBACK) {
        let provider = freshProviders.find(p => p.name === providerName);
        if (!provider || !provider.available) {
          console.log(`[AI] V387: ${providerName} not available — skipping`);
          continue;
        }
        // V390: Apply bedrockModelOverride in fallback path too
        if (providerName === 'bedrock' && bedrockModelOverride) {
          provider = { ...provider, model: bedrockModelOverride };
          console.log(`[AI] V390: Applying bedrockModelOverride in fallback path: ${bedrockModelOverride}`);
        }
        try {
          if (priority === 'generation') await waitForProviderSlot(providerName, 8000);
          const result = await callProviderWithRetry(provider, messages, temperature, maxTokens, 1);
          recordCall(providerName);
          console.log(`[AI] V387: ✓ ${providerName} succeeded (${LOCALE_LABEL} fallback) — content generated`);
          return result;
        } catch (err: any) {
          console.warn(`[AI] V387: ${providerName} failed: ${err.message?.slice(0, 100)}`);
          errors.push(`${providerName}: ${err.message?.slice(0, 80)}`);
        }
      }
    }

    // ALL providers failed — this should be extremely rare
    console.error(`[AI] V387: ALL providers failed for ${LOCALE_LABEL} pipeline: ${errors.join(' | ')}`);
    throw new Error(`V387: All providers failed for ${LOCALE_LABEL} pipeline. Errors: ${errors.join(' | ')}`);
  }

  // V396f: English pipeline — include Bedrock/Gemini as fallback after free providers.
  // V315 originally skipped Bedrock/Gemini for English to save cost, but this caused
  // English pipeline to COMPLETELY FAIL when all free providers hit rate limits.
  // Now: try free providers first (cost-effective), then fall back to Bedrock/Gemini.
  // Arabic pipeline (allowFallback=false): strict Bedrock → Gemini only (best Arabic quality).
  const ALLOWED_PIPELINE_PROVIDERS = allowFallback
    ? ['openrouter', 'grok', 'sambanova', 'groq', 'cerebras', 'siliconflow', 'deepinfra', 'mistral', 'cohere', 'nvidia', 'ollama', 'bedrock', 'gemini'] // V399: Grok added after OpenRouter
    : ['bedrock', 'gemini']; // V399: Arabic strict — Bedrock → Gemini

  // V396f: English pipeline — try free providers first, then Bedrock/Gemini as safety net.
  // This prevents the "ALL English providers failed" error that was common when
  // free tiers hit rate limits simultaneously.
  if (allowFallback) {
    const ENGLISH_PROVIDERS: AIProvider[] = ['openrouter', 'grok', 'sambanova', 'groq', 'cerebras', 'siliconflow', 'deepinfra', 'mistral', 'cohere', 'nvidia', 'ollama', 'bedrock', 'gemini'];
    console.log(`[AI] V399: English pipeline — OpenRouter/Grok first, then free providers, then Bedrock/Gemini fallback: ${ENGLISH_PROVIDERS.join(' → ')}`);
    const freshProviders = getProviders();
    const errors: string[] = [];
    for (const providerName of ENGLISH_PROVIDERS) {
      const provider = freshProviders.find(p => p.name === providerName);
      if (!provider || !provider.available) {
        console.log(`[AI] V399: ${providerName} not available — skipping`);
        continue;
      }
      try {
        if (priority === 'generation') await waitForProviderSlot(providerName, 5000);
        const result = await callProviderWithRetry(provider, messages, temperature, maxTokens, 1);
        recordCall(providerName);
        console.log(`[AI] V383: ✓ ${providerName} succeeded — English content generated`);
        return result;
      } catch (err: any) {
        console.warn(`[AI] V383: ${providerName} failed: ${err.message?.slice(0, 100)}`);
        errors.push(`${providerName}: ${err.message?.slice(0, 80)}`);
      }
    }
    // All English providers failed — this should be rare (multiple free providers + Ollama)
    console.error(`[AI] V386: All English providers failed: ${errors.join(' | ')}`);
    throw new Error(`V386: All English providers failed (${ENGLISH_PROVIDERS.join(' → ')}). Errors: ${errors.join(' | ')}`);
  }

  // V122: ALWAYS try Bedrock first, regardless of BEDROCK_ONLY env var.
  // This is now the hardcoded default behavior.
  const allProviders = getProviders();
  let bedrockProvider = allProviders.find(p => p.name === 'bedrock');
  const geminiProvider = allProviders.find(p => p.name === 'gemini');

  // V150: Override Bedrock model if specified (e.g., Sonnet for web_search support)
  // V172 FIX: Clone the provider object before mutating to prevent polluting the cache.
  if (bedrockModelOverride && bedrockProvider) {
    console.log(`[AI] V150: Overriding Bedrock model from ${bedrockProvider.model} to ${bedrockModelOverride}`);
    bedrockProvider = { ...bedrockProvider, model: bedrockModelOverride };
  }

  // Step 1: Try Bedrock (ALWAYS first)
  if (bedrockProvider && bedrockProvider.available) {
    if (priority === 'generation') await waitForProviderSlot('bedrock', 8000);
    try {
      const result = await callProviderWithRetry(bedrockProvider, messages, temperature, maxTokens, maxRetries, tools);
      recordCall('bedrock');
      return result;
    } catch (error: any) {
      if (error.message) recordBedrockFailure(error.message);
      console.warn(`[AI] V257: Bedrock failed: ${(error.message || '').slice(0, 150)}. Falling through to Bedrock retry + Gemini fallback...`);
    }
  } else {
    // Bedrock not available — log why
    const isCircuitBreakerIssue = isBedrockCircuitOpen(); // V256: daily quota fully removed — only circuit breaker for transient failures
    const isConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
    console.warn(`[AI] V257: Bedrock unavailable — ${isCircuitBreakerIssue ? 'circuit breaker (transient failures)' : isConfigured ? 'unknown reason' : 'NOT CONFIGURED (missing AWS keys)'}. Will try Bedrock retry then Gemini fallback...`);
  }

  // V257: Bedrock retry + Gemini fallback — after Bedrock initial failure,
  // retry Bedrock once (with circuit breaker reset), then fall through to Gemini
  // if Bedrock still fails. Gemini is the ONLY allowed fallback (second-best Arabic quality).
  console.log('[AI] V257: Bedrock initial attempt failed — retrying Bedrock, then Gemini as fallback');

  const errors: string[] = [];

  // Step 2: Retry Bedrock once (with circuit breaker reset)
  {
    resetBedrockCircuitBreaker();
    let retryBedrock = getProviders().find(p => p.name === 'bedrock');
    // V180: Apply model override to retry path (was lost before)
    if (retryBedrock && bedrockModelOverride) {
      retryBedrock = { ...retryBedrock, model: bedrockModelOverride };
    }
    if (retryBedrock && retryBedrock.available) {
      console.log('[AI] V257: Retrying Bedrock after circuit breaker reset...');
      try {
        const result = await callProviderWithRetry(retryBedrock, messages, temperature, maxTokens, maxRetries);
        recordCall('bedrock');
        return result;
      } catch (error: any) {
        if (error.message) recordBedrockFailure(error.message);
        console.error(`[AI] V257: Bedrock retry also failed: ${(error.message || '').slice(0, 150)}`);
        errors.push(`bedrock-retry: ${error.message}`);
      }
    }
  }

  // Step 3: Gemini fallback — try even if quota says exhausted (V258: when Bedrock is down,
  // the quota cooldown may have elapsed since we spent time on Bedrock retries).
  // The Gemini free tier quota resets per-minute, so retrying is safe.
  const freshProviders = getProviders();
  const geminiFallback = freshProviders.find(p => p.name === 'gemini');
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
  // V258: Try Gemini if: (a) provider says available, OR (b) API key exists but quota thinks exhausted.
  // When Bedrock is down, we MUST try Gemini regardless of our internal quota tracker,
  // because the quota may have reset since the last failure.
  if (geminiFallback && (geminiFallback.available || geminiApiKey)) {
    if (!geminiFallback.available && geminiApiKey) {
      // V258: Our internal tracker says quota exhausted, but Bedrock is down.
      // Force-reset the quota tracker and try anyway — the API quota likely reset by now.
      console.warn('[AI] V258: Gemini marked unavailable (quota exhausted) but Bedrock is down — force-resetting Gemini quota and retrying');
      resetGeminiQuota();
    }
    console.log('[AI] V257→V258: Bedrock fully failed — falling back to Gemini (Arabic pipeline fallback)...');
    try {
      recordGeminiDailyCall();
      const retryProviders = getProviders(); // Get fresh provider list after quota reset
      const retryGemini = retryProviders.find(p => p.name === 'gemini');
      if (!retryGemini) throw new Error('Gemini provider not found after reset');
      const result = await callProviderWithRetry(retryGemini, messages, temperature, maxTokens, 1);
      recordCall('gemini');
      console.log('[AI] V258: Gemini fallback succeeded — article processed via Gemini');
      return result;
    } catch (error: any) {
      console.error(`[AI] V258: Gemini fallback also failed: ${(error.message || '').slice(0, 150)}`);
      errors.push(`gemini-fallback: ${error.message}`);
      // If Gemini fails with 429/quota error, mark quota exhausted again
      if (error.message?.includes('429') || error.message?.includes('quota') || error.message?.includes('limit')) {
        markGeminiHardQuotaExhausted();
      }
    }
  } else {
    console.warn('[AI] V258: Gemini not available for fallback — no GEMINI_API_KEY set at all');
    errors.push('gemini: not available (no API key configured)');
  }

  // Step 4: Final Bedrock attempt with extended wait (last resort for Arabic)
  console.error('[AI] V259: Bedrock + Gemini both failed. Waiting 10s and trying Bedrock one final time...');
  await new Promise(r => setTimeout(r, 10000));
  resetBedrockCircuitBreaker();
  let finalBedrock3 = getProviders().find(p => p.name === 'bedrock');
  if (finalBedrock3 && bedrockModelOverride) {
    finalBedrock3 = { ...finalBedrock3, model: bedrockModelOverride };
  }
  if (finalBedrock3 && finalBedrock3.available) {
    try {
      const result = await callProviderWithRetry(finalBedrock3, messages, temperature, maxTokens, 1);
      recordCall('bedrock');
      return result;
    } catch (finalErr: any) {
      errors.push(`bedrock-final: ${finalErr.message}`);
    }
  }

  // V354: Arabic pipeline — EMERGENCY FALLBACK when Bedrock + Gemini are both down.
  // V315 originally blocked fallback because Groq/Cerebras/Mistral produce lower-quality Arabic.
  // However, when BOTH Bedrock AND Gemini are completely unavailable (DNS failure, quota exhausted),
  // producing SOME Arabic content is far better than producing ZERO content.
  // Mistral is the best Arabic fallback (multilingual-native), then Groq/Cerebras/NVIDIA.
  console.warn('[AI] V354: Arabic pipeline — Bedrock + Gemini both FAILED. Using emergency Arabic fallback (Mistral → Groq → Cerebras → NVIDIA)...');

  const ARABIC_EMERGENCY_FALLBACK: AIProvider[] = ['sambanova', 'mistral', 'cohere', 'groq', 'cerebras', 'siliconflow', 'deepinfra', 'nvidia'];
  const fallbackProviders = getProviders();
  for (const providerName of ARABIC_EMERGENCY_FALLBACK) {
    const provider = fallbackProviders.find(p => p.name === providerName);
    if (!provider || !provider.available) {
      console.log(`[AI] V354: ${providerName} not available — skipping`);
      continue;
    }
    try {
      if (priority === 'generation') await waitForProviderSlot(providerName, 5000);
      const result = await callProviderWithRetry(provider, messages, temperature, maxTokens, 1);
      recordCall(providerName);
      console.log(`[AI] V354: ✓ ${providerName} succeeded — Arabic content generated via emergency fallback`);
      return result;
    } catch (err: any) {
      console.warn(`[AI] V354: ${providerName} failed: ${err.message?.slice(0, 100)}`);
      errors.push(`${providerName}: ${err.message?.slice(0, 80)}`);
    }
  }

  // ALL providers failed — truly catastrophic
  console.error(`[AI] V354: ALL providers failed for Arabic pipeline (bedrock→gemini→mistral→groq→cerebras→nvidia)`);
  throw new Error(`V354: All providers failed for Arabic pipeline. Errors: ${errors.join(' | ')}`);
}

// ─── Call provider with retry + exponential backoff for rate limits ──
async function callProviderWithRetry(
  config: ProviderConfig,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  maxRetries: number = 2,
  tools?: Record<string, any>[]
): Promise<ChatCompletionResult> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await callProvider(config, messages, temperature, maxTokens, tools);
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error.message?.includes('429') || error.message?.includes('rate_limit') || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests');

      if (isRateLimit && attempt < maxRetries) {
        // Exponential backoff: 2s, 4s, 8s...
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[AI] Rate limited on ${config.name}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Non-rate-limit error or max retries exceeded — throw
      throw error;
    }
  }

  throw lastError;
}

// ─── z-ai-sdk with retry + exponential backoff for rate limits ──
async function zaiChatWithRetry(
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  maxRetries: number = 2
): Promise<ChatCompletionResult> {
  let lastError: any = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await zaiChat(messages, temperature, maxTokens);
    } catch (error: any) {
      lastError = error;
      const isRateLimit = error.message?.includes('429') || error.message?.includes('rate_limit') || error.message?.includes('rate limit') || error.message?.includes('Too Many Requests');

      if (isRateLimit && attempt < maxRetries) {
        const delay = Math.pow(2, attempt + 1) * 1000;
        console.log(`[AI] z-ai-sdk rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

async function callProvider(
  config: ProviderConfig,
  messages: ChatMessage[],
  temperature: number,
  maxTokens: number,
  tools?: Record<string, any>[]
): Promise<ChatCompletionResult> {
  switch (config.name) {
    case 'z-ai-sdk':
      // V46: Call zaiChat() directly (without retry wrapper) — the outer
      // callProviderWithRetry already handles retries. The previous
      // zaiChatWithRetry wrapper created nested retries: 3 outer × 3 inner = 9 attempts,
      // blocking the pipeline for up to 4.5 minutes when z-ai-sdk is down.
      return zaiChat(messages, temperature, maxTokens);
    case 'deepseek':
      return deepseekChat(messages, config, temperature, maxTokens);
    case 'groq':
      return groqChat(messages, config, temperature, maxTokens);
    case 'gemini':
      return geminiChat(messages, config, temperature, maxTokens);
    case 'glm':
      return glmChat(messages, config, temperature, maxTokens);
    case 'bedrock': {
      // V252: Daily token budget removed — use requested maxTokens directly
      const result = await bedrockChat(messages, config, temperature, maxTokens, tools);
      recordBedrockSuccess();
      return result;
    }
    case 'ollama':
      return ollamaChat(messages, config, temperature, maxTokens);
    case 'hf':
      return hfChat(messages, config, temperature, maxTokens);
    case 'cerebras':
      return cerebrasChat(messages, config, temperature, maxTokens);
    case 'mistral':
      return mistralChat(messages, config, temperature, maxTokens);
    case 'nvidia':
      return nvidiaChat(messages, config, temperature, maxTokens);
    case 'openrouter':
      return openrouterChat(messages, config, temperature, maxTokens);
    case 'sambanova':
      return sambanovaChat(messages, config, temperature, maxTokens);
    case 'cohere':
      return cohereChat(messages, config, temperature, maxTokens);
    case 'cloudflare':
      return cloudflareChat(messages, config, temperature, maxTokens);
    case 'grok':
      return grokChat(messages, config, temperature, maxTokens);
    case 'siliconflow':
      return siliconflowChat(messages, config, temperature, maxTokens);
    case 'deepinfra':
      return deepinfraChat(messages, config, temperature, maxTokens);
    case 'zukijourney':
      return zukijourneyChat(messages, config, temperature, maxTokens);
    case 'nagaai':
      return nagaaiChat(messages, config, temperature, maxTokens);
    case 'acytoo':
      return acytooChat(messages, config, temperature, maxTokens);
    default:
      throw new Error(`Unknown provider: ${config.name}`);
  }
}

// ─── Convenience: Simple system+user prompt ────────────────
export async function simpleChat(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.3,
  maxTokens: number = 800
): Promise<{ content: string; duration: number; provider: string }> {
  const result = await chatCompletion(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    { temperature, maxTokens }
  );
  return { content: result.content, duration: result.duration, provider: result.provider };
}

// ─── Convenience: Multi-turn conversation ──────────────────
export async function conversationChat(
  systemPrompt: string,
  conversationHistory: { role: 'user' | 'assistant'; content: string }[],
  currentMessage: string,
  temperature: number = 0.5,
  maxTokens: number = 600
): Promise<{ content: string; duration: number; provider: string }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  // Add conversation history (last 6 messages)
  for (const msg of conversationHistory.slice(-6)) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current message
  messages.push({ role: 'user', content: currentMessage });

  const result = await chatCompletion(messages, { temperature, maxTokens });
  return { content: result.content, duration: result.duration, provider: result.provider };
}

// ─── V12: Cleanup mixed Arabic-Latin words ────────────────
// AI models sometimes produce hybrid words like "كاريبbeans" or "كاترpillar"
// where they translate part of a compound English word but leave the rest.
// This function detects and fixes such broken translations.
function cleanupMixedWords(text: string): string {
  if (!text) return text;
  
  // Known company/term corrections — common financial names that get split
  const corrections: Record<string, string> = {
    // Company names that AI partially translates
    'كاريبbeans': 'كاريبيان',
    'كاريبbean': 'كاريبيان',
    'كاترpillar': 'كاتربيلر',
    'كاترpi': 'كاتربيلر',
    'Tanbreez،': 'تانبريز،',
    'Tanbreez': 'تانبريز',
    'Inseego': 'إنسيغو',
    'Solana': 'سولانا',
    // V13: More common financial terms that get partially translated
    'MicroStrategy': 'مايكروستراتيجي',
    'Coinbase': 'كوينبيس',
    'Binance': 'باينانس',
    'Ripple': 'ريبل',
    'Dogecoin': 'دوجكوين',
    'Litecoin': 'لايتكوين',
    'Polygon': 'بوليغون',
    'Chainlink': 'تشينلينك',
    'Avalanche': 'أفالانش',
    'Cardano': 'كاردانو',
    'Polkadot': 'بولكادوت',
    'OpenAI': 'أوبن إيه آي',
    'ChatGPT': 'تشات جي بي تي',
    'Nvidia': 'إنفيديا',
    'Netflix': 'نتفليكس',
    'Starbucks': 'ستاربكس',
    'Salesforce': 'سيلزفورس',
    'Spotify': 'سبوتيفاي',
    'Uber': 'أوبر',
    'Airbnb': 'إير بي إن بي',
    'Zoom': 'زوم',
    'PayPal': 'باي بال',
    'Visa': 'فيزا',
    'Mastercard': 'ماستركارد',
    'BlackRock': 'بلاك روك',
    'Vanguard': 'فانغارد',
    'Fidelity': 'فيديليتي',
    'S&P': 'إس آند بي',
    'FTSE': 'إف تي إس إي',
    'DAX': 'داكس',
    'Nikkei': 'نيكي',
    'Hang Seng': 'هانغ سنغ',
    'Shanghai': 'شنغهاي',
    'Euro Stoxx': 'يورو ستوكس',
    'Russell': 'راسل',
    'Wilshire': 'ويلشاير',
    'MSCI': 'إم إس سي آي',
  };
  
  let result = text;
  for (const [bad, good] of Object.entries(corrections)) {
    result = result.replace(new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), good);
  }
  
  // General fix: detect any word containing BOTH Arabic and Latin characters
  // and try to replace it with a fully Arabic version by removing the Latin suffix/prefix
  const words = result.split(/(\s+)/); // Keep separators
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word.trim()) continue; // Skip whitespace
    
    const hasArabic = /[\u0600-\u06FF]/.test(word);
    const hasLatin = /[a-zA-Z]{2,}/.test(word); // 2+ consecutive Latin chars
    
    if (hasArabic && hasLatin) {
      // This is a mixed word — try to fix it
      // Strategy: Extract the Arabic part and the Latin part
      const arabicPart = word.match(/[\u0600-\u06FF]+/g)?.join('') || '';
      const latinPart = word.match(/[a-zA-Z]+/g)?.join('') || '';
      
      // If the Latin part is a well-known abbreviation (2-5 uppercase chars), keep it
      if (/^[A-Z]{2,5}$/.test(latinPart)) {
        // Known financial abbreviations: USD, GDP, FWA, AI, IPO, ETF, etc.
        // These are acceptable in Arabic financial text
        continue;
      }
      
      // If the word looks like a partially-translated company name,
      // replace the entire word with just the Arabic transliteration
      // For now, strip the Latin suffix and just use the Arabic part
      // (Better to have just Arabic than a broken mix)
      if (arabicPart.length >= 2 && latinPart.length >= 3) {
        // Try to transliterate the Latin part to Arabic
        const transliterated = transliterateToArabic(latinPart);
        words[i] = arabicPart + transliterated;
        console.log(`[AI] V12: Fixed mixed word "${word}" → "${words[i]}"`);
      }
    }
  }
  
  return words.join('');
}

// Simple transliteration of Latin text to Arabic for financial terms
function transliterateToArabic(latin: string): string {
  const map: Record<string, string> = {
    'beans': 'بينز',
    'bean': 'بين',
    'pillar': 'بيلر',
    'pi': 'بي',
    'Caribbean': 'كاريبيان',
    'Caterpillar': 'كاتربيلر',
    'Royal': 'رويال',
    'Corp': 'كورب',
    'Inc': 'إنك',
    'Ltd': 'لمتد',
    'Group': 'غروب',
    'Holdings': 'هولدينغز',
    'Capital': 'كابيتال',
    'Partners': 'بارتنرز',
    'Ventures': 'فنتشرز',
  };
  
  return map[latin] || latin; // Return mapped version or keep as-is
}

// ─── V18: Mechanical Translation Fallback ──────────────────
// When ALL AI providers fail, use a dictionary-based translation.
// This ensures articles are NEVER left untranslated — even a rough
// Arabic translation is better than an invisible article.
const FINANCIAL_DICT: Record<string, string> = {
  // Actions & Events
  'rises': 'يرتفع', 'falls': 'ينخفض', 'surges': 'يقفز', 'drops': 'يهوي',
  'gains': 'يكسب', 'loses': 'يخسر', 'climbs': 'يتسلق', 'slides': 'ينزلق',
  'jumps': 'يقفز', 'plunges': 'يهوي', 'soars': 'يحلق', 'tumbles': 'يتهاوى',
  'rally': 'ارتفاع', 'rallies': 'يرتفع', 'declines': 'ينخفض', 'advances': 'يتقدم',
  'dips': 'ينخفض قليلاً', 'slips': 'ينزلق', 'rebounds': 'يرتد', 'recovers': 'يتعافى',
  'grows': 'ينمو', 'shrinks': 'يتقلص', 'expands': 'يتوسع', 'contracts': 'ينكمش',
  'beats': 'يتفوق على', 'misses': 'يخيب', 'exceeds': 'يتجاوز', 'tops': 'يتصدر',
  'hits': 'يصل إلى', 'reaches': 'يصل', 'posts': 'يسجل', 'reports': 'يبلغ',
  'warns': 'يحذر', 'announces': 'يعلن', 'says': 'يقول', 'plans': 'يخطط',
  'expects': 'يتوقع', 'predicts': 'يتنبأ', 'signals': 'يشير', 'suggests': 'يشير إلى',
  'cut': 'خفض', 'raise': 'رفع', 'hold': 'ثبات', 'buy': 'شراء', 'sell': 'بيع',
  'acquire': 'استحوذ', 'acquisition': 'استحواذ', 'merge': 'دمج', 'deal': 'صفقة',
  // Financial terms
  'stocks': 'الأسهم', 'stock': 'السهم', 'shares': 'الأسهم', 'share': 'السهم',
  'bond': 'السندات', 'bonds': 'السندات', 'market': 'السوق', 'markets': 'الأسواق',
  'trading': 'التداول', 'trade': 'التجارة', 'investor': 'المستثمر', 'investors': 'المستثمرين',
  'investment': 'الاستثمار', 'invest': 'استثمر', 'fund': 'الصندوق', 'funds': 'الصناديق',
  'profit': 'الربح', 'profits': 'الأرباح', 'loss': 'الخسارة', 'losses': 'الخسائر',
  'revenue': 'الإيرادات', 'earnings': 'الأرباح', 'income': 'الدخل', 'debt': 'الدين',
  'inflation': 'التضخم', 'deflation': 'الانكماش', 'recession': 'الركود', 'growth': 'النمو',
  'economy': 'الاقتصاد', 'economic': 'الاقتصادي', 'financial': 'المالي', 'fiscal': 'المالي',
  'monetary': 'النقدي', 'interest rate': 'سعر الفائدة', 'interest rates': 'أسعار الفائدة',
  'GDP': 'الناتج المحلي', 'Fed': 'الاحتياطي الفيدرالي', 'Federal Reserve': 'الاحتياطي الفيدرالي',
  'central bank': 'البنك المركزي', 'treasury': 'الخزانة', 'yields': 'العوائد',
  'dividend': 'التوزيعات', 'valuation': 'التقييم', 'portfolio': 'المحفظة',
  'hedge': 'التحوط', 'bullish': 'صاعد', 'bearish': 'هابط', 'volatile': 'متقلب',
  'correction': 'تصحيح', 'crash': 'انهيار', 'bubble': 'فقاعة',
  'support': 'الدعم', 'resistance': 'المقاومة', 'breakout': 'اختراق',
  // Companies & Entities
  'Apple': 'آبل', 'Microsoft': 'مايكروسوفت', 'Google': 'غوغل', 'Amazon': 'أمازون',
  'Meta': 'ميتا', 'Nvidia': 'إنفيديا', 'Tesla': 'تسلا', 'Intel': 'إنتل',
  'Bitcoin': 'بيتكوين', 'Ethereum': 'إيثريوم', 'crypto': 'العملات الرقمية',
  'oil': 'النفط', 'gold': 'الذهب', 'dollar': 'الدولار', 'euro': 'اليورو',
  'S&P 500': 'إس آند بي 500', 'Nasdaq': 'ناسداك', 'Dow Jones': 'داو جونز',
  'Wall Street': 'وول ستريت', 'White House': 'البيت الأبيض',
  'Treasury': 'الخزانة الأمريكية', 'Pentagon': 'البنتاجون',
  // Common phrases
  'as': 'كما', 'after': 'بعد', 'before': 'قبل', 'during': 'أثناء',
  'over': 'أكثر من', 'under': 'أقل من', 'between': 'بين', 'against': 'ضد',
  'from': 'من', 'for': 'لـ', 'with': 'مع', 'without': 'بدون',
  'could': 'قد', 'would': 'سوف', 'should': 'ينبغي', 'may': 'قد',
  'new': 'جديد', 'high': 'مرتفع', 'low': 'منخفض', 'big': 'كبير',
  'key': 'مفتاح', 'major': 'رئيسي', 'top': 'أعلى', 'best': 'أفضل',
  'first': 'أول', 'last': 'آخر', 'next': 'التالي', 'previous': 'السابق',
  'year': 'سنة', 'month': 'شهر', 'week': 'أسبوع', 'day': 'يوم',
  'quarter': 'ربع', 'annual': 'سنوي', 'monthly': 'شهري', 'weekly': 'أسبوعي',
  'percent': 'بالمائة', 'billion': 'مليار', 'million': 'مليون', 'trillion': 'تريليون',
  'point': 'نقطة', 'points': 'نقاط', 'record': 'رقم قياسي',
  'cost basis': 'تكلفة الأساس', 'support zone': 'منطقة دعم', 'bull trend': 'اتجاه صاعد',
  'cost': 'تكلفة', 'price': 'سعر', 'prices': 'أسعار', 'value': 'قيمة',
};

function mechanicalTranslate(text: string): string {
  if (!text) return '';
  let result = text;
  // Sort by length descending so longer phrases match first (e.g. "interest rate" before "interest")
  const sortedKeys = Object.keys(FINANCIAL_DICT).sort((a, b) => b.length - a.length);
  for (const eng of sortedKeys) {
    const arb = FINANCIAL_DICT[eng];
    // Case-insensitive replace for words/phrases
    const regex = new RegExp('\\b' + eng.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi');
    result = result.replace(regex, arb);
  }
  return result;
}

// ─── Auto-translate: English → Arabic for financial news ───
// Includes retry logic with exponential backoff for resilience on Railway
// V18: Falls back to mechanical dictionary translation when ALL AI providers fail
export async function translateToArabic(
  title: string,
  summary: string = ''
): Promise<{ translatedTitle: string; translatedSummary: string; provider?: string }> {
  const MAX_RETRIES = 2; // Increased to 2 for better translation success rate
  let lastError: any = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s
        const delay = Math.pow(2, attempt - 1) * 1000;
        console.log(`[AI] Translation retry ${attempt}/${MAX_RETRIES} after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const result = await chatCompletion(
        [
          {
            role: 'system',
            content: 'أنت مترجم مالي محترف من الإنجليزية إلى العربية بخبرة تزيد عن ٢٠ عاماً في ترجمة الأخبار المالية والاقتصادية لصحف عربية رائدة مثل الشرق الأوسط والاقتصادية والحياة. ترجم النص بالكامل إلى العربية بأسلوب صحفي عربي احترافي يقرأ وكأنه كتب أصلاً بالعربية — لا ترجمة آلية حرفية.\n\nقواعد صارمة:\n- ترجم بأسلوب صحفي عربي سلس وطبيعي — تجنب الترجمة الحرفية التي تبدو آلية\n- استخدم التشكيل حيث يساعد على الوضوح (مثل: الأسْهم، الرِّبْح، البُورصة)\n- أسماء الشركات والعملات تُترجم بحروف عربية (مثل: Dow Jones = داو جونز، Tesla = تسلا، Bitcoin = بيتكوين، S&P 500 = إس آند بي ٥٠٠، Federal Reserve = الاحتياطي الفيدرالي، Nasdaq = ناسداك، Wall Street = وول ستريت، S&P = إس آند بي، Microsoft = مايكروسوفت، Apple = آبل، Amazon = أمازون، Google = غوغل، Meta = ميتا، Nvidia = إنفيديا، JPMorgan = جي بي مورغان، Goldman Sachs = غولدمان ساكس، Morgan Stanley = مورغان ستانلي)\n- استخدم المصطلحات المالية العربية المعتمدة (مثل: الأسهم = stocks، السندات = bonds، التضخم = inflation، الفائدة = interest rate، الناتج المحلي = GDP، بيان الوظائف = NFP، السياسة النقدية = monetary policy، التحوط = hedging، الأساسيات = fundamentals، التحليل الفني = technical analysis، الدعم = support، المقاومة = resistance، نقاط الأساس = basis points، العائد = yield، السبريد = spread، الرافعة المالية = leverage، الهامش = margin)\n- الأرقام والنسب المئوية يجب أن تبقى كما هي بدون تغيير\n- حافظ على دقة المعنى المالي — لا تضف أو تحذف معلومات\n- لا تترك أي كلمة إنجليزية بدون ترجمة — كل كلمة يجب أن تكون بالعربية\n- تجنب الأحرف اللاتينية قدر الإمكان — استخدم الأرقام العربية (١٢٣ بدلاً من 123)\n- لا تكتب أي رموز غريبة أو أحرف غير مفهومة\n- ترجم الرموز المالية: % = بالمئة، bp = نقطة أساس، bps = نقاط أساس، Q1 = الربع الأول، Q2 = الربع الثاني، Q3 = الربع الثالث، Q4 = الربع الرابع، YoY = على أساس سنوي، MoM = على أساس شهري، EPS = ربحية السهم، P/E = سعر/ربحية، IPO = طرح عام أولي، ETF = صندوق متداول، CFTC = لجنة تداول العقود الآجلة، FOMC = لجنة السوق المفتوحة الفيدرالية، ECB = البنك المركزي الأوروبي، BOJ = البنك المركزي الياباني، IMF = صندوق النقد الدولي، CPI = مؤشر أسعار المستهلكين، PMI = مؤشر مديري المشتريات، GDP = الناتج المحلي الإجمالي، VIX = مؤشر الخوف، WTI = خام غرب تكساس الوسيط، Brent = برنت\n- لا تستخدم الرموز التالية أبداً: $ € £ ¥ — بل اكتبها بالعربية: دولار، يورو، جنيه إسترليني، ين ياباني\n- أمثلة على ترجمة صحيحة:\n  * "Stocks rally as Fed signals rate pause" → "ارتفاع الأسهم مع إشارة الاحتياطي الفيدرالي إلى إيقاف رفع الفائدة"\n  * "Bitcoin drops below $60K amid sell-off" → "هبوط بيتكوين دون ٦٠ ألف دولار وسط موجة بيع"\n  * "S&P 500 hits new all-time high" → "مؤشر إس آند بي ٥٠٠ يصل إلى مستوى قياسي جديد"\n  * "Oil prices surge on OPEC+ production cut" → "ارتفاع أسعار النفط بعد قرار أوبك بلس خفض الإنتاج"\n- أجب دائماً بصيغة JSON صحيحة فقط بدون نص إضافي',
          },
          {
            role: 'user',
            content: `ترجم النص الإنجليزي التالي بالكامل إلى العربية بأسلوب صحفي احترافي — لا تترك أي كلمة أو رمز إنجليزي. كل شيء يجب أن يكون بالعربية. الملخص المترجم يجب أن يكون مفصلاً وليس سطراً واحداً — اكتب على الأقل ٣ جمل كاملة في الملخص.\n\nالعنوان: ${title}\n${summary ? `الملخص: ${summary}` : ''}\n\nأجب بصيغة JSON فقط:\n{"translatedTitle": "...", "translatedSummary": "..."}`,
          },
        ],
        { temperature: 0.2, maxTokens: 2000 }  // V54: Auto-select best available provider
      );

      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Strip common prefixes that AI models sometimes add (e.g., "العنوان:", "Title:", "عنوان:")
        let translatedTitle = parsed.translatedTitle?.trim()
          ?.replace(/^(العنوان|عنوان|Title)\s*:\s*/i, '')
          ?.trim();
        let translatedSummary = parsed.translatedSummary?.trim()
          ?.replace(/^(الملخص|ملخص|Summary)\s*:\s*/i, '')
          ?.trim();

        // Validate: make sure translation is FULLY Arabic — no English words mixed in
        // A good Arabic translation should have >70% Arabic characters and no Latin words
        // V12: Added strict check for mixed Arabic-Latin WORDS (e.g., "كاريبbeans", "كاترpillar")
        // These hybrid words indicate the AI model split an English word and only
        // translated part of it — this is a CRITICAL quality issue.
        // V34: Lowered Arabic validation threshold from 70% to 40%.
        // Financial titles always contain English company names (Tesla, Apple, S&P 500)
        // which reduces the Arabic ratio below 70%. A title like "ارتفاع أسهم تسلا بعد إعلان"
        // is valid Arabic but only ~60% Arabic chars because "تسلا" transliterates to fewer chars.
        const isMostlyArabic = (text: string) => {
          if (!text || text.length < 3) return false;
          const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
          const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
          const ratio = arabicChars / (arabicChars + latinChars + 1);
          if (ratio < 0.4 || arabicChars < 3) return false;
          
          // V34: Relaxed mixed-word check from 2 to 5.
          // Financial text often mixes Arabic with abbreviations (USD, GDP, IPO, ETF).
          const words = text.split(/\s+/);
          let mixedWordCount = 0;
          for (const word of words) {
            const hasArabicChar = /[\u0600-\u06FF]/.test(word);
            const hasLatinChar = /[a-zA-Z]{2,}/.test(word); // V34: Only count 2+ consecutive Latin chars
            if (hasArabicChar && hasLatinChar) {
              mixedWordCount++;
            }
          }
          // V34: Allow up to 5 mixed words (was 2) — financial titles are inherently mixed
          if (mixedWordCount > 5) return false;
          
          return true;
        };

        if (translatedTitle && isMostlyArabic(translatedTitle)) {
          // V12: Post-translation cleanup — fix any remaining mixed Arabic-Latin words
          // Replace known bad patterns (company names partially translated)
          translatedTitle = cleanupMixedWords(translatedTitle);
          if (translatedSummary) {
            translatedSummary = cleanupMixedWords(translatedSummary);
          }
          
          // Re-validate after cleanup
          if (!isMostlyArabic(translatedTitle)) {
            console.warn(`[AI] Translation failed cleanup validation, retrying... (attempt ${attempt + 1}): "${translatedTitle?.slice(0, 50)}"`);
            lastError = new Error('Translation failed cleanup validation');
            continue; // Retry
          }
          
          console.log(`[AI] Translation OK via ${result.provider} (${result.duration}ms): "${title.slice(0, 40)}..." → "${translatedTitle.slice(0, 40)}..."`);
          return {
            translatedTitle,
            translatedSummary: translatedSummary && isMostlyArabic(translatedSummary) ? translatedSummary : summary,
            provider: result.provider,
          };
        } else {
          console.warn(`[AI] Translation returned mixed Arabic/English text, retrying... (attempt ${attempt + 1}): "${translatedTitle?.slice(0, 50)}"`);
          lastError = new Error('Translation returned mixed Arabic/English text');
          continue; // Retry
        }
      } else {
        console.warn(`[AI] Translation returned non-JSON response via ${result.provider}, retrying...`);
        lastError = new Error('Translation returned non-JSON response');
        continue; // Retry
      }
    } catch (err: any) {
      lastError = err;
      console.warn(`[AI] Translation attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  console.error(`[AI] All translation attempts failed for "${title.slice(0, 40)}...": ${lastError?.message}`);
  // Return empty strings instead of English text — prevents English leaking into Arabic fields
  // V18: ALL AI providers failed — use mechanical dictionary translation
  // Better to have a rough Arabic translation than an invisible article
  console.warn(`[AI] V18: All AI providers failed for translation — using mechanical dictionary fallback for: "${title.slice(0, 60)}"`);
  const mechTitle = mechanicalTranslate(title);
  const mechSummary = mechanicalTranslate(summary);
  if (mechTitle && /[\u0600-\u06FF]/.test(mechTitle)) {
    console.log(`[AI] V18: Mechanical translation produced Arabic title: "${mechTitle.slice(0, 50)}"`);
    return { translatedTitle: mechTitle, translatedSummary: mechSummary, provider: 'mechanical' };
  }
  // Absolute last resort: wrap the English text in an Arabic context
  return { translatedTitle: `[ترجمة آلية] ${title}`, translatedSummary: summary ? `[ترجمة آلية] ${summary}` : '', provider: 'mechanical-fallback' };
}

// ─── Auto-analyze financial news ───────────────────────────
export async function analyzeFinancialNews(
  title: string,
  summary: string = ''
): Promise<{
  summary: string;
  sentiment: string;
  confidence: number;
  affectedAssets: { symbol: string; direction: string }[];
  impactLevel: string;
  recommendation: string;
} | null> {
  try {
    const result = await chatCompletion(
      [
        {
          role: 'system',
          content: 'أنت محلل مالي ذكي. أجب دائماً بصيغة JSON صحيحة فقط بدون نص إضافي.',
        },
        {
          role: 'user',
          content: `أنت محلل مالي خبير. حلل الخبر التالي وقدم:\n1. ملخص قصير (جملة واحدة)\n2. التأثير المتوقع على الأسواق (إيجابي/سلبي/محايد)\n3. الأصول المتأثرة مع اتجاه التأثير\n4. مستوى التأثير (عالي/متوسط/منخفض)\n5. توصية سريعة للمتداول\n\nالخبر: ${title}\n${summary ? `التفاصيل: ${summary}` : ''}\n\nأجب بصيغة JSON فقط:\n{"summary": "...", "sentiment": "positive|negative|neutral", "confidence": 0-100, "affectedAssets": [{"symbol": "...", "direction": "up|down|neutral"}], "impactLevel": "high|medium|low", "recommendation": "..."}`,
        },
      ],
      { temperature: 0.3, maxTokens: 500 }
    );

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err: any) {
    console.error('[AI] Analysis failed:', err.message);
  }

  return null;
}

// ─── Get provider status for debugging ─────────────────────
export function getProviderStatus(): { provider: string; available: boolean; model: string }[] {
  return getProviders().map(p => ({
    provider: p.name,
    available: p.available,
    model: p.model,
  }));
}

// ─── V57: Direct provider test (NO fallback) ────────────────
// Tests a specific provider directly without any fallback mechanism.
// Returns the actual error message so we can see WHY a provider fails.
export async function testProviderDirectly(
  providerName: AIProvider
): Promise<{
  provider: string;
  success: boolean;
  model: string;
  duration?: number;
  content?: string;
  error?: string;
}> {
  const config = getProviders().find(p => p.name === providerName);
  if (!config) {
    return { provider: providerName, success: false, model: 'unknown', error: 'Provider not found' };
  }
  if (!config.available) {
    return { provider: providerName, success: false, model: config.model, error: 'Provider not available (no API key or init failed)' };
  }

  const startTime = Date.now();
  try {
    const result = await Promise.race([
      callProvider(config, [
        { role: 'system', content: 'Say OK' },
        { role: 'user', content: 'test' },
      ], 0, 5),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Provider test timed out after 15s')), 15000)
      ),
    ]);
    return {
      provider: providerName,
      success: true,
      model: result.model,
      duration: Date.now() - startTime,
      content: result.content?.slice(0, 100),
    };
  } catch (error: any) {
    return {
      provider: providerName,
      success: false,
      model: config.model,
      duration: Date.now() - startTime,
      error: error.message?.slice(0, 1000),
    };
  }
}

// ─── RAG-Omega: Fast Chat Completion ─────────────────────────────
// Single provider, no cascade, no retries. Designed for the RAG-Omega
// architecture where data is already fetched and we just need AI
// to synthesize a response from the provided data.
// Total timeout: 8 seconds. If it fails, we fall back to data-only response.

// V801: Startup diagnostics — log which AI providers are available on server start.
let startupLogged = false;
function logStartupDiagnostics() {
  if (startupLogged) return;
  startupLogged = true;
  
  const providers = getProviders();
  const available = providers.filter(p => p.available).map(p => p.name);
  const unavailable = providers.filter(p => !p.available).map(p => `${p.name}(no-key)`);
  
  console.log(`[AI] V802-STARTUP: Available providers: [${available.join(', ')}]`);
  if (unavailable.length > 0) {
    console.log(`[AI] V802-STARTUP: Unavailable providers: [${unavailable.join(', ')}]`);
  }
  
  // V802: Show key prefix for each configured provider — helps debug key detection
  const keyChecks: Record<string, string> = {
    'GROQ_API_KEY': process.env.GROQ_API_KEY ? `${process.env.GROQ_API_KEY.slice(0, 6)}...(${process.env.GROQ_API_KEY.length}ch)` : '(not set)',
    'GEMINI_API_KEY': process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.slice(0, 6)}...(${process.env.GEMINI_API_KEY.length}ch)` : '(not set)',
    'GOOGLE_AI_STUDIO_API_KEY': process.env.GOOGLE_AI_STUDIO_API_KEY ? `${process.env.GOOGLE_AI_STUDIO_API_KEY.slice(0, 6)}...(${process.env.GOOGLE_AI_STUDIO_API_KEY.length}ch)` : '(not set)',
    'NAGAAI_API_KEY': process.env.NAGAAI_API_KEY ? `${process.env.NAGAAI_API_KEY.slice(0, 6)}...(${process.env.NAGAAI_API_KEY.length}ch)` : '(not set)',
    'DEEPINFRA_API_KEY': process.env.DEEPINFRA_API_KEY ? `${process.env.DEEPINFRA_API_KEY.slice(0, 6)}...(${process.env.DEEPINFRA_API_KEY.length}ch)` : '(not set)',
    'AWS_ACCESS_KEY_ID': process.env.AWS_ACCESS_KEY_ID ? `${process.env.AWS_ACCESS_KEY_ID.slice(0, 6)}...(${process.env.AWS_ACCESS_KEY_ID.length}ch)` : '(not set)',
    'OPENROUTER_API_KEY': process.env.OPENROUTER_API_KEY ? `${process.env.OPENROUTER_API_KEY.slice(0, 6)}...(${process.env.OPENROUTER_API_KEY.length}ch)` : '(not set)',
    'XAI_API_KEY': process.env.XAI_API_KEY ? `${process.env.XAI_API_KEY.slice(0, 4)}...(${process.env.XAI_API_KEY.length}ch)` : '(not set)',
    'CLOUDFLARE_API_TOKEN': (process.env.CLOUDFLARE_API_TOKEN || '').trim() ? `${(process.env.CLOUDFLARE_API_TOKEN || '').trim().slice(0, 4)}...` : '(not set)',
    'CLOUDFLARE_ACCOUNT_ID': (process.env.CLOUDFLARE_ACCOUNT_ID || '').trim() ? `${(process.env.CLOUDFLARE_ACCOUNT_ID || '').trim().slice(0, 8)}...` : '(not set)',
    'ZAI_BASE_URL': process.env.ZAI_BASE_URL || '(not set)',
    'ZAI_API_KEY': process.env.ZAI_API_KEY ? `${process.env.ZAI_API_KEY.slice(0, 6)}...` : '(not set)',
  };
  
  console.log(`[AI] V802-STARTUP: Key check: ${JSON.stringify(keyChecks)}`);
  
  if (available.length === 0) {
    console.error(`[AI] V802-STARTUP: ⚠️ NO AI PROVIDERS AVAILABLE! The assistant will always fall to data-only mode.`);
    console.error(`[AI] V802-STARTUP: To fix: Set at least one of: GROQ_API_KEY, GEMINI_API_KEY, DEEPINFRA_API_KEY, AWS_ACCESS_KEY_ID+AWS_SECRET_ACCESS_KEY`);
    console.error(`[AI] V802-STARTUP: Free options: Groq (console.groq.com), Gemini (aistudio.google.com), DeepInfra (deepinfra.com)`);
  }
  
  // V802: Platform detection
  const onZaiPlatform = isZaiPlatform();
  const onRailway = !!(process.env.RAILWAY_SERVICE_ID || process.env.RAILWAY_STATIC_URL);
  console.log(`[AI] V802-STARTUP: Platform: ${onZaiPlatform ? 'Z.ai' : onRailway ? 'Railway' : 'unknown'} | z-ai-sdk: ${zaiPermanentlyUnavailable ? 'permanently-unavailable' : 'available'}`);
}

export async function fastChatCompletion(
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  options?: {
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    locale?: string;
    preferProviders?: AIProvider[];  // V900: Allow callers to prefer certain providers
    excludeProviders?: AIProvider[]; // V1002: Providers to NEVER use (even as fallback)
  }
): Promise<ChatCompletionResult> {
  const { temperature = 0.4, maxTokens = 2000, timeout = 15_000, locale = 'ar', preferProviders, excludeProviders } = options || {};
  const startTime = Date.now();
  const errors: string[] = [];

  // V801: Log startup diagnostics on first call
  logStartupDiagnostics();

  // V900: Provider order based on ACTUAL RUNTIME HEALTH — not just key existence.
  // Order rationale:
  // 1. groq — PROVEN WORKING (106ms, llama-3.3-70b, excellent Arabic)
  // 2. cerebras — PROVEN WORKING (186ms, gpt-oss-120b, excellent Arabic)
  // 3. bedrock — Claude (BEST quality when available, but rate-limited often)
  // 4. gemini — Good when credits available (currently depleted)
  // 5. nvidia — PROVEN WORKING (384ms, llama-3.1-8b, decent)
  // 6. ollama — PROVEN WORKING (460ms, gemma3:12b, backup)
  // 7-19: Other providers (most are credit-depleted or rate-limited)
  const DEFAULT_ORDER: AIProvider[] = [
    'groq',          // ✅ PROVEN WORKING — 106ms, llama-3.3-70b, BEST first choice
    'cerebras',      // ✅ PROVEN WORKING — 186ms, gpt-oss-120b, excellent backup
    'bedrock',       // Claude — BEST Arabic quality (but often rate-limited)
    'gemini',        // Good when credits available (currently depleted)
    'glm',           // V1046: GLM-4-Plus — strong multilingual, moved up from #19 to #5
    'nvidia',        // ✅ PROVEN WORKING — 384ms, llama-3.1-8b, decent quality
    'ollama',        // ✅ PROVEN WORKING — 460ms, gemma3:12b, backup
    'deepinfra',     // Qwen-72B when credits available
    'sambanova',     // Llama-70B when not rate-limited
    'mistral',       // Good multilingual when auth works
    'deepseek',      // Good Arabic when paid
    'cohere',        // command-a when trial limit not hit
    'cloudflare',    // Llama-70B when daily allocation available
    'siliconflow',   // DeepSeek-V3 when balance available
    'zukijourney',   // GPT-4o-mini when key configured
    'nagaai',        // Free models when model name correct
    'openrouter',    // Has free models when credits available
    'grok',          // xAI Grok-3 Mini — #2 priority after OpenRouter
    'z-ai-sdk',      // Z.ai platform only (internal API)
    'hf',            // Small model, low rate limit
  ];

  // V1002: Build exclude set from excludeProviders
  const excludeSet = new Set<AIProvider>(excludeProviders || []);

  // V900: If preferProviders is specified, put those providers FIRST
  // V1002: Also exclude any providers in the excludeSet
  let ALL_PROVIDERS: AIProvider[];
  if (preferProviders && preferProviders.length > 0) {
    const preferred = preferProviders.filter(p => DEFAULT_ORDER.includes(p) && !excludeSet.has(p));
    const rest = DEFAULT_ORDER.filter(p => !preferred.includes(p) && !excludeSet.has(p));
    ALL_PROVIDERS = [...preferred, ...rest];
  } else {
    ALL_PROVIDERS = DEFAULT_ORDER.filter(p => !excludeSet.has(p));
  }

  // V900: Filter to only try providers that are actually available AND healthy
  const providers = getProviders();
  const skippedUnhealthy: string[] = [];
  const availableProviders = ALL_PROVIDERS.filter(name => {
    const p = providers.find(pp => pp.name === name);
    if (!p || !p.available) return false;
    // Additional circuit breaker checks
    if (name === 'z-ai-sdk' && (isZaiCircuitOpen() || zaiPermanentlyUnavailable)) return false;
    if (name === 'gemini' && !isGeminiDailyQuotaAvailable()) return false;
    // V900: Check runtime health tracker — skip providers in cooldown
    if (!isProviderHealthy(name)) {
      skippedUnhealthy.push(name);
      return false;
    }
    return true;
  });

  if (availableProviders.length === 0) {
    throw new Error('fastChatCompletion: NO providers available — configure at least one AI provider (GROQ_API_KEY, GEMINI_API_KEY, DEEPINFRA_API_KEY, etc.)');
  }

  if (skippedUnhealthy.length > 0) {
    console.log(`[AI] V900: Skipped unhealthy providers: [${skippedUnhealthy.join(', ')}]`);
  }
  console.log(`[AI] V900: Trying providers: [${availableProviders.join(' → ')}] (preferred: [${(preferProviders || []).join(',')}])`);

  // V900: Log health summary for debugging
  const healthSummary = getProviderHealthSummary();
  const unhealthyProviders = Object.entries(healthSummary).filter(([_, v]) => !v.healthy);
  if (unhealthyProviders.length > 0) {
    console.log(`[AI] V900: Currently unhealthy: ${unhealthyProviders.map(([k, v]) => `${k} (${Math.round(v.cooldownRemainingMs / 1000)}s left)`).join(', ')}`);
  }

  for (const providerName of availableProviders) {
    try {
      const provider = providers.find(p => p.name === providerName)!;
      
      const result = await Promise.race([
        callProvider(provider, messages, temperature, maxTokens),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`fastChat: ${providerName} timeout (${timeout}ms)`)), timeout)
        ),
      ]);

      const duration = Date.now() - startTime;
      console.log(`[AI] V900: ${providerName} responded in ${duration}ms (${result.content?.length || 0} chars)`);
      
      // V900: Record success — clear health record
      recordProviderSuccess(providerName);

      return {
        content: result.content || '',
        provider: providerName,
        model: result.model || provider.model,
        duration,
        tokensUsed: result.tokensUsed,
        stopReason: result.stopReason,
      };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const errMsg = err.message || 'Unknown error';
      errors.push(`${providerName}: ${errMsg.slice(0, 80)}`);
      console.warn(`[AI] V900: ${providerName} failed in ${duration}ms — ${errMsg.slice(0, 80)}`);
      
      // V900: Record failure in health tracker — auto-classifies as permanent or transient
      recordProviderFailure(providerName, errMsg);
      
      // Continue to next provider — NO exponential backoff, NO retries
      continue;
    }
  }

  // All fast providers failed — throw with diagnostic info
  throw new Error(`fastChatCompletion: all ${availableProviders.length} available providers failed — ${errors.join('; ')}`);
}
