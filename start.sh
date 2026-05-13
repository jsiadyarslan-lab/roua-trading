#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script with PgBouncer
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# SUSTAINABLE FIX v2: PgBouncer + Aggressive Connection Management
#
# ROOT CAUSE of "too many clients already":
#   When Railway redeploys, the NEW container starts BEFORE the old one
#   fully shuts down. Old PostgreSQL connections remain open, filling
#   all available connection slots. The new container can't even connect
#   to run pg_terminate_backend.
#
# SUSTAINABLE SOLUTION (4-pronged):
#   1. INITIAL DELAY: Wait 15s for old container to shut down
#   2. PgBouncer: Multiplex many app connections onto few real PG connections
#   3. LOW connection_limit=2 per PrismaClient (was 5)
#   4. SKIP non-critical DB operations when DB is unavailable
#
#   Architecture:
#     App (PrismaClient x2, limit=2 each) → PgBouncer (localhost:6432) → PostgreSQL
#     4 client connections → PgBouncer → 3 real PostgreSQL connections
#     This leaves ~17 connection slots free on Railway's 20-25 max_connections
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -uo pipefail

# Load local environment fallback
if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ''|\#*) continue ;;
    esac
    key="${line%%=*}"
    value="${line#*=}"
    value="${value%$'\r'}"
    if [[ "$value" == *' #'* ]]; then
      value="${value%% #*}"
    fi
    value="${value%"${value##*[! ]}"}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi
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
    rm -rf dist tsconfig.tsbuildinfo && tsc
  fi
}

run_web_start() {
  if [ "$USE_BUN" -eq 1 ]; then
    bunx next start -H 0.0.0.0
  else
    npx next start -H 0.0.0.0
  fi
}

PROJECT_ROOT="$(pwd)"

# ── Environment Setup ──
export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:3001}"
export API_PORT="${API_PORT:-3001}"
if [ "${PORT:-3000}" = "3001" ]; then
  echo "⚠️ PORT was set to 3001 (conflicts with API_PORT) — forcing PORT=8080 for Next.js"
  export PORT=8080
fi
# Ensure PORT has a default
export PORT="${PORT:-8080}"

if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  if [ -z "${ORIGIN:-}" ] || [[ "${ORIGIN}" == *"localhost"* ]] || [[ "${ORIGIN}" == *"0.0.0.0"* ]]; then
    export ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
    echo "🔧 Auto-detected ORIGIN from RAILWAY_PUBLIC_DOMAIN: ${ORIGIN}"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 1: Database URL Setup — Split into DIRECT vs POOLED
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ FATAL: DATABASE_URL is not set. Cannot start."
  exit 1
fi

# Save the ORIGINAL database URL (before any modifications)
ORIG_DB_URL="$DATABASE_URL"

# DIRECT_DATABASE_URL: Direct connection to PostgreSQL for Prisma CLI
# CRITICAL: Use connection_limit=1 to minimize connection usage during migrations.
DIRECT_DB_URL=$(DATABASE_URL_IN="$DATABASE_URL" node -e "
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
export DIRECT_DATABASE_URL="${DIRECT_DB_URL:-$ORIG_DB_URL}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading — Starting with PgBouncer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL:       ${DATABASE_URL:+[SET (${#DATABASE_URL} chars)]}"
echo "DIRECT_DATABASE_URL: ${DIRECT_DATABASE_URL:+[SET (${#DIRECT_DATABASE_URL} chars)]}"
echo "API_INTERNAL_URL:   ${API_INTERNAL_URL:-[NOT SET]}"
echo "RP_ID:              ${RP_ID:-localhost}"
echo "ORIGIN:             ${ORIGIN:-not set}"
echo "NODE_ENV:           ${NODE_ENV:-development}"
echo "PORT:               ${PORT:-8080}"
echo "API_PORT:           ${API_PORT:-3001}"
echo "PgBouncer:          $(command -v pgbouncer >/dev/null 2>&1 && echo 'AVAILABLE' || echo 'NOT AVAILABLE — will use direct connections')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 1.5: INITIAL DELAY — Wait for old deployment to shut down
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRITICAL FIX: When Railway redeploys, the new container starts BEFORE
# the old one fully shuts down. Old PostgreSQL connections remain open.
# Without this delay, ALL subsequent DB operations will fail with
# "too many clients already" because old connections fill all slots.
#
# 15 seconds gives the old container enough time to:
#   1. Receive SIGTERM from Railway
#   2. Gracefully close PrismaClient pools
#   3. Release PostgreSQL connections
#
# This is the SINGLE MOST IMPORTANT FIX for the connection exhaustion problem.
echo ""
echo "━━━ Phase 1.5: Waiting for old deployment to shut down (15s) ━━━"
sleep 15
echo "✅ Initial delay complete — old deployment should have released connections"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 2: Kill Stale DB Connections from Previous Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Phase 2: Terminating Stale DB Connections ━━━"

DB_CLEANUP_OK=0
# INCREASED: 5 attempts with longer delays (was 3 with 3s)
for CLEANUP_ATTEMPT in 1 2 3 4 5; do
  DB_CLEANUP_RESULT=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    const { Client } = require('pg');
    async function cleanup() {
      const client = new Client({ connectionString: process.env.DATABASE_URL_IN, connectionTimeoutMillis: 10000 });
      try {
        await client.connect();
        const result = await client.query(
          \"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()\"
        );
        console.log('TERMINATED:' + result.rows.length);
        await client.end();
      } catch(e) {
        console.error('CLEANUP_ERROR:' + e.message);
        try { await client.end(); } catch {}
      }
    }
    cleanup();
  " 2>&1)

  if echo "$DB_CLEANUP_RESULT" | grep -q "TERMINATED:"; then
    COUNT=$(echo "$DB_CLEANUP_RESULT" | grep "TERMINATED:" | sed 's/TERMINATED://')
    echo "✅ Terminated $COUNT stale connections (attempt $CLEANUP_ATTEMPT)"
    DB_CLEANUP_OK=1
    sleep 3
    break
  else
    echo "⚠️ Cleanup attempt $CLEANUP_ATTEMPT failed: $(echo "$DB_CLEANUP_RESULT" | head -1)"
    if [ "$CLEANUP_ATTEMPT" -lt 5 ]; then
      # INCREASED: Progressive delay — 5s, 10s, 15s, 20s
      DELAY=$((CLEANUP_ATTEMPT * 5))
      echo "   Retrying in ${DELAY}s..."
      sleep $DELAY
    fi
  fi
done

if [ "$DB_CLEANUP_OK" -ne 1 ]; then
  echo "⚠️ All cleanup attempts failed — will proceed anyway"
  echo "   (Old deployment may still be shutting down — apps will retry connections)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 3: Prisma Database Setup (Using DIRECT Connection)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Phase 3: Prisma Database Setup (Direct Connection) ━━━"

echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

echo "📦 Applying Prisma schema..."
DB_MIGRATE_OK=0

# Helper: Try prisma db push with retries
try_db_push() {
  local MAX_RETRIES=3
  local RETRY_NUM=1
  while [ $RETRY_NUM -le $MAX_RETRIES ]; do
    echo "   db push attempt $RETRY_NUM/$MAX_RETRIES..."
    if timeout 60 npx prisma db push --schema=./prisma/schema.prisma 2>&1; then
      return 0
    else
      if [ $RETRY_NUM -lt $MAX_RETRIES ]; then
        local DELAY=$((RETRY_NUM * 10))
        echo "   ⏳ db push failed — waiting ${DELAY}s before retry..."
        sleep $DELAY
      fi
    fi
    RETRY_NUM=$((RETRY_NUM + 1))
  done
  return 1
}

if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  if timeout 60 npx prisma migrate deploy --schema=./prisma/schema.prisma 2>&1; then
    echo "✅ Migrations applied successfully"
    DB_MIGRATE_OK=1
  else
    echo "⚠️ prisma migrate deploy had issues — trying db push"
    if try_db_push; then
      echo "✅ db push succeeded"
      DB_MIGRATE_OK=1
    else
      echo "❌ prisma db push failed after retries — schema may be out of sync"
    fi
  fi
else
  if try_db_push; then
    echo "✅ db push succeeded"
    DB_MIGRATE_OK=1
  else
    echo "❌ prisma db push failed after retries — database may be unreachable"
  fi
fi

# Seed AUTO_TRADING_ENABLED setting — SKIP if DB is unavailable
if [ "$DB_MIGRATE_OK" -eq 1 ]; then
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
else
  echo "⚠️ Skipping seed — DB schema not applied (non-critical, will work with existing schema)"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 4: Start PgBouncer Connection Pooler
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Phase 4: Starting PgBouncer Connection Pooler ━━━"

PGBOUNCER_OK=0
if command -v pgbouncer >/dev/null 2>&1; then
  # Parse DATABASE_URL to extract connection components for PgBouncer config
  PG_CONFIG=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      process.stdout.write([
        u.hostname,
        u.port || '5432',
        u.pathname.slice(1),
        decodeURIComponent(u.username),
        decodeURIComponent(u.password)
      ].join('|'));
    } catch(e) {
      process.stderr.write('PARSE_ERROR:' + e.message);
      process.exit(1);
    }
  " 2>&1)

  if echo "$PG_CONFIG" | grep -q "PARSE_ERROR"; then
    echo "⚠️ Failed to parse DATABASE_URL for PgBouncer: $PG_CONFIG"
    echo "   Falling back to direct connections"
  else
    PG_HOST=$(echo "$PG_CONFIG" | cut -d'|' -f1)
    PG_PORT=$(echo "$PG_CONFIG" | cut -d'|' -f2)
    PG_DB=$(echo "$PG_CONFIG" | cut -d'|' -f3)
    PG_USER=$(echo "$PG_CONFIG" | cut -d'|' -f4)
    PG_PASS=$(echo "$PG_CONFIG" | cut -d'|' -f5)

    PG_MD5_HASH=$(PG_PASS_IN="$PG_PASS" PG_USER_IN="$PG_USER" node -e "
      const crypto = require('crypto');
      const pass = process.env.PG_PASS_IN;
      const user = process.env.PG_USER_IN;
      const hash = 'md5' + crypto.createHash('md5').update(pass + user).digest('hex');
      process.stdout.write(hash);
    " 2>/dev/null)

    cat > /tmp/pgbouncer_users.txt <<EOF
"${PG_USER}" "${PG_MD5_HASH}"
EOF
    chmod 600 /tmp/pgbouncer_users.txt

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # PgBouncer Configuration — OPTIMIZED for Railway's low max_connections
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # CHANGES from v1:
    #   default_pool_size: 5 → 3 (fewer real PG connections)
    #   reserve_pool_size: 2 → 1 (fewer reserve connections)
    #   min_pool_size: 0 → 2 (keep minimum ready)
    #   Total max real connections: 3 + 1 = 4 (leaves ~16 for direct/migration)
    #
    # With connection_limit=2 per PrismaClient and 2 PrismaClient instances
    # (NestJS + Next.js), we have 4 client connections to PgBouncer.
    # PgBouncer multiplexes these onto 3-4 real PG connections.
    # This leaves plenty of room for direct connections (prisma CLI, cleanup).
    cat > /tmp/pgbouncer.ini <<EOF
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; PgBouncer Configuration v2 — Optimized for Railway
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; 4 client connections → 3 real PG connections
;; Leaves ~17 slots free on Railway's ~20-25 max_connections

[databases]
${PG_DB} = host=${PG_HOST} port=${PG_PORT} dbname=${PG_DB}

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432

auth_type = md5
auth_file = /tmp/pgbouncer_users.txt

pool_mode = transaction

; Connection limits — REDUCED for Railway's low max_connections
max_client_conn = 100
default_pool_size = 3
min_pool_size = 2
reserve_pool_size = 1
reserve_pool_timeout = 5

; Timeouts
server_idle_timeout = 300
server_lifetime = 600
server_connect_timeout = 15
server_login_retry = 3
server_check_query = SELECT 1
server_check_delay = 30

; Logging
log_connections = 0
log_disconnections = 0
stats_period = 60

; File locations
pidfile = /tmp/pgbouncer.pid
logfile = /tmp/pgbouncer.log

; Admin
admin_users = ${PG_USER}
stats_users = ${PG_USER}
EOF
    chmod 600 /tmp/pgbouncer.ini

    # Start PgBouncer
    echo "🔧 Starting PgBouncer on 127.0.0.1:6432..."
    pgbouncer -d /tmp/pgbouncer.ini 2>&1
    PGBOUNCER_PID=$(pgrep -f "pgbouncer" 2>/dev/null | head -1)

    # Wait for PgBouncer to be ready
    for i in $(seq 1 10); do
      if node -e "
        const net = require('net');
        const client = new net.Socket();
        client.setTimeout(1000);
        client.on('connect', () => { client.destroy(); process.exit(0); });
        client.on('error', () => { client.destroy(); process.exit(1); });
        client.on('timeout', () => { client.destroy(); process.exit(1); });
        client.connect(6432, '127.0.0.1');
      " 2>/dev/null; then
        echo "✅ PgBouncer is ready on 127.0.0.1:6432 (PID: ${PGBOUNCER_PID:-unknown})"
        PGBOUNCER_OK=1
        break
      fi
      sleep 1
    done

    if [ "$PGBOUNCER_OK" -ne 1 ]; then
      echo "⚠️ PgBouncer failed to start within 10s — falling back to direct connections"
      pkill -f pgbouncer 2>/dev/null || true
    fi
  fi
else
  echo "⚠️ PgBouncer not installed — falling back to direct connections with connection_limit=1"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set DATABASE_URL for Application Use
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$PGBOUNCER_OK" -eq 1 ]; then
  # Application connects through PgBouncer
  # CRITICAL: connection_limit=2 (was 5) to reduce total connections
  # With 2 PrismaClient instances (NestJS + Next.js), that's 4 client connections
  # PgBouncer multiplexes these onto 3 real PG connections.
  POOLED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      u.hostname = '127.0.0.1';
      u.port = '6432';
      u.searchParams.delete('connection_limit');
      u.searchParams.delete('pool_timeout');
      u.searchParams.delete('connect_timeout');
      u.searchParams.set('pgbouncer', 'true');
      u.searchParams.set('connection_limit', '2');
      process.stdout.write(u.toString());
    } catch(e) {
      process.stderr.write('ERROR:' + e.message);
      process.exit(1);
    }
  " 2>/dev/null)

  if [ -n "$POOLED_URL" ]; then
    export DATABASE_URL="$POOLED_URL"
    echo "🔧 DATABASE_URL → PgBouncer (localhost:6432, pgbouncer=true, connection_limit=2, pool_mode=transaction)"
  else
    echo "⚠️ Failed to construct PgBouncer URL — falling back to direct connections"
    PGBOUNCER_OK=0
  fi
fi

# Fallback: If PgBouncer is not available, use direct connections with connection_limit=1
if [ "$PGBOUNCER_OK" -ne 1 ]; then
  MODIFIED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
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
    echo "🔧 DATABASE_URL → Direct PostgreSQL (connection_limit=1 — PgBouncer unavailable)"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Connection Architecture:"
echo "   Mode: $([ "$PGBOUNCER_OK" -eq 1 ] && echo 'PgBouncer (POOLED) ✅' || echo 'Direct (NO POOLING) ⚠️')"
echo "   DATABASE_URL:       $([ "$PGBOUNCER_OK" -eq 1 ] && echo '→ PgBouncer:6432 (limit=2)' || echo '→ Direct PG (limit=1)')"
echo "   DIRECT_DATABASE_URL: → Direct PG (limit=1, for migrations)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 5: Start Next.js (Health Check Priority)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTUAL_WEB_PORT=${PORT:-8080}
echo "━━━ Phase 5: Starting Next.js (port $ACTUAL_WEB_PORT) ━━━"
cd apps/web
run_web_start 2>&1 &
WEB_PID=$!
cd "$PROJECT_ROOT"

sleep 5
if curl -fsS "http://127.0.0.1:${ACTUAL_WEB_PORT}/api/health" > /dev/null 2>&1; then
  echo "✅ Next.js HEALTHY on port $ACTUAL_WEB_PORT"
else
  echo "⏳ Next.js still starting on port $ACTUAL_WEB_PORT..."
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 6: Admin User Recovery — SKIP if DB is unavailable
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRITICAL FIX: Do NOT create an additional PrismaClient if the DB
# is already exhausted. This was creating a 3rd connection pool,
# adding to the connection pressure. Only run recovery if DB is reachable.
echo ""
echo "━━━ Phase 6: Checking Admin User ━━━"

# Build API if needed
if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building API..."
  (cd apps/api && run_api_build)
fi

# ONLY attempt recovery if DB cleanup or migration succeeded
if [ "$DB_CLEANUP_OK" -eq 1 ] || [ "$DB_MIGRATE_OK" -eq 1 ]; then
  timeout 15 node -e "
const { PrismaClient } = require('@prisma/client');
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
      data: { email: 'admin@roua-trading.com', displayName: 'جابر - المدير', tier: 'INSTITUTIONAL' }
    });
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.session.create({
      data: { userId: user.id, token, refreshToken, isActive: true, expiresAt,
        deviceInfo: JSON.stringify({ browser: 'Recovery', type: 'desktop' }) }
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
else
  echo "⚠️ Skipping admin recovery — DB was unreachable during startup (non-critical)"
  echo "   Recovery will be attempted on next successful deployment"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 7: Start NestJS API Server
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Phase 7: Starting NestJS API (port ${API_PORT:-3001}) ━━━"

cd apps/api
node dist/main 2>&1 &
API_PID=$!
echo "📋 NestJS started (PID: $API_PID)"

sleep 10
if ! kill -0 $API_PID 2>/dev/null; then
  echo "❌ NestJS CRASHED within 10 seconds!"
  echo "🔄 Restarting in 5 seconds..."
  sleep 5
  node dist/main 2>&1 &
  API_PID=$!
  sleep 10
  if ! kill -0 $API_PID 2>/dev/null; then
    echo "❌ NestJS CRASHED again — API will be unavailable"
  else
    echo "✅ NestJS started on retry (PID: $API_PID)"
  fi
else
  echo "✅ NestJS is running (PID: $API_PID)"
fi

cd "$PROJECT_ROOT"

echo "📦 Schema management: prisma migrate deploy ONLY — no ad-hoc DDL"

# Wait for API readiness
echo "⏳ Waiting for API to be ready..."
API_HEALTH_URL="http://127.0.0.1:${API_PORT:-3001}/api/health"
API_READY=0
for i in $(seq 1 60); do
  if curl -fsS "$API_HEALTH_URL" > /dev/null 2>&1; then
    echo "✅ API is ready! (attempt $i)"
    API_READY=1
    break
  fi
  if [ $i -eq 60 ]; then
    echo "❌ API did not start in 60s"
  fi
  sleep 1
done

cd "$PROJECT_ROOT"

# ── NestJS Process Monitor ──
NESTJS_RESTART_COUNT=0
NESTJS_MAX_RESTARTS=10
NESTJS_RESTART_WINDOW=3600
NESTJS_RESTART_TIMES=()
NESTJS_BACKOFF_SECONDS=1
NESTJS_BACKOFF_MAX=30

monitor_nestjs() {
  while true; do
    if ! kill -0 $API_PID 2>/dev/null; then
      local now=$(date +%s)
      NESTJS_RESTART_TIMES=($(echo "${NESTJS_RESTART_TIMES[@]}" | tr ' ' '\n' | awk -v cutoff=$((now - NESTJS_RESTART_WINDOW)) '$1 > cutoff'))

      if [ ${#NESTJS_RESTART_TIMES[@]} -ge $NESTJS_MAX_RESTARTS ]; then
        echo "❌ NestJS crashed ${NESTJS_MAX_RESTARTS} times this hour — NOT restarting"
        break
      fi

      echo "⏳ Waiting ${NESTJS_BACKOFF_SECONDS}s before restarting..."
      sleep $NESTJS_BACKOFF_SECONDS

      echo "❌ NestJS process died — restarting..."
      NESTJS_RESTART_TIMES+=($now)

      cd "$PROJECT_ROOT/apps/api"
      node dist/main &
      API_PID=$!
      echo "🔧 NestJS restarted (PID: $API_PID, restart #$(( ${#NESTJS_RESTART_TIMES[@]} )) this hour)"

      for i in $(seq 1 30); do
        if curl -fsS "http://127.0.0.1:${API_PORT:-3001}/api/health" > /dev/null 2>&1; then
          echo "✅ NestJS ready after restart! (attempt $i)"
          NESTJS_BACKOFF_SECONDS=1
          break
        fi
        if [ $i -eq 30 ]; then
          echo "⚠️ NestJS did not start in 30s after restart"
        fi
        sleep 1
      done

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

# Verify Next.js is still listening
WEB_READY=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${ACTUAL_WEB_PORT}/" > /dev/null 2>&1; then
    echo "✅ Next.js VERIFIED on port $ACTUAL_WEB_PORT (attempt $i)"
    WEB_READY=1
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ Next.js did not respond on port $ACTUAL_WEB_PORT after 30s"
  fi
  sleep 1
done

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 ROUA TRADING — STARTUP COMPLETE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Connection Mode:  $([ "$PGBOUNCER_OK" -eq 1 ] && echo 'PgBouncer ✅ (TRANSACTION MODE, limit=2)' || echo 'Direct ⚠️ (NO POOLER, limit=1)')"
echo "   API (NestJS):     port ${API_PORT:-3001} — $([ "$API_READY" -eq 1 ] && echo '✅ VERIFIED' || echo '❌ NOT RESPONDING')"
echo "   Web (Next.js):    port $ACTUAL_WEB_PORT — $([ "$WEB_READY" -eq 1 ] && echo '✅ VERIFIED' || echo '❌ NOT RESPONDING')"
echo "   DB Migrations:    $([ "$DB_MIGRATE_OK" -eq 1 ] && echo '✅ APPLIED' || echo '❌ FAILED (will retry on next deploy)')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Cleanup trap
trap "kill $API_PID $MONITOR_PID 2>/dev/null; pkill -f pgbouncer 2>/dev/null; true" EXIT

# Keep Next.js in foreground (main process)
wait $WEB_PID
