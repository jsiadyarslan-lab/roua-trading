# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Roua Trading Monitor Agent — Production Dockerfile for Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the agent source code
COPY . .

# Environment defaults (overridden by Railway env vars)
ENV PLATFORM_URL=https://roua-trading-production.up.railway.app
ENV CHECK_INTERVAL=300
ENV REQUEST_TIMEOUT=15
ENV ALERT_COOLDOWN=1800
ENV MAX_CONSECUTIVE_FAILURES=2
ENV GLM_MODEL=glm-4-flash

# Health check — the agent is a long-running process, so we verify Python works
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 \
  CMD python -c "print('healthy')" || exit 1

# Run the monitor agent
CMD ["python", "-u", "monitor.py"]
