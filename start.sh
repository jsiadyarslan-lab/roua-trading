#!/bin/bash
# Railway startup script for Roua Trading
# Production startup with full stack: NestJS API + Next.js Web
# Supports Bun when available, otherwise falls back to npm/npx

set -euo pipefail

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

USE_BUN=0
if command -v bun >/dev/null 2>&1; then
  USE_BUN=1
fi

run_prisma() {
  if [ "$USE_BUN" -eq 1 ]; then
    bunx prisma "$@"
  else
    npx --yes prisma "$@"
  fi
}

run_api_build() {
  if [ "$USE_BUN" -eq 1 ]; then
    bun run build
  else
    npm run build
  fi
}

run_web_build() {
  if [ "$USE_BUN" -eq 1 ]; then
    bunx next build --webpack
  else
    npm run build
  fi
}

run_web_start() {
  if [ "$USE_BUN" -eq 1 ]; then
    bunx next start -H 0.0.0.0
  else
    npm run start
  fi
}

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
echo "RUNNER: $([ "$USE_BUN" -eq 1 ] && echo bun || echo npm)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Generate Prisma client (must be done before db push) ──
echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

# ── Step 2: Apply Prisma schema to database ──
echo "📦 Applying Prisma schema..."
run_prisma db push --schema=./prisma/schema.prisma --accept-data-loss 2>&1 || echo "⚠️ prisma db push had issues — will verify tables below"

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

    -- User table (critical for auth — must exist before /api/auth/me can work)
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL,
      "email" TEXT NOT NULL,
      "displayName" TEXT,
      "avatar" TEXT,
      "passkeyId" TEXT,
      "passkeyPub" TEXT,
      "tier" TEXT NOT NULL DEFAULT 'FREE',
      "maxPositionSize" DECIMAL(19,4),
      "maxDailyLoss" DECIMAL(19,4),
      "riskTolerance" TEXT DEFAULT 'moderate',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "User_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

    -- Session table (critical for auth — /api/auth/me creates/validates sessions)
    CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
    CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
    CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");

    -- Challenge table (used by WebAuthn/passkey auth)
    CREATE TABLE IF NOT EXISTS "Challenge" (
      "id" TEXT NOT NULL,
      "key" TEXT NOT NULL,
      "challenge" TEXT NOT NULL,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Challenge_key_key" ON "Challenge"("key");
    CREATE INDEX IF NOT EXISTS "Challenge_key_idx" ON "Challenge"("key");
    CREATE INDEX IF NOT EXISTS "Challenge_expiresAt_idx" ON "Challenge"("expiresAt");

    -- AuditLog table (used by DELETE /api/auth/me for logout auditing)
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL,
      "userId" TEXT,
      "action" TEXT NOT NULL,
      "resource" TEXT NOT NULL,
      "details" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
    CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
    CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
    CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
EOSQL

  echo "📦 Executing safety-net SQL via prisma db execute..."
  run_prisma db execute --schema=./prisma/schema.prisma --file /tmp/ensure_tables.sql 2>&1 && echo "📦 Safety-net SQL executed successfully" || echo "⚠️ Safety-net SQL had issues (non-fatal — tables may already exist with different schema)"

  rm -f /tmp/ensure_tables.sql
else
  echo "⚠️ No DATABASE_URL — skipping table verification"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Build artifacts on the fly if they are missing
if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building API..."
  (cd apps/api && run_api_build)
fi

if [ ! -d "apps/web/.next" ]; then
  echo "⚠️ Next build missing — building web..."
  (cd apps/web && run_web_build)
fi

# Start the NestJS API in the background
echo "🔧 Starting NestJS API server (port 3001)..."
cd apps/api

# Use the compiled JS entrypoint in production
if [ -d "dist" ]; then
  node dist/main &
  API_PID=$!
  echo "📋 NestJS started from dist/ (PID: $API_PID)"
else
  echo "⚠️ dist/ not found — API build output is missing"
  exit 1
fi

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
# Use a public endpoint for readiness; /api/auth/session is public and returns authenticated=false when no session exists.
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

cd "$PROJECT_ROOT"

# Start the Next.js web application
echo "🌐 Starting Next.js server (port 3000)..."
cd apps/web
trap "kill $API_PID 2>/dev/null || true" EXIT
run_web_start
