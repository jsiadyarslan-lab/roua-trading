# Task #19: Extract MarketDataService from AIOrchestratorService

## Summary

Extracted all market data fetching logic from the AIOrchestratorService monolith into a dedicated MarketDataService.

## Files Changed

### 1. Created: `apps/api/src/modules/ai/services/market-data.service.ts` (538 lines)
- New `@Injectable()` NestJS service: `MarketDataService`
- Contains constants: `PRICE_SANITY`, `REFERENCE_PRICES`, `COINCAP_IDS` (moved from orchestrator)
- Contains `lastKnownPriceCache` and `PRICE_CACHE_MAX_AGE` (moved from orchestrator)
- Public method: `fetchQuickMarketData(symbol)` returns `{ price, rsi, macd, change24h? }`
- Private methods: `_fetchQuickMarketData`, `_symbolToCoingeckoId`, `_fetchCoinGeckoFallback`, `_formatMacd`
- Uses `calcRsiLatest` and `calcMacdScalar` from `indicator-algorithms.util.ts`
- Injected dependencies: `ConfigService`, `RedisService` (optional)

### 2. Modified: `apps/api/src/modules/ai/services/ai-orchestrator.service.ts` (2326 → 1667 lines, ~660 lines removed)
- Removed imports: `calcRsiLatest`, `calcEmaLatest`, `calcMacdScalar`, `axios`
- Added import: `MarketDataService`
- Removed constants: `PRICE_SANITY`, `REFERENCE_PRICES`, `COINCAP_IDS`, `lastKnownPriceCache`, `PRICE_CACHE_MAX_AGE`
- Added `MarketDataService` as injected dependency in constructor (2nd param)
- Replaced `this._fetchQuickMarketData()` calls with `this.marketData.fetchQuickMarketData()`
- `fetchQuickMarketData()` public method now delegates to `this.marketData.fetchQuickMarketData()`
- Removed methods: `_fetchQuickMarketData`, `_symbolToCoingeckoId`, `_fetchCoinGeckoFallback`, `_calculateRSI`, `_calculateMACD`, `_calculateEMA`

### 3. Modified: `apps/api/src/modules/ai/ai.module.ts`
- Added import: `MarketDataService`
- Added `MarketDataService` as provider (before AIOrchestratorService)
- Added `MarketDataService` to exports (so other modules can use it)

## TypeScript Compilation

All source files compile cleanly. The only errors are in pre-existing test files (`__tests__/phase1-*.spec.ts`) that are unrelated to this change:
- `market-data.service.ts` — ✅ No errors
- `ai-orchestrator.service.ts` — ✅ No errors
- `ai.module.ts` — ✅ No errors

## Backward Compatibility

- `aiOrchestrator.fetchQuickMarketData()` still works — it now delegates to `MarketDataService`
- External consumers (Strategic Council, Smart Executor, AI Controller) require zero changes
- `MarketDataService` is exported from `AiModule` so other modules can inject it directly
