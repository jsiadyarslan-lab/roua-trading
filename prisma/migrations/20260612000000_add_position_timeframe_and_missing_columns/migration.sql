-- V204 FIX: Add missing columns to Position table that were in the Prisma schema
-- but never had migrations created. These columns are referenced by the code
-- but would be missing if the database was set up via `prisma migrate deploy`.

-- 1. timeframe: V204 — persisted in DB for position-monitor MAX_HOLDING calculation.
--    Was only in Redis (lost on restart → wrong holding time, positions closed at 8h instead of 48h).
--    The position-monitor reads this column FIRST (before checking Redis fallback).
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "timeframe" TEXT;

-- 2. closeReason: V141 — Why the position was closed (STOP_LOSS, TAKE_PROFIT, MANUAL, etc.)
--    Used for trade journal analytics and debugging.
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;

-- 3. version: Optimistic locking — prevents concurrent close race condition.
--    Without this, two concurrent close attempts could both succeed, causing
--    double PnL recording or negative quantity.
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0;

-- 4. exchangeSymbol: Exchange-specific symbol (e.g. BTCUSD for Alpaca) for reconciliation.
--    Used for MT5 position matching and exchange sync.
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exchangeSymbol" TEXT;

-- 5. source: V145 — Source of the trade ('user_manual', 'smart_executor', 'agent', 'auto_paper').
--    Used for per-source position counting, risk management, and analytics.
ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user_manual';

-- Backfill existing positions that have Redis timeframe keys
-- (This is a one-time migration; the application code also backfills on read.)
-- Note: We cannot access Redis from SQL, so the application's V204 backfill
-- logic in position-monitor.service.ts handles this on a per-position basis.

-- Create index on timeframe for efficient position-monitor queries
CREATE INDEX IF NOT EXISTS "Position_timeframe_idx" ON "Position"("timeframe");

-- Create index on source for efficient per-source counting
CREATE INDEX IF NOT EXISTS "Position_source_idx" ON "Position"("source");
