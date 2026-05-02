FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates postgresql-client && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PLATFORM_URL=https://roua-trading-production.up.railway.app
ENV BACKUP_INTERVAL=86400
ENV CLEANUP_INTERVAL=21600
ENV HEALTH_PORT=8082
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 CMD curl -f http://localhost:8082/health || exit 1
CMD ["python", "-u", "maintenance.py"]
