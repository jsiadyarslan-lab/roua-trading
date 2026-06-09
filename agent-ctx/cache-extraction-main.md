# Task: Extract Caching Logic from AIOrchestratorService into AiCacheService

## Task ID: cache-extraction
## Agent: main
## Status: COMPLETED

## Summary
Extracted all caching logic from `AIOrchestratorService` into a dedicated `AiCacheService`, as part of #19 (Break up the AIOrchestrator monolith).

## Files Created
- `/home/z/my-project/roua-trading/apps/api/src/modules/ai/services/ai-cache.service.ts` — New dedicated cache service

## Files Modified
- `/home/z/my-project/roua-trading/apps/api/src/modules/ai/services/ai-orchestrator.service.ts` — Removed caching logic, delegated to AiCacheService
- `/home/z/my-project/roua-trading/apps/api/src/modules/ai/ai.module.ts` — Registered and exported AiCacheService

## Changes Made

### AiCacheService (new file)
- In-memory cache (`responseCache` Map with TTL) — extracted from orchestrator
- `MAX_CACHE_SIZE` = 500 — extracted from orchestrator
- `CACHE_TTL` per analysis type — extracted from orchestrator
- `inFlightRequests` Map for request deduplication — extracted from orchestrator
- `_cacheCleanupInterval` + `onModuleDestroy()` — extracted from orchestrator
- Redis cache read/write methods: `getRedisCache()`, `setRedisCache()`, `setRedisCacheWithTTL()`
- Memory cache methods: `getMemoryCache()`, `setMemoryCache()`
- In-flight dedup methods: `getInFlightRequest()`, `setInFlightRequest()`, `removeInFlightRequest()`
- Cache key generators: `generateRedisCacheKey()`, `generateMemoryCacheKey()`, `generateDedupeKey()`
- Utility: `getTTL()`, `clearCache()`, `getRedis()`
- Private helpers: `_evictOldestEntries()`, `_stableStringify()`, `_hashPrompt()`
- `@Optional()` injection of `RedisService` (same pattern as before)

### AIOrchestratorService (modified)
- Removed `OnModuleDestroy` interface and `onModuleDestroy()` method
- Removed `_cacheCleanupInterval` field
- Removed `inFlightRequests` Map
- Removed `responseCache` Map and `MAX_CACHE_SIZE`
- Removed `CACHE_TTL` record
- Removed private cache helpers: `_getCacheKey()`, `_getCachedResult()`, `_setCachedResult()`, `_cleanExpiredCache()`, `_evictOldestEntries()`, `_stableStringify()`, `_hashPrompt()`
- Added `AiCacheService` as constructor dependency (injected as `this.cache`)
- Replaced `@Optional() private readonly redis?: RedisService` with `private readonly cache: AiCacheService`
- `analyze()` method now uses `this.cache.generateRedisCacheKey()`, `this.cache.getRedisCache()`, `this.cache.generateMemoryCacheKey()`, `this.cache.getMemoryCache()`, `this.cache.generateDedupeKey()`, `this.cache.getInFlightRequest()`, `this.cache.setInFlightRequest()`, `this.cache.removeInFlightRequest()`
- `_executeAnalysis()` now uses `this.cache.setRedisCache()`, `this.cache.setMemoryCache()`
- `getConsensusAnalysis()` now uses `this.cache.getRedis()`, `this.cache.getTTL('consensus')`, `this.cache.setRedisCacheWithTTL()`
- `clearCache()` delegates to `this.cache.clearCache()`
- Removed `import * as crypto from 'crypto'` (no longer needed)
- Removed `import { RedisService }` (replaced by AiCacheService)
- Removed `import { OnModuleDestroy }` (no longer needed)

### ai.module.ts (modified)
- Added `import { AiCacheService } from './services/ai-cache.service'`
- Added `AiCacheService` to providers (before AIOrchestratorService)
- Added `AiCacheService` to exports

## TypeScript Compilation
- `npx tsc --noEmit` passes with zero errors in production code
- Only pre-existing test file errors remain (unrelated to this change)

## Public API Compatibility
- All public method signatures on `AIOrchestratorService` remain unchanged
- The `analyze()` method flow is preserved: Redis check → memory check → dedup check → execute → cache result → return
- The `clearCache()` public method is preserved (delegates to AiCacheService)
- The `fetchQuickMarketData()` public method is preserved (delegates to MarketDataService)
