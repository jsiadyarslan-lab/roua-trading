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
    # Strip inline comments (e.g., KEY=value # comment -> KEY=value)
    value="${value%% #*}"
    value="${value%%\#*}"
    value="${value%"${value##*[! ]}"}"
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
    # Use tsc directly — avoids npm workspace binary resolution issues
    # (same output as `nest build` with webpack:false in nest-cli.json)
    rm -rf dist && tsc
  fi
}

run_web_build() {
  if [ "$USE_BUN" -eq 1 ]; then
    bunx next build --webpack
  else
    # Use next directly — avoids npm workspace binary resolution issues
    next build --webpack
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

# FIX: Ensure API_INTERNAL_URL is set so Next.js can reach NestJS.
# In a single-container deploy, NestJS runs on localhost:3001.
# This is the #1 cause of "fetch failed" errors in production —
# the frontend can't find the API because this env var is missing.
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:3001}"

# FIX: Auto-detect ORIGIN from Railway's public domain.
# This is CRITICAL for Google OAuth — without it, redirect_uri
# resolves to http://0.0.0.0:3000 causing redirect_uri_mismatch.
# Also override if ORIGIN is set to localhost (from .env file).
if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  if [ -z "${ORIGIN:-}" ] || [[ "${ORIGIN}" == *"localhost"* ]] || [[ "${ORIGIN}" == *"0.0.0.0"* ]]; then
    export ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
    echo "🔧 Auto-detected ORIGIN from RAILWAY_PUBLIC_DOMAIN: ${ORIGIN}"
  fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading - Starting Full Stack"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL: ${DATABASE_URL:+[SET (${#DATABASE_URL} chars)]}${DATABASE_URL:-[NOT SET]}"
echo "API_INTERNAL_URL: ${API_INTERNAL_URL:-[NOT SET]}"
echo "RP_ID: ${RP_ID:-localhost}"
echo "ORIGIN: ${ORIGIN:-not set}"
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "PORT: ${PORT:-3000}"
echo "API_PORT: ${API_PORT:-3001}"
echo "RUNNER: $([ "$USE_BUN" -eq 1 ] && echo bun || echo npm)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Generate Prisma client (must be done before db push) ──
echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

# ── Step 2: Apply Prisma schema to database ──
# Use prisma migrate deploy (production-safe) instead of db push.
# migrate deploy only applies pending migrations and never drops data.
# Fall back to db push if no migration files exist (first deploy).
echo "📦 Applying Prisma schema..."
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  run_prisma migrate deploy --schema=./prisma/schema.prisma 2>&1 || echo "⚠️ prisma migrate deploy had issues — trying db push as fallback"
  run_prisma db push --schema=./prisma/schema.prisma 2>&1 || echo "⚠️ prisma db push also had issues — will verify tables below"
else
  run_prisma db push --schema=./prisma/schema.prisma 2>&1 || echo "⚠️ prisma db push had issues — will verify tables below"
fi

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
    -- Includes refreshToken, deviceInfo, ipAddress, userAgent, isActive for cross-device sync
    CREATE TABLE IF NOT EXISTS "Session" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "token" TEXT NOT NULL,
      "refreshToken" TEXT,
      "deviceInfo" TEXT,
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "expiresAt" TIMESTAMP(3) NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
    CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session"("refreshToken");
    CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
    CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");
    CREATE INDEX IF NOT EXISTS "Session_refreshToken_idx" ON "Session"("refreshToken");
    CREATE INDEX IF NOT EXISTS "Session_userId_isActive_idx" ON "Session"("userId", "isActive");
    CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");

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

  # ── Step 3b: Add missing columns to existing tables ──
  # The CREATE TABLE IF NOT EXISTS above only creates NEW tables.
  # If a table already exists from a previous deploy but is missing
  # columns that were added later to the Prisma schema, we need
  # ALTER TABLE to add them. This is the #1 cause of 401 errors:
  # Prisma's @updatedAt field is required but the DB doesn't have it.
  cat > /tmp/add_missing_columns.sql <<'EOSQL'
    -- Session table: add updatedAt if missing (Prisma @updatedAt requires it)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Session' AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE "Session" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- Session table: add refreshToken if missing (critical for cross-device session sync + Google OAuth)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Session' AND column_name = 'refreshToken'
      ) THEN
        ALTER TABLE "Session" ADD COLUMN "refreshToken" TEXT;
        CREATE UNIQUE INDEX IF NOT EXISTS "Session_refreshToken_key" ON "Session"("refreshToken");
        CREATE INDEX IF NOT EXISTS "Session_refreshToken_idx" ON "Session"("refreshToken");
      END IF;
    END $$;

    -- Session table: add deviceInfo if missing (for device management UI)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Session' AND column_name = 'deviceInfo'
      ) THEN
        ALTER TABLE "Session" ADD COLUMN "deviceInfo" TEXT;
      END IF;
    END $$;

    -- Session table: add ipAddress if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Session' AND column_name = 'ipAddress'
      ) THEN
        ALTER TABLE "Session" ADD COLUMN "ipAddress" TEXT;
      END IF;
    END $$;

    -- Session table: add userAgent if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Session' AND column_name = 'userAgent'
      ) THEN
        ALTER TABLE "Session" ADD COLUMN "userAgent" TEXT;
      END IF;
    END $$;

    -- Session table: add isActive if missing (critical for session revocation)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Session' AND column_name = 'isActive'
      ) THEN
        ALTER TABLE "Session" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
        CREATE INDEX IF NOT EXISTS "Session_userId_isActive_idx" ON "Session"("userId", "isActive");
      END IF;
    END $$;

    -- Session table: add expiresAt index if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'Session' AND indexname = 'Session_expiresAt_idx'
      ) THEN
        CREATE INDEX IF NOT EXISTS "Session_expiresAt_idx" ON "Session"("expiresAt");
      END IF;
    END $$;

    -- User table: add updatedAt if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- User table: add riskTolerance if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'riskTolerance'
      ) THEN
        ALTER TABLE "User" ADD COLUMN "riskTolerance" TEXT DEFAULT 'moderate';
      END IF;
    END $$;

    -- Position table: add updatedAt if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'Position' AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE "Position" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- AuditLog table: add userId column if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'AuditLog' AND column_name = 'userId'
      ) THEN
        ALTER TABLE "AuditLog" ADD COLUMN "userId" TEXT;
      END IF;
    END $$;

    -- ExchangeCredential table: add updatedAt if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ExchangeCredential' AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE "ExchangeCredential" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- PaperOrder table: add updatedAt if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'PaperOrder' AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE "PaperOrder" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- TradingBot table: add createdAt if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'TradingBot' AND column_name = 'createdAt'
      ) THEN
        ALTER TABLE "TradingBot" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- ChartPreference table: add updatedAt and createdAt if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ChartPreference' AND column_name = 'updatedAt'
      ) THEN
        ALTER TABLE "ChartPreference" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ChartPreference' AND column_name = 'createdAt'
      ) THEN
        ALTER TABLE "ChartPreference" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
      END IF;
    END $$;

    -- Session table: add foreign key constraint if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Session_userId_fkey'
      ) THEN
        ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;

    -- User table: add unique constraint on email if missing
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'User_email_key'
      ) THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_email_key" UNIQUE ("email");
      END IF;
    END $$;

    -- User table: add telegramChatId if missing (used by alert-agent for Telegram notifications)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'User' AND column_name = 'telegramChatId'
      ) THEN
        ALTER TABLE "User" ADD COLUMN "telegramChatId" TEXT;
      END IF;
    END $$;

    -- ── Agent Tables (Critical for Autonomous Trader) ──

    -- AgentSession table (persists agent state across Redis restarts)
    CREATE TABLE IF NOT EXISTS "AgentSession" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "agentRunId" TEXT NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'RUNNING',
      "strategy" TEXT NOT NULL DEFAULT 'SCALPING',
      "config" TEXT NOT NULL DEFAULT '{}',
      "dailyPnL" DECIMAL(19,4) NOT NULL DEFAULT 0,
      "dailyTradesCount" INTEGER NOT NULL DEFAULT 0,
      "totalCycles" INTEGER NOT NULL DEFAULT 0,
      "consecutiveLosses" INTEGER NOT NULL DEFAULT 0,
      "lastError" TEXT,
      "credentialId" TEXT NOT NULL,
      "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "stoppedAt" TIMESTAMP(3),
      "lastCycleAt" TIMESTAMP(3),
      "lastSignalAt" TIMESTAMP(3),
      "dailyResetAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "AgentSession_agentRunId_key" ON "AgentSession"("agentRunId");
    CREATE INDEX IF NOT EXISTS "AgentSession_userId_idx" ON "AgentSession"("userId");
    CREATE INDEX IF NOT EXISTS "AgentSession_status_idx" ON "AgentSession"("status");
    CREATE INDEX IF NOT EXISTS "AgentSession_userId_status_idx" ON "AgentSession"("userId", "status");
    CREATE INDEX IF NOT EXISTS "AgentSession_startedAt_idx" ON "AgentSession"("startedAt");

    -- AgentSession foreign key (add if User table exists)
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'AgentSession_userId_fkey'
      ) THEN
        ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;

    -- AutonomousTrade table (agent-specific trade records with strategy/reasoning/confidence)
    CREATE TABLE IF NOT EXISTS "AutonomousTrade" (
      "id" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "agentRunId" TEXT NOT NULL,
      "symbol" TEXT NOT NULL,
      "side" TEXT NOT NULL,
      "orderType" TEXT NOT NULL,
      "strategy" TEXT NOT NULL DEFAULT 'SCALPING',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "entryPrice" DECIMAL(19,8) NOT NULL,
      "currentPrice" DECIMAL(19,8),
      "exitPrice" DECIMAL(19,8),
      "stopLoss" DECIMAL(19,8) NOT NULL,
      "takeProfit" DECIMAL(19,8) NOT NULL,
      "quantity" DECIMAL(19,8) NOT NULL,
      "filledQuantity" DECIMAL(19,8) NOT NULL DEFAULT 0,
      "pnl" DECIMAL(19,4),
      "fee" DECIMAL(19,4) NOT NULL DEFAULT 0,
      "feeCurrency" TEXT NOT NULL DEFAULT 'USD',
      "riskScore" INTEGER NOT NULL DEFAULT 0,
      "confidence" INTEGER NOT NULL DEFAULT 0,
      "riskRewardRatio" DECIMAL(10,4) NOT NULL,
      "reasoning" TEXT NOT NULL,
      "signalData" TEXT NOT NULL DEFAULT '{}',
      "metadata" TEXT NOT NULL DEFAULT '{}',
      "decisions" TEXT NOT NULL DEFAULT '[]',
      "execution" TEXT,
      "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "closedAt" TIMESTAMP(3),
      "holdingDurationMs" INTEGER,
      "credentialId" TEXT NOT NULL,
      "exchangeOrderId" TEXT,
      "isWinning" BOOLEAN,
      "exitReason" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AutonomousTrade_pkey" PRIMARY KEY ("id")
    );
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_userId_idx" ON "AutonomousTrade"("userId");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_symbol_idx" ON "AutonomousTrade"("symbol");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_strategy_idx" ON "AutonomousTrade"("strategy");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_status_idx" ON "AutonomousTrade"("status");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_agentRunId_idx" ON "AutonomousTrade"("agentRunId");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_createdAt_idx" ON "AutonomousTrade"("createdAt");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_userId_status_idx" ON "AutonomousTrade"("userId", "status");
    CREATE INDEX IF NOT EXISTS "AutonomousTrade_userId_strategy_createdAt_idx" ON "AutonomousTrade"("userId", "strategy", "createdAt");

    -- AutonomousTrade foreign key
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'AutonomousTrade_userId_fkey'
      ) THEN
        ALTER TABLE "AutonomousTrade" ADD CONSTRAINT "AutonomousTrade_userId_fkey"
          FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$;
EOSQL

  echo "📦 Adding missing columns via ALTER TABLE..."
  run_prisma db execute --schema=./prisma/schema.prisma --file /tmp/add_missing_columns.sql 2>&1 && echo "📦 Missing columns SQL executed successfully" || echo "⚠️ Missing columns SQL had issues (non-fatal — columns may already exist)"

  rm -f /tmp/ensure_tables.sql /tmp/add_missing_columns.sql
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

# ── NestJS Process Monitor — auto-restart if NestJS crashes ──
# FIX: Previously, if NestJS crashed, the entire AI subsystem went offline
# with no recovery. Now we monitor the process and restart it automatically.
NESTJS_RESTART_COUNT=0
NESTJS_MAX_RESTARTS=10  # Max restarts per hour (prevents infinite restart loop)
NESTJS_RESTART_WINDOW=3600  # 1 hour window
NESTJS_RESTART_TIMES=()  # Track restart timestamps

monitor_nestjs() {
  while true; do
    if ! kill -0 $API_PID 2>/dev/null; then
      local now=$(date +%s)

      # Clean old restart timestamps outside the window
      NESTJS_RESTART_TIMES=($(echo "${NESTJS_RESTART_TIMES[@]}" | tr ' ' '\n' | awk -v cutoff=$((now - NESTJS_RESTART_WINDOW)) '$1 > cutoff'))

      if [ ${#NESTJS_RESTART_TIMES[@]} -ge $NESTJS_MAX_RESTARTS ]; then
        echo "❌ NestJS has crashed ${NESTJS_MAX_RESTARTS} times in the last hour — NOT restarting (possible persistent error). Check logs!"
        break
      fi

      echo "❌ NestJS process died (PID: $API_PID)! Restarting..."
      NESTJS_RESTART_TIMES+=($now)

      cd "$PROJECT_ROOT/apps/api"
      node dist/main &
      API_PID=$!
      echo "🔧 NestJS restarted (new PID: $API_PID, restart #$(( ${#NESTJS_RESTART_TIMES[@]} )) this hour)"

      # Wait for it to be ready
      for i in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:3001/api/auth/session" > /dev/null 2>&1; then
          echo "✅ NestJS is ready after restart! (attempt $i)"
          break
        fi
        if [ $i -eq 30 ]; then
          echo "⚠️ NestJS did not start in 30s after restart"
        fi
        sleep 1
      done

      cd "$PROJECT_ROOT"
    fi
    sleep 10
  done
}

echo "🔍 Starting NestJS process monitor..."
monitor_nestjs &
MONITOR_PID=$!

# Start the Next.js web application
echo "🌐 Starting Next.js server (port 3000)..."
cd apps/web
trap "kill $API_PID $MONITOR_PID 2>/dev/null || true" EXIT
run_web_start
