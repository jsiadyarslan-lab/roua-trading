FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY shared/ ./shared/
COPY config.py .
COPY pattern_detector.py .
COPY audit.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "audit.py"]
