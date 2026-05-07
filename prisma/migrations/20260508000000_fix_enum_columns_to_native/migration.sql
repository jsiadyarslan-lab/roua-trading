-- Fix: Convert TEXT columns to native enum types to match Prisma schema
-- This resolves "invalid input value for enum" errors when Prisma queries
-- tables that were created by the safety-net SQL (which used TEXT columns).
--
-- The root cause: The init migration and subsequent safety-net SQL created
-- all enum-like columns as TEXT, but the Prisma schema expects native enum types.
-- When Prisma Client sends typed enum parameters, PostgreSQL rejects them
-- because the column is TEXT, not the expected enum type.
--
-- Additionally, the 20260507000000_fix_agent_strategy_enum migration added
-- extra values (REJECTED, CLOSED, EXPIRED, TIMEOUT, SIGNAL_REVERSAL) to
-- AgentTradeStatus and AgentExitReason that are NOT in the Prisma schema.
-- We must remove those by recreating the enum types.

-- ══════════════════════════════════════════════════════════════════
-- Step 1: Create missing enum types (idempotent — skip if exists)
-- ══════════════════════════════════════════════════════════════════

DO $$ BEGIN CREATE TYPE "Tier" AS ENUM ('FREE', 'PRO', 'PLUS', 'PREMIUM', 'INSTITUTIONAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AssetType" AS ENUM ('STOCK', 'FOREX', 'CRYPTO', 'COMMODITY', 'INDEX'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SignalAction" AS ENUM ('BUY', 'SELL', 'WAIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SignalStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'EXECUTED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderSide" AS ENUM ('BUY', 'SELL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderType" AS ENUM ('MARKET', 'LIMIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderEventType" AS ENUM ('CREATED', 'ACCEPTED', 'RISK_REJECTED', 'SENT_TO_EXCHANGE', 'FILLED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'LIQUIDATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TradeType" AS ENUM ('ENTRY', 'EXIT', 'PARTIAL_EXIT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AlertCondition" AS ENUM ('ABOVE', 'BELOW', 'CROSSES_UP', 'CROSSES_DOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationType" AS ENUM ('SIGNAL_GENERATED', 'ORDER_FILLED', 'ORDER_REJECTED', 'ORDER_ACCEPTED', 'POSITION_OPENED', 'POSITION_CLOSED', 'RISK_WARNING', 'PRICE_ALERT', 'AI_INSIGHT', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "NotificationPriority" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PredictionEventStatus" AS ENUM ('ACTIVE', 'RESOLVED', 'EXPIRED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ContentArticleStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════════
-- Step 2: Fix AgentTradeStatus enum — remove extra values
-- ══════════════════════════════════════════════════════════════════
-- Prisma expects: PENDING, FILLED, PARTIALLY_FILLED, CANCELLED, FAILED
-- DB may have extra values: REJECTED, CLOSED, EXPIRED (from 20260507000000 migration)
--
-- PostgreSQL cannot remove values from an enum. We must:
-- 1. Rename the old type
-- 2. Create a new type with correct values
-- 3. Retype the column
-- 4. Drop the old type

-- First, clean up any data with invalid enum values
UPDATE "AutonomousTrade" SET status = 'FAILED' WHERE status IN ('REJECTED', 'CLOSED', 'EXPIRED');

-- Check if the enum type has extra values — if so, recreate it
DO $$
DECLARE
  has_rejected boolean;
  old_type_exists boolean;
BEGIN
  -- Check if the AgentTradeStatus enum has the REJECTED value (extra value not in Prisma)
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AgentTradeStatus' AND e.enumlabel = 'REJECTED'
  ) INTO has_rejected;

  IF has_rejected THEN
    -- The enum has extra values — need to recreate it
    -- Step 1: Rename old type
    ALTER TYPE "AgentTradeStatus" RENAME TO "AgentTradeStatus_old";

    -- Step 2: Create new type with correct values
    CREATE TYPE "AgentTradeStatus" AS ENUM ('PENDING', 'FILLED', 'PARTIALLY_FILLED', 'CANCELLED', 'FAILED');

    -- Step 3: If AutonomousTrade.status column is already using AgentTradeStatus_old, retypes it
    -- If it's TEXT, also retypes it
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'AutonomousTrade' AND column_name = 'status'
      AND udt_name = 'AgentTradeStatus_old'
    ) INTO old_type_exists;

    IF old_type_exists THEN
      ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" DROP DEFAULT;
      ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" TYPE "AgentTradeStatus" USING "status"::text::"AgentTradeStatus";
      ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" SET DEFAULT 'PENDING';
    END IF;

    -- Step 4: Drop old type
    DROP TYPE "AgentTradeStatus_old";
  END IF;
END $$;

-- If AutonomousTrade.status is still TEXT, convert it now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AutonomousTrade' AND column_name = 'status' AND data_type = 'text'
  ) THEN
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" TYPE "AgentTradeStatus" USING "status"::"AgentTradeStatus";
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- Step 3: Fix AgentExitReason enum — remove extra values
-- ══════════════════════════════════════════════════════════════════
-- Prisma expects: TAKE_PROFIT, STOP_LOSS, MANUAL, TRAILING_STOP, STRATEGY_EXIT
-- DB may have extra: TIMEOUT, SIGNAL_REVERSAL (from 20260507000000 migration)

UPDATE "AutonomousTrade" SET "exitReason" = 'STRATEGY_EXIT' WHERE "exitReason" IN ('TIMEOUT', 'SIGNAL_REVERSAL');

DO $$
DECLARE
  has_timeout boolean;
  old_type_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AgentExitReason' AND e.enumlabel = 'TIMEOUT'
  ) INTO has_timeout;

  IF has_timeout THEN
    ALTER TYPE "AgentExitReason" RENAME TO "AgentExitReason_old";
    CREATE TYPE "AgentExitReason" AS ENUM ('TAKE_PROFIT', 'STOP_LOSS', 'MANUAL', 'TRAILING_STOP', 'STRATEGY_EXIT');

    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'AutonomousTrade' AND column_name = 'exitReason'
      AND udt_name = 'AgentExitReason_old'
    ) INTO old_type_exists;

    IF old_type_exists THEN
      ALTER TABLE "AutonomousTrade" ALTER COLUMN "exitReason" TYPE "AgentExitReason" USING "exitReason"::text::"AgentExitReason";
    END IF;

    DROP TYPE "AgentExitReason_old";
  END IF;
END $$;

-- If AutonomousTrade.exitReason is still TEXT, convert it now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AutonomousTrade' AND column_name = 'exitReason' AND data_type = 'text'
  ) THEN
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "exitReason" TYPE "AgentExitReason" USING "exitReason"::"AgentExitReason";
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- Step 4: Convert AutonomousTrade TEXT columns to native enums
-- ══════════════════════════════════════════════════════════════════

-- side -> OrderSide
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AutonomousTrade' AND column_name = 'side' AND data_type = 'text'
  ) THEN
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide";
  END IF;
END $$;

-- orderType -> OrderType
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AutonomousTrade' AND column_name = 'orderType' AND data_type = 'text'
  ) THEN
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "orderType" TYPE "OrderType" USING "orderType"::"OrderType";
  END IF;
END $$;

-- strategy -> AgentStrategy
-- First ensure AgentStrategy enum exists with all correct values
DO $$
DECLARE
  strategy_correct boolean;
BEGIN
  -- Check if AgentStrategy has all expected values and no extras
  SELECT NOT EXISTS (
    SELECT e.enumlabel FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'AgentStrategy'
    AND e.enumlabel NOT IN ('AUTO', 'SCALPING', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI')
  ) INTO strategy_correct;

  -- If AgentStrategy doesn't exist or has wrong values, ensure it has all correct values
  -- (We can't easily remove extra values, but the 20260507000000 migration only added correct ones)
  -- Just add any missing values
  IF NOT strategy_correct OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AgentStrategy') THEN
    -- Ensure all values exist
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'AUTO'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'SCALPING'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'SWING'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'GRID'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'MEAN_REVERSION'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'MOMENTUM_BREAKOUT'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'DCA'; EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER TYPE "AgentStrategy" ADD VALUE 'VWAP_RSI'; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

-- Now convert the column if it's still TEXT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'AutonomousTrade' AND column_name = 'strategy' AND data_type = 'text'
  ) THEN
    -- Fix any invalid strategy values before conversion
    UPDATE "AutonomousTrade" SET strategy = 'AUTO' WHERE strategy NOT IN ('AUTO', 'SCALPING', 'SWING', 'GRID', 'MEAN_REVERSION', 'MOMENTUM_BREAKOUT', 'DCA', 'VWAP_RSI');
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "strategy" DROP DEFAULT;
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "strategy" TYPE "AgentStrategy" USING "strategy"::"AgentStrategy";
    ALTER TABLE "AutonomousTrade" ALTER COLUMN "strategy" SET DEFAULT 'AUTO';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- Step 5: Convert other tables' TEXT columns to native enums
-- ══════════════════════════════════════════════════════════════════
-- Each conversion is guarded by a check that the column is currently TEXT

-- User.tier -> Tier enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'tier' AND data_type = 'text') THEN
    ALTER TABLE "User" ALTER COLUMN "tier" TYPE "Tier" USING "tier"::"Tier";
  END IF;
END $$;

-- Position.side -> OrderSide enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Position' AND column_name = 'side' AND data_type = 'text') THEN
    ALTER TABLE "Position" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide";
  END IF;
END $$;

-- Position.status -> PositionStatus enum
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Position' AND column_name = 'status' AND data_type = 'text') THEN
    ALTER TABLE "Position" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Position" ALTER COLUMN "status" TYPE "PositionStatus" USING "status"::"PositionStatus";
    ALTER TABLE "Position" ALTER COLUMN "status" SET DEFAULT 'OPEN';
  END IF;
END $$;

-- Order.side -> OrderSide
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'side' AND data_type = 'text') THEN
    ALTER TABLE "Order" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide";
  END IF;
END $$;

-- Order.type -> OrderType
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'type' AND data_type = 'text') THEN
    ALTER TABLE "Order" ALTER COLUMN "type" TYPE "OrderType" USING "type"::"OrderType";
  END IF;
END $$;

-- Order.status -> OrderStatus
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'status' AND data_type = 'text') THEN
    ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus";
    ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

-- OrderEvent.eventType -> OrderEventType
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'OrderEvent' AND column_name = 'eventType' AND data_type = 'text') THEN
    ALTER TABLE "OrderEvent" ALTER COLUMN "eventType" TYPE "OrderEventType" USING "eventType"::"OrderEventType";
  END IF;
END $$;

-- Trade.side -> OrderSide
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trade' AND column_name = 'side' AND data_type = 'text') THEN
    ALTER TABLE "Trade" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide";
  END IF;
END $$;

-- Trade.type -> TradeType
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trade' AND column_name = 'type' AND data_type = 'text') THEN
    ALTER TABLE "Trade" ALTER COLUMN "type" TYPE "TradeType" USING "type"::"TradeType";
  END IF;
END $$;

-- PaperOrder.side -> OrderSide
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PaperOrder' AND column_name = 'side' AND data_type = 'text') THEN
    ALTER TABLE "PaperOrder" ALTER COLUMN "side" TYPE "OrderSide" USING "side"::"OrderSide";
  END IF;
END $$;

-- PaperOrder.type -> OrderType
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PaperOrder' AND column_name = 'type' AND data_type = 'text') THEN
    ALTER TABLE "PaperOrder" ALTER COLUMN "type" TYPE "OrderType" USING "type"::"OrderType";
  END IF;
END $$;

-- PaperOrder.status -> OrderStatus
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PaperOrder' AND column_name = 'status' AND data_type = 'text') THEN
    ALTER TABLE "PaperOrder" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "PaperOrder" ALTER COLUMN "status" TYPE "OrderStatus" USING "status"::"OrderStatus";
    ALTER TABLE "PaperOrder" ALTER COLUMN "status" SET DEFAULT 'PENDING';
  END IF;
END $$;

-- Signal.action -> SignalAction
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Signal' AND column_name = 'action' AND data_type = 'text') THEN
    ALTER TABLE "Signal" ALTER COLUMN "action" TYPE "SignalAction" USING "action"::"SignalAction";
  END IF;
END $$;

-- Signal.status -> SignalStatus
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Signal' AND column_name = 'status' AND data_type = 'text') THEN
    ALTER TABLE "Signal" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "Signal" ALTER COLUMN "status" TYPE "SignalStatus" USING "status"::"SignalStatus";
    ALTER TABLE "Signal" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

-- PortfolioAsset.assetType -> AssetType
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PortfolioAsset' AND column_name = 'assetType' AND data_type = 'text') THEN
    ALTER TABLE "PortfolioAsset" ALTER COLUMN "assetType" TYPE "AssetType" USING "assetType"::"AssetType";
  END IF;
END $$;

-- PredictionEvent.status -> PredictionEventStatus
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'PredictionEvent' AND column_name = 'status' AND data_type = 'text') THEN
    ALTER TABLE "PredictionEvent" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "PredictionEvent" ALTER COLUMN "status" TYPE "PredictionEventStatus" USING "status"::"PredictionEventStatus";
    ALTER TABLE "PredictionEvent" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
  END IF;
END $$;

-- ContentArticle.status -> ContentArticleStatus
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ContentArticle' AND column_name = 'status' AND data_type = 'text') THEN
    ALTER TABLE "ContentArticle" ALTER COLUMN "status" DROP DEFAULT;
    ALTER TABLE "ContentArticle" ALTER COLUMN "status" TYPE "ContentArticleStatus" USING "status"::"ContentArticleStatus";
    ALTER TABLE "ContentArticle" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
  END IF;
END $$;

-- Alert.condition -> AlertCondition
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Alert' AND column_name = 'condition' AND data_type = 'text') THEN
    ALTER TABLE "Alert" ALTER COLUMN "condition" TYPE "AlertCondition" USING "condition"::"AlertCondition";
  END IF;
END $$;

-- UserNotification.type -> NotificationType
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserNotification' AND column_name = 'type' AND data_type = 'text') THEN
    ALTER TABLE "UserNotification" ALTER COLUMN "type" TYPE "NotificationType" USING "type"::"NotificationType";
  END IF;
END $$;

-- UserNotification.priority -> NotificationPriority
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'UserNotification' AND column_name = 'priority' AND data_type = 'text') THEN
    ALTER TABLE "UserNotification" ALTER COLUMN "priority" DROP DEFAULT;
    ALTER TABLE "UserNotification" ALTER COLUMN "priority" TYPE "NotificationPriority" USING "priority"::"NotificationPriority";
    ALTER TABLE "UserNotification" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM';
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════
-- Step 6: Fix AgentSession default values
-- ══════════════════════════════════════════════════════════════════
-- The original migration set:
--   status DEFAULT 'RUNNING'  → should be 'PENDING'
--   strategy DEFAULT 'SCALPING' → should be 'AUTO'
-- AgentSession.status and strategy are STRING type in Prisma (not enum),
-- so we only need to fix the default values and existing data.

ALTER TABLE "AgentSession" ALTER COLUMN "status" SET DEFAULT 'PENDING';
ALTER TABLE "AgentSession" ALTER COLUMN "strategy" SET DEFAULT 'AUTO';

-- Fix existing AgentSession rows with wrong defaults
UPDATE "AgentSession" SET strategy = 'AUTO' WHERE strategy = 'SCALPING' AND status = 'PENDING';

-- ══════════════════════════════════════════════════════════════════
-- Step 7: Fix AutonomousTrade default values
-- ══════════════════════════════════════════════════════════════════
-- The original migration set strategy DEFAULT 'SCALPING' → should be 'AUTO'
-- This was already fixed above in Step 4 when we converted the column type,
-- but let's ensure the default is correct regardless.

ALTER TABLE "AutonomousTrade" ALTER COLUMN "strategy" SET DEFAULT 'AUTO';
