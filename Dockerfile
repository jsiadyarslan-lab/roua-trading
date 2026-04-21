# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Next.js Multi-Stage Production Dockerfile
# Context: monorepo root (Railway builds from root by default)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy workspace manifests first (cache-friendly layer)
COPY package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
# Copy lockfile if it exists (optional)
COPY bun.lock* bun.lockb* ./

# Install WITHOUT frozen-lockfile so missing lockfile doesn't break build
RUN bun install

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the Next.js application
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source
COPY . .

# Generate Prisma client
RUN bunx prisma generate --schema=./prisma/schema.prisma

# Build Next.js
RUN cd apps/web && bun run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Minimal production runtime
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Security: non-root user (Debian-compatible commands)
RUN groupadd --system --gid 1001 roua \
    && useradd --system --uid 1001 --gid roua webuser

# Copy full built source (needed for Prisma + start.sh)
COPY --from=builder --chown=webuser:roua /app ./

USER webuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run migrations then start server
CMD ["bash", "start.sh"]
