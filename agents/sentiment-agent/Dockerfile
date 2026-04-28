FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY shared/ ./shared/
COPY config.py .
COPY brand_monitor.py .
COPY sentiment.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8086/health || exit 1

CMD ["python", "-u", "sentiment.py"]
