#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script v10
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIX v10: SIMPLE AND RELIABLE. No auto-constructed pooler URLs.
#
# Previous versions tried to AUTO-CONSTRUCT a PgBouncer URL by guessing
# hostname patterns (adding "-pooler" suffix, etc.). This was UNRELIABLE
# and often produced WRONG URLs that:
#   1. Didn't resolve to a real service
#   2. Caused pgbouncer=true to be added to non-PgBouncer URLs
#   3. Triggered SSL stripping in PrismaClient code (which breaks
#      Railway's REMOTE PgBouncer that REQUIRES SSL)
#
# v10 approach:
#   1. If DATABASE_POOLED_URL exists (Railway provides this) → use it
#   2. Otherwise → use DATABASE_URL directly (no PgBouncer, no guessing)
#   3. connection_limit=1 per app → max 2 DB connections total
#   4. NO auto-construction of pooler URLs — too fragile
#   5. NO SSL stripping — Railway requires SSL for all connections
#
# Total steady-state DB connections: 2 (1 Next.js + 1 NestJS)
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
# DATABASE_URL SETUP — Simple & Reliable
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ FATAL: DATABASE_URL is not set. Cannot start."
  exit 1
fi

ORIG_DB_URL="$DATABASE_URL"

# Step 1: Use DATABASE_POOLED_URL if available (Railway provides this)
# This is Railway's OFFICIAL PgBouncer URL — no guessing needed.
# If it's not set, the user needs to add it in Railway dashboard:
#   PostgreSQL service → Variables → Reference DATABASE_POOLED_URL
if [ -n "${DATABASE_POOLED_URL:-}" ]; then
  echo "✅ DATABASE_POOLED_URL detected — using Railway's built-in PgBouncer"
  DATABASE_URL="$DATABASE_POOLED_URL"
  USING_POOLER=1
else
  echo "⚠️ No DATABASE_POOLED_URL — using direct connection (connection_limit=1)"
  USING_POOLER=0
fi

# Step 2: Set DIRECT_DATABASE_URL for Prisma CLI (migrations)
# Always uses the ORIGINAL (non-pooled) URL with connection_limit=1
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

# Step 3: Configure DATABASE_URL for PrismaClient
# - Always set connection_limit=1 and pool_timeout=10
# - Add pgbouncer=true ONLY if using Railway's official pooled URL
# - DO NOT strip SSL params — Railway requires SSL for all connections
APP_DB_URL=$(DATABASE_URL_IN="$DATABASE_URL" POOLER="$USING_POOLER" node -e "
  const url = process.env.DATABASE_URL_IN || '';
  const pooler = process.env.POOLER === '1';
  try {
    const u = new URL(url);
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('pool_timeout', '10');
    u.searchParams.set('connect_timeout', '30');

    // Only add pgbouncer=true if we're using Railway's official pooled URL
    // This tells Prisma to use PgBouncer-compatible mode (no prepared statements)
    if (pooler) {
      u.searchParams.set('pgbouncer', 'true');
    }

    // DO NOT strip SSL params — Railway's remote PgBouncer REQUIRES SSL
    // The old code stripped sslmode/ssl when pgbouncer=true, which was
    // correct for LOCAL PgBouncer (localhost:6432) but WRONG for Railway's
    // REMOTE PgBouncer which needs SSL to connect.

    process.stdout.write(u.toString());
  } catch {
    process.stdout.write(url);
  }
" 2>/dev/null)
export DATABASE_URL="${APP_DB_URL:-$DATABASE_URL}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading — Starting (v10)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL host:    $(echo $DATABASE_URL | node -e "try{const u=new URL(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(u.hostname+':'+u.port)}catch{process.stdout.write('PARSE_ERROR')}" 2>/dev/null)"
echo "DATABASE_URL pgbouncer: $(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES ✅ (Railway pooler)' || echo 'NO (direct connection)')"
echo "DATABASE_POOLED_URL:  ${DATABASE_POOLED_URL:+[SET]} ${DATABASE_POOLED_URL:-[NOT SET — add in Railway dashboard!]}"
echo "DIRECT_DATABASE_URL:  [SET — for migrations only]"
echo "ORIGIN:               ${ORIGIN:-not set}"
echo "NODE_ENV:             ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE CONNECTIVITY TEST — Quick check only
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Database Connectivity Test ━━━"
DB_REACHABLE=0
for DB_TRY in 1 2 3; do
  DB_TEST_RESULT=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    const { Client } = require('pg');
    async function test() {
      const client = new Client({
        connectionString: process.env.DATABASE_URL_IN,
        connectionTimeoutMillis: 5000,
      });
      try {
        await client.connect();
        const res = await client.query('SELECT 1 AS ok');
        try {
          const mc = await client.query('SHOW max_connections');
          const ac = await client.query('SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = current_database()');
          console.log('DB_OK max=' + (mc.rows[0].max_connections || mc.rows[0].Value) + ' active=' + ac.rows[0].cnt);
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
# PRISMA SETUP — Uses DIRECT_DATABASE_URL only
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Prisma Setup ━━━"

echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

echo "📦 Applying Prisma schema..."
DB_MIGRATE_OK=0
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  if timeout 60 npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1; then
    echo "✅ Migrations applied"
    DB_MIGRATE_OK=1
  else
    echo "⚠️ migrate deploy failed — trying db push"
    if timeout 60 npx prisma db push --schema=./prisma/schema.prisma 2>&1; then
      echo "✅ db push succeeded"
      DB_MIGRATE_OK=1
    else
      echo "❌ db push failed — will proceed, apps will retry"
    fi
  fi
else
  if timeout 60 npx prisma db push --schema=./prisma/schema.prisma 2>&1; then
    echo "✅ db push succeeded"
    DB_MIGRATE_OK=1
  else
    echo "❌ db push failed — will proceed, apps will retry"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# START APPS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Start Next.js
ACTUAL_WEB_PORT=${PORT:-8080}
echo ""
echo "━━━ Starting Next.js (port $ACTUAL_WEB_PORT) ━━━"
cd apps/web
run_web_start 2>&1 &
WEB_PID=$!
cd "$PROJECT_ROOT"
sleep 3

# Build API if needed
if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building..."
  (cd apps/api && run_api_build)
fi

# Start NestJS API
echo ""
echo "━━━ Starting NestJS API (port ${API_PORT:-3001}) ━━━"
cd apps/api
node dist/main 2>&1 &
API_PID=$!
cd "$PROJECT_ROOT"
sleep 5

# Restart NestJS if it crashed
if ! kill -0 $API_PID 2>/dev/null; then
  echo "❌ NestJS crashed — restarting..."
  sleep 3
  cd apps/api && node dist/main 2>&1 &
  API_PID=$!
  cd "$PROJECT_ROOT"
  sleep 5
fi

# Wait for API to be ready
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${API_PORT:-3001}/api/health" > /dev/null 2>&1; then
    echo "✅ API ready (attempt $i)"
    break
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
echo "   DB:       pgbouncer=$(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES ✅ (Railway pooler)' || echo 'NO (direct, connection_limit=1)')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
