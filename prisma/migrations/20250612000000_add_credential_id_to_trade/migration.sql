-- AlterTable: Add credentialId column to Trade table for account-based filtering
-- V205: When switching accounts, trades must be filterable by credentialId
ALTER TABLE "Trade" ADD COLUMN "credentialId" TEXT;

-- CreateIndex: Index for filtering trades by credentialId
CREATE INDEX "Trade_credentialId_idx" ON "Trade"("credentialId");

-- CreateIndex: Composite index for user + credential filtering
CREATE INDEX "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId");
