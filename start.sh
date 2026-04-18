#!/bin/bash
# Railway startup script for Roua Trading
# Creates the SQLite database if it doesn't exist, then starts the web app

set -e

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"
export DATABASE_URL="file:${PROJECT_ROOT}/roua.db"

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
bunx prisma db push --schema=./prisma/schema.prisma --skip-generate --accept-data-loss

# Start the web application
echo "🌐 Starting Next.js server..."
cd apps/web
HOSTNAME=0.0.0.0 exec bun x next start -H 0.0.0.0
