-- V341: Add State Machine states to PositionStatus enum
-- These new states enable a proper Position State Machine:
--   PENDING_CLOSE: A close has been requested but not yet executed
--   CLOSING: Close is in progress (exchange order submitted)

-- PostgreSQL ALTER TYPE ADD VALUE is idempotent-safe with IF NOT EXISTS (PG 12+)
ALTER TYPE "PositionStatus" ADD VALUE IF NOT EXISTS 'PENDING_CLOSE';
ALTER TYPE "PositionStatus" ADD VALUE IF NOT EXISTS 'CLOSING';
