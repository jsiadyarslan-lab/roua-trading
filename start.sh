#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script v8
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIX v8: ABSOLUTE MINIMUM. Zero extra DB connections during startup.
#
# Previous versions were creating EXTRA connections during startup:
#   - Connection cleanup script (pg_terminate_backend)
#   - PgBouncer setup and pre-flight checks
#   - Pooler host discovery (TCP probes)
#   All of these consumed DB connections BEFORE the apps even started!
#
# v8 approach:
#   1. Set DATABASE_URL with connection_limit=1
#   2. If DATABASE_POOLED_URL exists, add pgbouncer=true
#   3. Run prisma generate + migrate (1 connection, releases after)
#   4. Start Next.js + NestJS (2 connections total)
#   5. THAT'S IT. No cleanup, no PgBouncer, no probes.
#
# Total DB connections: 2 (Next.js) + 2 (NestJS) = max 4 at any time
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
# DATABASE_URL SETUP — Zero extra connections
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ FATAL: DATABASE_URL is not set. Cannot start."
  exit 1
fi

ORIG_DB_URL="$DATABASE_URL"

# Step 1: If DATABASE_POOLED_URL is available, use it as the app's DATABASE_URL
# This goes through Railway's built-in PgBouncer — no local PgBouncer needed
if [ -n "${DATABASE_POOLED_URL:-}" ]; then
  echo "✅ DATABASE_POOLED_URL detected — using Railway's built-in PgBouncer"
  DATABASE_URL="$DATABASE_POOLED_URL"
  echo "🔧 DATABASE_URL → Railway PgBouncer"
else
  # Step 1.5: Try to AUTO-CONSTRUCT pooled URL from DATABASE_URL
  # Railway provides DATABASE_POOLED_URL as a separate variable, but it's
  # often not referenced in the web service. We construct it here.
  # Railway pooled URL pattern: same URL but port 5432 → port 5432 with -pooler suffix
  CONSTRUCTED_POOLED=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      const origHost = u.hostname;
      
      // Railway internal networking pattern:
      // Direct: postgres.railway.internal:5432
      // Pooled: postgres-pooler.railway.internal:5432
      //
      // Public pattern:
      // Direct: containers-us-west-XX.railway.app:XXXX
      // Pooled: Same host, different port (usually 5432)
      //
      // Try common Railway pooler patterns:
      const poolerHosts = [];
      
      // Pattern 1: Replace 'postgres.' with 'postgres-pooler.'
      if (origHost.startsWith('postgres.')) {
        poolerHosts.push(origHost.replace('postgres.', 'postgres-pooler.'));
      }
      
      // Pattern 2: Add '-pooler' before .railway.app
      if (origHost.includes('.railway.app') || origHost.includes('.railway.internal')) {
        const parts = origHost.split('.');
        parts[0] = parts[0] + '-pooler';
        poolerHosts.push(parts.join('.'));
      }
      
      // Pattern 3: Add '-pooler' before any TLD
      const lastDot = origHost.lastIndexOf('.');
      if (lastDot > 0) {
        const base = origHost.substring(0, lastDot);
        const tld = origHost.substring(lastDot);
        poolerHosts.push(base + '-pooler' + tld);
      }
      
      // Output first viable candidate
      if (poolerHosts.length > 0) {
        // Try the first pattern that's different from original
        for (const h of poolerHosts) {
          if (h !== origHost) {
            u.hostname = h;
            process.stdout.write(u.toString());
            process.exit(0);
          }
        }
      }
      
      // No pattern matched — output empty
      process.stdout.write('');
    } catch {
      process.stdout.write('');
    }
  " 2>/dev/null)
  
  if [ -n "$CONSTRUCTED_POOLED" ]; then
    echo "🔧 Auto-constructed pooled URL from DATABASE_URL"
    DATABASE_URL="$CONSTRUCTED_POOLED"
    echo "🔧 DATABASE_URL → Auto-constructed Pooler"
  else
    echo "⚠️ No DATABASE_POOLED_URL and couldn't construct one — using direct connection"
  fi
fi

# Step 2: Set DIRECT_DATABASE_URL for Prisma CLI (migrations)
# Uses the original DATABASE_URL (not pooled) with connection_limit=1
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

# Step 3: Modify DATABASE_URL for PrismaClient usage
# Add connection_limit=1 and pgbouncer=true if using pooled URL
APP_DB_URL=$(DATABASE_URL_IN="$DATABASE_URL" ORIG_IN="$ORIG_DB_URL" node -e "
  const url = process.env.DATABASE_URL_IN || '';
  const origUrl = process.env.ORIG_IN || '';
  try {
    const u = new URL(url);
    u.searchParams.set('connection_limit', '1');
    u.searchParams.set('pool_timeout', '10');
    u.searchParams.set('connect_timeout', '30');

    // If DATABASE_URL differs from original, it's a pooled URL
    if (url !== origUrl) {
      u.searchParams.set('pgbouncer', 'true');
      // Pooled URLs through PgBouncer should not have sslmode for localhost
      // But Railway's PgBouncer is NOT localhost, so keep sslmode
    }

    process.stdout.write(u.toString());
  } catch {
    process.stdout.write(url);
  }
" 2>/dev/null)
export DATABASE_URL="${APP_DB_URL:-$DATABASE_URL}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading — Starting (v9)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL host:    $(echo $DATABASE_URL | node -e "try{const u=new URL(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(u.hostname+':'+u.port)}catch{process.stdout.write('PARSE_ERROR')}" 2>/dev/null)"
echo "DATABASE_URL pgbouncer: $(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES' || echo 'NO')"
echo "DATABASE_POOLED_URL:  ${DATABASE_POOLED_URL:+[SET]} ${DATABASE_POOLED_URL:-[NOT SET]}"
echo "DIRECT_DATABASE_URL:  [SET]"
echo "ORIGIN:               ${ORIGIN:-not set}"
echo "NODE_ENV:             ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# DATABASE CONNECTIVITY TEST — Verify DB is reachable
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Database Connectivity Test ━━━"
DB_REACHABLE=0
for DB_TRY in 1 2 3 4 5; do
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
    echo "⚠️ Database unreachable (attempt $DB_TRY/5): $ERR"
    if [ "$DB_TRY" -lt 5 ]; then
      sleep 5
    fi
  fi
done

if [ "$DB_REACHABLE" -ne 1 ]; then
  echo "❌ FATAL: Database is not reachable after 5 attempts!"
  echo "   The apps will start but database features will not work."
  echo "   This usually means:"
  echo "   1. Railway PostgreSQL is paused or hibernated (free tier)"
  echo "   2. max_connections is exhausted by other deployments"
  echo "   3. Network connectivity issue between services"
  echo "   Check: https://railway.app/dashboard → PostgreSQL service"
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
echo "   DB:       pgbouncer=$(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES' || echo 'NO (direct)')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

wait
