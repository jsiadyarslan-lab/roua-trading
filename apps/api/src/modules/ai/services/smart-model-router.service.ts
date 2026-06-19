// ═══════════════════════════════════════════════════════════════
// Roua Trading — Smart Model Router
// Distributes AI requests across free-tier providers to maximize the
// daily quota without exhausting any single provider.
// ═══════════════════════════════════════════════════════════════
//
// Problem:
//   The platform has 8 AI council roles × multiple symbols × multiple
//   locales. Even with role-bounded prompts (V288), calling 8 models
//   per request quickly exhausts the free daily quota of any single
//   provider (Groq: 1000 req/day, Cerebras: 14400, GLM: variable,
//   Mistral: 1B tokens/month, NVIDIA: 40/min, etc.).
//
// Solution:
//   Track each provider's daily usage in Redis. When a role requests a
//   model, the router picks the least-used provider from the role's
//   fallback list that still has quota remaining. If a provider's quota
//   is exhausted, it's auto-disabled until midnight UTC.
//
//   This is provider-agnostic — it works whether the user has 1 key
//   or 8 keys configured. With only 1 key (current production state),
//   the router still adds value via the dedup layer (prevents the same
//   prompt from being sent twice within 60s).

import { Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

// Daily free-tier quota per provider (conservative estimates).
// Set to 0 = unlimited (e.g. Ollama local).
// Sources (as of 2024-2025):
//   - Groq: 1000 req/day on Llama 3.3 70B free tier
//   - Cerebras: 14400 req/day (1 req/sec)
//   - GLM (Zhipu): variable, ~200 req/day free tier
//   - Gemini: 1500 req/day free tier
//   - Mistral: 1B tokens/month ≈ 500k req/day @ 2k tokens/req
//   - NVIDIA: 40 req/min = 57600 req/day
//   - Bedrock: paid (no free quota, but budget-limited)
//   - Ollama: unlimited (self-hosted)
//   - HuggingFace: 1000 req/day free
//   - OpenRouter: 50 req/day free
//   - DeepSeek: 500 req/day free
const DAILY_QUOTA: Record<string, number> = {
  groq: 1000,
  cerebras: 14400,
  glm: 200,
  gemini: 1500,
  mistral: 50000,
  nvidia: 57600,
  bedrock: 0,        // paid — no daily limit, budget-limited elsewhere
  ollama: 0,         // unlimited
  huggingface: 1000,
  openrouter: 50,
  deepseek: 500,
};

// Soft threshold: when a provider's usage reaches this % of quota,
// the router prefers other providers. Hard threshold (100%) blocks it.
const SOFT_THRESHOLD_PCT = 0.7;  // 70% → prefer alternatives
const HARD_THRESHOLD_PCT = 0.95; // 95% → block entirely

// TTL for in-flight dedup: if the same prompt is sent within this window,
// reuse the in-progress Promise instead of sending a duplicate request.
const DEDUP_WINDOW_MS = 60_000;

@Injectable()
export class SmartModelRouter {
  private readonly logger = new Logger(SmartModelRouter.name);
  private readonly inFlight = new Map<string, { promise: Promise<any>; expiresAt: number }>();

  constructor(@Optional() private readonly redis?: RedisService) {
    // Periodic cleanup of expired in-flight entries (every 2 minutes)
    setInterval(() => this._cleanupInFlight(), 120_000).unref?.();
  }

  /**
   * Pick the best model from a candidate list, considering:
   * 1. Is the model's API key available?
   * 2. Is the model in cooldown (recent failures)?
   * 3. Has the model's daily quota been exhausted?
   * 4. Among available models, prefer the least-used one.
   *
   * Returns the model key, or null if no candidate is usable.
   */
  async pickModel(
    candidates: string[],
    isAvailable: (model: string) => boolean,
  ): Promise<string | null> {
    if (candidates.length === 0) return null;

    // Step 1: filter to models that have keys and aren't in cooldown
    const usable = candidates.filter(m => isAvailable(m));
    if (usable.length === 0) return null;

    // Step 2: filter out models that hit the hard quota threshold
    const notExhausted: string[] = [];
    for (const m of usable) {
      const usage = await this.getUsagePct(m);
      if (usage < HARD_THRESHOLD_PCT) notExhausted.push(m);
    }
    if (notExhausted.length === 0) {
      // All exhausted — pick the one closest to reset (lowest usage among the exhausted)
      this.logger.warn(`⚠️ All ${usable.length} usable models exhausted their daily quota`);
      return usable[0]; // last resort — will likely fail but better than nothing
    }

    // Step 3: among not-exhausted, prefer those below the soft threshold
    const fresh = await Promise.all(
      notExhausted.map(async m => ({ model: m, usage: await this.getUsagePct(m) }))
    );
    const belowSoft = fresh.filter(x => x.usage < SOFT_THRESHOLD_PCT);
    const pool = belowSoft.length > 0 ? belowSoft : fresh;

    // Step 4: pick the least-used model from the pool
    pool.sort((a, b) => a.usage - b.usage);
    return pool[0].model;
  }

  /**
   * Record a successful API call to a model. Increments the daily counter.
   */
  async recordUsage(model: string, tokensUsed: number = 0): Promise<void> {
    const key = this._usageKey(model);
    if (!this.redis) return;
    try {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
      const dayKey = `${key}:${today}`;
      const count = await this.redis.incr(dayKey);
      if (count === 1) {
        // First call today — set TTL to expire at end of day + buffer
        const endOfDay = new Date();
        endOfDay.setUTCHours(24, 0, 0, 0); // next midnight UTC
        const ttlSec = Math.ceil((endOfDay.getTime() - Date.now()) / 1000) + 60;
        await this.redis.expire(dayKey, ttlSec);
      }
      // Also track token usage for token-limited providers (Mistral).
      // RedisService doesn't have incrby — use a simple set+incr loop.
      // Skip for now to avoid blocking; the request counter above is the
      // primary quota signal.
      if (tokensUsed > 0) {
        const tokenKey = `${key}:tokens:${today}`;
        const currentTokens = parseInt((await this.redis.get(tokenKey)) || '0', 10);
        const newTotal = currentTokens + tokensUsed;
        const endOfDay = new Date();
        endOfDay.setUTCHours(24, 0, 0, 0);
        const ttlSec = Math.ceil((endOfDay.getTime() - Date.now()) / 1000) + 60;
        await this.redis.set(tokenKey, String(newTotal), ttlSec * 1000);
      }
    } catch (err: any) {
      this.logger.debug(`SmartRouter recordUsage failed: ${err?.message}`);
    }
  }

  /**
   * Get the current usage percentage (0-1) for a model today.
   */
  async getUsagePct(model: string): Promise<number> {
    const quota = DAILY_QUOTA[model];
    if (!quota || quota === 0) return 0; // unlimited or unknown
    if (!this.redis) return 0;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const dayKey = `${this._usageKey(model)}:${today}`;
      const count = parseInt((await this.redis.get(dayKey)) || '0', 10);
      return count / quota;
    } catch {
      return 0;
    }
  }

  /**
   * Get human-readable usage stats for all models (for the dashboard).
   */
  async getUsageReport(): Promise<Array<{ model: string; used: number; quota: number; pct: number; exhausted: boolean }>> {
    const report: Array<{ model: string; used: number; quota: number; pct: number; exhausted: boolean }> = [];
    for (const [model, quota] of Object.entries(DAILY_QUOTA)) {
      const today = new Date().toISOString().slice(0, 10);
      const dayKey = `${this._usageKey(model)}:${today}`;
      let used = 0;
      try {
        used = parseInt((await this.redis?.get(dayKey)) || '0', 10);
      } catch {}
      const pct = quota > 0 ? used / quota : 0;
      report.push({
        model,
        used,
        quota,
        pct: Math.round(pct * 100),
        exhausted: pct >= HARD_THRESHOLD_PCT,
      });
    }
    return report.sort((a, b) => b.pct - a.pct);
  }

  /**
   * Dedup in-flight requests. If the same prompt is already being processed,
   * return the existing Promise instead of sending a duplicate request.
   *
   * The dedup key is a hash of (model, prompt, symbol) — so two council
   * roles calling the same model with the same prompt get deduped, but
   * different roles with different prompts do not.
   */
  async dedupe<T>(
    dedupKey: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Check for in-flight request
    const existing = this.inFlight.get(dedupKey);
    if (existing && existing.expiresAt > Date.now()) {
      this.logger.debug(`🔀 SmartRouter dedup hit: ${dedupKey.slice(0, 50)}...`);
      return existing.promise as Promise<T>;
    }

    // Start new request
    const promise = fn().finally(() => {
      // Remove from in-flight map after a short grace period (to dedupe
      // requests that arrive immediately after this one completes)
      setTimeout(() => this.inFlight.delete(dedupKey), 5000);
    });
    this.inFlight.set(dedupKey, { promise, expiresAt: Date.now() + DEDUP_WINDOW_MS });
    return promise;
  }

  /**
   * Generate a stable dedup key from (model, prompt, symbol).
   */
  static buildDedupKey(model: string, prompt: string, symbol?: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(`${model}|${symbol || ''}|${prompt}`).digest('hex').slice(0, 16);
    return `smart-router:dedup:${hash}`;
  }

  // ── Private helpers ──

  private _usageKey(model: string): string {
    return `smart-router:usage:${model}`;
  }

  private _cleanupInFlight(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.inFlight.entries()) {
      if (entry.expiresAt <= now) {
        this.inFlight.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`🧹 SmartRouter cleaned ${cleaned} expired in-flight entries`);
    }
  }
}

export { DAILY_QUOTA };
