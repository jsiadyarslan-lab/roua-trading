-- CreateTable
-- FIX: Position Reconciliation table for tracking failed position updates
-- When an order is executed on the exchange but the position update transaction
-- fails (e.g., serialization conflict), the data is stored here for retry.
CREATE TABLE IF NOT EXISTS "PositionReconciliation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeCredentialId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "filledQuantity" DECIMAL(18,8) NOT NULL,
    "fillPrice" DECIMAL(18,8) NOT NULL,
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PositionReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PositionReconciliation_orderId_key" ON "PositionReconciliation"("orderId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PositionReconciliation_status_idx" ON "PositionReconciliation"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PositionReconciliation_userId_idx" ON "PositionReconciliation"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PositionReconciliation_createdAt_idx" ON "PositionReconciliation"("createdAt");
