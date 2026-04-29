# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Root Dockerfile for Railway Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Builds the Next.js web app from the monorepo root.
# No build secrets required — ALPACA_PAPER and other API keys
# are runtime env vars, NOT build-time secrets.
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy lockfile + workspace manifests first (cache-friendly)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install all workspace dependencies
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the Next.js application
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source for build context
COPY . .

# Generate Prisma client (needed for auth API routes)
RUN bunx prisma generate --schema=./apps/web/prisma/schema.prisma

# Build the Next.js app
RUN cd apps/web && bun run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Minimal production image
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runner

# Security: run as non-root user (Debian-based image uses groupadd/useradd, not addgroup/adduser)
RUN groupadd --system --gid 1001 roua \
    && useradd --system --uid 1001 --gid roua --create-home webuser

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy all source (for next start mode — non-standalone)
COPY --from=builder --chown=webuser:roua /app .

# Copy Prisma schema and generated client
COPY --from=builder --chown=webuser:roua /app/apps/web/prisma ./apps/web/prisma

# Ensure public directory exists
RUN mkdir -p apps/web/public

USER webuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start: run prisma db push then next start
CMD ["sh", "-c", "cd /app && bunx prisma db push --schema=./apps/web/prisma/schema.prisma --skip-generate --accept-data-loss 2>/dev/null; cd apps/web && bun x next start -H 0.0.0.0"]
