#!/bin/bash
# Railway startup script for Roua Trading
# Production startup must never mutate schema destructively.

set -e

# Determine the project root (Railway runs from /app)
PROJECT_ROOT="$(pwd)"

# Removed SQLite override. System will respect the external PostgreSQL DATABASE_URL.

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Roua Trading - Starting Production Server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "DATABASE_URL: ${DATABASE_URL}"
echo "RP_ID: ${RP_ID:-localhost}"
echo "ORIGIN: ${ORIGIN:-not set}"
echo "NODE_ENV: ${NODE_ENV:-development}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Never run prisma db push with accept-data-loss during startup.
# Schema changes must be applied deliberately during deployment, not when the
# production app boots.
echo "📦 Startup database policy: destructive schema sync disabled"
echo "ℹ️  Apply Prisma schema changes in a controlled deploy step before starting production."

# Start the web application
echo "🌐 Starting Next.js server..."
cd apps/web
HOSTNAME=0.0.0.0 exec bun x next start -H 0.0.0.0
