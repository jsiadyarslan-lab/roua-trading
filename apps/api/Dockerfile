# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua API — NestJS Multi-Stage Production Dockerfile (Bun)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Build:   docker build -f apps/api/Dockerfile -t roua-api .
# Run:     docker run -p 3001:3001 --env-file .env roua-api
#
# Context must be the monorepo root (for workspace resolution):
#   docker build -f apps/api/Dockerfile -t roua-api .
#              └─ context = root (.) ──┘
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies (cached layer)
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy lockfile + workspace manifests first (cache-friendly)
COPY bun.lock package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install all workspace dependencies
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the NestJS application
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy full source for build context
COPY . .

# Generate Prisma client (relative path — works in Docker WORKDIR)
RUN bunx prisma generate --schema=./prisma/schema.prisma

# Build the NestJS app (tsc → dist/)
RUN cd apps/api && bun run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Production dependency pruning
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS prod-deps

WORKDIR /app

COPY bun.lock package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Install only production dependencies (no devDependencies)
RUN bun install --frozen-lockfile --production

# ─────────────────────────────────────────────────────────────
# Stage 4: Minimal production image
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runner

# Install curl + bash for HEALTHCHECK (not in slim image by default)
RUN apt-get update -y && apt-get install -y curl bash && rm -rf /var/lib/apt/lists/*

# Security: run as non-root user
RUN addgroup --system --gid 1001 roua \
    && adduser --system --uid 1001 --ingroup roua apiuser

WORKDIR /app

# Copy production node_modules from pruning stage
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy built NestJS dist output
COPY --from=builder /app/apps/api/dist ./apps/api/dist

# Copy Prisma client (generated at root level)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy Prisma schema (needed at runtime for potential migrations)
COPY --from=builder /app/prisma ./prisma

# Copy package manifests for module resolution
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/packages/shared/src ./packages/shared/src

# Set ownership to non-root user
RUN chown -R apiuser:roua /app

USER apiuser

# Environment defaults
ENV NODE_ENV=production
ENV API_PORT=3001

EXPOSE 3001

# Health check — verify API is responding
# FIX: Use API_PORT env var with fallback to 3001 (Railway may assign a different port)
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD bash -c 'curl -fsS "http://localhost:${API_PORT:-3001}/api/health" > /dev/null 2>&1 || exit 1'

# Start NestJS via the compiled JS entry point
CMD ["bun", "run", "apps/api/dist/main.js"]
