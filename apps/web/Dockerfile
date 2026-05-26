# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Web — Next.js Multi-Stage Production Dockerfile (Bun)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# Build:   docker build -f apps/web/Dockerfile -t roua-web .
# Run:     docker run -p 3000:3000 --env-file .env roua-web
#
# Context must be the monorepo root (for workspace resolution):
#   docker build -f apps/web/Dockerfile -t roua-web .
#              └─ context = root (.) ──┘
#
# Uses Next.js "standalone" output mode for minimal image size.
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies (cached layer)
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS deps

WORKDIR /app

# Copy lockfile + workspace manifests first (cache-friendly)
COPY bun.lock package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

# Install all workspace dependencies
RUN bun install --frozen-lockfile

# ─────────────────────────────────────────────────────────────
# Stage 2: Build the Next.js application
# ─────────────────────────────────────────────────────────────
FROM oven/bun:1 AS builder

WORKDIR /app

# NOTE: API_INTERNAL_URL is intentionally NOT baked in at build time.
# On Railway (single-container monorepo), NestJS runs on localhost:3001,
# so the value must be http://127.0.0.1:3001 at RUNTIME, not build time.
# The start.sh script sets: export API_INTERNAL_URL="${API_INTERNAL_URL:-http://127.0.0.1:3001}"
# which means the value is always correct regardless of what Docker env says.
# Legacy Docker Compose used "http://api:3001" which only works with multi-container setups.

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules

# Copy full source for build context
COPY . .

# Generate Prisma client (needed for auth API routes)
RUN bunx prisma generate --schema=./prisma/schema.prisma

# Build the Next.js app (output: standalone mode)
# The standalone output creates a minimal server in .next/standalone
# API_INTERNAL_URL is baked into the build for server-side rewrites
RUN cd apps/web && bun run build

# ─────────────────────────────────────────────────────────────
# Stage 3: Minimal production image using standalone output
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup --system --gid 1001 roua \
    && adduser --system --uid 1001 --ingroup roua webuser

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy the standalone Next.js server output
# Standalone includes a minimal node_modules and server.js
COPY --from=builder --chown=webuser:roua /app/apps/web/.next/standalone ./

# Copy static assets (not included in standalone)
COPY --from=builder --chown=webuser:roua /app/apps/web/.next/static ./apps/web/.next/static

# Copy public directory (images, fonts, etc.)
COPY --from=builder --chown=webuser:roua /app/apps/web/public ./apps/web/public

USER webuser

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Start the standalone Next.js server
# The standalone server.js is at apps/web/server.js
CMD ["node", "apps/web/server.js"]
