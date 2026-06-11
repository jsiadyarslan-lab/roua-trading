# Task 4 & 5: Distributed Lock + BullMQ Redis Singleton Guard

## Files Created/Modified

### 1. NEW: DistributedLockService
**Path:** `/home/z/my-project/roua-trading/apps/api/src/modules/trading/services/distributed-lock.service.ts`

- Key format: `trade-rep:dir-lock:{userId}:{exchangeCredentialId}`
- Default TTL: 30 seconds, 3 retries, 500ms delay
- Methods: acquireLock(), releaseLock(), withLock(), isLocked()
- Uses RedisService.setIfNotExists() for atomic SET NX
- Safe release via lockId match (prevents releasing another process's lock)
- Auto-release via TTL on crash

### 2. MODIFIED: OrderQueueProcessor
**Path:** `/home/z/my-project/roua-trading/apps/api/src/modules/execution/services/order-queue.processor.ts`

- Added RedisService injection
- Implements OnModuleDestroy
- Redis registration key: `bullmq:processor:active:{instanceId}` (60s TTL)
- Periodic refresh every 30s
- _isRedisActiveProcessor() check in process()
- onModuleDestroy() cleanup: timer + Redis key + static guard reset
- Complements V178 static guard for cross-instance detection

### 3. MODIFIED: TradingModule
**Path:** `/home/z/my-project/roua-trading/apps/api/src/modules/trading/trading.module.ts`

- DistributedLockService added to providers and exports
- Import was already present

## TypeScript Compilation
- `cd apps/api && npx tsc --noEmit` = 0 errors ✓
