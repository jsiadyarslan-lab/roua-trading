FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY shared/ ./shared/
COPY config.py .
COPY brand_monitor.py .
COPY sentiment.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "sentiment.py"]
