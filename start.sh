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
echo "🚀 Roua Trading — Starting (v8)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL:         [SET] pgbouncer=$(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES' || echo 'NO')"
echo "DATABASE_POOLED_URL:  ${DATABASE_POOLED_URL:+[SET]} ${DATABASE_POOLED_URL:-[NOT SET]}"
echo "DIRECT_DATABASE_URL:  [SET]"
echo "ORIGIN:               ${ORIGIN:-not set}"
echo "NODE_ENV:             ${NODE_ENV:-development}"
echo "PORT:                 ${PORT:-8080}"
echo "API_PORT:             ${API_PORT:-3001}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

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
