-- Add M1 (1-minute) timeframe to BriefTimeframe enum
-- This enables the Smart Executor to generate and process M1 briefs
-- for ultra-fast scalping trades.
--
-- Before this migration, M1 was defined in the TypeScript types
-- (EXECUTOR_TIMEFRAMES = ['M1', 'M5', 'M15']) but NOT in the database enum,
-- causing all M1 brief creation attempts to fail silently with a
-- PostgreSQL enum constraint violation.

ALTER TYPE "BriefTimeframe" ADD VALUE IF NOT EXISTS 'M1';
