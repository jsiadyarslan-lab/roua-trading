#!/bin/bash

# Binance Testnet Credential Setup
echo "🚀 إضافة Binance Testnet Credential..."

# استبدل YOUR_TOKEN بالـ JWT token الخاص بك
TOKEN="YOUR_TOKEN"

# استبدل بـ API keys من testnet.binance.com
API_KEY="your-testnet-api-key"
API_SECRET="your-testnet-api-secret"

curl -X POST http://localhost:3000/api/portfolio/credentials \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{
    \"exchange\": \"binance\",
    \"label\": \"Binance Testnet Auto\",
    \"apiKey\": \"$API_KEY\",
    \"apiSecret\": \"$API_SECRET\",
    \"testnet\": true
  }"

echo ""
echo "✅ تم إضافة Binance Testnet credential"
echo "🌐 يتصل بـ testnet.binance.com (أموال وهمية)"
echo "⚡ Smart Executor سيبدأ التنفيذ خلال 15 ثانية"
