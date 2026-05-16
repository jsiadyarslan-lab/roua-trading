-- CreateTable
CREATE TABLE IF NOT EXISTS "AutonomousTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "orderType" TEXT NOT NULL,
    "strategy" TEXT NOT NULL DEFAULT 'SCALPING',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "entryPrice" DECIMAL(19,8) NOT NULL,
    "currentPrice" DECIMAL(19,8),
    "exitPrice" DECIMAL(19,8),
    "stopLoss" DECIMAL(19,8) NOT NULL,
    "takeProfit" DECIMAL(19,8) NOT NULL,
    "quantity" DECIMAL(19,8) NOT NULL,
    "filledQuantity" DECIMAL(19,8) NOT NULL DEFAULT 0,
    "pnl" DECIMAL(19,4),
    "fee" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "feeCurrency" TEXT NOT NULL DEFAULT 'USD',
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "riskRewardRatio" DECIMAL(10,4) NOT NULL,
    "reasoning" TEXT NOT NULL,
    "signalData" TEXT NOT NULL DEFAULT '{}',
    "metadata" TEXT NOT NULL DEFAULT '{}',
    "decisions" TEXT NOT NULL DEFAULT '[]',
    "execution" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "holdingDurationMs" INTEGER,
    "credentialId" TEXT NOT NULL,
    "exchangeOrderId" TEXT,
    "isWinning" BOOLEAN,
    "exitReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutonomousTrade_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AutonomousTrade_userId_idx" ON "AutonomousTrade"("userId");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_symbol_idx" ON "AutonomousTrade"("symbol");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_strategy_idx" ON "AutonomousTrade"("strategy");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_status_idx" ON "AutonomousTrade"("status");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_agentRunId_idx" ON "AutonomousTrade"("agentRunId");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_createdAt_idx" ON "AutonomousTrade"("createdAt");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_userId_status_idx" ON "AutonomousTrade"("userId", "status");
CREATE INDEX IF NOT EXISTS "AutonomousTrade_userId_strategy_createdAt_idx" ON "AutonomousTrade"("userId", "strategy", "createdAt");

-- AddForeignKey
ALTER TABLE "AutonomousTrade" ADD CONSTRAINT "AutonomousTrade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
