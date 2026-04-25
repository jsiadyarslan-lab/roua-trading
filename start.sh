#!/bin/bash
# Railway startup script for Roua Trading
# Production startup with full stack: NestJS API + Next.js Web

set -e

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"

# Removed SQLite override. System will respect the external PostgreSQL DATABASE_URL.

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading - Starting Full Stack"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL: ${DATABASE_URL}"
echo "RP_ID: ${RP_ID:-localhost}"
echo "ORIGIN: ${ORIGIN:-not set}"
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Apply Prisma schema to database (safe for production)
echo "📦 Applying Prisma schema..."
npx --yes prisma db push --schema=./prisma/schema.prisma --accept-data-loss || true

# Generate Prisma client (ensure latest)
echo "📦 Generating Prisma client..."
npx --yes prisma generate --schema=./prisma/schema.prisma

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start the NestJS API in the background
echo "🔧 Starting NestJS API server (port 3001)..."
cd apps/api

# Use the compiled JS entrypoint in production
if [ -d "dist" ]; then
  npm run start:prod &
  API_PID=$!
  echo "📋 NestJS started from dist/ (PID: $API_PID)"
else
  echo "⚠️ dist/ not found — API build output is missing"
  exit 1
fi

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
API_HEALTH_URL="http://127.0.0.1:3001/api/engine/health"
for i in $(seq 1 45); do
  if curl -fsS "$API_HEALTH_URL" > /dev/null 2>&1; then
    echo "✅ API is ready! (attempt $i)"
    break
  fi
  if [ $i -eq 45 ]; then
    echo "⚠️ API did not start in 45s — critical routes will fail!"
    echo "⚠️ Check logs above for NestJS startup errors."
  fi
  sleep 1
done

cd "$PROJECT_ROOT"

# Start the Next.js web application
echo "🌐 Starting Next.js server (port 3000)..."
cd apps/web
trap "kill $API_PID 2>/dev/null || true" EXIT
npm run start
