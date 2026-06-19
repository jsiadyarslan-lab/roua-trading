import { Injectable, Logger, Optional, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';
import { AIAnalysisResponse } from './groq.service';
import * as crypto from 'crypto';

@Injectable()
export class AiCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(AiCacheService.name);

  /** In-memory cache for AI responses with TTL */
  private readonly responseCache = new Map<string, { result: AIAnalysisResponse; expiresAt: number }>();
  private readonly MAX_CACHE_SIZE = 500;

  /** In-flight request deduplication */
  private readonly inFlightRequests = new Map<string, Promise<AIAnalysisResponse>>();

  /** Cache TTL per analysis type */
  private readonly CACHE_TTL: Record<string, number> = {
    sentiment: 5 * 60 * 1000,
    market_analysis: 15 * 60 * 1000,
    prediction: 10 * 60 * 1000,
    signal_generation: 5 * 60 * 1000,
    risk_analysis: 15 * 60 * 1000,
    translation: 30 * 60 * 1000,
    general: 10 * 60 * 1000,
    // V289: raised consensus TTL from 3 min → 30 min. Market structure doesn't
    // change meaningfully in 3 minutes. 30 min cuts AI API calls by ~10x for
    // the same symbol/locale, preserving daily quota on free-tier providers.
    // Partial (under-3-models) results stay at 1 min so they refresh quickly
    // once more models come back online.
    consensus: 30 * 60 * 1000,
    consensus_partial: 1 * 60 * 1000,
  };

  private _cacheCleanupInterval: NodeJS.Timeout | null = null;

  constructor(@Optional() private readonly redis?: RedisService) {
    // Periodic cleanup of expired entries (every 5 minutes)
    this._cacheCleanupInterval = setInterval(() => {
      const now = Date.now();
      let expired = 0;
      for (const [key, entry] of this.responseCache) {
        if (now >= entry.expiresAt) {
          this.responseCache.delete(key);
          expired++;
        }
      }
      if (expired > 0) {
        this.logger.debug(`🧹 Cleaned ${expired} expired cache entries (remaining: ${this.responseCache.size})`);
      }
    }, 5 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this._cacheCleanupInterval) {
      clearInterval(this._cacheCleanupInterval);
      this._cacheCleanupInterval = null;
    }
  }

  // ── Public Methods ──

  /** Check Redis cache for an analysis result */
  async getRedisCache(redisCacheKey: string): Promise<AIAnalysisResponse | null> {
    try {
      const cached = await this.redis?.get(redisCacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
    return null;
  }

  /** Store result in Redis cache */
  async setRedisCache(redisCacheKey: string, result: AIAnalysisResponse, type: string): Promise<void> {
    const ttl = this.CACHE_TTL[type] || this.CACHE_TTL.general;
    try {
      await this.redis?.set(redisCacheKey, JSON.stringify(result), ttl);
    } catch {}
  }

  /** Store result in Redis cache with a custom TTL (for consensus with differentiated TTLs) */
  async setRedisCacheWithTTL(redisCacheKey: string, result: unknown, ttlMs: number): Promise<void> {
    try {
      await this.redis?.set(redisCacheKey, JSON.stringify(result), ttlMs);
    } catch {}
  }

  /** Check in-memory cache */
  getMemoryCache(key: string): AIAnalysisResponse | null {
    const entry = this.responseCache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.result;
    }
    if (entry) {
      this.responseCache.delete(key); // expired
    }
    return null;
  }

  /** Store result in in-memory cache */
  setMemoryCache(key: string, result: AIAnalysisResponse, type: string): void {
    const ttl = this.CACHE_TTL[type] || this.CACHE_TTL.general;
    this.responseCache.set(key, { result, expiresAt: Date.now() + ttl });

    // Evict oldest entries if cache is too large
    if (this.responseCache.size > this.MAX_CACHE_SIZE) {
      this._evictOldestEntries();
    }
  }

  /** Get or create in-flight request (deduplication) */
  getInFlightRequest(key: string): Promise<AIAnalysisResponse> | null {
    return this.inFlightRequests.get(key) || null;
  }

  /** Set in-flight request */
  setInFlightRequest(key: string, promise: Promise<AIAnalysisResponse>): void {
    this.inFlightRequests.set(key, promise);
  }

  /** Remove in-flight request */
  removeInFlightRequest(key: string): void {
    this.inFlightRequests.delete(key);
  }

  /** Generate Redis cache key from request */
  generateRedisCacheKey(request: any): string {
    return `ai:analysis:${this._hashPrompt(this._stableStringify(request))}`;
  }

  /** Generate in-memory cache key from request */
  generateMemoryCacheKey(request: any): string {
    const type = request.type || 'general';
    const symbol = request.symbol || '';
    return `${type}:${symbol}:${this._hashPrompt(this._stableStringify(request))}`;
  }

  /** Generate deduplication key */
  generateDedupeKey(request: any): string {
    return `ai:${request.type || 'general'}:${request.symbol || ''}:${this._hashPrompt(this._stableStringify(request))}`;
  }

  /** Get the TTL for a given cache type */
  getTTL(type: string): number {
    return this.CACHE_TTL[type] || this.CACHE_TTL.general;
  }

  /** Clear all in-memory cache entries */
  clearCache(): void {
    this.responseCache.clear();
    this.logger.debug('🗑️ AI response cache cleared');
  }

  /** Get raw Redis client for direct operations (e.g., del for consensus cache invalidation) */
  getRedis(): RedisService | undefined {
    return this.redis;
  }

  // ── Private Methods ──

  private _evictOldestEntries(): void {
    const entries = [...this.responseCache.entries()]
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
    const toEvict = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
    for (const [key] of toEvict) {
      this.responseCache.delete(key);
    }
  }

  private _stableStringify(obj: any): string {
    if (obj === null || obj === undefined) return 'null';
    if (typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return '[' + obj.map(v => this._stableStringify(v)).join(',') + ']';
    return '{' + Object.keys(obj).sort().map(k => `"${k}":${this._stableStringify(obj[k])}`).join(',') + '}';
  }

  private _hashPrompt(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16);
  }
}
