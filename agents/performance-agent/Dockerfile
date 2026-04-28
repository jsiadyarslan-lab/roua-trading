FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PLATFORM_URL=https://roua-trading-production.up.railway.app
ENV METRICS_COLLECTION_INTERVAL=3600
ENV REPORT_INTERVAL=604800
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 CMD curl -f http://localhost:8083/health || exit 1
CMD ["python", "-u", "performance.py"]
