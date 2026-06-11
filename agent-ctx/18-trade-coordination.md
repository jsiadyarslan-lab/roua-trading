# Task #18: Unify V1 and V2 paths — TradeCoordinationService

## Summary

Implemented `TradeCoordinationService` to prevent the SmartExecutor and Autonomous Trader Agent from opening conflicting positions on the same symbol. Consolidated V1→V2 circuit breaker key cleanup code into the new service.

## Files Created

1. **`/home/z/my-project/roua-trading/apps/api/src/modules/trading/services/trade-coordination.service.ts`**
   - New service with methods:
     - `getExistingPositionSource(userId, symbol)` — checks DB for open positions on a symbol
     - `canOpenPosition(userId, symbol, requestingSource)` — coordination gate with distributed lock check
     - `acquireTradeLock(userId, symbol, source)` — Redis-based distributed lock (5s TTL)
     - `releaseTradeLock(userId, symbol)` — releases the distributed lock
     - `getOpenPositionSummary(userId)` — returns position counts grouped by source
     - `cleanupV1CircuitBreakerKeys()` — consolidates V1→V2 key cleanup logic
   - All methods are **fail-open**: if Redis or DB fails, trades are allowed through

## Files Modified

2. **`trading.module.ts`** — Imported `TradeCoordinationService`, added to providers and exports

3. **`smart-executor.service.ts`** — 
   - Added `TradeCoordinationService` import and constructor injection
   - Added coordination check + lock acquisition before `orderDispatcher.submitOrder()` in `_executeBriefForUser()`
   - Wrapped `submitOrder` call in try/finally to ensure lock release
   - Replaced V1 circuit breaker cleanup with `tradeCoordination.cleanupV1CircuitBreakerKeys()`

4. **`order-executor.service.ts`** — 
   - Added `TradeCoordinationService` import and constructor injection (with `@Optional()`)
   - Added coordination check + lock acquisition at the start of `execute()`
   - When `tradeCoordination` is available, uses it instead of old V146b agent-only check
   - Falls back to old V146b check when `tradeCoordination` is unavailable
   - Added `finally` block to release coordination lock

5. **`agent.service.ts`** — 
   - Added `TradeCoordinationService` import and constructor injection (with `@Optional()`)
   - Replaced V1 circuit breaker cleanup with `tradeCoordination.cleanupV1CircuitBreakerKeys()`

## TypeScript Compilation

All modified files compile without errors. Pre-existing errors in `phase1-fixes.spec.ts` and `phase1-integration.spec.ts` are unrelated to this change.

## Design Decisions

- **Fail-open**: If the coordination service fails (Redis down, DB error), trades proceed. This prevents a coordination outage from blocking all trading.
- **@Optional() on Agent side**: The `tradeCoordination` is `@Optional()` in both `OrderExecutorService` and `AutonomousTraderAgentService` because they use `@Optional()` for other TradingModule dependencies as well. When unavailable, the old V146b check is used as fallback.
- **Non-optional on SmartExecutor**: SmartExecutor already imports TradingModule non-optionally, so the service is always available.
- **Distributed lock TTL**: 5 seconds — enough for a single trade execution but short enough to not cause permanent deadlocks.
