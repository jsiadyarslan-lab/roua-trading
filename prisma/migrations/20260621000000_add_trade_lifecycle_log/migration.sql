-- V339: Trade Lifecycle Log — Single Source of Truth for every trade event
-- Every position state change is logged here for audit and replay debugging.

CREATE TABLE "TradeLifecycleLog" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "closingSource" TEXT,
    "module" TEXT NOT NULL,
    "reason" TEXT,
    "price" DECIMAL(18,8),
    "highestPrice" DECIMAL(18,8),
    "lowestPrice" DECIMAL(18,8),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeLifecycleLog_pkey" PRIMARY KEY ("id")
);

-- Indexes for common query patterns
CREATE INDEX "TradeLifecycleLog_positionId_idx" ON "TradeLifecycleLog"("positionId");
CREATE INDEX "TradeLifecycleLog_userId_idx" ON "TradeLifecycleLog"("userId");
CREATE INDEX "TradeLifecycleLog_eventType_idx" ON "TradeLifecycleLog"("eventType");
CREATE INDEX "TradeLifecycleLog_closingSource_idx" ON "TradeLifecycleLog"("closingSource");
CREATE INDEX "TradeLifecycleLog_positionId_createdAt_idx" ON "TradeLifecycleLog"("positionId", "createdAt");
CREATE INDEX "TradeLifecycleLog_createdAt_idx" ON "TradeLifecycleLog"("createdAt");
