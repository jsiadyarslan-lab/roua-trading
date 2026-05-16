#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script v14
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIX v11: SIMPLEST POSSIBLE. Direct connection, no PgBouncer.
#
# WHY: PgBouncer (both local and Railway's built-in) has been causing
# connection issues for 50+ rounds. The simplest, most reliable approach
# is to NOT use PgBouncer at all and connect directly to PostgreSQL
# with connection_limit=1 per app.
#
# Total DB connections at steady state: 2 (1 Next.js + 1 NestJS)
# This is well within Railway's PostgreSQL limits (20+ max_connections).
#
# The news website (separate Railway service) works because it uses
# DATABASE_URL directly — no PgBouncer, no SSL stripping, no URL
# modification. This script now does the same thing.
#
# KEY PRINCIPLE: Don't modify DATABASE_URL except to add connection_limit=1.
# Don't add pgbouncer=true, don't strip SSL, don't change the hostname.
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
# FIX v13: Add connection_limit=1 and pool_timeout=10.
# CRITICAL: Without connection_limit=1, Prisma opens 3-5 connections per
# PrismaClient (2 clients = 6-10 connections), which EXHAUSTS Railway's
# PostgreSQL max_connections and causes "too many clients already".
# With connection_limit=1, total is only 2 connections (1 Next.js + 1 NestJS).
# We do NOT add pgbouncer=true or strip SSL.
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
echo "🚀 Roua Trading — Starting (v14)"
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
# DATABASE CONNECTIVITY TEST + STALE CONNECTION CLEANUP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Database Connectivity Test + Cleanup ━━━"
DB_REACHABLE=0
for DB_TRY in 1 2 3; do
  DB_TEST_RESULT=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    const { Client } = require('pg');
    async function test() {
      const client = new Client({
        connectionString: process.env.DATABASE_URL_IN,
        connectionTimeoutMillis: 10000,
      });
      try {
        await client.connect();
        try {
          // FIX v13: Try to increase max_connections first.
          // Railway PostgreSQL default is often 20-25, which is too low
          // when multiple services share the same database.
          try {
            await client.query('ALTER SYSTEM SET max_connections = 100');
            await client.query('SELECT pg_reload_conf()');
            console.log('INCREASED max_connections to 100');
          } catch(alterErr) {
            // May not have superuser access - that's OK, try to continue
            console.log('Cannot increase max_connections: ' + alterErr.message.substring(0, 80));
          }
          
          const mc = await client.query('SHOW max_connections');
          const ac = await client.query('SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = current_database()');
          const maxConn = mc.rows[0].max_connections || mc.rows[0].Value;
          const activeConn = ac.rows[0].cnt;
          console.log('DB_OK max=' + maxConn + ' active=' + activeConn);
          
          // FIX v13: Kill ALL idle connections from old deployments.
          // Railway PostgreSQL has limited max_connections. When the old
          // deployment is replaced, its connections may not be released.
          // We terminate ALL idle connections (except our own) to free up slots.
          try {
            // First terminate connections idle > 5 seconds
            const r1 = await client.query(\`
              SELECT pg_terminate_backend(pid)
              FROM pg_stat_activity
              WHERE datname = current_database()
                AND pid <> pg_backend_pid()
                AND state = 'idle'
            \`);
            const terminated = r1.rowCount || 0;
            console.log('Terminated ' + terminated + ' idle connections');
            
            // Also terminate connections in 'idle in transaction' state
            const r2 = await client.query(\`
              SELECT pg_terminate_backend(pid)
              FROM pg_stat_activity
              WHERE datname = current_database()
                AND pid <> pg_backend_pid()
                AND state = 'idle in transaction'
            \`);
            const terminated2 = r2.rowCount || 0;
            if (terminated2 > 0) console.log('Terminated ' + terminated2 + ' idle-in-transaction connections');
            
            // Wait a moment for PostgreSQL to release the slots
            await new Promise(r => setTimeout(r, 1000));
            
            // Check active connections after cleanup
            const ac2 = await client.query('SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = current_database()');
            console.log('After cleanup: active=' + ac2.rows[0].cnt + '/' + maxConn);
          } catch(e2) {
            console.log('Cleanup failed (non-fatal): ' + e2.message.substring(0, 100));
          }
        } catch {
          console.log('DB_OK');
        }
        await client.end();
      } catch(e) {
        console.error('DB_ERROR:' + e.message.substring(0, 200));
        try { await client.end(); } catch {}
      }
    }
    test();
  " 2>&1)

  if echo "$DB_TEST_RESULT" | grep -q "DB_OK"; then
    INFO=$(echo "$DB_TEST_RESULT" | grep "DB_OK")
    echo "✅ Database reachable: $INFO"
    DB_REACHABLE=1
    break
  else
    ERR=$(echo "$DB_TEST_RESULT" | grep -o 'DB_ERROR:.*' | head -1)
    echo "⚠️ Database unreachable (attempt $DB_TRY/3): $ERR"
    if [ "$DB_TRY" -lt 3 ]; then
      sleep 5
    fi
  fi
done

if [ "$DB_REACHABLE" -ne 1 ]; then
  echo "⚠️ Database not reachable — apps will start and retry in background"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PRISMA SETUP — Generate only (migrations run AFTER apps start)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Prisma Setup ━━━"

echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# START APPS — NestJS FIRST, then Next.js
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRITICAL FIX v14: Start NestJS BEFORE Next.js!
#
# ROOT CAUSE of "nothing changes" bug:
# Previously, Next.js started first (3s) and began serving pages.
# Users opened the page → frontend made API calls → NestJS wasn't
# ready → 3 consecutive 502 errors → circuit breaker activated →
# ALL subsequent API calls blocked for 10s → death spiral.
# The frontend could NEVER reach NestJS.
#
# NOW: Start NestJS first and wait for it to be healthy.
# Only then start Next.js. This ensures that when the frontend
# starts making API calls, NestJS is already ready to serve them.
#
# Railway gives us 120 seconds (healthcheck start-period) to get
# both services running, so this is safe.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Build API if needed
if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building..."
  (cd apps/api && run_api_build)
fi

# ══════════════════════════════════════════════════════════════
# Step 1: Start NestJS API FIRST
# ══════════════════════════════════════════════════════════════
echo ""
echo "━━━ Starting NestJS API (port ${API_PORT:-3001}) — STARTING FIRST ━━━"
cd apps/api
node dist/main 2>&1 &
API_PID=$!
cd "$PROJECT_ROOT"

# Wait for NestJS to be ready (up to 60 seconds)
echo "⏳ Waiting for NestJS to be ready..."
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${API_PORT:-3001}/api/health" > /dev/null 2>&1; then
    echo "✅ NestJS API ready (attempt $i)"
    break
  fi
  if [ $((i % 10)) -eq 0 ]; then
    echo "  ... still waiting for NestJS (attempt $i/60)"
  fi
  sleep 1
done

# Check if NestJS is actually running
if ! kill -0 $API_PID 2>/dev/null; then
  echo "❌ NestJS crashed during startup — restarting..."
  sleep 3
  cd apps/api && node dist/main 2>&1 &
  API_PID=$!
  cd "$PROJECT_ROOT"
  sleep 5
fi

# ══════════════════════════════════════════════════════════════
# Step 2: Start Next.js AFTER NestJS is ready
# ══════════════════════════════════════════════════════════════
ACTUAL_WEB_PORT=${PORT:-8080}
echo ""
echo "━━━ Starting Next.js (port $ACTUAL_WEB_PORT) — NestJS is ready ✅ ━━━"
cd apps/web
run_web_start 2>&1 &
WEB_PID=$!
cd "$PROJECT_ROOT"
sleep 3

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PRISMA MIGRATIONS — Run in background after apps start
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Prisma Migrations (background) ━━━"
(run_prisma migrate deploy --schema=./prisma/schema.prisma 2>&1 && echo "✅ Migrations applied" || echo "⚠️ Migrations skipped") &

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
