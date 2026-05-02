# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading Self-Healing Agent — Production Dockerfile for Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# مصمم ليعمل من جذر المستودع (build context = repo root)
# railway.json يُحدد dockerfilePath = agents/self-healing-agent/Dockerfile
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer caching)
COPY agents/self-healing-agent/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the agent source code
COPY agents/self-healing-agent/config.py .
COPY agents/self-healing-agent/monitor.py .
COPY agents/self-healing-agent/logger_fetcher.py .
COPY agents/self-healing-agent/error_analyzer.py .
COPY agents/self-healing-agent/fix_generator.py .
COPY agents/self-healing-agent/test_runner.py .
COPY agents/self-healing-agent/github_pr_manager.py .
COPY agents/self-healing-agent/human_approval.py .
COPY agents/self-healing-agent/main.py .

# Copy shared utilities from agents/shared/
COPY agents/shared/ /app/shared/

# Environment defaults (overridden by Railway env vars)
ENV PLATFORM_URL=https://roua-trading-production.up.railway.app
ENV CHECK_INTERVAL=60
ENV REQUEST_TIMEOUT=15
ENV ALERT_COOLDOWN=1800
ENV MAX_CONSECUTIVE_FAILURES=2
ENV GLM_MODEL=glm-4-flash
ENV MAX_FIX_ATTEMPTS_PER_ERROR=3
ENV FIX_COOLDOWN=3600
ENV HEALTH_PORT=8081
ENV PORT=8081

# Expose the health check port
EXPOSE 8081

# Health check — uses the HTTP /health endpoint
HEALTHCHECK --interval=60s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8081}/health || exit 1

# Run the self-healing agent
CMD ["python", "-u", "main.py"]
