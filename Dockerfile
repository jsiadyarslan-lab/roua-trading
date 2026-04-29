# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Root Dockerfile for Railway Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Builds the Next.js web app from the monorepo root.
# Uses Node.js + npm (matching package-lock.json format).
# No build secrets required — ALPACA_PAPER and other API keys
# are runtime env vars, NOT build-time secrets.
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS deps

WORKDIR /app

# Copy lockfile + workspace manifests first (cache-friendly)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install all workspace dependencies
RUN npm ci --install-strategy=hoisted

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the Next.js application
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source for build context
COPY . .

# Generate Prisma client (needed for auth API routes)
RUN npx prisma generate --schema=./apps/web/prisma/schema.prisma

# Build the Next.js app
RUN cd apps/web && npm run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Minimal production image
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

# Security: run as non-root user
RUN groupadd --system --gid 1001 roua \
    && useradd --system --uid 1001 --gid roua --create-home webuser

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy all source (for next start mode — non-standalone)
COPY --from=builder --chown=webuser:roua /app .

# Ensure public directory exists
RUN mkdir -p apps/web/public

USER webuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/').catch(()=>process.exit(1))"

# Start: run prisma db push then next start
CMD ["sh", "-c", "cd /app && npx prisma db push --schema=./apps/web/prisma/schema.prisma --skip-generate --accept-data-loss 2>/dev/null; cd apps/web && npx next start -H 0.0.0.0"]
