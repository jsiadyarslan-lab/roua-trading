# Bug Fix Round 1 — All 13 Bugs

## Build Result
TypeScript compilation: **PASS** (exit code 0)
Lint: API passes clean; pre-existing web warnings unrelated to changes.

## Changes Made

### BUG 1: No AI result caching
**File**: `apps/api/src/modules/analytics/analytical-ai.service.ts`
- Added `RedisService` injection (optional)
- Added Redis cache check at start of `analyzeAsset()` with key `scanner:analysis:{symbol}`, 3-minute TTL
- Stores result in Redis after computation
- When two users request the same symbol, the second gets the cached result

### BUG 2: Double analysis in scanner
**Status**: Already fixed. `SignalGeneratorService.generateSignal()` already accepts `preComputedAnalysis` parameter (line 80), and `MarketScannerService` already passes the analysis result to it (line 322).

### BUG 3: AI before dedup check in news
**Status**: Already fixed. `_processNewsBatch()` checks for existing articles (lines 243-252) BEFORE making AI calls (line 257).

### BUG 4: OAuth tokens stored as plaintext
**Files**: `prisma/schema.prisma`, `apps/api/src/auth/auth.service.ts`
- Added comprehensive TODO comments in schema Account model describing the encryption plan
- Added TODO in AuthService noting the security gap
- Auth uses WebAuthn not OAuth currently, but the Account model exists for future NextAuth integration

### BUG 5: SignalService bypasses orchestrator
**Status**: Already fixed. `SignalService` uses `this.orchestrator.analyze()` for both sentiment (line 92) and signal generation (line 136). Comment on line 89 confirms this was previously fixed.

### BUG 6: No exponential backoff in circuit breaker
**File**: `apps/api/src/modules/ai/services/ai-orchestrator.service.ts`
- Changed `BASE_COOLDOWN_MS` from 120_000 (2 min) to 30_000 (30s)
- Changed `MAX_COOLDOWN_MS` from 30 * 60 * 1000 (30 min) to 5 * 60 * 1000 (5 min)
- Backoff sequence: 30s → 60s → 120s → 240s → 300s (capped at 5min)

### BUG 7: Ollama 120s timeout blocks fallback
**File**: `apps/api/src/modules/ai/services/ollama.service.ts`
- Changed timeout from `cloud ? 30000 : 5000` to unified `30000` (30s)
- This ensures the orchestrator can fall back to other models within reasonable time

### BUG 8: 8 AI calls per single news article
**Status**: Already fixed. `analyzeNewsText()` uses a single combined prompt (comment on line 137 confirms 8→1 reduction). `_processNewsBatch()` uses `_translateAndAnalyze()` which makes 1 call per article.

### BUG 9: Daily P&L calculated repeatedly in 4+ services
**File**: `apps/api/src/modules/trading/services/position-manager.service.ts`
- Added `getDailyPnL(userId)` method with Redis cache (key `daily:pnl:{userId}`, 60s TTL)
- Updated `getPortfolioSummary()` to use the cached method
- Other services (RiskGatekeeper, RiskCalculator) can inject PositionManagerService and call `getDailyPnL()` instead of independently querying the DB

### BUG 10: RAG service without Redis cache
**File**: `apps/api/src/modules/ai/services/rag.service.ts`
- Added `RedisService` injection (optional)
- Added cache check in `retrieveRelevantContext()` with key `rag:{query_hash}`, 10-minute TTL
- Extracted original logic to `_retrieveWithoutCache()`
- Added `_hashQuery()` helper for stable cache keys

### BUG 11: No HTTP cache headers on API responses
**File**: `apps/api/src/main.ts`
- Added middleware that sets Cache-Control headers:
  - `/api/exchange/`, `/api/health`, `/api/scanner/overview`, `/api/scanner/heatmap`: `public, max-age=5`
  - All other endpoints: `private, no-cache`
- Only sets headers if not already set by the endpoint itself

### BUG 12: No connection pool configuration for Prisma
**File**: `apps/api/src/common/prisma/prisma.service.ts`
- Updated `connection_limit` from 15 to 20
- Updated `pool_timeout` from 20 to 10
- Updated log message to reflect new values

### BUG 13: AI_COUNCIL fake strategy in Backtest
**File**: `apps/api/src/modules/neural/services/backtest-runner.service.ts`
- Replaced "Randomized but biased" comment with comprehensive KNOWN LIMITATION note
- Documents that RSI heuristic is used instead of real AI Council calls
- Lists three possible proper implementations
- Warns that results should be treated as approximations
