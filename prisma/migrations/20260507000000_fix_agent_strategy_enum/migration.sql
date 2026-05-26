-- Fix AgentStrategy enum: add missing values that the application code uses
-- The Prisma schema defines 8 values but the database enum was created with
-- only the original values. This causes "invalid input value for enum" errors
-- when the app tries to query trades with MOMENTUM_BREAKOUT, MEAN_REVERSION, etc.

-- Add missing enum values (IF NOT EXISTS is not supported for ALTER TYPE ADD VALUE,
-- so we wrap in DO blocks to handle the case where values already exist)
DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'MOMENTUM_BREAKOUT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'MEAN_REVERSION';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'DCA';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'VWAP_RSI';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'GRID';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'AUTO';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'SCALPING';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentStrategy" ADD VALUE 'SWING';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Also fix the OrderSide and OrderType enums if they exist as native enums
-- (prisma db push may have created them)
DO $$ BEGIN
  ALTER TYPE "OrderSide" ADD VALUE 'BUY';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "OrderSide" ADD VALUE 'SELL';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "OrderType" ADD VALUE 'MARKET';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "OrderType" ADD VALUE 'LIMIT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentTradeStatus" ADD VALUE 'PENDING';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentTradeStatus" ADD VALUE 'FILLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentTradeStatus" ADD VALUE 'PARTIALLY_FILLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentTradeStatus" ADD VALUE 'CANCELLED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentTradeStatus" ADD VALUE 'FAILED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentExitReason" ADD VALUE 'TAKE_PROFIT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentExitReason" ADD VALUE 'STOP_LOSS';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentExitReason" ADD VALUE 'MANUAL';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentExitReason" ADD VALUE 'TRAILING_STOP';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "AgentExitReason" ADD VALUE 'STRATEGY_EXIT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
