#!/bin/bash
# Railway startup script for Roua Trading
# Creates the SQLite database if it doesn't exist, then starts the web app

set -e

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"

# ── DATABASE_URL: Always force SQLite for this app ──
# Railway plugins (e.g. PostgreSQL) may auto-set DATABASE_URL to a postgres:// URL
# We must override it to use SQLite. Use SQLITE_DB_PATH for custom path.
DB_PATH="${SQLITE_DB_PATH:-${PROJECT_ROOT}/roua.db}"
export DATABASE_URL="file:${DB_PATH}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading - Starting Production Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL: ${DATABASE_URL}"
echo "RP_ID: ${RP_ID:-localhost}"
echo "ORIGIN: ${ORIGIN:-not set}"
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create/migrate the database
echo "📦 Running prisma db push..."
npx prisma db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || \
bunx prisma db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss 2>&1 || \
echo "⚠️  prisma db push failed, will retry on first request via ensureDbReady()"

# Start the web application
echo "🌐 Starting Next.js server..."
cd apps/web
HOSTNAME=0.0.0.0 exec npx next start -H 0.0.0.0
