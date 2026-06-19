# Roua Trading — Runbooks

## 🚨 كيفية الاستخدام

لكل حادث: اتبع الخطوات بالترتيب. لو فشلت الخطوة 1، انتقل لـ 2.

---

## RB-01: قاعدة البيانات معطّلة (DB Down)

**الأعراض:** API يرجع 500، `/api/health` يظهر `database: error`

### الإجراء الفوري (خلال 1 دقيقة)

```bash
# 1. تحقق من حالة DB على Railway
railway status

# 2. لو DB معطّل، أعد التشغيل
railway database restart

# 3. لو لا يعمل، فعّل وضع الطوارئ (النظام يتخطى DB queries)
# على Railway Variables:
DISABLE_DB_QUERIES=true
```

### التأثير
- PositionMonitor يتخطى الدورة (safe — لا إغلاق خاطئ)
- SmartExecutor يتخطى التنفيذ (safe — لا صفقات جديدة)
- الـ Council يتخطى جلساته
- الواجهة تُظهر بيانات مخبأة (cached)

### ما لا يجب فعله
- ❌ لا تُغلق الصفقات يدوياً (ستُغلق تلقائياً عند عودة DB)
- ❌ لا تُعدّل Redis (الـ cooldowns محفوظة)

---

## RB-02: Redis معطّل

**الأعراض:** خطأ `Redis connection refused`، cooldowns لا تعمل

### الإجراء

```bash
# 1. تحقق من Redis
railway redis status

# 2. لو معطّل، أعد التشغيل
railway redis restart

# 3. لو لا يعمل، النظام سيعمل بـ degraded mode:
#    - لا cooldowns (خطر: قد تُفتح صفقات متكررة)
#    - لا cache (أبطأ لكن يعمل)
#    فعّل الحماية البديلة:
DISABLE_NEW_TRADES=true  # يوقف فتح صفقات جديدة حتى يعود Redis
```

### التأثير
- بدون Redis: لا cooldowns، لا cache، لا processed keys
- **خطر:** قد تُفتح صفقات مكررة → فعّل `DISABLE_NEW_TRADES`

---

## RB-03: Binance API محجوب (429 / IP Ban)

**الأعراض:** أخطاء `429 Too Many Requests`، أسعار لا تتحدث

### الإجراء

```bash
# 1. تحقق من حالة Binance
curl -s "https://api.binance.com/api/v3/ping"

# 2. لو محجوب، النظام يتحول تلقائياً لـ fallback:
#    - CoinGecko → CoinCap → Bybit
#    لكن أبطأ بـ 3-5 ثوانٍ

# 3. لو جميع المصادر فشلت، فعّل:
FORCE_PAPER_PRICING=true  # يستخدم آخر سعر معروف من DB

# 4. انتظر 1-24 ساعة (Binance IP ban يدوم 2-24h)
#    خلال هذه المدة، لا تُفتح صفقات جديدة (الأسعار غير موثوقة)
```

---

## RB-04: AI Models معطّلة (جميع المزودين)

**الأعراض:** Council يرجع `isFallback: true`، `confidence: 0`

### الإجراء

```bash
# 1. تحقق من المزودين
curl "https://roua-trading-production.up.railway.app/api/ai/diagnose"

# 2. لو الكل معطّل:
#    - النظام يستخدم Technical Fallback (RSI + momentum)
#    - يُولّد briefs بـ confidence=58 (فوق الحد الأدنى 55)
#    - لكن بدون تحليل AI حقيقي

# 3. عطّل التداول الآلي حتى تعود الـ AI:
DISABLE_AUTO_TRADING=true

# 4. تحقق من مفاتيح API على Railway Variables
#    (انظر V268_API_KEYS_GUIDE.md)
```

---

## RB-05: صفقات لا تُغلق (Stuck Positions)

**الأعراض:** صفقة مفتوحة > 48 ساعة، SL/TP لم يُفعّل

### الإجراء

```bash
# 1. تحقق من PositionMonitor
curl "https://roua-trading-production.up.railway.app/api/engine/monitor/status"

# 2. لو PositionMonitor معطّل (self-healing):
#    أعد تفعيله يدوياً:
redis-cli DEL "self-healing:disabled:position-monitor"

# 3. لو الصفقة عالقة بسبب optimistic lock:
#    أغلقها يدوياً من الواجهة (زر Close)

# 4. لو لا يعمل، أغلقها عبر API:
curl -X POST "https://roua-trading-production.up.railway.app/api/trading/positions/{id}/close" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"closeReason": "MANUAL"}'
```

---

## RB-06: أداء سيء مفاجئ (Win Rate انخفض)

**الأعراض:** 5+ خسارات متتالية، P&L ينخفض بسرعة

### الإجراء

```bash
# 1. فعّل Sanctuary (يوقف الـ AI Council لساعة):
redis-cli SET "council:sanctuary:halt" "$(date -d '+1 hour' -Iseconds)" EX 3600

# 2. لو استمر، عطّل التداول الآلي:
DISABLE_AUTO_TRADING=true

# 3. راجع آخر الصفقات — هل SL مفقود؟ هل الـ AI يعطي إشارات متناقضة؟
# 4. عطّل ميزة معينة لو مشبوهة:
DISABLE_V270=true  # لو V270 يُغلق صفقات بشكل خاطئ
DISABLE_V265=true  # لو SL ≥ 2% يسبب مشاكل
```

---

## RB-07: إعادة النشر فاشلة (Build Failed)

**الأعراض:** Railway build يفشل

### الإجراء

```bash
# 1. راجع build logs — عادة خطأ TypeScript أو npm
# 2. لو خطأ TypeScript:
cd apps/api && npx tsc --noEmit  # محلياً
cd apps/web && npx tsc --noEmit

# 3. لو خطأ npm ci (lock file غير متزامن):
npm install --legacy-peer-deps  # محلياً
git add package-lock.json && git commit -m "fix: sync lockfile" && git push

# 4. لو عاجل، أعد النشر لآخر commit ناجح:
railway rollback  # أو من Railway Dashboard → Deployments → Rollback
```

---

## RB-08: WebSocket لا يعمل

**الأعراض:** الواجهة لا تتحدث بالـ real-time، المراكز تظهر متأخرة

### الإجراء

```bash
# 1. تحقق من Socket.IO
curl "https://roua-trading-production.up.railway.app/socketio/?EIO=4&transport=polling"

# 2. لو 404: تأكد أن IoAdapter مُفعّل في main.ts
# 3. لو 502: أعد نشر الـ API service
# 4. لو يعمل لكن لا يتحدث:
#    - تحقق من Redis pub/sub (الـ WS يعتمد عليه)
#    - أعد تشغيل Redis
```

---

## 📋 قائمة المتغيرات البيئية للطوارئ

| المتغير | التأثير |
|---------|--------|
| `DISABLE_AUTO_TRADING=true` | يوقف فتح صفقات جديدة |
| `DISABLE_V261=true` | يُعطّل منع forceClose TIME_EXPIRED |
| `DISABLE_V265=true` | يُعطّل SL ≥ 2% |
| `DISABLE_V270=true` | يُعطّل Regime-Aware Position Manager |
| `DISABLE_V267=true` | يُعطّل multilingual AI (يرجع للعربية) |
| `FORCE_PAPER_PRICING=true` | يستخدم آخر سعر معروف (لا API calls) |
| `BEDROCK_MONTHLY_BUDGET_USD=10` | يخفض ميزانية Bedrock للطوارئ |
