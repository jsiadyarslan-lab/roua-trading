#!/bin/bash

# Paper Trading Credential Setup
echo "🎮 إضافة Paper Trading Credential..."

# استبدل YOUR_TOKEN بالـ JWT token الخاص بك
TOKEN="YOUR_TOKEN"

curl -X POST http://localhost:3000/api/portfolio/credentials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "exchange": "paper-trading",
    "label": "Paper Trading Auto",
    "apiKey": "paper-trading-key",
    "apiSecret": "paper-trading-secret"
  }'

echo ""
echo "✅ تم إضافة Paper Trading credential"
echo "⚡ Smart Executor سيبدأ التنفيذ خلال 15 ثانية"
