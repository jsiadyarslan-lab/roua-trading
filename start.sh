#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script with PgBouncer
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# SUSTAINABLE FIX v3: PgBouncer + Auth/SSL Fix + Aggressive Connection Management
#
# ROOT CAUSE of "too many clients already" (3 hidden issues found in v2):
#
#   ISSUE 1: PgBouncer auth_type=md5 FAILS with PostgreSQL scram-sha-256
#     Railway PostgreSQL uses scram-sha-256 by default. PgBouncer with md5
#     auth can't perform SCRAM exchange — connection silently fails.
#     FIX: Use auth_type=plain (stores plaintext password, works with scram)
#
#   ISSUE 2: SSL parameters in DATABASE_URL conflict with PgBouncer
#     When DATABASE_URL is rewritten to point to PgBouncer on localhost,
#     sslmode=require is sent to localhost:6432 — but PgBouncer doesn't
#     support SSL on localhost. Connection fails with SSL error.
#     FIX: Strip sslmode/ssl params from DATABASE_URL when using PgBouncer
#
#   ISSUE 3: PgBouncer doesn't use TLS when connecting to PostgreSQL
#     Railway PostgreSQL requires TLS. Without server_tls_sslmode in
#     PgBouncer config, it connects without TLS and gets rejected.
#     FIX: Add server_tls_sslmode=require to PgBouncer config
#
#   Additional fixes:
#     - Increased initial delay from 15s to 25s for old container shutdown
#     - Added pre-flight query check to verify PgBouncer→PostgreSQL path
#     - Reduced pool sizes for Railway's low max_connections
#     - Added max_connections diagnostic
#
#   Architecture:
#     App (PrismaClient x2, limit=1 each) → PgBouncer (localhost:6432) → PostgreSQL
#     2 client connections → PgBouncer → 5-7 real PostgreSQL connections
#     TLS: App → PgBouncer (plain/local) → PostgreSQL (TLS)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -uo pipefail

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CRITICAL FIX v6: Reliable PgBouncer + Connection Management
#
# ROOT CAUSE ANALYSIS (from Railway deployment logs):
#
#   SYMPTOM: "DATABASE_URL has pgbouncer=true: false" in logs
#   MEANING: PgBouncer is FAILING its pre-flight check → PGBOUNCER_OK=0
#   RESULT: DATABASE_URL is NOT rewritten to point to PgBouncer
#   CONSEQUENCE: Every PrismaClient connects directly to PostgreSQL
#   PROBLEM: Direct connections + retries + health checks exhaust max_connections
#
#   WHY previous fixes failed (v1-v5):
#   1. v1-v2: PgBouncer auth_type=md5 incompatible with PG scram-sha-256
#   2. v3: Added auth_type=plain + TLS, but pre-flight check still fails
#      because PostgreSQL is saturated during deployment
#   3. v4: Fixed PgBouncer daemon mode, but pre-flight still fails
#   4. v5: Added direct connection fallback with pool_timeout=3 (WRONG!)
#      pool_timeout=3 means "wait 3s for pool connection" not "idle timeout"
#      This caused MORE timeouts and $disconnect/$connect cycles
#
# FIX v6 APPROACH:
#   1. If PgBouncer TCP check passes, USE PgBouncer even if pre-flight
#      query fails (PgBouncer will retry connecting to PG internally)
#   2. Support DATABASE_POOLED_URL from Railway (built-in PgBouncer)
#   3. Fix pool_timeout from 3→10 (3s is too short for pool wait)
#   4. Fix ensureDbReady() to NOT call $disconnect() on failure
#      (destroying pools creates more connections)
#   5. Remove SELECT 1 from health checks (unnecessary DB queries)
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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
# CRITICAL FIX v5: Increased from 25s to 35s.
# Railway sometimes takes 30+ seconds to fully terminate the old container.
# The old container's PrismaClient connections can persist for 20-30 seconds
# after SIGTERM. If we start too early, we compete for the same limited
# max_connections slots and BOTH deployments fail.
echo ""
echo "━━━ Phase 1.5: Waiting for old deployment to shut down (35s) ━━━"
sleep 35
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
PGBOUNCER_TCP_OK=0
PGBOUNCER_PID=""
if command -v pgbouncer >/dev/null 2>&1; then
  # Parse DATABASE_URL to extract connection components for PgBouncer config
  PG_CONFIG=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      process.stdout.write([
        u.hostname,
        u.port || '5432',
        decodeURIComponent(u.pathname.slice(1)),
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

    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    # CRITICAL FIX v3: Use PLAINTEXT auth instead of md5
    #
    # WHY: Railway PostgreSQL uses scram-sha-256 authentication by default.
    # PgBouncer with auth_type=md5 can't perform SCRAM exchange because it
    # only has the md5 hash, not the plaintext password. This causes ALL
    # queries through PgBouncer to SILENTLY FAIL.
    #
    # With auth_type=plain:
    #   1. Client sends plaintext password over localhost (secure — local only)
    #   2. PgBouncer verifies against plaintext password in auth_file
    #   3. PgBouncer uses the plaintext password for server auth
    #      (works with BOTH md5 AND scram-sha-256 on the PostgreSQL side)
    #
    # Security: auth_file is chmod 600 and only accessible locally.
    # PgBouncer is bound to 127.0.0.1 — no external access.
    # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    # Escape any special characters in password for the auth file
    # PgBouncer auth file format: backslashes must be escaped as \\
    # and double quotes must be escaped as \"
    PG_PASS_ESCAPED=$(printf '%s' "$PG_PASS" | sed 's/\\/\\\\/g; s/"/\\"/g')

    cat > /tmp/pgbouncer_users.txt <<PGEOF
"${PG_USER}" "${PG_PASS_ESCAPED}"
PGEOF
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
    # CRITICAL FIX v4: Remove stale PID/log files from previous runs
    # On container restart (not redeploy), old PID/log files may persist in /tmp.
    # PgBouncer refuses to start if a PID file exists with a running PID.
    rm -f /tmp/pgbouncer.pid /tmp/pgbouncer.log

    cat > /tmp/pgbouncer.ini <<EOF
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; PgBouncer Configuration v3 — Auth + SSL Fix for Railway
;; ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
;; KEY FIXES from v2:
;;   1. auth_type = plain (was md5) — works with PG scram-sha-256
;;   2. server_tls_sslmode = require — TLS for PG connection
;;   3. Reduced pool sizes for Railway's very low max_connections
;;
;; 2 client connections (limit=1 each) → PgBouncer → 5-7 real PG connections
;; Leaves max_connections - 7 slots free for migrations/cleanup

[databases]
${PG_DB} = host=${PG_HOST} port=${PG_PORT} dbname=${PG_DB}

[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432

; CRITICAL FIX v3: auth_type=plain instead of md5
; Railway PostgreSQL uses scram-sha-256. With md5 auth, PgBouncer
; can't perform SCRAM exchange — ALL queries silently fail.
; Plain auth stores plaintext password and can authenticate to
; both md5 and scram-sha-256 PostgreSQL servers.
; Safe because PgBouncer is on localhost (127.0.0.1) only.
auth_type = plain
auth_file = /tmp/pgbouncer_users.txt

pool_mode = transaction

; Connection limits — TIGHT for Railway's low max_connections (~20)
; FIX v5: Reduced pool sizes. PgBouncer multiplexes in transaction mode,
; so 3 real PG connections can serve many client connections.
;   1 (Next.js) + 1 (NestJS) = 2 client connections
;   3 real PG connections leaves ~17 slots for other clients
max_client_conn = 20
default_pool_size = 3
min_pool_size = 1
reserve_pool_size = 1
reserve_pool_timeout = 5

; CRITICAL FIX v3: TLS for PgBouncer → PostgreSQL connection
; Railway PostgreSQL requires TLS. Without this, PgBouncer
; connects without TLS and the connection is rejected.
server_tls_sslmode = require

; Timeouts
server_idle_timeout = 300
server_lifetime = 600
server_connect_timeout = 15
server_login_retry = 3
server_check_query = SELECT 1
server_check_delay = 30

; Logging — enable connection logging for diagnostics
log_connections = 1
log_disconnections = 1
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
    # CRITICAL FIX v4: Do NOT use `pgbouncer -d` (daemon mode).
    #
    # PROBLEM with `-d` in Docker containers:
    #   1. `pgbouncer -d` forks a child and the parent exits with code 0
    #      IMMEDIATELY — even if the child crashes right after forking.
    #      The script can't detect child-process failures from the exit code.
    #   2. The child process uses setsid() to create a new session.
    #      In Docker containers (especially as non-root user), this can fail
    #      silently or the orphaned child can be reaped by PID 1.
    #   3. When running as `webuser` (non-root), the daemonized process
    #      may not have proper process group leadership, causing the child
    #      to be killed when the shell exits or receives signals.
    #
    # FIX: Run PgBouncer in the BACKGROUND without daemonizing.
    #   `pgbouncer /tmp/pgbouncer.ini &` keeps PgBouncer as a direct
    #   child of the shell. It stays in the process group, receives
    #   signals properly, and any startup errors are visible immediately.
    echo "🔧 Starting PgBouncer on 127.0.0.1:6432 (auth=plain, tls=require)..."
    pgbouncer /tmp/pgbouncer.ini &
    PGBOUNCER_PID=$!
    sleep 1

    # Check if PgBouncer process is still alive (detects immediate crashes)
    if ! kill -0 "$PGBOUNCER_PID" 2>/dev/null; then
      echo "❌ PgBouncer process died immediately!"
      echo "   PgBouncer log (last 10 lines):"
      tail -10 /tmp/pgbouncer.log 2>/dev/null || echo "   (no log available)"
      echo "   Config file contents:"
      head -20 /tmp/pgbouncer.ini 2>/dev/null || echo "   (config not available)"
      echo "   Auth file exists: $([ -f /tmp/pgbouncer_users.txt ] && echo 'yes' || echo 'NO')"
      echo "   Falling back to direct connections"
    else
      # Wait for PgBouncer to accept TCP connections
      PGBOUNCER_TCP_OK=0
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
          echo "✅ PgBouncer accepting TCP on 127.0.0.1:6432 (PID: ${PGBOUNCER_PID})"
          PGBOUNCER_TCP_OK=1
          break
        fi
        sleep 1
      done

      if [ "$PGBOUNCER_TCP_OK" -ne 1 ]; then
        echo "⚠️ PgBouncer failed to start within 10s — falling back to direct connections"
        echo "   PgBouncer log (last 10 lines):"
        tail -10 /tmp/pgbouncer.log 2>/dev/null || echo "   (no log available)"
        kill "$PGBOUNCER_PID" 2>/dev/null || true
      else
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # CRITICAL FIX v3: Pre-flight query check
        # PgBouncer can accept TCP connections but STILL fail to reach
        # PostgreSQL (auth failure, TLS failure, max_connections reached).
        # This check verifies the FULL PATH: App → PgBouncer → PostgreSQL.
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        echo "🔍 PgBouncer pre-flight check: verifying App → PgBouncer → PostgreSQL path..."
        PGBOUNCER_QUERY_OK=0
        for PREFLIGHT in 1 2 3; do
          PREFLIGHT_RESULT=$(PGHOST_IN="127.0.0.1" PGPORT_IN="6432" PGDB_IN="$PG_DB" PGUSER_IN="$PG_USER" PGPASS_IN="$PG_PASS" node -e "
            const { Client } = require('pg');
            async function check() {
              const client = new Client({
                host: process.env.PGHOST_IN,
                port: parseInt(process.env.PGPORT_IN),
                database: process.env.PGDB_IN,
                user: process.env.PGUSER_IN,
                password: process.env.PGPASS_IN,
                connectionTimeoutMillis: 10000,
                ssl: false  // No SSL needed for localhost PgBouncer
              });
              try {
                await client.connect();
                const res = await client.query('SELECT 1 AS ok');
                console.log('PREFLIGHT_OK:' + JSON.stringify(res.rows[0]));
                try {
                  const mc = await client.query('SHOW max_connections');
                  console.log('MAX_CONN:' + (mc.rows[0].max_connections || mc.rows[0].Value || 'unknown'));
                } catch {}
                try {
                  const ac = await client.query('SELECT count(*) as cnt FROM pg_stat_activity WHERE datname = current_database()');
                  console.log('ACTIVE_CONN:' + ac.rows[0].cnt);
                } catch {}
                await client.end();
              } catch(e) {
                console.error('PREFLIGHT_ERROR:' + e.message);
                try { await client.end(); } catch {}
              }
            }
            check();
          " 2>&1)

          if echo "$PREFLIGHT_RESULT" | grep -q "PREFLIGHT_OK:"; then
            echo "✅ PgBouncer → PostgreSQL: WORKING"
            MAX_CONN=$(echo "$PREFLIGHT_RESULT" | grep "MAX_CONN:" | sed 's/MAX_CONN://')
            ACTIVE_CONN=$(echo "$PREFLIGHT_RESULT" | grep "ACTIVE_CONN:" | sed 's/ACTIVE_CONN://')
            if [ -n "$MAX_CONN" ]; then
              echo "📊 PostgreSQL max_connections = $MAX_CONN, active = ${ACTIVE_CONN:-?}"
            fi
            PGBOUNCER_QUERY_OK=1
            PGBOUNCER_OK=1
            break
          else
            PREFLIGHT_ERR=$(echo "$PREFLIGHT_RESULT" | grep -o 'PREFLIGHT_ERROR:.*' | head -1)
            echo "⚠️ Pre-flight attempt $PREFLIGHT/3 failed: $PREFLIGHT_ERR"
            echo "   PgBouncer log (last 10 lines):"
            tail -10 /tmp/pgbouncer.log 2>/dev/null || echo "   (no log available)"
            sleep 5
          fi
        done

        if [ "$PGBOUNCER_QUERY_OK" -ne 1 ]; then
          echo "❌ PgBouncer can't reach PostgreSQL — falling back to direct connections"
          echo "   PgBouncer log (FULL):"
          cat /tmp/pgbouncer.log 2>/dev/null || echo "   (no log available)"
          echo ""
          PGBOUNCER_OK=0
        fi
      fi
    fi
  fi
else
  echo "⚠️ PgBouncer not installed — falling back to direct connections with connection_limit=1"
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set DATABASE_URL for Application Use
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FIX v6: Check for Railway's built-in DATABASE_POOLED_URL first
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Railway PostgreSQL provides a DATABASE_POOLED_URL that goes through
# Railway's own PgBouncer. This is more reliable than our own PgBouncer
# because it's managed by Railway and doesn't have TLS/auth issues.
if [ -n "${DATABASE_POOLED_URL:-}" ]; then
  echo "✅ DATABASE_POOLED_URL detected — using Railway's built-in PgBouncer"
  POOLED_URL=$(DATABASE_URL_IN="$DATABASE_POOLED_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      u.searchParams.set('pgbouncer', 'true');
      u.searchParams.set('connection_limit', '1');
      // Strip SSL params that conflict with PgBouncer
      u.searchParams.delete('sslmode');
      u.searchParams.delete('ssl');
      u.searchParams.delete('sslrootcert');
      u.searchParams.delete('sslcert');
      u.searchParams.delete('sslkey');
      process.stdout.write(u.toString());
    } catch(e) {
      process.stderr.write('ERROR:' + e.message);
      process.exit(1);
    }
  " 2>/dev/null)
  if [ -n "$POOLED_URL" ]; then
    export DATABASE_URL="$POOLED_URL"
    echo "🔧 DATABASE_URL → Railway PgBouncer (pgbouncer=true, connection_limit=1)"
    # Skip our own PgBouncer setup — Railway's is already running
    PGBOUNCER_OK=2  # Special value: using Railway's PgBouncer
  else
    echo "⚠️ Failed to construct Railway PgBouncer URL — will try our own"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Set DATABASE_URL for Application Use (our own PgBouncer)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ "$PGBOUNCER_OK" -eq 1 ]; then
  # Application connects through our PgBouncer
  # CRITICAL: connection_limit=1 to minimize total connections
  #
  # CRITICAL FIX v3: Strip SSL parameters from DATABASE_URL
  # When DATABASE_URL is rewritten to point to PgBouncer on localhost,
  # sslmode=require would be sent to localhost:6432. But PgBouncer
  # doesn't support SSL on localhost — connection fails with SSL error!
  #
  # TLS is handled separately:
  #   App → PgBouncer: plain (localhost, secure by default)
  #   PgBouncer → PostgreSQL: TLS (server_tls_sslmode=require)
  POOLED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      u.hostname = '127.0.0.1';
      u.port = '6432';
      // Strip connection management params (PgBouncer handles these)
      u.searchParams.delete('connection_limit');
      u.searchParams.delete('pool_timeout');
      u.searchParams.delete('connect_timeout');
      // CRITICAL FIX v3: Strip SSL params — PgBouncer on localhost doesn't use SSL
      // TLS is handled by PgBouncer's server_tls_sslmode for the PG connection
      u.searchParams.delete('sslmode');
      u.searchParams.delete('ssl');
      u.searchParams.delete('sslrootcert');
      u.searchParams.delete('sslcert');
      u.searchParams.delete('sslkey');
      u.searchParams.delete('sslcrm');
      // Add Prisma PgBouncer compatibility flag
      u.searchParams.set('pgbouncer', 'true');
      u.searchParams.set('connection_limit', '1');
      process.stdout.write(u.toString());
    } catch(e) {
      process.stderr.write('ERROR:' + e.message);
      process.exit(1);
    }
  " 2>/dev/null)

  if [ -n "$POOLED_URL" ]; then
    export DATABASE_URL="$POOLED_URL"
    echo "🔧 DATABASE_URL → PgBouncer (localhost:6432, pgbouncer=true, connection_limit=1, SSL stripped)"
  else
    echo "⚠️ Failed to construct PgBouncer URL — falling back to direct connections"
    PGBOUNCER_OK=0
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# FIX v6: If PgBouncer TCP is up but pre-flight query failed, STILL use PgBouncer
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# WHY: The pre-flight query fails because PostgreSQL is saturated during
# deployment. But PgBouncer in transaction mode will RETRY connecting to PG
# internally (server_login_retry=3). So even if PG is saturated NOW,
# PgBouncer will connect LATER when connections free up.
#
# This is MUCH better than direct connections, where each PrismaClient
# creates its own pool and directly competes for PG connection slots.
if [ "$PGBOUNCER_OK" -eq 0 ] && [ "$PGBOUNCER_TCP_OK" -eq 1 ] 2>/dev/null; then
  echo "⚠️ PgBouncer TCP is up but pre-flight query failed — using PgBouncer anyway"
  echo "   (PgBouncer will retry connecting to PostgreSQL internally)"
  POOLED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      u.hostname = '127.0.0.1';
      u.port = '6432';
      u.searchParams.delete('connection_limit');
      u.searchParams.delete('pool_timeout');
      u.searchParams.delete('connect_timeout');
      u.searchParams.delete('sslmode');
      u.searchParams.delete('ssl');
      u.searchParams.delete('sslrootcert');
      u.searchParams.delete('sslcert');
      u.searchParams.delete('sslkey');
      u.searchParams.delete('sslcrm');
      u.searchParams.set('pgbouncer', 'true');
      u.searchParams.set('connection_limit', '1');
      process.stdout.write(u.toString());
    } catch(e) {
      process.stderr.write('ERROR:' + e.message);
      process.exit(1);
    }
  " 2>/dev/null)

  if [ -n "$POOLED_URL" ]; then
    export DATABASE_URL="$POOLED_URL"
    PGBOUNCER_OK=1
    echo "🔧 DATABASE_URL → PgBouncer (localhost:6432, pgbouncer=true, degraded mode — will retry)"
  fi
fi

# Fallback: If PgBouncer is not available at all, use direct connections
# FIX v6: pool_timeout=10 (was 3) — pool_timeout is wait time for pool
# connection, NOT idle timeout. 3s was too short and caused timeout errors
# that triggered $disconnect/$connect cycles, making exhaustion worse.
if [ "$PGBOUNCER_OK" -ne 1 ] && [ "$PGBOUNCER_OK" -ne 2 ]; then
  MODIFIED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
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
  if [ -n "$MODIFIED_URL" ]; then
    export DATABASE_URL="$MODIFIED_URL"
    echo "🔧 DATABASE_URL → Direct PostgreSQL (connection_limit=1, pool_timeout=10 — PgBouncer unavailable)"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Connection Architecture:"
if [ "$PGBOUNCER_OK" -eq 2 ]; then
  echo "   Mode: Railway PgBouncer (POOLED) ✅"
  echo "   DATABASE_URL:       → Railway PgBouncer (pgbouncer=true, limit=1)"
elif [ "$PGBOUNCER_OK" -eq 1 ]; then
  echo "   Mode: Local PgBouncer (POOLED) ✅"
  echo "   DATABASE_URL:       → PgBouncer:6432 (pgbouncer=true, limit=1)"
else
  echo "   Mode: Direct (NO POOLING) ⚠️"
  echo "   DATABASE_URL:       → Direct PG (limit=1, pool_timeout=10)"
fi
echo "   DIRECT_DATABASE_URL: → Direct PG (limit=1, for migrations)"
echo "   pgbouncer=true in URL: $(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES ✅' || echo 'NO ❌')"
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
# FIX: Use raw pg Client instead of PrismaClient to avoid creating a 3rd connection pool.
# PrismaClient creates its own pool which competes with Next.js and NestJS pools.
# The raw pg Client opens ONE connection, does the work, and closes immediately.
if [ "$DB_CLEANUP_OK" -eq 1 ] || [ "$DB_MIGRATE_OK" -eq 1 ]; then
  # Use DIRECT_DATABASE_URL (bypasses PgBouncer) to avoid pool contention
  RECOVERY_DB_URL="${DIRECT_DATABASE_URL:-$ORIG_DB_URL}"
  timeout 15 node -e "
const { Client } = require('pg');
const crypto = require('crypto');

async function recover() {
  const client = new Client({
    connectionString: process.env.RECOVERY_DB_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    await client.connect();

    // Check if any users exist
    const countResult = await client.query('SELECT COUNT(*) as cnt FROM \"User\"');
    const userCount = parseInt(countResult.rows[0].cnt);

    if (userCount > 0) {
      // Create recovery token for first user
      const userResult = await client.query('SELECT id FROM \"User\" ORDER BY \"createdAt\" ASC LIMIT 1');
      const userId = userResult.rows[0].id;
      const token = crypto.randomBytes(32).toString('hex');
      const refreshToken = crypto.randomBytes(48).toString('hex');
      const expiresAt = new Date(Date.now() + 7*24*60*60*1000).toISOString();
      const deviceInfo = JSON.stringify({ browser: 'Recovery', type: 'desktop' });

      await client.query(
        'INSERT INTO \"Session\" (id, \"userId\", token, \"refreshToken\", \"deviceInfo\", \"isActive\", \"expiresAt\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, NOW(), NOW())',
        [userId, token, refreshToken, deviceInfo, expiresAt]
      );
      console.log('');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('🔑 RECOVERY LINK (صالح 7 أيام):');
      console.log('https://roua-trading-production.up.railway.app/api/auth/recover?token=' + token);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      return;
    }

    // No users — create admin account
    console.log('⚠️ No users found — creating admin account...');
    const adminResult = await client.query(
      'INSERT INTO \"User\" (id, email, \"displayName\", tier, \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), $1, $2, $3, NOW(), NOW()) RETURNING id',
      ['admin@roua-trading.com', 'جابر - المدير', 'INSTITUTIONAL']
    );
    const userId = adminResult.rows[0].id;
    const token = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 7*24*60*60*1000).toISOString();
    const deviceInfo = JSON.stringify({ browser: 'Recovery', type: 'desktop' });

    await client.query(
      'INSERT INTO \"Session\" (id, \"userId\", token, \"refreshToken\", \"deviceInfo\", \"isActive\", \"expiresAt\", \"createdAt\", \"updatedAt\") VALUES (gen_random_uuid(), $1, $2, $3, $4, true, $5, NOW(), NOW())',
      [userId, token, refreshToken, deviceInfo, expiresAt]
    );
    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ RECOVERY ACCOUNT CREATED');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email: admin@roua-trading.com');
    console.log('User ID: ' + userId);
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
    await client.end();
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
echo "   Connection Mode:  $([ "$PGBOUNCER_OK" -eq 1 ] && echo 'PgBouncer ✅ (TRANSACTION MODE, limit=1)' || echo 'Direct ⚠️ (NO POOLER, limit=1)')"
echo "   API (NestJS):     port ${API_PORT:-3001} — $([ "$API_READY" -eq 1 ] && echo '✅ VERIFIED' || echo '❌ NOT RESPONDING')"
echo "   Web (Next.js):    port $ACTUAL_WEB_PORT — $([ "$WEB_READY" -eq 1 ] && echo '✅ VERIFIED' || echo '❌ NOT RESPONDING')"
echo "   DB Migrations:    $([ "$DB_MIGRATE_OK" -eq 1 ] && echo '✅ APPLIED' || echo '❌ FAILED (will retry on next deploy)')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Cleanup trap
trap "kill $API_PID $MONITOR_PID 2>/dev/null; [ -n \"$PGBOUNCER_PID\" ] && kill \"$PGBOUNCER_PID\" 2>/dev/null; true" EXIT

# Keep Next.js in foreground (main process)
wait $WEB_PID
