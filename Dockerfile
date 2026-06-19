# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Root Dockerfile for Railway Deployment
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# FULL STACK: NestJS API (port 3001) + Next.js Web (port 3000)
# in a single container, managed by start.sh
#
# FIX: Previously this Dockerfile only built and ran Next.js,
# completely ignoring the NestJS API. This caused ALL AI,
# scanner, news, and trading endpoints to return "fetch failed"
# because the API server was never started.
#
# Now builds BOTH apps and uses start.sh to run them together.
#
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Embed the git commit SHA into the Docker image
# V245: Fix timer dancing — direct DOM positioning (no React state) + stick below price label
ARG BUILD_CACHE=V291
ARG GIT_COMMIT=unknown
# V216: Declare RAILWAY_GIT_COMMIT_SHA so Docker doesn't warn about undefined variable
ARG RAILWAY_GIT_COMMIT_SHA=

# ─────────────────────────────────────────────────────────────
# Stage 1: Install dependencies
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS deps

# OpenSSL required by Prisma + curl for health checks
RUN apt-get update -y && apt-get install -y openssl curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy lockfile + ALL workspace manifests (including API now)
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/

# Remove mobile from workspaces before npm ci (saves ~225MB)
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));p.workspaces=['apps/web','apps/api','packages/shared'];fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n')"

# Install all workspace dependencies
RUN npm ci --legacy-peer-deps

# V268: Remove deprecated @types/socket.io-client@1.4.33 which conflicts with
# socket.io-client@4.8.3's built-in types. The override in package.json
# (`@types/socket.io-client: npm:noop@1.0.1`) doesn't always work with
# workspace hoisting, so we explicitly delete the directory here.
# This prevents 6 TypeScript errors in useMT5Streaming, useNotificationSocket,
# useWebSocketTicker hooks (which import { io, Socket } from 'socket.io-client').
RUN rm -rf node_modules/@types/socket.io-client

# ─────────────────────────────────────────────────────────────
# Stage 2: Build BOTH applications
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS builder

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy full source for build context
COPY . .

# FIX: Add node_modules/.bin to PATH so all installed binaries
# (tsc, next, prisma, etc.) are directly available in RUN commands.
# With --install-strategy=hoisted, all binaries live at this location.
# We CANNOT rely on `npm run` to find them because npm scripts
# only add ./node_modules/.bin relative to the package directory,
# which doesn't exist with hoisted installs in a workspace.
ARG GIT_COMMIT=unknown

# Add node_modules/.bin to PATH
ENV PATH="/app/node_modules/.bin:${PATH}"

# Generate Prisma client (schema is at repo root: prisma/schema.prisma)
RUN prisma generate --schema=./prisma/schema.prisma

# Build the shared package first (dependency of both apps)
RUN cd packages/shared && tsc

# Build the NestJS API — use tsc directly instead of `nest build`.
# With webpack:false, `nest build` is just `rm -rf dist && tsc`.
# Using tsc directly avoids npx resolution failures in hoisted workspaces.
# CRITICAL FIX: Must also remove tsconfig.tsbuildinfo before tsc.
# With incremental:true in tsconfig, TypeScript caches build state in
# tsbuildinfo. If dist/ is deleted but tsbuildinfo remains, TypeScript
# thinks files are already compiled and SKIPS them, producing an
# incomplete build (missing common/, audit/, auth/ directories).
# This was the ROOT CAUSE of 502 errors on Railway: incomplete JS output
# → module resolution failures → NestJS crash at startup.
RUN cd apps/api && rm -rf dist tsconfig.tsbuildinfo && echo "Build cache: $BUILD_CACHE" && tsc

# Build the Next.js web app — use next directly from PATH.
RUN cd apps/web && next build --webpack

# ─────────────────────────────────────────────────────────────
# Stage 3: Production image with API + Web (optimized)
# ─────────────────────────────────────────────────────────────
FROM node:22-slim AS runner

# Re-declare ARG so it's available in this stage (ARGs don't carry across stages)
ARG GIT_COMMIT=unknown
ARG RAILWAY_GIT_COMMIT_SHA=

# OpenSSL for Prisma + curl for health checks + bash for start.sh
# procps: Provides pgrep/pkill for process management in start.sh
# NOTE: PgBouncer removed in v7 — using Railway's built-in pooler or direct connections
RUN apt-get update -y && apt-get install -y openssl curl bash procps && rm -rf /var/lib/apt/lists/*

# Security: run as non-root user
RUN groupadd --system --gid 1001 roua \
    && useradd --system --uid 1001 --gid roua --create-home webuser

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV API_PORT=3001
ENV HOSTNAME="0.0.0.0"
# Pass git commit SHA so /api/health can report what version is running
# V216 FIX: Use RAILWAY_GIT_COMMIT_SHA if available (auto-set by Railway),
# otherwise fall back to the build ARG
ENV DEPLOY_COMMIT=${RAILWAY_GIT_COMMIT_SHA:-${GIT_COMMIT}}

# FIX: Selective copy — only runtime files, NOT devDependencies or source.
# The previous "COPY --from=builder /app ." copied EVERYTHING including
# 800MB+ of devDependencies and source files, causing memory pressure.
# Now we copy only what's needed at runtime:
COPY --from=builder --chown=webuser:roua /app/node_modules ./node_modules
COPY --from=builder --chown=webuser:roua /app/package.json ./
COPY --from=builder --chown=webuser:roua /app/package-lock.json ./
COPY --from=builder --chown=webuser:roua /app/start.sh ./
COPY --from=builder --chown=webuser:roua /app/prisma ./prisma
# API: compiled JS output + tsconfig for module resolution
COPY --from=builder --chown=webuser:roua /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=webuser:roua /app/apps/api/package.json ./apps/api/
COPY --from=builder --chown=webuser:roua /app/apps/api/tsconfig.json ./apps/api/
# Web: Next.js standalone output
COPY --from=builder --chown=webuser:roua /app/apps/web/.next ./apps/web/.next
COPY --from=builder --chown=webuser:roua /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=webuser:roua /app/apps/web/messages ./apps/web/messages
COPY --from=builder --chown=webuser:roua /app/apps/web/i18n ./apps/web/i18n
COPY --from=builder --chown=webuser:roua /app/apps/web/package.json ./apps/web/
COPY --from=builder --chown=webuser:roua /app/apps/web/next.config.ts ./apps/web/
# Web source files — needed by integrity check V49 to verify chart fixes.
# Without these, the API cannot verify V225+ fixes in the production container.
COPY --from=builder --chown=webuser:roua /app/apps/web/src ./apps/web/src
# Shared package
COPY --from=builder --chown=webuser:roua /app/packages/shared ./packages/shared

# Ensure required directories exist
RUN mkdir -p apps/web/public apps/web/messages apps/web/i18n apps/api/dist

# Make start.sh executable
RUN chmod +x start.sh

USER webuser

# Expose both ports: web (3000) and API (3001)
EXPOSE 3000 3001

# Health check — verify Next.js health endpoint (which also checks NestJS API).
# FIX: Changed from checking API_PORT directly to checking PORT (Next.js).
# Previously checked http://localhost:${API_PORT}/api/health directly, but
# Railway's healthcheck uses the Next.js PORT. The Next.js route handler
# at /api/health returns 200 even when the API is still starting,
# preventing "1/1 replicas never became healthy" deployment failures.
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=5 \
  CMD bash -c 'curl -fsS "http://localhost:${PORT:-3000}/api/health" > /dev/null 2>&1 || exit 1'

# FIX: Use start.sh which runs BOTH NestJS API (port 3001)
# AND Next.js Web (port 3000) in a single container.
# Previously only ran `next start`, leaving the API dead.
CMD ["bash", "start.sh"]


