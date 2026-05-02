-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "strategy" TEXT NOT NULL DEFAULT 'SCALPING',
    "config" TEXT NOT NULL DEFAULT '{}',
    "dailyPnL" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "dailyTradesCount" INTEGER NOT NULL DEFAULT 0,
    "totalCycles" INTEGER NOT NULL DEFAULT 0,
    "consecutiveLosses" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "credentialId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stoppedAt" TIMESTAMP(3),
    "lastCycleAt" TIMESTAMP(3),
    "lastSignalAt" TIMESTAMP(3),
    "dailyResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentSession_agentRunId_key" ON "AgentSession"("agentRunId");

-- CreateIndex
CREATE INDEX "AgentSession_userId_idx" ON "AgentSession"("userId");

-- CreateIndex
CREATE INDEX "AgentSession_status_idx" ON "AgentSession"("status");

-- CreateIndex
CREATE INDEX "AgentSession_userId_status_idx" ON "AgentSession"("userId", "status");

-- CreateIndex
CREATE INDEX "AgentSession_startedAt_idx" ON "AgentSession"("startedAt");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
