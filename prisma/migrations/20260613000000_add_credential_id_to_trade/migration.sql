-- AlterTable: Add credentialId column to Trade table for account-based filtering
-- V205: When switching accounts, trades must be filterable by credentialId
ALTER TABLE "Trade" ADD COLUMN "credentialId" TEXT;

-- Backfill: Populate credentialId for existing Trade records from related Position or Order
-- This is critical for account-based filtering to work on historical data.
-- Step 1: Set credentialId from related Position (most reliable source)
UPDATE "Trade" t
SET "credentialId" = p."credentialId"
FROM "Position" p
WHERE t."positionId" = p.id AND t."credentialId" IS NULL AND p."credentialId" IS NOT NULL;

-- Step 2: Set credentialId from related Order → ExchangeCredential (for trades without a Position)
UPDATE "Trade" t
SET "credentialId" = o."exchangeCredentialId"
FROM "Order" o
WHERE t."orderId" = o.id AND t."credentialId" IS NULL AND o."exchangeCredentialId" IS NOT NULL;

-- CreateIndex: Index for filtering trades by credentialId
CREATE INDEX "Trade_credentialId_idx" ON "Trade"("credentialId");

-- CreateIndex: Composite index for user + credential filtering
CREATE INDEX "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId");
