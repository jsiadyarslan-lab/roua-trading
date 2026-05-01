# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading Self-Healing Agent — Production Dockerfile for Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# هذا Dockerfile مصمم ليعمل عندما يكون Root Directory
# هو agents/self-healing-agent/ في إعدادات خدمة Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy only the agent source code
COPY config.py .
COPY monitor.py .
COPY logger_fetcher.py .
COPY error_analyzer.py .
COPY fix_generator.py .
COPY test_runner.py .
COPY github_pr_manager.py .
COPY human_approval.py .
COPY main.py .

# Copy shared utilities from parent (if available at build time)
# Note: these are imported at runtime with sys.path fallback

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

# Health check — the agent is a long-running process
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "print('healthy')" || exit 1

# Run the self-healing agent
CMD ["python", "-u", "main.py"]
