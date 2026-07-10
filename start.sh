#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script v15
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIX v15: Start Next.js FIRST, NestJS in background.
#
# WHY: v14 started NestJS first and waited up to 60s for it to be
# ready before starting Next.js. Combined with DB cleanup (~30s) and
# Prisma migrations (~30s), total startup was 120+s before Next.js
# even started listening. Railway's healthcheckTimeout is 300s, and
# the health endpoint ALWAYS returns 200 (even when NestJS is down),
# so there's no reason to wait for NestJS before starting Next.js.
#
# The circuit breaker was removed in v108 (nestjs-proxy.ts uses
# per-request retry), so starting Next.js first is safe.
#
# NEW STARTUP SEQUENCE:
#   1. Quick DB connectivity test (10s max, non-blocking)
#   2. Prisma generate + migrate (with 60s timeout)
#   3. Start Next.js IMMEDIATELY ← healthcheck passes here
#   4. Start NestJS in background
#   5. Monitor NestJS health in background
#
# Total time to healthcheck pass: ~20-30 seconds
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -uo pipefail

# Load local .env if DATABASE_URL not set
if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in ''|\#*) continue ;; esac
    key="${line%%=*}"; value="${line#*=}"; value="${value%$'\r'}"
    [ -z "$key" ] && continue
    export "$key=$value"
  done < .env
fi

USE_BUN=0
if command -v bun >/dev/null 2>&1; then USE_BUN=1; fi

run_prisma() { [ "$USE_BUN" -eq 1 ] && bunx prisma "$@" || npx --yes prisma "$@"; }
run_api_build() { [ "$USE_BUN" -eq 1 ] && bun run build || (rm -rf dist tsconfig.tsbuildinfo && tsc); }
run_web_start() { [ "$USE_BUN" -eq 1 ] && bunx next start -H 0.0.0.0 || npx next start -H 0.0.0.0; }

PROJECT_ROOT="$(pwd)"

# ── Environment Setup ──
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:3001}"
export API_PORT="${API_PORT:-3001}"
if [ "${PORT:-3000}" = "3001" ]; then export PORT=8080; fi
export PORT="${PORT:-8080}"

if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  if [ -z "${ORIGIN:-}" ] || [[ "${ORIGIN}" == *"localhost"* ]] || [[ "${ORIGIN}" == *"0.0.0.0"* ]]; then
    export ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE_URL SETUP — Simplest possible
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ FATAL: DATABASE_URL is not set. Cannot start."
  exit 1
fi

ORIG_DB_URL="$DATABASE_URL"

# Save DATABASE_POOLED_URL for reference (but don't use it)
if [ -n "${DATABASE_POOLED_URL:-}" ]; then
  echo "ℹ️ DATABASE_POOLED_URL is set (saved for reference, not used for app connections)"
fi

# Step 1: Set DIRECT_DATABASE_URL for Prisma CLI (migrations)
DIRECT_DB_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
  const url = process.env.DATABASE_URL_IN || '';
  try {
    const u = new URL(url);
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('connect_timeout', '30');
    process.stdout.write(u.toString());
  } catch {
    process.stdout.write(url);
  }
" 2>/dev/null)
export DIRECT_DATABASE_URL="${DIRECT_DB_URL:-$ORIG_DB_URL}"

# Step 2: Set DATABASE_URL for PrismaClient (apps)
APP_DB_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
  const url = process.env.DATABASE_URL_IN || '';
  try {
    const u = new URL(url);
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('pool_timeout', '10');
    u.searchParams.set('connect_timeout', '30');
    process.stdout.write(u.toString());
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    process.stdout.write(url + sep + 'connection_limit=1&pool_timeout=10&connect_timeout=30');
  }
" 2>/dev/null)
export DATABASE_URL="${APP_DB_URL:-$ORIG_DB_URL}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading — Starting (v15)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL length:    ${#DATABASE_URL} chars"
echo "DATABASE_URL prefix:    $(echo $DATABASE_URL | cut -c1-30)..."
echo "DATABASE_URL pgbouncer: $(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES' || echo 'NO (direct ✅)')"
echo "DATABASE_URL conn_limit: $(echo $DATABASE_URL | grep -q 'connection_limit=1' && echo 'YES ✅' || echo 'NO ❌ MISSING!')"
echo "DATABASE_POOLED_URL:    ${DATABASE_POOLED_URL:+[SET — not used]} ${DATABASE_POOLED_URL:-[NOT SET]}"
echo "DIRECT_DATABASE_URL:    [SET — for migrations only]"
echo "ORIGIN:                 ${ORIGIN:-not set}"
echo "NODE_ENV:               ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE CONNECTIVITY TEST (QUICK — no cleanup, just check reachability)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FIX v15: Removed the aggressive DB cleanup script that was:
#   1. Taking 30-90 seconds (3 retries × 10s connect + queries + sleep)
#   2. Running ALTER SYSTEM SET max_connections (requires superuser)
#   3. Terminating ALL idle connections (dangerous on shared DB)
#   4. Adding 1s wait after termination
# Now: Just a simple connectivity test (3s timeout), non-blocking.
echo ""
echo "━━━ Database Connectivity Test ━━━"
DB_REACHABLE=0
DB_TEST_RESULT=$(DATABASE_URL_IN="$ORIG_DB_URL" timeout 10 node -e "
  const { Client } = require('pg');
  async function test() {
    const client = new Client({
      connectionString: process.env.DATABASE_URL_IN,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    try {
      await client.connect();
      const r = await client.query('SELECT 1 as ok');
      console.log('DB_OK');
      await client.end();
    } catch(e) {
      console.error('DB_ERROR:' + e.message.substring(0, 200));
      try { await client.end(); } catch {}
    }
  }
  test();
" 2>&1)

if echo "$DB_TEST_RESULT" | grep -q "DB_OK"; then
  echo "✅ Database reachable"
  DB_REACHABLE=1
else
  ERR=$(echo "$DB_TEST_RESULT" | grep -o 'DB_ERROR:.*' | head -1)
  echo "⚠️ Database unreachable: $ERR — apps will start and retry in background"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PRISMA SETUP — Generate client AND apply migrations (with timeouts)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Prisma Setup ━━━"

echo "📦 Generating Prisma client..."
timeout 30 npx --yes prisma generate --schema=./prisma/schema.prisma 2>&1 || echo "⚠️ Prisma generate failed (non-fatal — client may already exist)"

if [ "$DB_REACHABLE" -eq 1 ]; then
  echo "📦 Applying database migrations (60s timeout)..."
  timeout 60 npx --yes prisma migrate deploy --schema=./prisma/schema.prisma 2>&1 && echo "✅ Migrations applied" || {
    echo "⚠️ migrate deploy failed — trying db push (safe: only adds tables, never drops)..."
    # db push WITHOUT --accept-data-loss is safe:
    # - On fresh database: creates all tables from schema
    # - On existing database: adds missing tables/columns, never drops
    timeout 120 npx --yes prisma db push --schema=./prisma/schema.prisma 2>&1 && echo "✅ Schema created via db push" || echo "⚠️ db push also failed — will try direct SQL fallback"
  }

  # ── V339: Ensure TradeLifecycleLog table exists (UNCONDITIONAL) ──
  # A failed migration in _prisma_migrations blocks ALL new migrations.
  # This direct SQL creation runs REGARDLESS of migration status, ensuring
  # the TradeLifecycleLog table always exists for audit logging.
  echo "📦 V339: Ensuring TradeLifecycleLog table exists..."
  DATABASE_URL_IN="$ORIG_DB_URL" timeout 20 node -e "
    const { Client } = require('pg');
    async function ensureTLL() {
      const client = new Client({
        connectionString: process.env.DATABASE_URL_IN,
        connectionTimeoutMillis: 5000,
        statement_timeout: 15000,
      });
      try {
        await client.connect();
        const check = await client.query(
          \"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'TradeLifecycleLog')\"
        );
        if (!check.rows[0].exists) {
          console.log('V339: Creating TradeLifecycleLog table...');
          await client.query(\`
            CREATE TABLE IF NOT EXISTS \"TradeLifecycleLog\" (
                \"id\" TEXT NOT NULL,
                \"positionId\" TEXT NOT NULL,
                \"userId\" TEXT NOT NULL,
                \"eventType\" TEXT NOT NULL,
                \"closingSource\" TEXT,
                \"module\" TEXT NOT NULL,
                \"reason\" TEXT,
                \"price\" DECIMAL(18,8),
                \"highestPrice\" DECIMAL(18,8),
                \"lowestPrice\" DECIMAL(18,8),
                \"metadata\" JSONB,
                \"createdAt\" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT \"TradeLifecycleLog_pkey\" PRIMARY KEY (\"id\")
            );
            CREATE INDEX IF NOT EXISTS \"TradeLifecycleLog_positionId_idx\" ON \"TradeLifecycleLog\"(\"positionId\");
            CREATE INDEX IF NOT EXISTS \"TradeLifecycleLog_userId_idx\" ON \"TradeLifecycleLog\"(\"userId\");
            CREATE INDEX IF NOT EXISTS \"TradeLifecycleLog_eventType_idx\" ON \"TradeLifecycleLog\"(\"eventType\");
            CREATE INDEX IF NOT EXISTS \"TradeLifecycleLog_closingSource_idx\" ON \"TradeLifecycleLog\"(\"closingSource\");
            CREATE INDEX IF NOT EXISTS \"TradeLifecycleLog_positionId_createdAt_idx\" ON \"TradeLifecycleLog\"(\"positionId\", \"createdAt\");
            CREATE INDEX IF NOT EXISTS \"TradeLifecycleLog_createdAt_idx\" ON \"TradeLifecycleLog\"(\"createdAt\");
          \`);
          console.log('V339: ✅ TradeLifecycleLog table created');
        } else {
          console.log('V339: ✅ TradeLifecycleLog table already exists');
        }
        await client.end();
      } catch(e) {
        console.error('V339_ERROR: ' + e.message.substring(0, 300));
        try { await client.end(); } catch {}
      }
    }
    ensureTLL();
  " 2>&1

  # ── V341: Add State Machine states to PositionStatus enum ──
  # Adds PENDING_CLOSE and CLOSING states for the Position State Machine.
  # Uses ALTER TYPE ADD VALUE IF NOT EXISTS (PostgreSQL 12+) — idempotent.
  echo "📦 V341: Ensuring PositionStatus enum has state machine states..."
  DATABASE_URL_IN="$ORIG_DB_URL" timeout 15 node -e "
    const { Client } = require('pg');
    async function ensureEnum() {
      const client = new Client({
        connectionString: process.env.DATABASE_URL_IN,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
      });
      try {
        await client.connect();
        await client.query(\"ALTER TYPE \\\"PositionStatus\\\" ADD VALUE IF NOT EXISTS 'PENDING_CLOSE'\");
        await client.query(\"ALTER TYPE \\\"PositionStatus\\\" ADD VALUE IF NOT EXISTS 'CLOSING'\");
        console.log('V341: ✅ PositionStatus enum states verified');
        await client.end();
      } catch(e) {
        console.error('V341_ERROR: ' + e.message.substring(0, 200));
        try { await client.end(); } catch {}
      }
    }
    ensureEnum();
  " 2>&1

  # ── FIX v112: Verify critical tables exist after migration ──
  # Prisma may mark migrations as "applied" in _prisma_migrations table
  # even if the actual SQL failed (e.g., during a previous deploy when
  # the DB was unreachable). This verification step ensures critical
  # tables exist and creates them directly if missing.
  echo "📦 Verifying critical tables exist..."
  TABLE_CHECK=$(DATABASE_URL_IN="$ORIG_DB_URL" timeout 15 node -e "
    const { Client } = require('pg');
    async function check() {
      const client = new Client({
        connectionString: process.env.DATABASE_URL_IN,
        connectionTimeoutMillis: 5000,
        statement_timeout: 10000,
      });
      try {
        await client.connect();
        const criticalTables = [
          'UserNotification',
          'UserNotificationPreferences',
          'Setting',
          'AiUsageLog',
          'AgentSettings',
          'AdminSession',
          'TradeLifecycleLog', // V339: Critical for trade audit logging
        ];
        const missing = [];
        for (const table of criticalTables) {
          const r = await client.query(
            \`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '\${table}')\`
          );
          if (!r.rows[0].exists) missing.push(table);
        }
        if (missing.length > 0) {
          console.log('MISSING:' + missing.join(','));
        } else {
          console.log('ALL_OK');
        }
        await client.end();
      } catch(e) {
        console.error('CHECK_ERROR:' + e.message.substring(0, 200));
        try { await client.end(); } catch {}
      }
    }
    check();
  " 2>&1)

  if echo "$TABLE_CHECK" | grep -q "MISSING:"; then
    MISSING_TABLES=$(echo "$TABLE_CHECK" | grep "MISSING:" | sed 's/MISSING://')
    echo "⚠️ Missing tables detected: $MISSING_TABLES"
    # BUG-066s FIX: Removed 'db push --accept-data-loss' — it can drop columns.
    # Use direct SQL fallback only (safer — only creates tables, never drops).
    echo "📦 Running direct SQL fallback for missing tables..."
    DATABASE_URL_IN="$ORIG_DB_URL" timeout 30 node -e "
        const { Client } = require('pg');
        const fs = require('fs');
        const path = require('path');
        async function run() {
          const client = new Client({
            connectionString: process.env.DATABASE_URL_IN,
            connectionTimeoutMillis: 5000,
            statement_timeout: 20000,
          });
          try {
            await client.connect();
            // Read the migration SQL file
            const sqlFile = path.join(__dirname, 'prisma/migrations/20260509000000_add_missing_tables/migration.sql');
            if (fs.existsSync(sqlFile)) {
              const sql = fs.readFileSync(sqlFile, 'utf8');
              await client.query(sql);
              console.log('OK: Direct SQL migration applied');
            } else {
              console.log('SKIP: Migration SQL file not found');
            }

            // V339: Ensure TradeLifecycleLog table exists (critical for trade audit)
            // This runs REGARDLESS of whether the migration file was found,
            // because a failed migration in _prisma_migrations table blocks
            // ALL new migrations from applying.
            const tllCheck = await client.query(
              \`SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'TradeLifecycleLog')\`
            );
            if (!tllCheck.rows[0].exists) {
              console.log('V339: Creating TradeLifecycleLog table (migration was blocked)...');
              await client.query(\`
                CREATE TABLE IF NOT EXISTS "TradeLifecycleLog" (
                    "id" TEXT NOT NULL,
                    "positionId" TEXT NOT NULL,
                    "userId" TEXT NOT NULL,
                    "eventType" TEXT NOT NULL,
                    "closingSource" TEXT,
                    "module" TEXT NOT NULL,
                    "reason" TEXT,
                    "price" DECIMAL(18,8),
                    "highestPrice" DECIMAL(18,8),
                    "lowestPrice" DECIMAL(18,8),
                    "metadata" JSONB,
                    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "TradeLifecycleLog_pkey" PRIMARY KEY ("id")
                );
                CREATE INDEX IF NOT EXISTS "TradeLifecycleLog_positionId_idx" ON "TradeLifecycleLog"("positionId");
                CREATE INDEX IF NOT EXISTS "TradeLifecycleLog_userId_idx" ON "TradeLifecycleLog"("userId");
                CREATE INDEX IF NOT EXISTS "TradeLifecycleLog_eventType_idx" ON "TradeLifecycleLog"("eventType");
                CREATE INDEX IF NOT EXISTS "TradeLifecycleLog_closingSource_idx" ON "TradeLifecycleLog"("closingSource");
                CREATE INDEX IF NOT EXISTS "TradeLifecycleLog_positionId_createdAt_idx" ON "TradeLifecycleLog"("positionId", "createdAt");
                CREATE INDEX IF NOT EXISTS "TradeLifecycleLog_createdAt_idx" ON "TradeLifecycleLog"("createdAt");
              \`);
              console.log('V339: TradeLifecycleLog table created successfully');
            } else {
              console.log('V339: TradeLifecycleLog table already exists');
            }

            await client.end();
          } catch(e) {
            console.error('SQL_ERROR:' + e.message.substring(0, 300));
            try { await client.end(); } catch {}
          }
        }
        run();
      " 2>&1
  elif echo "$TABLE_CHECK" | grep -q "ALL_OK"; then
    echo "✅ All critical tables verified"
  else
    echo "⚠️ Could not verify tables (non-fatal): $TABLE_CHECK"
  fi

  # ── V207: Verify Trade.credentialId column exists and backfill if needed ──
  # This is CRITICAL because the API code now references Trade.credentialId.
  # If the migration wasn't applied or was only partially applied, all Trade
  # queries would fail, causing "no trades appeared" for the user.
  echo "📦 Verifying Trade.credentialId column..."
  CRED_COL_CHECK=$(DATABASE_URL_IN="$ORIG_DB_URL" timeout 15 node -e "
    const { Client } = require('pg');
    async function check() {
      const client = new Client({
        connectionString: process.env.DATABASE_URL_IN,
        connectionTimeoutMillis: 5000,
        statement_timeout: 15000,
      });
      try {
        await client.connect();
        // Check if credentialId column exists in Trade table
        const colCheck = await client.query(
          \`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Trade' AND column_name = 'credentialId')\`
        );
        if (!colCheck.rows[0].exists) {
          console.log('MISSING_COL');
          // Add the column directly
          await client.query('ALTER TABLE \"Trade\" ADD COLUMN \"credentialId\" TEXT');
          console.log('COL_ADDED');
        } else {
          console.log('COL_EXISTS');
        }
        // Backfill: Set credentialId from related Position
        const bf1 = await client.query(
          \`UPDATE \"Trade\" t SET \"credentialId\" = p.\"credentialId\" FROM \"Position\" p WHERE t.\"positionId\" = p.id AND t.\"credentialId\" IS NULL AND p.\"credentialId\" IS NOT NULL\`
        );
        console.log('BACKFILL_POS:' + bf1.rowCount);
        // Backfill: Set credentialId from related Order
        const bf2 = await client.query(
          \`UPDATE \"Trade\" t SET \"credentialId\" = o.\"exchangeCredentialId\" FROM \"Order\" o WHERE t.\"orderId\" = o.id AND t.\"credentialId\" IS NULL AND o.\"exchangeCredentialId\" IS NOT NULL\`
        );
        console.log('BACKFILL_ORD:' + bf2.rowCount);
        // Ensure indexes exist
        await client.query('CREATE INDEX IF NOT EXISTS \"Trade_credentialId_idx\" ON \"Trade\"(\"credentialId\")');
        await client.query('CREATE INDEX IF NOT EXISTS \"Trade_userId_credentialId_idx\" ON \"Trade\"(\"userId\", \"credentialId\")');
        console.log('INDEXES_OK');
        await client.end();
      } catch(e) {
        console.error('CHECK_ERROR:' + e.message.substring(0, 300));
        try { await client.end(); } catch {}
      }
    }
    check();
  " 2>&1)

  if echo "$CRED_COL_CHECK" | grep -q "COL_ADDED"; then
    echo "⚠️ Trade.credentialId column was MISSING — added directly"
  elif echo "$CRED_COL_CHECK" | grep -q "COL_EXISTS"; then
    echo "✅ Trade.credentialId column exists"
  fi
  if echo "$CRED_COL_CHECK" | grep -q "BACKFILL_POS"; then
    BF_POS=$(echo "$CRED_COL_CHECK" | grep "BACKFILL_POS:" | sed 's/BACKFILL_POS://')
    echo "   Backfill from Position: ${BF_POS:-0} rows updated"
  fi
  if echo "$CRED_COL_CHECK" | grep -q "BACKFILL_ORD"; then
    BF_ORD=$(echo "$CRED_COL_CHECK" | grep "BACKFILL_ORD:" | sed 's/BACKFILL_ORD://')
    echo "   Backfill from Order: ${BF_ORD:-0} rows updated"
  fi
  if echo "$CRED_COL_CHECK" | grep -q "CHECK_ERROR"; then
    ERR=$(echo "$CRED_COL_CHECK" | grep "CHECK_ERROR:" | sed 's/CHECK_ERROR://')
    echo "⚠️ Trade.credentialId verification failed (non-fatal): $ERR"
  fi
else
  echo "⚠️ Database not reachable — skipping migrations (will retry on next deploy)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# START APPS — Next.js FIRST (for healthcheck), NestJS in background
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FIX v15: Start Next.js IMMEDIATELY. The health endpoint always
# returns 200 (even when NestJS is down), so Railway's healthcheck
# will pass as soon as Next.js starts listening (~3-5 seconds).
#
# The circuit breaker was removed in v108, so Next.js can safely
# proxy to NestJS even when NestJS isn't ready yet — it will just
# return a degraded status until NestJS comes up.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Build API if needed
if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building..."
  (cd apps/api && timeout 60 run_api_build)
fi

# ══════════════════════════════════════════════════════════════
# Step 1: Start Next.js FIRST — healthcheck depends on this!
# ══════════════════════════════════════════════════════════════
ACTUAL_WEB_PORT=${PORT:-8080}
echo ""
echo "━━━ Starting Next.js (port $ACTUAL_WEB_PORT) — STARTING FIRST FOR HEALTHCHECK ━━━"
cd apps/web
run_web_start 2>&1 &
WEB_PID=$!
cd "$PROJECT_ROOT"

# Wait briefly for Next.js to start listening (up to 10 seconds)
echo "⏳ Waiting for Next.js to start listening..."
for i in $(seq 1 10); do
  if curl -fsS --connect-timeout 2 --max-time 3 "http://127.0.0.1:${ACTUAL_WEB_PORT}/api/health" > /dev/null 2>&1; then
    echo "✅ Next.js is listening (attempt $i) — healthcheck should pass now!"
    break
  fi
  sleep 1
done

# ══════════════════════════════════════════════════════════════
# Step 2: Start NestJS API in background
# ══════════════════════════════════════════════════════════════
echo ""
echo "━━━ Starting NestJS API (port ${API_PORT:-3001}) — in background ━━━"
cd apps/api
node dist/main 2>&1 &
API_PID=$!
cd "$PROJECT_ROOT"

# Wait for NestJS to be ready (up to 120 seconds, non-blocking for healthcheck)
echo "⏳ Waiting for NestJS to be ready (background — healthcheck already passing)..."
for i in $(seq 1 120); do
  if curl -fsS --connect-timeout 2 --max-time 5 "http://127.0.0.1:${API_PORT:-3001}/api/health" > /dev/null 2>&1; then
    echo "✅ NestJS API ready (attempt $i)"
    break
  fi
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "⚠️ NestJS process died — will be restarted by monitor"
    break
  fi
  if [ $((i % 15)) -eq 0 ]; then
    echo "  ... still waiting for NestJS (attempt $i/120)"
  fi
  sleep 1
done

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NESTJS PROCESS MONITOR
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NESTJS_RESTART_TIMES=()
NESTJS_MAX_RESTARTS=10

monitor_nestjs() {
  while true; do
    if ! kill -0 $API_PID 2>/dev/null; then
      local now=$(date +%s)
      NESTJS_RESTART_TIMES=($(echo "${NESTJS_RESTART_TIMES[@]}" | tr ' ' '\n' | awk -v cutoff=$((now - 3600)) '$1 > cutoff'))
      if [ ${#NESTJS_RESTART_TIMES[@]} -ge $NESTJS_MAX_RESTARTS ]; then
        echo "❌ NestJS crashed too many times — stopping restart"
        break
      fi
      NESTJS_RESTART_TIMES+=($now)
      echo "❌ NestJS died — restarting..."
      sleep 5
      cd "$PROJECT_ROOT/apps/api" && node dist/main 2>&1 &
      API_PID=$!
      cd "$PROJECT_ROOT"
      sleep 5
    fi
    sleep 10
  done
}

monitor_nestjs &

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Roua Trading is running!"
echo "   Next.js:  port $ACTUAL_WEB_PORT (PID: $WEB_PID)"
echo "   NestJS:   port ${API_PORT:-3001} (PID: $API_PID)"
echo "   DB:       direct connection (connection_limit=1, no PgBouncer)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
