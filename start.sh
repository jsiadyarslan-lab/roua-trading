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
bunx prisma db push --schema=./prisma/schema.prisma --accept-data-loss || true

# Generate Prisma client (ensure latest)
echo "📦 Generating Prisma client..."
bunx prisma generate --schema=./prisma/schema.prisma

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Start the NestJS API in the background
echo "🔧 Starting NestJS API server (port 3001)..."
cd apps/api

# Use bun to run compiled JS directly (more reliable than node in Bun runtime)
if [ -d "dist" ]; then
  bun run dist/main.js &
  API_PID=$!
  echo "📋 NestJS started from dist/ (PID: $API_PID)"
else
  echo "⚠️ dist/ not found — attempting TypeScript execution with Bun..."
  bun run src/main.ts &
  API_PID=$!
  echo "📋 NestJS started from src/ via Bun TS loader (PID: $API_PID)"
fi

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
API_READY=false
for i in $(seq 1 45); do
  if curl -s http://localhost:3001/api > /dev/null 2>&1; then
    echo "✅ API is ready! (attempt $i)"
    API_READY=true
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
HOSTNAME=0.0.0.0 exec bun x next start -H 0.0.0.0

# If Next.js exits, kill the API too
trap "kill $API_PID 2>/dev/null; exit" EXIT
