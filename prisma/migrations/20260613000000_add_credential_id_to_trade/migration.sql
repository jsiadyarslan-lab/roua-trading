-- V207 FIX: Add credentialId column to Trade table (IF NOT EXISTS for safe re-run)
-- V205: When switching accounts, trades must be filterable by credentialId
-- This migration uses IF NOT EXISTS so it's safe to re-run even if the column
-- was already added by a previous partial migration.

-- 1. Add column (safe to re-run)
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;

-- 2. Backfill: Populate credentialId for existing Trade records
-- Step A: Set credentialId from related Position (most reliable source)
-- Position.credentialId is NOT NULL (required), so this is the best source.
UPDATE "Trade" t
SET "credentialId" = p."credentialId"
FROM "Position" p
WHERE t."positionId" = p.id AND t."credentialId" IS NULL AND p."credentialId" IS NOT NULL;

-- Step B: Set credentialId from related Order → ExchangeCredential
-- For trades without a Position (e.g., failed orders that still recorded a trade)
UPDATE "Trade" t
SET "credentialId" = o."exchangeCredentialId"
FROM "Order" o
WHERE t."orderId" = o.id AND t."credentialId" IS NULL AND o."exchangeCredentialId" IS NOT NULL;

-- 3. Create indexes (IF NOT EXISTS for safe re-run)
CREATE INDEX IF NOT EXISTS "Trade_credentialId_idx" ON "Trade"("credentialId");
CREATE INDEX IF NOT EXISTS "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId");
