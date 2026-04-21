# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Single-Stage Production Dockerfile
# Optimised for Railway + Bun monorepo (Turborepo)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM oven/bun:1

WORKDIR /app

# Copy all source files first
COPY . .

# Install all dependencies (no frozen lockfile needed)
RUN bun install

# Generate Prisma client
RUN bunx prisma generate --schema=./prisma/schema.prisma

# Build the Next.js app via turbo
RUN bun run build

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Run DB migrations then start Next.js
CMD ["bash", "start.sh"]
