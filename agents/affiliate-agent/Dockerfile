FROM python:3.12-slim

WORKDIR /app

# Install shared modules
COPY shared/ ./shared/
COPY config.py .
COPY referral_tracker.py .
COPY affiliate.py .
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

CMD ["python", "affiliate.py"]
