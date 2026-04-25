#!/bin/bash
# Railway startup script for Roua Trading
# Production startup with full stack: NestJS API + Next.js Web
# Uses Bun runtime (oven/bun:1 Docker image)

set -e

# Load local environment fallback when running outside Railway or when env vars are absent.
if [ -z "${DATABASE_URL:-}" ] && [ -f ".env" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      ''|\#*) continue ;;
    esac
    value="${value%$'\r'}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    fi
    export "$key=$value"
  done < .env
fi

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"

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

# Use the compiled JS entrypoint in production
if [ -d "dist" ]; then
  node dist/main &
  API_PID=$!
  echo "📋 NestJS started from dist/ (PID: $API_PID)"
else
  echo "⚠️ dist/ not found — API build output is missing"
  exit 1
fi

# Wait for API to be ready
echo "⏳ Waiting for API to be ready..."
# Use a public endpoint for readiness; /api/engine/health is protected by AuthGuard.
API_HEALTH_URL="http://127.0.0.1:3001/api/auth/session"
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
bunx next start -H 0.0.0.0
