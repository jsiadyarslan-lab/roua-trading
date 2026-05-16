-- AlterTable: Add 'source' field to Trade model to distinguish real user trades from auto-paper phantom trades
-- Values: 'user_manual' (default), 'smart_executor', 'auto_paper', 'reconciliation'
ALTER TABLE "Trade" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'user_manual';

-- CreateIndex: Index the source column for efficient filtering in stats queries
CREATE INDEX "Trade_source_idx" ON "Trade"("source");

-- Update existing auto-executed paper trades to mark them as 'auto_paper'
-- These are trades created by the SmartExecutor for the system-auto-trader user
-- or for paper-trading exchange credentials, which were inflating stats
UPDATE "Trade" SET source = 'auto_paper'
WHERE "exchange" = 'paper-trading'
AND "source" = 'user_manual';

-- Update trades that were created by the SmartExecutor for real users (not auto-paper)
UPDATE "Trade" SET source = 'smart_executor'
WHERE "id" IN (
  SELECT t."id" FROM "Trade" t
  INNER JOIN "AuditLog" a ON a."userId" = t."userId"
  WHERE a."action" = 'SMART_EXECUTOR_TRADE'
  AND t."source" = 'user_manual'
  AND t."exchange" != 'paper-trading'
);
