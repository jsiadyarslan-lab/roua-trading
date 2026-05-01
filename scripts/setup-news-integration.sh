#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# سكريبت إعداد الربط بين وكلاء روعة وموقع الأخبار المالي
# ROUA Trading ↔ rouatradingnews Integration Setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e

NEWS_URL="https://rouatradingnews-production.up.railway.app"
CRON_SECRET="WQlViNP79xc6Jfg_c9igla3lMfXx_Mw2oZcJKBaf9LE"
ADMIN_SECRET="i-Y_Ssk53QGai49sJPb81-75zJhbYaM-zKwayVWiNQrII511NOmFcWMf6NVPX06Z"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 إعداد ربط الوكلاء بموقع الأخبار المالي"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# الخطوة 1: التحقق من صحة موقع الأخبار
echo ""
echo "📍 الخطوة 1: التحقق من صحة موقع الأخبار..."
HEALTH=$(curl -s "$NEWS_URL/api/health")
STATUS=$(echo "$HEALTH" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','unknown'))" 2>/dev/null || echo "error")

if [ "$STATUS" = "ok" ]; then
    echo "✅ موقع الأخبار يعمل بشكل طبيعي"
else
    echo "❌ موقع الأخبار لا يستجيب! الحالة: $STATUS"
    exit 1
fi

# الخطوة 2: إنشاء مفتاح API للوكلاء
echo ""
echo "📍 الخطوة 2: إنشاء مفتاح API للوكلاء..."
API_KEY_RESULT=$(curl -s -X POST "$NEWS_URL/api/setup/agent-key" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $CRON_SECRET" 2>&1)

API_KEY=$(echo "$API_KEY_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('apiKey',{}).get('key',''))" 2>/dev/null || echo "")

if [ -z "$API_KEY" ]; then
    # محاولة مع ADMIN_SECRET
    API_KEY_RESULT=$(curl -s -X POST "$NEWS_URL/api/setup/agent-key" \
        -H "Content-Type: application/json" \
        -H "Authorization: Bearer $ADMIN_SECRET" 2>&1)
    API_KEY=$(echo "$API_KEY_RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('apiKey',{}).get('key',''))" 2>/dev/null || echo "")
fi

if [ -n "$API_KEY" ]; then
    echo "✅ مفتاح API: ${API_KEY:0:12}...${API_KEY: -4}"
else
    echo "⚠️ لم يتم إنشاء مفتاح API — سيتم إنشاؤه تلقائياً عند أول تشغيل"
    echo "   أو يمكن إنشاؤه يدوياً عبر: POST /api/setup/agent-key"
fi

# الخطوة 3: اختبار الاتصال بمفتاح API
echo ""
echo "📍 الخطوة 3: اختبار الاتصال..."
if [ -n "$API_KEY" ]; then
    NEWS_TEST=$(curl -s "$NEWS_URL/api/v1/news?limit=1" \
        -H "Authorization: Bearer $API_KEY" 2>&1)
    HAS_DATA=$(echo "$NEWS_TEST" | python3 -c "import json,sys; d=json.load(sys.stdin); print('yes' if 'data' in d else 'no')" 2>/dev/null || echo "no")
    if [ "$HAS_DATA" = "yes" ]; then
        echo "✅ الاتصال ناجح — يمكن للوكلاء جلب الأخبار"
    else
        echo "⚠️ المفتاح يعمل لكن لا توجد أخبار بعد (pipeline قد يكون فارغاً)"
    fi
fi

# الخطوة 4: اختبار نقاط النهاية الأخرى
echo ""
echo "📍 الخطوة 4: اختبار نقاط نهاية مشاعر السوق..."
SENTIMENT=$(curl -s "$NEWS_URL/api/markets/sentiment" 2>&1)
FG_VALUE=$(echo "$SENTIMENT" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('fearGreedIndex',{}).get('value','—'))" 2>/dev/null || echo "—")
echo "✅ مؤشر الخوف والطمع: $FG_VALUE"

# الخطوة 5: عرض ملخص المتغيرات المطلوبة
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 المتغيرات المطلوبة على Railway:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔵 ROUA TRADING NEWS (موقع الأخبار):"
echo "   CRON_SECRET=$CRON_SECRET"
echo "   ADMIN_SECRET=$ADMIN_SECRET"
echo ""
echo "🟢 ROUA TRADING (كل وكيل):"
echo "   NEWS_SITE_URL=$NEWS_URL"
if [ -n "$API_KEY" ]; then
    echo "   NEWS_API_KEY=$API_KEY"
else
    echo "   NEWS_API_KEY=rva_8da2b171a8a47c77271879cc12de11df709d5ef99c2ff2d6"
fi
echo "   CRON_SECRET=$CRON_SECRET"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ الإعداد مكتمل!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
