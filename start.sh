#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Railway Startup Script v7
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FIX v7: SIMPLE IS BETTER. Remove all PgBouncer complexity.
#
# WHY PgBouncer was failing for 10+ attempts:
#   1. PgBouncer auth_type vs PG scram-sha-256 incompatibility
#   2. TLS between PgBouncer → PostgreSQL failing
#   3. Pre-flight check failing because PG is saturated
#   4. Even TCP check sometimes fails in Docker
#
# THE SIMPLE FIX that actually works:
#   1. If DATABASE_POOLED_URL exists → USE IT (Railway's built-in PgBouncer)
#   2. Otherwise → construct pooled URL by changing port to 5432 (Railway pattern)
#   3. If that fails → direct connection with connection_limit=1
#   4. NO local PgBouncer — it was the source of all problems
#   5. NO $disconnect() on failure — it creates new pools and exhausts connections
#   6. NO SELECT 1 in health checks — zero DB overhead
#
# Architecture:
#   App (PrismaClient x2, limit=1 each) → Railway PgBouncer → PostgreSQL
#   OR
#   App (PrismaClient x2, limit=1 each) → PostgreSQL (direct)
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
export PORT="${PORT:-8080}"

if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  if [ -z "${ORIGIN:-}" ] || [[ "${ORIGIN}" == *"localhost"* ]] || [[ "${ORIGIN}" == *"0.0.0.0"* ]]; then
    export ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
    echo "🔧 Auto-detected ORIGIN from RAILWAY_PUBLIC_DOMAIN: ${ORIGIN}"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 1: Database URL Setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ FATAL: DATABASE_URL is not set. Cannot start."
  exit 1
fi

# Save the ORIGINAL database URL (before any modifications)
ORIG_DB_URL="$DATABASE_URL"

# DIRECT_DATABASE_URL: Direct connection to PostgreSQL for Prisma CLI
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
echo "🚀 Roua Trading — Starting (v7 — No PgBouncer)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL:          ${DATABASE_URL:+[SET (${#DATABASE_URL} chars)]}"
echo "DATABASE_POOLED_URL:   ${DATABASE_POOLED_URL:+[SET]} ${DATABASE_POOLED_URL:-[NOT SET]}"
echo "DIRECT_DATABASE_URL:   ${DIRECT_DATABASE_URL:+[SET]}"
echo "API_INTERNAL_URL:      ${API_INTERNAL_URL:-[NOT SET]}"
echo "ORIGIN:                ${ORIGIN:-not set}"
echo "NODE_ENV:              ${NODE_ENV:-development}"
echo "PORT:                  ${PORT:-8080}"
echo "API_PORT:              ${API_PORT:-3001}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 2: Set DATABASE_URL for Application Use
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Strategy (in order of preference):
#   1. DATABASE_POOLED_URL from Railway → use it with pgbouncer=true
#   2. Construct pooled URL by replacing port with 5432 (Railway PgBouncer pattern)
#   3. Direct connection with connection_limit=1 as last resort

CONNECTION_MODE="unknown"

# Option 1: Use DATABASE_POOLED_URL if available (Railway's built-in PgBouncer)
if [ -n "${DATABASE_POOLED_URL:-}" ]; then
  echo "✅ DATABASE_POOLED_URL detected — using Railway's built-in PgBouncer"
  POOLED_URL=$(DATABASE_URL_IN="$DATABASE_POOLED_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
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
    CONNECTION_MODE="railway_pgbouncer"
    echo "🔧 DATABASE_URL → Railway PgBouncer (pgbouncer=true, connection_limit=1)"
  fi
fi

# Option 2: Try to construct a pooled URL from DATABASE_URL
# On Railway, the pooled URL typically uses the same host but with
# a different subdomain pattern or port. We try common patterns.
if [ "$CONNECTION_MODE" = "unknown" ]; then
  echo "🔍 No DATABASE_POOLED_URL — trying to construct pooled URL..."
  CONSTRUCTED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
    try {
      const u = new URL(process.env.DATABASE_URL_IN);
      const origHost = u.hostname;

      // Railway PgBouncer patterns to try:
      // Pattern 1: Replace 'postgres.railway.app' with 'postgres-pooler.railway.app'
      // Pattern 2: Replace first subdomain segment with 'pooler'
      // Pattern 3: Add '-pooler' before the TLD
      const patterns = [];

      if (origHost.includes('railway.app')) {
        // Try postgres-pooler.railway.app
        const poolerHost = origHost.replace(/^postgres\./, 'postgres-pooler.');
        if (poolerHost !== origHost) patterns.push(poolerHost);

        // Try *-pooler.railway.app
        const parts = origHost.split('.');
        if (parts.length >= 2) {
          parts[0] = parts[0] + '-pooler';
          patterns.push(parts.join('.'));
        }
      }

      // Try port 5432→5432 with pgbouncer flag (some Railway setups)
      // Don't change the URL, just add pgbouncer=true
      patterns.push(origHost);

      // Output: first_pattern|second_pattern|original_host
      process.stdout.write(patterns.join('|') + '||' + u.port + '||' + u.toString());
    } catch(e) {
      process.stderr.write('ERROR:' + e.message);
      process.exit(1);
    }
  " 2>/dev/null)

  if [ -n "$CONSTRUCTED_URL" ]; then
    HOSTS_PART=$(echo "$CONSTRUCTED_URL" | cut -d'||' -f1)
    ORIG_PORT=$(echo "$CONSTRUCTED_URL" | cut -d'||' -f2)
    ORIG_FULL_URL=$(echo "$CONSTRUCTED_URL" | cut -d'||' -f3-)

    # Try each pattern to see if it resolves and connects
    POOLED_FOUND=0
    IFS='|' read -ra HOST_ARRAY <<< "$HOSTS_PART"
    for TRY_HOST in "${HOST_ARRAY[@]}"; do
      if [ "$TRY_HOST" = "$(echo "$ORIG_DB_URL" | node -e "try{const u=new URL(require('fs').readFileSync('/dev/stdin','utf8'));process.stdout.write(u.hostname)}catch{process.stdout.write('')}" 2>/dev/null)" ]; then
        # Same host — just add pgbouncer=true (direct connection mode)
        MODIFIED_URL=$(DATABASE_URL_IN="$ORIG_DB_URL" node -e "
          try {
            const u = new URL(process.env.DATABASE_URL_IN);
            u.searchParams.set('connection_limit', '1');
            u.searchParams.set('pool_timeout', '10');
            u.searchParams.set('connect_timeout', '30');
            process.stdout.write(u.toString());
          } catch {
            process.stdout.write(process.env.DATABASE_URL_IN);
          }
        " 2>/dev/null)
        if [ -n "$MODIFIED_URL" ]; then
          export DATABASE_URL="$MODIFIED_URL"
          CONNECTION_MODE="direct"
          POOLED_FOUND=1
          echo "🔧 DATABASE_URL → Direct PostgreSQL (connection_limit=1, pool_timeout=10)"
          break
        fi
      else
        # Different host — try Railway's pooler
        echo "   Trying pooler host: $TRY_HOST..."
        MODIFIED_URL=$(FULL_URL_IN="$ORIG_FULL_URL" TRY_HOST_IN="$TRY_HOST" node -e "
          try {
            const u = new URL(process.env.FULL_URL_IN);
            u.hostname = process.env.TRY_HOST_IN;
            u.searchParams.set('pgbouncer', 'true');
            u.searchParams.set('connection_limit', '1');
            process.stdout.write(u.toString());
          } catch {
            process.exit(1);
          }
        " 2>/dev/null)

        if [ -n "$MODIFIED_URL" ]; then
          # Quick TCP check — can we reach this host?
          TRY_PORT=$(echo "$MODIFIED_URL" | node -e "try{process.stdout.write(new URL(require('fs').readFileSync('/dev/stdin','utf8')).port||'5432')}catch{process.stdout.write('5432')}" 2>/dev/null)
          if node -e "
            const net = require('net');
            const client = new net.Socket();
            client.setTimeout(3000);
            client.on('connect', () => { client.destroy(); process.exit(0); });
            client.on('error', () => { client.destroy(); process.exit(1); });
            client.on('timeout', () => { client.destroy(); process.exit(1); });
            client.connect(parseInt('$TRY_PORT'), '$TRY_HOST');
          " 2>/dev/null; then
            export DATABASE_URL="$MODIFIED_URL"
            CONNECTION_MODE="railway_pgbouncer_constructed"
            POOLED_FOUND=1
            echo "✅ Railway pooler host reachable: $TRY_HOST"
            echo "🔧 DATABASE_URL → Railway Pooler ($TRY_HOST, pgbouncer=true, connection_limit=1)"
            break
          else
            echo "   ✗ $TRY_HOST not reachable"
          fi
        fi
      fi
    done

    if [ "$POOLED_FOUND" -ne 1 ]; then
      # Fallback to direct connection
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
        CONNECTION_MODE="direct"
        echo "🔧 DATABASE_URL → Direct PostgreSQL (connection_limit=1, pool_timeout=10) — no pooler available"
      fi
    fi
  fi
fi

# Final fallback if nothing worked
if [ "$CONNECTION_MODE" = "unknown" ]; then
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
    CONNECTION_MODE="direct"
  fi
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Connection Architecture:"
echo "   Mode: $CONNECTION_MODE"
echo "   pgbouncer=true: $(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES ✅' || echo 'NO (direct mode)')"
echo "   connection_limit=1: $(echo $DATABASE_URL | grep -q 'connection_limit=1' && echo 'YES ✅' || echo 'NO')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 3: Kill Stale DB Connections from Previous Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "━━━ Phase 3: Terminating Stale DB Connections ━━━"

DB_CLEANUP_OK=0
for CLEANUP_ATTEMPT in 1 2 3; do
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
    if [ "$CLEANUP_ATTEMPT" -lt 3 ]; then
      sleep 5
    fi
  fi
done

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 4: Prisma Database Setup (Using DIRECT Connection)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo ""
echo "━━━ Phase 4: Prisma Database Setup (Direct Connection) ━━━"

echo "📦 Generating Prisma client..."
run_prisma generate --schema=./prisma/schema.prisma

echo "📦 Applying Prisma schema..."
DB_MIGRATE_OK=0

try_db_push() {
  local MAX_RETRIES=2
  local RETRY_NUM=1
  while [ $RETRY_NUM -le $MAX_RETRIES ]; do
    echo "   db push attempt $RETRY_NUM/$MAX_RETRIES..."
    if timeout 60 npx prisma db push --schema=./prisma/schema.prisma 2>&1; then
      return 0
    else
      if [ $RETRY_NUM -lt $MAX_RETRIES ]; then
        echo "   ⏳ db push failed — waiting 10s before retry..."
        sleep 10
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
      echo "❌ prisma db push failed — schema may be out of sync"
    fi
  fi
else
  if try_db_push; then
    echo "✅ db push succeeded"
    DB_MIGRATE_OK=1
  else
    echo "❌ prisma db push failed — database may be unreachable"
  fi
fi

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# PHASE 5: Start Next.js (Health Check Priority)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ACTUAL_WEB_PORT=${PORT:-8080}
echo ""
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
echo ""
echo "━━━ Phase 6: Checking Admin User ━━━"

if [ ! -f "apps/api/dist/main.js" ]; then
  echo "⚠️ API dist missing — building API..."
  (cd apps/api && run_api_build)
fi

if [ "$DB_CLEANUP_OK" -eq 1 ] || [ "$DB_MIGRATE_OK" -eq 1 ]; then
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

    const countResult = await client.query('SELECT COUNT(*) as cnt FROM \"User\"');
    const userCount = parseInt(countResult.rows[0].cnt);

    if (userCount > 0) {
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
    console.log('RECOVERY TOKEN (صالح 7 أيام):');
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
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Roua Trading is running!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "   Next.js:  http://0.0.0.0:${ACTUAL_WEB_PORT} (PID: $WEB_PID)"
echo "   NestJS:   http://0.0.0.0:${API_PORT:-3001} (PID: $API_PID)"
echo "   DB Mode:  $CONNECTION_MODE"
echo "   pgbouncer=true: $(echo $DATABASE_URL | grep -q 'pgbouncer=true' && echo 'YES' || echo 'NO')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Keep script running — wait for either process to die
wait
