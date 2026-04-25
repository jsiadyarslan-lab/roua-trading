# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Production Dockerfile for Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM oven/bun:1

WORKDIR /app

# Copy all source files
COPY . .

# Install all workspace dependencies
RUN bun install

# Generate Prisma client
RUN bunx prisma generate --schema=./prisma/schema.prisma

# ── Build NestJS API ──
RUN cd apps/api && bun run build

# ── Build Next.js Web ──
RUN cd apps/web && bunx next build --webpack

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["bash", "start.sh"]
