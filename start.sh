#!/bin/bash
# Railway startup script for Roua Trading
# Production startup with full stack: NestJS API + Next.js Web
# Supports Bun when available, otherwise falls back to npm/npx

set -uo pipefail
# FIX: Removed -e flag (was causing silent exits on SQL failures).
# The -e flag makes bash exit immediately if any command fails.
# During startup, some SQL commands may fail (e.g., column already exists,
# enum already created) which is expected and non-fatal.
# Individual critical commands use explicit error checking instead.

# Load local environment fallback when running outside Railway or when env vars are absent.
# FIX: Improved .env parser that preserves '#' in values.
# The old parser used `value="${value%% #*}"` which would corrupt values
# containing '#' (common in API keys, connection strings, base64 tokens).
# Example: DATABASE_URL=postgresql://user:p#ss@host → would become postgresql://user:p
if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines and comment-only lines
    case "$line" in
      ''|\#*) continue ;;
    esac
    # Extract key (everything before first =)
    key="${line%%=*}"
    # Extract value (everything after first =)
    value="${line#*=}"
    # Remove carriage return
    value="${value%$'\r'}"
    # Strip inline comments ONLY if preceded by a space (# without space is part of value)
    # This preserves: KEY=abc#def → abc#def
    # But removes:    KEY=abc # comment → abc
    if [[ "$value" == *' #'* ]]; then
      value="${value%% #*}"
    fi
    # Trim trailing whitespace
    value="${value%"${value##*[! ]}"}"
    # Remove surrounding quotes if present
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi
    # Skip if key is empty after processing
    [ -z "$key" ] && continue
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
    # CRITICAL FIX: Also remove tsconfig.tsbuildinfo to prevent stale
    # incremental build state from producing incomplete JS output.
    rm -rf dist tsconfig.tsbuildinfo && tsc
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
    # FIX: Use npx next start directly instead of `npm run start`.
    # In npm workspaces, `npm run start` from apps/web/ may resolve to
    # the root package.json's "start": "bash start.sh", causing infinite
    # recursion. Using npx directly avoids this risk entirely.
    npx next start -H 0.0.0.0
  fi
}

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"

# FIX: Ensure API_INTERNAL_URL is set so Next.js can reach NestJS.
# In a single-container deploy, NestJS runs on localhost:3001.
# This is the #1 cause of "fetch failed" errors in production —
# the frontend can't find the API because this env var is missing.
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:3001}"

# FIX: Protect API_PORT from being overwritten by Railway's PORT variable.
# Railway sets PORT to the port it routes external traffic to (e.g., 3000 or a
# dynamic high port). If PORT=3001, Next.js would try to bind 3001 and conflict
# with NestJS. We explicitly set API_PORT=3001 and ensure PORT is used only by
# Next.js. This is critical for single-container deployments where both services
# run in the same process namespace.
export API_PORT="${API_PORT:-3001}"
# If Railway set PORT=3001 (which would conflict with API_PORT), force PORT=3000
if [ "${PORT:-3000}" = "3001" ]; then
  echo "⚠️ PORT was set to 3001 (conflicts with API_PORT) — forcing PORT=3000 for Next.js"
  export PORT=3000
fi

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

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUSTAINABLE FIX: Inject connection_limit=1 into DATABASE_URL itself
#
# ROOT CAUSE of "too many clients already":
#   Prisma CLI commands (db push, db execute, migrate deploy) use
#   the raw DATABASE_URL without connection_limit, creating pools
#   of 5 connections each. On Railway's PostgreSQL (max ~5-25
#   connections), this immediately exhausts the pool.
#
#   Previously, only application code (PrismaService, db.ts) added
#   connection_limit=1 to the URL. But CLI commands didn't benefit
#   from this, creating 5-connection pools each time.
#
# SUSTAINABLE FIX: Modify DATABASE_URL at the ENVIRONMENT LEVEL
# so ALL Prisma operations (CLI + application) use 1 connection.
# This is the single most impactful fix for connection exhaustion.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if [ -n "${DATABASE_URL:-}" ]; then
  ORIG_DB_URL="$DATABASE_URL"
  # Use Node.js for robust URL manipulation (handles special chars in passwords)
  # Pass URL via env var to avoid shell interpolation issues with special characters
  MODIFIED_URL=$(DATABASE_URL_IN="$DATABASE_URL" node -e "
    const url = process.env.DATABASE_URL_IN || '';
    try {
      const u = new URL(url);
      u.searchParams.set('connection_limit', '1');
      u.searchParams.set('pool_timeout', '10');
      u.searchParams.set('connect_timeout', '10');
      process.stdout.write(u.toString());
    } catch {
      const sep = url.includes('?') ? '&' : '?';
      process.stdout.write(url + sep + 'connection_limit=1&pool_timeout=10&connect_timeout=10');
    }
  " 2>/dev/null)
  if [ -n "$MODIFIED_URL" ]; then
    export DATABASE_URL="$MODIFIED_URL"
    echo "🔧 DATABASE_URL: Injected connection_limit=1&pool_timeout=10&connect_timeout=10 globally"
  else
    echo "⚠️ Could not modify DATABASE_URL — Prisma will use DEFAULT pool size (5)"
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
echo "RAILWAY_PUBLIC_DOMAIN: ${RAILWAY_PUBLIC_DOMAIN:-not set}"
echo "RUNNER: $([ "$USE_BUN" -eq 1 ] && echo bun || echo npm)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️ NOTE: The PORT/API_PORT values above are ENV VARS, not proof the services are running."
echo "   Real verification happens below after services start."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRITICAL FIX: Start Next.js FIRST, before ANY other operation
#
# Railway health check has a 5-minute window. If the health check
# endpoint doesn't return HTTP 200 within that window, the entire
# deployment FAILS with "1/1 replicas never became healthy".
#
# Previously, start.sh ran Prisma operations (which can take 10-60s)
# BEFORE starting Next.js. If Prisma was slow or hanging, the
# health check would fail before Next.js even started.
#
# Now: Start Next.js IMMEDIATELY. The /api/health endpoint returns
# HTTP 200 even when NestJS is down, so Railway marks the replica
# as healthy within seconds. All other setup runs after.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTUAL_WEB_PORT=${PORT:-3000}
echo "🌐 Starting Next.js server (port $ACTUAL_WEB_PORT) FIRST..."
cd apps/web
# FIX: Pipe logs to stdout so they appear in Railway logs
run_web_start 2>&1 &
WEB_PID=$!
cd "$PROJECT_ROOT"

# Brief wait for Next.js to bind the port
sleep 5
if curl -fsS "http://127.0.0.1:${ACTUAL_WEB_PORT}/api/health" > /dev/null 2>&1; then
  echo "✅ Next.js HEALTHY on port $ACTUAL_WEB_PORT — Railway health check should pass!"
else
  echo "⏳ Next.js still starting on port $ACTUAL_WEB_PORT (will retry later)..."
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# SUSTAINABLE FIX: Terminate stale DB connections from previous deployments
#
# ROOT CAUSE: When Railway redeploys, the new container starts BEFORE
# the old one fully shuts down. Old PostgreSQL connections remain open,
# and Railway PostgreSQL (hobby tier ~5-25 max_connections) immediately
# hits "too many clients already" errors.
#
# PREVIOUS FIX: Used psql to terminate idle connections. But psql is
# NOT available in the Railway container, so cleanup was silently skipped.
#
# SUSTAINABLE FIX: Use Node.js + pg package (already installed) to
# terminate ALL non-current connections. This works without psql and
# handles special characters in DATABASE_URL correctly.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "🧹 Terminating stale DB connections from previous deployment..."
if [ -n "${ORIG_DB_URL:-}" ]; then
  # Use Node.js + pg package to terminate stale connections
  # (psql is not available in Railway containers)
  # Use ORIGINAL URL (without connection_limit) for cleanup
  DB_CLEANUP_RESULT=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    const { Client } = require('pg');
    async function cleanup() {
      // Use ORIGINAL URL (without connection_limit) for cleanup
      // so we connect via superuser reserved slot
      const rawUrl = process.env.DATABASE_URL_IN || '';
      const client = new Client({ connectionString: rawUrl, connectionTimeoutMillis: 5000 });
      try {
        await client.connect();
        const result = await client.query(
          \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle'\"
        );
        console.log('TERMINATED:' + result.rows.length);
        // Also terminate 'idle in transaction' connections (these block the most)
        const result2 = await client.query(
          \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND state = 'idle in transaction'\"
        );
        console.log('TERMINATED_TX:' + result2.rows.length);
        await client.end();
      } catch(e) {
        console.error('CLEANUP_ERROR:' + e.message);
        try { await client.end(); } catch {}
      }
    }
    cleanup();
  " 2>&1)

  if echo "$DB_CLEANUP_RESULT" | grep -q "TERMINATED:"; then
    IDLE_COUNT=$(echo "$DB_CLEANUP_RESULT" | grep "TERMINATED:" | sed 's/TERMINATED://')
    echo "✅ Terminated $IDLE_COUNT stale idle connections from previous deployment"
  else
    echo "⚠️ Stale connection cleanup had issues (non-critical): $(echo "$DB_CLEANUP_RESULT" | head -1)"
  fi
fi

# ── Prisma Setup (runs AFTER Next.js is already serving health checks) ──
echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

# ── Step 2: Apply Prisma schema to database ──
# Use prisma migrate deploy (production-safe) instead of db push.
# migrate deploy only applies pending migrations and never drops data.
# Fall back to db push if no migration files exist (first deploy).
echo "📦 Applying Prisma schema..."
DB_MIGRATE_OK=0
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  if timeout 60 npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1; then
    echo "✅ Migrations applied successfully"
    DB_MIGRATE_OK=1
  else
    echo "⚠️ prisma migrate deploy had issues — using db push WITHOUT --accept-data-loss"
    # CRITICAL: NEVER use --accept-data-loss in production!
    if timeout 60 npx prisma db push --schema=./prisma/schema.prisma 2>&1; then
      echo "✅ db push succeeded (safe — no data loss)"
      DB_MIGRATE_OK=1
    else
      echo "❌ prisma db push failed (likely needs a migration, not a push)"
      echo "❌ The app will start but schema may be out of sync"
    fi
  fi
else
  # No migrations directory — first deploy only
  if timeout 60 npx prisma db push --schema=./prisma/schema.prisma 2>&1; then
    echo "✅ db push succeeded (safe — no data loss)"
    DB_MIGRATE_OK=1
  else
    echo "❌ prisma db push failed — database may be unreachable or schema conflict"
    echo "❌ The app will start but schema may be out of sync"
  fi
fi

# ── FIX: Seed AUTO_TRADING_ENABLED using prisma db execute ──
# Previously, this script created a PrismaClient instance (with its own
# connection pool), contributing to connection pool exhaustion. Now uses
# `prisma db execute` which uses the CLI's own temporary connection and
# doesn't create a persistent pool.
echo "🔧 Seeding AUTO_TRADING_ENABLED setting..."
timeout 15 npx prisma db execute --schema=./prisma/schema.prisma \
  --stdin <<'SQL' 2>/dev/null && echo "✅ AUTO_TRADING_ENABLED seeded" || echo "⚠️ Seed skipped (non-critical)"
INSERT INTO "Setting" ("id", "key", "value", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'AUTO_TRADING_ENABLED',
  'true',
  NOW(),
  NOW()
) ON CONFLICT ("key") DO NOTHING;
SQL

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# START NESTJS IN BACKGROUND — after Prisma setup
# Next.js was already started at the top of this script.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Build artifacts on the fly if they are missing
if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building API..."
  (cd apps/api && run_api_build)
fi

# ── RECOVERY: إنشاء حساب المالك إذا لم يوجد أي مستخدم ──
# FIX: Uses a single PrismaClient with connection_limit=1 instead of the
# default pool size of 5. Also disconnects immediately after use.
echo "🔑 Checking for admin user..."
timeout 15 node -e "
const { PrismaClient } = require('@prisma/client');
// FIX: connection_limit=1 to minimize pool usage during startup
let dbUrl = process.env.DATABASE_URL;
if (dbUrl) {
  try { const u = new URL(dbUrl); u.searchParams.set('connection_limit', '1'); u.searchParams.set('pool_timeout', '5'); u.searchParams.set('connect_timeout', '5'); dbUrl = u.toString(); }
  catch { const sep = dbUrl.includes('?') ? '&' : '?'; dbUrl = dbUrl + sep + 'connection_limit=1&pool_timeout=5&connect_timeout=5'; }
}
const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

async function recover() {
  try {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      console.log('✅ Users exist (' + userCount + ') — no recovery needed');
      return;
    }

    console.log('⚠️ No users found — creating admin account...');

    const user = await prisma.user.create({
      data: {
        email: 'admin@roua-trading.com',
        displayName: 'جابر - المدير',
        tier: 'INSTITUTIONAL',
      }
    });

    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        token,
        refreshToken,
        isActive: true,
        expiresAt,
        deviceInfo: JSON.stringify({ browser: 'Recovery', type: 'desktop' }),
      }
    });

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ RECOVERY ACCOUNT CREATED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email: admin@roua-trading.com');
    console.log('User ID: ' + user.id);
    console.log('');
    console.log('RECOVERY TOKEN (صالح 7 أيام):');
    console.log(token);
    console.log('');
    console.log('افتح هذا الرابط لتسجيل الدخول:');
    console.log('https://roua-trading-production.up.railway.app/api/auth/recover?token=' + token);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  } catch(e) {
    console.log('Recovery error: ' + e.message);
  } finally {
    await prisma.\$disconnect();
    process.exit(0);
  }
}
recover();
" 2>/dev/null || echo "⚠️ Recovery check skipped"

echo "🔧 Starting NestJS API server (port ${API_PORT:-3001})..."
cd apps/api

if [ -d "dist" ]; then
  # FIX: Pipe logs to stdout so they appear in Railway logs
  node dist/main 2>&1 &
  API_PID=$!
  echo "📋 NestJS started from dist/ (PID: $API_PID)"

  # Check if the process crashed within 10 seconds (increased from 3 — module
  # initialization with many providers can take 5-8 seconds on Railway)
  sleep 10
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "❌ NestJS CRASHED within 10 seconds!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ Common causes:"
    echo "   1. Dependency injection error (check module imports)"
    echo "   2. Missing NODE_ENV or DATABASE_URL environment variables"
    echo "   3. Module resolution error (check node_modules)"
    echo "   4. Port ${API_PORT:-3001} already in use (PORT conflict)"
    echo "   5. BullMQ/Redis connection failure crashing module init"
    echo "   6. Constructor throwing in a provider (check CredentialsService)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔄 Restarting NestJS in 5 seconds (attempt 2)..."
    sleep 5
    node dist/main 2>&1 &
    API_PID=$!
    sleep 10
    if ! kill -0 $API_PID 2>/dev/null; then
      echo "❌ NestJS CRASHED again on retry!"
      echo "❌ Giving up — the site will show 502 errors for all API endpoints"
    else
      echo "✅ NestJS started successfully on retry (PID: $API_PID)"
    fi
  else
    echo "✅ NestJS is running (PID: $API_PID)"
  fi
else
  echo "⚠️ dist/ not found — API build output is missing"
  exit 1
fi

cd "$PROJECT_ROOT"


# ── SAFETY-NET SQL REMOVED ──
# Previously, 1700+ lines of DDL (CREATE TABLE, ALTER TABLE, CREATE TYPE)
# ran on EVERY deployment. This was EXTREMELY DANGEROUS because:
#   1. `prisma db push --accept-data-loss` (above) + this DDL could conflict
#   2. Running DDL outside of migrations is an anti-pattern
#   3. The `--accept-data-loss` flag caused catastrophic data loss
#   4. DDL competed with NestJS for DB connections during startup
#
# All schema changes must now be done via `prisma migrate deploy` ONLY.
# If you need a new column/table, create a proper migration:
#   npx prisma migrate dev --name add_your_column
#
# This was the section that deleted production data. NEVER re-add it.
echo "📦 Schema management: prisma migrate deploy ONLY — no ad-hoc DDL"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
# Use a public endpoint for readiness; /api/auth/session is public and returns authenticated=false when no session exists.
API_HEALTH_URL="http://127.0.0.1:${API_PORT:-3001}/api/health"
# FIX: Increased from 45s to 60s for cold starts (Railway cold starts take 45-60s)
API_READY=0
for i in $(seq 1 60); do
  if curl -fsS "$API_HEALTH_URL" > /dev/null 2>&1; then
    echo "✅ API is ready on port ${API_PORT:-3001}! (attempt $i)"
    API_READY=1
    break
  fi
  if [ $i -eq 60 ]; then
    echo "❌ API did not start in 60s — critical routes will fail!"
    echo "❌ Check logs above for NestJS startup errors."
    echo "❌ This usually means: database unreachable, TypeScript build missing, or port conflict."
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
# FIX: Exponential backoff for NestJS restarts — 1s, 2s, 4s, 8s... max 30s
# Prevents rapid restart loops when NestJS has persistent startup errors
NESTJS_BACKOFF_SECONDS=1
NESTJS_BACKOFF_MAX=30

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

      # FIX: Exponential backoff before restarting
      echo "⏳ Waiting ${NESTJS_BACKOFF_SECONDS}s before restarting NestJS (exponential backoff)..."
      sleep $NESTJS_BACKOFF_SECONDS

      echo "❌ NestJS process died (PID: $API_PID)! Restarting..."
      NESTJS_RESTART_TIMES+=($now)

      cd "$PROJECT_ROOT/apps/api"
      node dist/main &
      API_PID=$!
      echo "🔧 NestJS restarted (new PID: $API_PID, restart #$(( ${#NESTJS_RESTART_TIMES[@]} )) this hour)"

      # Wait for it to be ready
      for i in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:${API_PORT:-3001}/api/health" > /dev/null 2>&1; then
          echo "✅ NestJS is ready after restart! (attempt $i)"
          # FIX: Reset backoff on successful start
          NESTJS_BACKOFF_SECONDS=1
          break
        fi
        if [ $i -eq 30 ]; then
          echo "⚠️ NestJS did not start in 30s after restart"
        fi
        sleep 1
      done

      # FIX: Increase backoff for next restart (1s → 2s → 4s → 8s → 16s → 30s max)
      NESTJS_BACKOFF_SECONDS=$(( NESTJS_BACKOFF_SECONDS * 2 ))
      if [ $NESTJS_BACKOFF_SECONDS -gt $NESTJS_BACKOFF_MAX ]; then
        NESTJS_BACKOFF_SECONDS=$NESTJS_BACKOFF_MAX
      fi

      cd "$PROJECT_ROOT"
    fi
    sleep 10
  done
}

echo "🔍 Starting NestJS process monitor..."
monitor_nestjs &
MONITOR_PID=$!

# Next.js was already started early (before NestJS) for fast health check response.
# Just set up the trap and wait for it.
trap "kill $API_PID $MONITOR_PID 2>/dev/null || true" EXIT

# Verify Next.js is still listening (it was started earlier)
WEB_READY=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${ACTUAL_WEB_PORT}/" > /dev/null 2>&1; then
    echo "✅ Next.js VERIFIED listening on port $ACTUAL_WEB_PORT (attempt $i)"
    WEB_READY=1
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Next.js did not respond on port $ACTUAL_WEB_PORT after 30s"
    echo "❌ Railway assigns PORT dynamically — if PORT was overridden, Next.js should be on that port."
    echo "❌ Check: PORT=$ACTUAL_WEB_PORT, HOSTNAME=$HOSTNAME"
  fi
  sleep 1
done

# Summary of REAL port status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 PORT VERIFICATION RESULTS:"
echo "   API (NestJS):  port ${API_PORT:-3001} — $([ "$API_READY" -eq 1 ] && echo '✅ VERIFIED' || echo '❌ NOT RESPONDING')"
echo "   Web (Next.js): port $ACTUAL_WEB_PORT — $([ "$WEB_READY" -eq 1 ] && echo '✅ VERIFIED' || echo '❌ NOT RESPONDING')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Keep Next.js in foreground (this is the main process)
wait $WEB_PID
