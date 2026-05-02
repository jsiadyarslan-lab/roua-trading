FROM python:3.12-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PLATFORM_URL=https://roua-trading-production.up.railway.app
ENV SECURITY_CHECK_INTERVAL=21600
ENV FULL_SCAN_INTERVAL=86400
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 CMD curl -f http://localhost:8081/health || exit 1
CMD ["python", "-u", "security.py"]
