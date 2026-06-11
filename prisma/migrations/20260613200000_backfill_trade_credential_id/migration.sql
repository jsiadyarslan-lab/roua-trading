-- V207: Backfill Trade.credentialId for existing records
-- This is a SEPARATE migration from the one that adds the column,
-- because the column-adding migration may have already been applied
-- WITHOUT the backfill (if it was applied before the backfill SQL was added).
--
-- This migration uses ADD COLUMN IF NOT EXISTS + UPDATE to be safe
-- even if run multiple times or if the column already exists.

-- Ensure the column exists (no-op if already added)
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;

-- Backfill from Position (most reliable — Position.credentialId is NOT NULL)
UPDATE "Trade" t
SET "credentialId" = p."credentialId"
FROM "Position" p
WHERE t."positionId" = p.id
  AND t."credentialId" IS NULL
  AND p."credentialId" IS NOT NULL;

-- Backfill from Order (for trades without a Position link)
UPDATE "Trade" t
SET "credentialId" = o."exchangeCredentialId"
FROM "Order" o
WHERE t."orderId" = o.id
  AND t."credentialId" IS NULL
  AND o."exchangeCredentialId" IS NOT NULL;

-- Ensure indexes exist (no-op if already created)
CREATE INDEX IF NOT EXISTS "Trade_credentialId_idx" ON "Trade"("credentialId");
CREATE INDEX IF NOT EXISTS "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId");
