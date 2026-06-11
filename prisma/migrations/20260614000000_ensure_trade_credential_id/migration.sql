-- V209: ENSURE Trade.credentialId column exists and is properly backfilled.
-- This migration is a SAFETY NET — it uses IF NOT EXISTS so it's safe to run
-- even if previous migrations already added the column.
--
-- WHY: Previous migration (20260613000000) may have been marked as "applied"
-- in _prisma_migrations without the SQL actually executing (partial deploy).
-- This caused the Trade table to be missing the credentialId column,
-- which broke ALL trade queries (Prisma SELECT includes all schema columns).
-- Result: trades never appeared after deployment.

-- 1. Ensure the column exists (no-op if already added)
ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "credentialId" TEXT;

-- 2. Backfill from Position (most reliable — Position.credentialId is NOT NULL)
UPDATE "Trade" t
SET "credentialId" = p."credentialId"
FROM "Position" p
WHERE t."positionId" = p.id
  AND t."credentialId" IS NULL
  AND p."credentialId" IS NOT NULL;

-- 3. Backfill from Order → ExchangeCredential (for trades without a Position link)
UPDATE "Trade" t
SET "credentialId" = o."exchangeCredentialId"
FROM "Order" o
WHERE t."orderId" = o.id
  AND t."credentialId" IS NULL
  AND o."exchangeCredentialId" IS NOT NULL;

-- 4. Ensure indexes exist (no-op if already created)
CREATE INDEX IF NOT EXISTS "Trade_credentialId_idx" ON "Trade"("credentialId");
CREATE INDEX IF NOT EXISTS "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId");
