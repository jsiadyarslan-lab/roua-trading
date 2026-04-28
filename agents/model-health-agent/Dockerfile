FROM python:3.12-slim

WORKDIR /app

# Copy shared libraries first
COPY shared/ ./shared/

# Copy agent files
COPY config.py .
COPY cost_tracker.py .
COPY model_health.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "model_health.py"]
