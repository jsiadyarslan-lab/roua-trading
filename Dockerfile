# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading — Production Dockerfile for Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM node:22-bookworm-slim

WORKDIR /app

# Install system dependencies required by Prisma, Next.js, and runtime scripts
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash curl ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

# Copy package manifests first for better layer caching
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install all workspace dependencies
RUN npm ci --workspaces --include-workspace-root

# Copy the rest of the source code
COPY . .

# Generate Prisma client
RUN npx prisma generate --schema=./prisma/schema.prisma

# Build the workspace
RUN npm run build

# Runtime environment
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl --fail --silent http://localhost:3000/ || exit 1

CMD ["bash", "start.sh"]
