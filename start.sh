#!/bin/bash
# Railway startup script for Roua Trading
# Production startup with full stack: NestJS API + Next.js Web
# Uses Bun runtime (oven/bun:1 Docker image)

# Don't use 'set -e' — we want to continue even if some steps fail
# so Next.js can start regardless of API/database issues
# set -e

# Load local environment fallback when running outside Railway or when env vars are absent.
if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      ''|\#*) continue ;;
    esac
    value="${value%$'\r'}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    fi
    export "$key=$value"
  done < .env
fi

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading - Starting Full Stack"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL: ${DATABASE_URL}"
echo "RP_ID: ${RP_ID:-localhost}"
echo "ORIGIN: ${ORIGIN:-not set}"
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "DEV_MODE: ${DEV_MODE:-not set}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Generate Prisma client (must be done before db push) ──
echo "📦 Generating Prisma client..."
bunx prisma generate --schema=./prisma/schema.prisma

# ── Step 2: Apply Prisma schema to database ──
echo "📦 Applying Prisma schema..."
bunx prisma db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1 || echo "⚠️ prisma db push had issues — will verify tables below"

# ── Step 3: Verify critical tables exist ──
# Prisma db:push sometimes silently fails to create new tables when
# there are existing schema conflicts. We write a SQL file and execute
# it via prisma db execute to create any missing tables.
echo "📦 Verifying critical tables..."
if [ -n "${DATABASE_URL:-}" ]; then
  # Write safety-net SQL to a temp file
  cat > /tmp/ensure_tables.sql <<'EOSQL'
    -- Position table (critical for trading engine)
    CREATE TABLE IF NOT EXISTS "Position" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "credentialId" TEXT NOT NULL,
      "exchange" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "side" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'OPEN',
      "quantity" DOUBLE PRECISION NOT NULL,
      "entryPrice" DOUBLE PRECISION NOT NULL,
      "currentPrice" DOUBLE PRECISION,
      "unrealizedPnl" DOUBLE PRECISION,
      "realizedPnl" DOUBLE PRECISION,
      "stopLoss" DOUBLE PRECISION,
      "takeProfit" DOUBLE PRECISION,
      "highestPrice" DOUBLE PRECISION,
      "lowestPrice" DOUBLE PRECISION,
      "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "closedAt" TIMESTAMP(3),
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "Position_userId_idx" ON "Position"("userId");
    CREATE INDEX IF NOT EXISTS "Position_symbol_idx" ON "Position"("symbol");
    CREATE INDEX IF NOT EXISTS "Position_status_idx" ON "Position"("status");
    CREATE INDEX IF NOT EXISTS "Position_exchange_idx" ON "Position"("exchange");

    -- OrderEvent table (critical for order lifecycle)
    CREATE TABLE IF NOT EXISTS "OrderEvent" (
      "id" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "eventType" TEXT NOT NULL,
      "payload" TEXT,
      "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");
    CREATE INDEX IF NOT EXISTS "OrderEvent_eventType_idx" ON "OrderEvent"("eventType");

    -- Trade table (critical for P&L tracking)
    CREATE TABLE IF NOT EXISTS "Trade" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "orderId" TEXT,
      "positionId" TEXT,
      "exchange" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "side" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "quantity" DOUBLE PRECISION NOT NULL,
      "price" DOUBLE PRECISION NOT NULL,
      "fee" DOUBLE PRECISION,
      "feeCurrency" TEXT,
      "pnl" DOUBLE PRECISION,
      "exchangeTradeId" TEXT,
      "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "Trade_userId_idx" ON "Trade"("userId");
    CREATE INDEX IF NOT EXISTS "Trade_symbol_idx" ON "Trade"("symbol");

    -- PaperOrder table (critical for paper trading)
    CREATE TABLE IF NOT EXISTS "PaperOrder" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "side" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "quantity" DECIMAL(65,30) NOT NULL,
      "price" DECIMAL(65,30),
      "stopLoss" DECIMAL(65,30),
      "takeProfit" DECIMAL(65,30),
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "filledQuantity" DECIMAL(65,30) NOT NULL DEFAULT 0,
      "averagePrice" DECIMAL(65,30),
      "fee" DECIMAL(65,30),
      "feeCurrency" TEXT,
      "slippage" DECIMAL(65,30),
      "idempotencyKey" TEXT NOT NULL,
      "clientOrderId" TEXT,
      "exchangeOrderId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "PaperOrder_userId_idx" ON "PaperOrder"("userId");
    CREATE INDEX IF NOT EXISTS "PaperOrder_idempotencyKey_key" ON "PaperOrder"("idempotencyKey");

    -- TradingBot table (critical for bot engine)
    CREATE TABLE IF NOT EXISTS "TradingBot" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "name" TEXT NOT NULL DEFAULT 'HFT-Alpha',
      "strategy" TEXT NOT NULL DEFAULT 'Scalp AI',
      "isActive" BOOLEAN NOT NULL DEFAULT false,
      "winRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "totalTrades" INTEGER NOT NULL DEFAULT 0,
      "dailyPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "statusMessage" TEXT NOT NULL DEFAULT 'SYSTEM_IDLE',
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "TradingBot_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "TradingBot_userId_idx" ON "TradingBot"("userId");

    -- ChartPreference table
    CREATE TABLE IF NOT EXISTS "ChartPreference" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "settings" TEXT NOT NULL DEFAULT '{}',
      "drawings" TEXT NOT NULL DEFAULT '[]',
      "updatedAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ChartPreference_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "ChartPreference_userId_symbol_key" ON "ChartPreference"("userId", "symbol");
    CREATE INDEX IF NOT EXISTS "ChartPreference_userId_idx" ON "ChartPreference"("userId");
EOSQL

  echo "📦 Executing safety-net SQL via prisma db execute..."
  bunx prisma db execute --schema=./prisma/schema.prisma --file /tmp/ensure_tables.sql 2>&1 && echo "📦 Safety-net SQL executed successfully" || echo "⚠️ Safety-net SQL had issues (non-fatal — tables may already exist with different schema)"

  rm -f /tmp/ensure_tables.sql

  # ── Step 3b: ALTER existing tables to add missing columns ──
  # CREATE TABLE IF NOT EXISTS does NOT add new columns to tables that already exist.
  # When Prisma generates queries referencing columns that don't exist in the DB yet,
  # it throws a schema mismatch error that bubbles up as a 503.
  # These ALTER TABLE statements are idempotent (IF NOT EXISTS) so they are safe to run every deploy.
  echo "📦 Adding missing columns to existing tables..."
  cat > /tmp/alter_tables.sql <<'EOSQL'
    -- ── Position table: add credentialId ──
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Position' AND column_name = 'credentialId'
      ) THEN
        ALTER TABLE "Position" ADD COLUMN "credentialId" TEXT NOT NULL DEFAULT 'unknown';
      END IF;
    END $$;

    -- ── Trade table: add positionId and exchangeTradeId ──
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Trade' AND column_name = 'positionId'
      ) THEN
        ALTER TABLE "Trade" ADD COLUMN "positionId" TEXT;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Trade' AND column_name = 'exchangeTradeId'
      ) THEN
        ALTER TABLE "Trade" ADD COLUMN "exchangeTradeId" TEXT;
      END IF;
    END $$;

    -- ── Order table: add idempotencyKey, clientOrderId, averagePrice ──
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'idempotencyKey'
      ) THEN
        ALTER TABLE "Order" ADD COLUMN "idempotencyKey" TEXT NOT NULL DEFAULT 'legacy-' || gen_random_uuid();
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'clientOrderId'
      ) THEN
        ALTER TABLE "Order" ADD COLUMN "clientOrderId" TEXT;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Order' AND column_name = 'averagePrice'
      ) THEN
        ALTER TABLE "Order" ADD COLUMN "averagePrice" DECIMAL(65,30);
      END IF;
    END $$;

    -- ── PaperOrder table: add slippage ──
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'PaperOrder' AND column_name = 'slippage'
      ) THEN
        ALTER TABLE "PaperOrder" ADD COLUMN "slippage" DECIMAL(65,30);
      END IF;
    END $$;

    -- ── Missing indexes ──
    CREATE INDEX IF NOT EXISTS "Position_credentialId_idx" ON "Position"("credentialId");
    CREATE INDEX IF NOT EXISTS "Trade_positionId_idx" ON "Trade"("positionId");
    CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
EOSQL

  echo "📦 Executing ALTER TABLE SQL via prisma db execute..."
  bunx prisma db execute --schema=./prisma/schema.prisma --file /tmp/alter_tables.sql 2>&1 && echo "📦 ALTER TABLE SQL executed successfully" || echo "⚠️ ALTER TABLE SQL had issues (non-fatal — columns may already exist)"

  rm -f /tmp/alter_tables.sql
else
  echo "⚠️ No DATABASE_URL — skipping table verification"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start the NestJS API in the background
echo "🔧 Starting NestJS API server (port 3001)..."
cd apps/api

API_PID=""
# Use the compiled JS entrypoint in production
if [ -d "dist" ]; then
  node dist/main &
  API_PID=$!
  echo "📋 NestJS started from dist/ (PID: $API_PID)"
else
  echo "⚠️ dist/ not found — API will not be available"
  echo "⚠️ Next.js will still start but API routes will fail"
fi

# Wait for API to be ready (only if API was started)
if [ -n "$API_PID" ]; then
  echo "⏳ Waiting for API to be ready..."
  # Use a public endpoint for readiness; /api/engine/health is protected by AuthGuard.
  API_HEALTH_URL="http://127.0.0.1:3001/api/auth/session"
  for i in $(seq 1 45); do
    if curl -fsS "$API_HEALTH_URL" > /dev/null 2>&1; then
      echo "✅ API is ready! (attempt $i)"
      break
    fi
    if [ $i -eq 45 ]; then
      echo "⚠️ API did not start in 45s — critical routes will fail!"
      echo "⚠️ Check logs above for NestJS startup errors."
    fi
    sleep 1
  done
else
  echo "⏩ Skipping API readiness check (API not started)"
fi

cd "$PROJECT_ROOT"

# Start the Next.js web application
echo "🌐 Starting Next.js server (port 3000)..."
cd apps/web
trap "kill $API_PID 2>/dev/null || true" EXIT
bunx next start -H 0.0.0.0 || {
  echo "❌ Next.js failed to start — retrying with port auto-detect..."
  bunx next start -H 0.0.0.0 -p ${PORT:-3000}
}
