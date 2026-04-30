# تقرير تدقيق منصة التداول "رؤى ROUA" — التدقيق الشامل

**التاريخ:** 2026-04-27  
**الإصدار:** 1.0  
**المُدقِّق:** فريق ضمان الجودة (QA)  
**المنصة:** roua-trading-production.up.railway.app  

---

## جدول المحتويات

1. [ملخص تنفيذي](#1-ملخص-تنفيذي)
2. [جدول حالة الميزات](#2-جدول-حالة-الميزات)
3. [المرحلة 1: فحص الخلفية (Backend)](#3-المرحلة-1-فحص-الخلفية-backend)
4. [المرحلة 2: فحص الواجهة الأمامية (Frontend)](#4-المرحلة-2-فحص-الواجهة-الأمامية-frontend)
5. [المرحلة 3: فحص تكامل الذكاء الاصطناعي](#5-المرحلة-3-فحص-تكامل-الذكاء-الاصطناعي)
6. [المرحلة 4: فحص قاعدة البيانات](#6-المرحلة-4-فحص-قاعدة-البيانات)
7. [المرحلة 5: فحص الأمان](#7-المرحلة-5-فحص-الأمان)
8. [المرحلة 6: فحص الأداء](#8-المرحلة-6-فحص-الأداء)
9. [ملخص الأخطاء حسب الخطورة](#9-ملخص-الأخطاء-حسب-الخطورة)
10. [التوصيات](#10-التوصيات)
11. [تقييم الجاهزية للإطلاق التجريبي](#11-تقييم-الجاهزية-للإطلاق-التجريبي)

---

## 1. ملخص تنفيذي

تم إجراء تدقيق شامل لمنصة التداول "رؤى ROUA" عبر 6 مراحل تغطي الخلفية، الواجهة الأمامية، تكامل الذكاء الاصطناعي، قاعدة البيانات، الأمان، والأداء. كشف التدقيق عن **37 مشكلة حرجة**، **29 مشكلة متوسطة الخطورة**، و**18 مشكلة طفيفة**.

أبرز المخاطر تتعلق بـ:
- **ثغرات أمنية حرجة** تشمل SSRF عبر Caddyfile، ونقطة نهاية debug مكشوفة، وغياب حماية CSRF
- **استنزاف موارد الذكاء الاصطناعي** — النظام يحرق تلقائياً ~690,000 token/ساعة (~16.5M token/يوم) عبر المهام المجدولة دون تخزين مؤقت
- **استعلامات N+1** في خدمات المراكز تسبب تأخيراً شديداً (2.5+ ثانية لكل طلب)
- **مشاكل تشفير** — مشاركة IV/authTag بين apiKey و apiSecret تُبطل أمان AES-256-GCM
- **عدم اتساق سمة الألوان** بين صفحات المنصة

---

## 2. جدول حالة الميزات

| الميزة | الحالة | ملاحظات |
|--------|--------|---------|
| نظام المصادقة (WebAuthn + Google OAuth) | ⚠️ تحتاج إصلاح | مصادقة تعمل لكن لا يوجد rotation للجلسات، وحماية CSRF مفقودة |
| لوحة التحكم (Dashboard) | ✅ تعمل | تصميم متجاوب مع 3 نقاط كسر، حالة بيانات مباشرة |
| المحفظة (Portfolio) | ⚠️ تحتاج إصلاح | ألوان غير متسقة، جداول لا تستجيب على الموبايل |
| المراكز المفتوحة (Positions) | ✅ تعمل | علامة +/$0.00 للصفر، لا تحديث تلقائي |
| مختبر التداول العصبي (Neural Lab) | ⚠️ تحتاج إصلاح | تواريخ افتراضية مستقبلية، تنسيق رموز غير متسق |
| باك تيست (Backtest) | ✅ تعمل | استدعاء AI واحد لكل تشغيل، بيانات شموع اصطناعية |
| مُحسِّن الاستراتيجيات (Optimizer) | ✅ تعمل | رموز USDT بدلاً من USD |
| مقارنة الاستراتيجيات (Comparison) | ✅ تعمل | نفس مشكلة الرموز |
| تصدير التقارير | ⚠️ تحتاج إصلاح | PDF إنجليزي فقط، خطوط لا تدعم العربية |
| الأخبار | ⚠️ تحتاج إصلاح | عنق زجاجة AI عند البدء (60-120 ثانية)، لا حالة خطأ |
| AI Coach | ✅ تعمل | userId ثابت بدلاً من الجلسة |
| AI Council | ⚠️ تحتاج إصلاح | قيم ثقة ثابتة، كشف كلمات مفتاحية مبسط |
| الماسح الضوئي (Scanner) | ⚠️ تحتاج إصلاح | لا مصادقة، تحليل مزدوج غير ضروري |
| محرك التداول (Engine/Bot) | ✅ تعمل | استعلامات Redis KEYS خطرة |
| WebSocket (Binance) | ✅ تعمل | إعادة اتصال جيدة مع exponential backoff |
| بيانات الأسهم (AAPL, TSLA, NVDA) | ❌ لا تعمل | TwelveData مستنفد، FreeFallback لا يدعم الأسهم |
| بيانات الذهب (XAU/USD) | ❌ لا تعمل | metals.dev يتطلب مفتاح API (401)، Frankfurter لا يدعم الذهب |

---

## 3. المرحلة 1: فحص الخلفية (Backend)

### 3.1 المسارات والتحكم (Routes & Controllers)

تم فحص **14 وحدة تحكم** تغطي 68 نقطة نهاية:

| وحدة التحكم | المسار | مصادقة | نقاط النهاية |
|-------------|--------|--------|-------------|
| TradingController | `/api/trading` | ✅ AuthGuard | 10 |
| OrderController (v2) | `/api/trading/v2` | ✅ AuthGuard | 6 |
| EngineController | `/api/engine` | ✅ AuthGuard | 9 |
| SignalController | `/api/signals` | ✅ AuthGuard | 4 |
| SanctuaryController | `/api/portfolio/sanctuary` | ✅ AuthGuard | 1 |
| CredentialsController | `/api/portfolio/credentials` | ✅ AuthGuard | 3 |
| AiController | `/api/ai` | ✅ AuthGuard | 4 |
| AnalyticsController | `/api/analytics` | ✅ AuthGuard | 2 |
| NeuralController | `/api/neural` | ✅ AuthGuard | 7 |
| **NewsController** | `/api/news` | ❌ **بدون مصادقة** | 3 |
| **ScannerController** | `/api/scanner` | ❌ **بدون مصادقة** | 6 |
| **CoachController** | `/api/coach` | ✅ AuthGuard | 3 |
| ExchangeController | `/api/exchange` | ✅ AuthGuard | 3 |
| AuthController | `/api/auth` | ❌ بالتصميم | 4 |

### 3.2 مشاكل معالجة الأخطاء

**🔴 حرج — ابتلاع الأخطاء في NewsController:** بدلاً من رمي استثناءات HTTP مناسبة، يعود بـ `{ success: false }` مما يمنع العميل من التمييز بين النتائج الفارغة والأخطاء.

```typescript
// apps/api/src/modules/news/news.controller.ts:42-48
catch (error) {
  return { success: false, data: [] }; // يبتلع الخطأ!
}
```

**🔴 حرج — ScannerController بدون أي معالجة أخطاء:** جميع نقاط النهاية الست لا تحتوي على try-catch، أي فشل يمر مباشرة إلى المستخدم.

**🟡 متوسط — تنسيق استجابة غير متسق:** ثلاثة أنماط مختلفة:
1. `{ statusCode, message, timestamp, path }` (عبر المرشح العام)
2. `{ success: true, data: ... }` (معظم وحدات التحكم)
3. كائن مباشر بدون تغليف (بعض نقاط التداول)

**🟡 متوسط — وحدات الخدمة تبتلع الأخطاء:** `trading.service.ts` يعود بـ `[]` عند فشل قاعدة البيانات، مما يخفي الأخطاء بصمت.

### 3.3 مفاتيح API والأسرار

**🔴 حرج — ملف `.env` مُتتبع في Git:** يحتوي على بيانات اعتماد حقيقية:
```
DATABASE_URL=postgresql://postgres:roua_dev_2026@localhost:5432/roua_trading
REDIS_URL=redis://:roua_redis_2026@localhost:6379
RABBITMQ_URL=amqp://roua:roua_mq_2026@localhost:5672
NEXTAUTH_SECRET=roua-dev-secret-change-in-production
```

**🔴 حرج — مفتاح Gemini API في عنوان URL:** 
```typescript
// apps/api/src/modules/ai/services/gemini.service.ts:36
const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
```

**🟡 متوسط — مفتاح تشفير احتياطي ضعيف:**
```typescript
// apps/api/src/modules/portfolio/credentials/credentials.service.ts:38-41
const fallback = this.configService.get<string>('NEXTAUTH_SECRET', 'roua-dev-key-change-in-production');
this.encryptionKey = crypto.scryptSync(fallback, 'roua-salt', 32); // salt ثابت!
```

### 3.4 مشاكل المصادقة

**🔴 حرج — ScannerController بدون مصادقة:** 6 نقاط نهاية مكشوفة للعامة، تقوم بمكالمات API مكلفة وعمليات AI بدون حماية.

**🔴 حرج — NewsController بدون مصادقة:** `POST /api/news/fetch` يُشغّل تحليل AI مكلف (ترجمة + تحليل مشاعر + نماذج متعددة) بدون مصادقة.

**🔴 حرج — IDOR في CoachController:** جميع نقاط النهاية الثلاث تقبل `userId` من نص الطلب بدلاً من الجلسة:
```typescript
// apps/api/src/modules/coach/coach.controller.ts:19
async getPerformanceAdvice(@Body() body: { userId: string }) {
  // أي مستخدم يمكنه الوصول لبيانات أي مستخدم آخر!
}
```

### 3.5 استعلامات N+1

**🔴 حرج — N+1 في getOpenPositions:** لكل N مركز، يتم إجراء N مكالمة API خارجية + N تحديث قاعدة بيانات:
```typescript
// apps/api/src/modules/trading/trading.service.ts:379-414
for (const position of positions) {
  const quote = await this.exchangeService.getQuote(position.symbol);
  await this.prisma.position.update({ where: { id: position.id }, data: { ... } });
}
```
**تأثير:** مستخدم مع 10 مراكز مفتوحة → 10 مكالمات API + 10 تحديثات DB = **2.5+ ثانية** لكل طلب.

**🔴 حرج — N+1 في Position Monitor:** نفس النمط يعمل كل 30 ثانية لجميع المراكز عبر جميع المستخدمين.

### 3.6 المهام المجدولة

| الخدمة | الجدولة | حماية التداخل | معالجة الأخطاء |
|--------|---------|--------------|---------------|
| MarketScanner | كل 5 دقائق | ✅ `isScanning` | ✅ try-catch |
| TradingBot | كل 2 دقيقة | ✅ `isProcessing` | ✅ try-catch |
| CouncilScheduler | كل 15 دقيقة | ✅ `isInSession` | ✅ try-catch |
| PositionMonitor | كل 30 ثانية | ✅ `isMonitoring` | ✅ try-catch |
| MarketBroadcaster | كل 15 ثانية | ✅ `isBroadcasting` | ✅ try-catch |
| **NewsService** | كل 15 دقيقة | ❌ **لا حماية** | ✅ try-catch |

**🟡 متوسط — NewsService يستخدم `setInterval` يدوي** بدلاً من `@Cron`، بدون حماية من التداخل.

**🟡 متوسط — أمر Redis `KEYS` خطير:**
```typescript
// apps/api/src/modules/engine/services/trading-bot.service.ts:230
const keys = await this.redis['client'].keys('bot:config:*'); // O(N) يوقف Redis!
```

### 3.7 المكالمات الخارجية

| الخدمة | مهلة الاتصال | إعادة المحاولة | قاطع الدائرة |
|--------|------------|---------------|-------------|
| TwelveData | 10-15s | ❌ | ✅ يومي |
| Binance (CCXT) | افتراضي CCXT | ✅ مدمج | ✅ في الدقيقة |
| FreeFallback | 10-15s | ❌ | ❌ |
| Gemini | 60s | ✅ عبر المنسق | ✅ 60s تبريد |
| Groq | 30s | ✅ عبر المنسق | ✅ 60s تبريد |
| RSS Feeds | ❌ **بدون مهلة** | ❌ | ❌ |

**🔴 حرج — لا مهلة على جلب RSS:** مكالمات `fetch()` في NewsService يمكن أن تتوقف إلى ما لا نهاية.

---

## 4. المرحلة 2: فحص الواجهة الأمامية (Frontend)

### 4.1 جرد الصفحات

تم فحص **17 صفحة** تحت `/dashboard/` و**40+ مكون** عبر المجموعات الرئيسية.

### 4.2 لوحة التحكم

**✅ نقاط القوة:**
- تصميم متجاوب بثلاث نقاط كسر (سطح مكتب، مدمج، موبايل)
- حالة البيانات المباشرة (live/delayed/fallback/demo/disconnected)
- التنقل السفلي للموبايل

**🟡 مشكلة:** `usePositionsStore.fetchAccount` يبتلع الأخطاء بصمت:
```typescript
fetchAccount: async () => {
  try { ... } catch {} // لا حالة خطأ!
},
```

### 4.3 صفحة المحفظة والمراكز

**🔴 حرج — ألوان غير متسقة:**

| المكون | القيمة المتوقعة (CSS) | القيمة الفعلية |
|--------|----------------------|---------------|
| Portfolio/AI `T.bg` | `#0B0E14` | `#04050C` |
| Portfolio/AI `T.card` | `#1A1D29` | `#08090F` |
| Portfolio/AI `T.green` | `#00FFA3` | `#00FFC6` |
| Portfolio/AI `T.red` | `#FF4757` | `#FF4D4D` |

هذا يخلق اختلافاً بصرياً واضحاً عند التنقل بين الصفحات.

**🟡 متوسط — P/L يظهر `+$0.00` للقيم الصفرية** بدلاً من `$0.00`.

**🟡 متوسط — لا تحديث تلقائي** في صفحة المراكز (تحديث يدوي فقط).

**🟡 متوسط — جداول تفيض على الموبايل** في صفحة المحفظة (9 أعمدة).

### 4.4 مختبر التداول العصبي (Neural Lab)

**🔴 حرج — تواريخ افتراضية مستقبلية:**
```typescript
// apps/web/src/app/dashboard/neural/BacktestPanel.tsx:71-72
const [periodStart, setPeriodStart] = useState('2026-01-01');
const [periodEnd, setPeriodEnd] = useState('2026-04-27');
```
الباك تيست سيفشل أو يعود بلا بيانات لأن التواريخ في المستقبل.

**🔴 حرج — تنسيق رموز غير متسق:**
- BacktestPanel يستخدم `BTC/USD`
- OptimizerPanel و ComparisonPanel يستخدمان `BTC/USDT`

**🔴 حرج — تسرب ذاكرة في TradeChart:** ResizeObserver لا يتم تنظيفه بشكل صحيح لأن التنظيف داخل `import().then()` callback.

**🟡 متوسط — تصدير PDF إنجليزي فقط** ولا يدعم الأحرف العربية.

### 4.5 صفحة الأخبار

**✅ نقاط القوة:** تصفية حسب الأصل والمشاعر، بطاقات مترجمة، تحليل AI، تحديث تلقائي.

**🟡 مشكلات:**
- لا حالة خطأ تُعرض عند فشل الجلب
- استخدام فهرس المصفوفة كمفتاح بديل

### 4.6 AI Coach / صفحة AI

**✅ نقاط القوة:** دردشة تفاعلية مع localStorage، AI Council مع تصويت، مؤشرات نموذج.

**🔴 حرج — useEffect مع تبعيات مفقودة:**
```typescript
// apps/web/src/app/dashboard/ai/page.tsx:151-156
useEffect(() => {
  setMessages(loadMessages())
  fetchAIStatus()
  fetchTechIndicators()
  fetchNarrator()
}, []) // التبعيات مفقودة!
```

**🟡 متوسط — تصميم 3 أعمدة ثابت** يتعطل على الشاشات الصغيرة.

**🟡 متوسط — `userId: 'current'` ثابت** في AICoachPanel بدلاً من ID المستخدم الفعلي.

### 4.7 دعم RTL والتصميم الداكن

**✅ جيد:** `<html lang="ar" dir="rtl">`، خطوط Cairo، خصائص RTL منطقية.

**❌ مشكلة:** ألوان غير متسقة بين الصفحات (انظر الجدول أعلاه في 4.3).

---

## 5. المرحلة 3: فحص تكامل الذكاء الاصطناعي

### 5.1 جرد النماذج

| # | النموذج | مفتاح API | مهلة الاتصال | max_tokens |
|---|---------|-----------|------------|------------|
| 1 | Groq / Llama 3.3 70B | `GROQ_API_KEY` | 30s | 1024 |
| 2 | Gemini 2.0 Flash | `GOOGLE_AI_STUDIO_API_KEY` | 60s | 2048 |
| 3 | GLM-4 (Zhipu AI) | `GLM_API_KEY` | 60s | 2048 |
| 4 | HuggingFace / Mistral-7B | `HUGGINGFACE_API_KEY` | 60s | 1024 |
| 5 | Ollama / Qwen2.5 | `OLLAMA_BASE_URL` | 120s | 1024 |
| 6 | Bedrock / Claude 3.5 | `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` | 60s | 2048 |

### 5.2 المنسق (Orchestrator)

**✅ جيد:** سلسلة احتياطية ذكية مع 7 أنواع مهام، كل نموذج يظهر في كل سلسلة، تبريد 60 ثانية بعد 429.

**🔴 حرج — قيم ثقة ثابتة:** جميع النماذج الستة تعيد قيم ثقة ثابتة بغض النظر عن جودة الاستجابة:
- Groq: دائماً 0.8
- Gemini: دائماً 0.9
- GLM-4: دائماً 0.85
- HuggingFace: دائماً 0.82
- Ollama: دائماً 0.85
- Bedrock: دائماً 0.92

هذا يجعل حسابات الإجماع وتصنيفات الثقة بلا معنى.

**🔴 حرج — كشف كلمات مفتاحية مبسط:** البحث عن وجود كلمات مثل "شراء" أو "BUY" دون سياق أو كشف نفي. عبارة "لا أنصح بالشراء" تُحسب كتصويت شراء!

### 5.3 عنق زجاجة أخبار البدء

**🔴 حرج — 40-60 مكالمة AI متسلسلة عند البدء:**
- حتى 20 مقالة × 2-3 مكالمات AI = 40-60 مكالمة متسلسلة
- لا تجميع، لا تحديد معدل، لا تحكم تزامن
- يمكن أن يستغرق 5-15 دقيقة
- فحص التكرار يحدث **بعد** مكالمات AI (إهدار tokens)

### 5.4 استهلاك Tokens التلقائي

| المهمة المجدولة | التكرار | مكالمات AI/ساعة |
|----------------|---------|----------------|
| Market Scanner | كل 5 دقائق | 24-48 |
| Council Scheduler | كل 15 دقيقة | 140 |
| News Fetch | كل 15 دقيقة | 160-240 |

**الإجمالي التقديري: ~460 مكالمة AI/ساعة ≈ 690,000 tokens/ساعة ≈ 16.5M tokens/يوم**

بأسعار Groq: **~$9.72/يوم** في تكاليف AI المستقلة فقط.

### 5.5 مكالمات AI مكررة

**🔴 حرج — تحليل مزدوج في الماسح:** `analyzeAsset()` يُستدعى مرتين لكل رمز مؤهل (مرة مباشرة، ومرة داخل `generateSignal()`).

**🔴 حرج — AI قبل فحص التكرار:** في NewsService، الترجمة وتحليل المشاعر يتم قبل التحقق من وجود المقال مسبقاً.

**🔴 حرج — لا تخزين مؤقت لنتائج AI:** إذا طلب مستخدمان تحليلاً لنفس الرمز في نفس الوقت، يتم تشغيل مكالمات AI منفصلة.

---

## 6. المرحلة 4: فحص قاعدة البيانات

### 6.1 تحليل المخطط

تم فحص **19 نموذج/جدول** عبر Prisma ORM.

**علاقات مفقودة حرجة:**

| الجدول | الحقل | المشكلة |
|--------|-------|---------|
| AuditLog | `userId` | لا قيد FK — سجلات يتيمة بعد حذف المستخدم |
| CoachAdvice | `userId` | لا علاقة — نفس المشكلة |
| PaperOrder | `userId` | لا علاقة — لا حذف متسلسل |
| Trade | `orderId`, `positionId` | لا علاقة — لا يمكن include |
| Position | `credentialId` | لا علاقة بـ ExchangeCredential |

### 6.2 الفهارس المفقودة

**🔴 حرج — فهارس مركبة مفقودة:**

| الجدول | الفهرس المفقود | نمط الاستعلام | الاستخدام |
|--------|---------------|--------------|----------|
| Position | `@@index([userId, status])` | `findMany({ where: { userId, status: 'OPEN' } })` | 8+ خدمات |
| Position | `@@index([userId, symbol, status])` | فحص المركز المكرر | 5+ مواقع |
| Trade | `@@index([userId, type, executedAt])` | P&L اليومي | 4 خدمات |
| Order | `@@index([userId, status, createdAt])` | قوائم الطلبات | 2 خدمات |
| Signal | `@@index([userId, status, expiresAt])` | إشارات نشطة | 2 خدمات |

### 6.3 أمان البيانات

**🔴 حرج — مشاركة IV/authTag في التشفير:**
```typescript
// apps/api/src/modules/portfolio/credentials/credentials.service.ts:107-119
const encryptedApiKey = this._encrypt(apiKey);    // IV جديد
const encryptedSecret = this._encrypt(apiSecret); // IV مختلف
// لكن يتم تخزين IV واحد فقط:
iv: encryptedApiKey.iv,           // ❌ IV الخاص بـ apiKey فقط
authTag: encryptedApiKey.authTag, // ❌ authTag الخاص بـ apiKey فقط
```
AES-GCM مع نفس المفتاح + IV لأجزاء مختلفة يكسر الأمان التشفيري.

**🔴 حرج — OAuth tokens مخزنة كنص عادي:**
```
Account.access_token    → Plaintext String
Account.refresh_token   → Plaintext String
Account.id_token        → Plaintext String
```

**🔴 حرج — Position و Trade يستخدمان Float:**
```prisma
unrealizedPnl Float   // ❌ Float يفقد الدقة المالية
realizedPnl   Float   // ❌ 0.1 + 0.2 ≠ 0.3
pnl           Float   // ❌ يجب أن يكون Decimal
```

### 6.4 عمليات غير آمنة

**🔴 حرج — لا معاملات للعمليات المالية:**
- `placeOrder` — إنشاء طلب + إنشاء صفقة + تحديث مركز **بدون معاملة**
- `closePosition` — نفس المشكلة
- إذا فشلت خطوة وسطى، البيانات تصبح غير متسقة

**🔴 حرج — لا ملفات هجرة (migrations):** المجلد `prisma/migrations/` غير موجود. لا سجل تغييرات المخطط، لا إمكانية التراجع.

---

## 7. المرحلة 5: فحص الأمان

### 7.1 حقن SQL

**✅ لا ثغرات:** جميع استعلامات قاعدة البيانات تستخدم Prisma ORM المُعاملات، أو `$queryRaw` مع قوالب مصنفة (tagged templates) آمنة.

### 7.2 XSS

**✅ خطر منخفض:** استخدام واحد فقط لـ `dangerouslySetInnerHTML` في مكون chart لحقن CSS ثابت. React يتولى الهروب التلقائي.

### 7.3 CSRF

**🔴 حرج — `sameSite: 'none'` في الإنتاج بدون حماية CSRF:**
```typescript
sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
```
نظراً لأن Next.js يعيد كتابة الطلبات إلى NestJS (نفس الأصل)، فإن `sameSite: 'lax'` أو `'strict'` سيعمل بشكل جيد. `sameSite: 'none'` غير ضروري ويخلق ثغرة CSRF.

لا توجد رموز CSRF أو مكتبات حماية في أي مكان في الكود.

### 7.4 رؤوس الأمان

**🔴 حرج — لا رؤوس أمان على الإطلاق:**

| الرأس | الحالة |
|-------|--------|
| Content-Security-Policy | ❌ مفقود |
| X-Frame-Options | ❌ مفقود |
| X-Content-Type-Options | ❌ مفقود |
| Strict-Transport-Security | ❌ مفقود |
| Referrer-Policy | ❌ مفقود |
| Permissions-Policy | ❌ مفقود |

لا يوجد Helmet أو أي وسيط رؤوس أمان.

### 7.5 نقطة نهاية Debug المكشوفة

**🔴 حرج — `/api/auth/debug` بدون مصادقة:**
```typescript
// apps/web/src/app/api/auth/debug/route.ts
GOOGLE_CLIENT_SECRET: mask(process.env.GOOGLE_CLIENT_SECRET), // مكشوف جزئياً!
DATABASE_URL: mask(process.env.DATABASE_URL, 10),             // مكشوف جزئياً!
NEXTAUTH_SECRET: mask(process.env.NEXTAUTH_SECRET),           // مكشوف جزئياً!
```
دالة `mask()` تعرض أول وآخر 6 أحرف — كافية للاستغلال.

### 7.6 SSRF عبر Caddyfile

**🔴 حرج — ثغرة SSRF:**
```
# Caddyfile:2-12
@transform_port_query {
    query XTransformPort=*
}
handle @transform_port_query {
    reverse_proxy localhost:{query.XTransformPort}
}
```
يمكن للمهاجم الوصول لأي خدمة على localhost (PostgreSQL:5432، Redis:6379، إلخ).

### 7.7 أمان المصادقة

**🟡 متوسط — لا rotation للجلسات:** إذا نُسبت جلسة، تبقى صالحة لمدة 24 ساعة حتى لو سجّل المستخدم الدخول مرة أخرى.

**🟡 متوسط — NEXTAUTH_SECRET يُولّد تلقائياً:** إذا لم يُعيَّن، يُشتق حتمياً من متغيرات بيئة أخرى — أي شخص يعرف هذه المتغيرات يمكنه تزوير JWT.

**🟡 متوسط — عداد WebAuthn دائماً 0:** اكتشاف استنساخ المصدق معطل.

### 7.8 أمان API

**🟡 متوسط — لا DTOs:** جميع وحدات التحكم تستخدم `@Body() body: any` بدون فئات تحقق. `ValidationPipe` مُهيأ لكن غير فعال بدون DTOs.

---

## 8. المرحلة 6: فحص الأداء

### 8.1 حجم الحزمة (Bundle Size)

**🔴 حرج — تبعات ثقيلة محملة بشكل حريص:**

| الحزمة | الحجم التقديري | مطلوب في كل صفحة؟ |
|--------|---------------|------------------|
| `@mdxeditor/editor` | ~2.5MB | ❌ فقط في صفحات محددة |
| `exceljs` | ~1.5MB | ❌ فقط عند التصدير |
| `pdfkit` | ~500KB | ❌ فقط عند التصدير |
| `react-syntax-highlighter` | ~500KB | ❌ فقط في صفحات محددة |
| `recharts` | ~600KB | ❌ صفحات الرسوم البيانية |

**🔴 حرج — تقسيم كود شبه معدوم:** فقط ملفان يستخدمان `next/dynamic`. صفحة Dashboard تستورد 15+ مكون بشكل متزامن.

**🟡 متوسط — 4 خطوط Google محملة بشكل حريص** (~400KB).

### 8.2 استعلامات قاعدة البيانات

**🔴 حرج — تسجيل استعلامات Prisma في الإنتاج:**
```typescript
// apps/api/src/common/prisma/prisma.service.ts:14-20
log: [
  { emit: 'event', level: 'query' },  // يسجّل كل استعلام!
],
```

**🔴 حرج — لا تكوين تجمع اتصالات:** الحجم الافتراضي هو `num_cpus * 2 + 1` — غير كافٍ للطلبات المتزامنة + المهام المجدولة.

### 8.3 التخزين المؤقت

**✅ جيد — محولات الصرف تستخدم Redis:** Binance 3s، TwelveData 120s، FreeFallback 300s.

**🔴 حرج — لا رؤوس HTTP cache:** لا `Cache-Control`، لا `ETag` على أي استجابة API.

**🔴 حرج — لا تخزين مؤقت لنتائج AI:** إذا طلب مستخدمان تحليلاً لنفس الرمز في نفس الوقت، يتم تشغيل مكالمات AI منفصلة.

### 8.4 إدارة الذاكرة

**🔴 حرج — NewsService setInterval لا يُنظّف عند تدمير الوحدة.**

**🔴 حرج — Finnhub WS إعادة اتصال بدون حد أقصى أو تنظيف.**

**🔴 حرج — أمر Redis `KEYS` يحظر Redis في الإنتاج.**

### 8.5 مهلات المكالمات الخارجية

**🔴 حرج — لا مهلة على جلب RSS و CCXT:** مكالمات `fetch()` و CCXT يمكن أن تتوقف إلى ما لا نهاية.

**🟡 متوسط — Finnhub WS إعادة اتصال بدون exponential backoff.**

---

## 9. ملخص الأخطاء حسب الخطورة

### 🔴 حرج (37)

| # | الفئة | المشكلة | الموقع |
|---|-------|---------|--------|
| 1 | أمان | SSRF عبر XTransformPort في Caddyfile | `Caddyfile:2-12` |
| 2 | أمان | نقطة نهاية debug مكشوفة بدون مصادقة | `api/auth/debug/route.ts` |
| 3 | أمان | CSRF — `sameSite: 'none'` بدون حماية | 6 مواقع set cookie |
| 4 | أمان | لا رؤوس أمان (CSP, HSTS, X-Frame-Options) | `apps/api/src/main.ts` |
| 5 | خلفية | ملف `.env` مُتتبع في Git | `.env` |
| 6 | خلفية | ScannerController بدون مصادقة | `scanner.controller.ts` |
| 7 | خلفية | NewsController بدون مصادقة | `news.controller.ts` |
| 8 | خلفية | IDOR في CoachController — userId من الطلب | `coach.controller.ts` |
| 9 | خلفية | N+1 في getOpenPositions | `trading.service.ts:379-414` |
| 10 | خلفية | N+1 في PositionMonitor (كل 30 ثانية) | `position-monitor.service.ts:105-117` |
| 11 | خلفية | مشاركة IV/authTag في AES-256-GCM | `credentials.service.ts:107-119` |
| 12 | خلفية | لا مهلة على RSS fetch | `news.service.ts:315,366,389` |
| 13 | خلفية | مفتاح Gemini API في URL | `gemini.service.ts:36` |
| 14 | AI | قيم ثقة ثابتة لجميع النماذج | جميع خدمات AI |
| 15 | AI | عنق زجاجة أخبار البدء (40-60 مكالمة متسلسلة) | `news.service.ts` |
| 16 | AI | لا تخزين مؤقت لنتائج AI | النظام بالكامل |
| 17 | AI | تحليل مزدوج في الماسح | `market-scanner.service.ts` |
| 18 | AI | AI قبل فحص التكرار في الأخبار | `news.service.ts:204-264` |
| 19 | AI | كشف كلمات مفتاحية مبسط للإجماع | `ai-orchestrator.service.ts` |
| 20 | قاعدة بيانات | OAuth tokens مخزنة كنص عادي | `schema.prisma:410-416` |
| 21 | قاعدة بيانات | Position/Trade يستخدمان Float بدلاً من Decimal | `schema.prisma` |
| 22 | قاعدة بيانات | لا معاملات للعمليات المالية | `trading.service.ts:186-227` |
| 23 | قاعدة بيانات | لا ملفات هجرة (migrations) | `prisma/migrations/` مفقود |
| 24 | قاعدة بيانات | فهارس مركبة مفقودة | Position, Trade, Order, Signal |
| 25 | أداء | تبعات ثقيلة محملة بشكل حريص | `apps/web/package.json` |
| 26 | أداء | تقسيم كود شبه معدوم | صفحة Dashboard |
| 27 | أداء | N+1 استعلامات في خدمات المراكز | 3 خدمات |
| 28 | أداء | 60 مكالمة AI متسلسلة لدورة أخبار | `news.service.ts` |
| 29 | أداء | Redis KEYS يحظر Redis | `trading-bot.service.ts:230` |
| 30 | أداء | NewsService setInterval لا يُنظّف | `news.service.ts` |
| 31 | أداء | Finnhub WS إعادة اتصال بدون حد | `finnhub.adapter.ts` |
| 32 | أداء | تسجيل استعلامات Prisma في الإنتاج | `prisma.service.ts:14-20` |
| 33 | أداء | لا تكوين تجمع اتصالات | `prisma.service.ts` |
| 34 | أداء | لا رؤوس HTTP cache | جميع نقاط النهاية |
| 35 | واجهة | ألوان غير متسقة بين الصفحات | `portfolio/page.tsx`, `ai/page.tsx` |
| 36 | واجهة | تواريخ Backtest افتراضية مستقبلية | `BacktestPanel.tsx:71-72` |
| 37 | واجهة | تسرب ذاكرة TradeChart ResizeObserver | `TradeChart.tsx:171-186` |

### 🟠 متوسط الخطورة (29)

| # | الفئة | المشكلة | الموقع |
|---|-------|---------|--------|
| 1 | خلفية | مفتاح تشفير احتياطي ضعيف مع salt ثابت | `credentials.service.ts:38-41` |
| 2 | خلفية | .env.example يحتوي كلمات مرور حقيقية | `.env.example` |
| 3 | خلفية | تنسيق استجابة أخطاء غير متسق | عدة ملفات |
| 4 | خلفية | NewsService setInterval بدون حماية تداخل | `news.service.ts:61-69` |
| 5 | خلفية | Redis KEYS في cron jobs | `trading-bot.service.ts:230` |
| 6 | خلفية | Health endpoint يكشف معلومات المخطط | `main.ts:51-68` |
| 7 | خلفية | OrderController v2 يستخدم @Body() على GET | `order.controller.ts:240` |
| 8 | خلفية | وحدات الخدمة تبتلع الأخطاء | `trading.service.ts`, `news.service.ts` |
| 9 | أمان | لا rotation للجلسات | `auth.service.ts` |
| 10 | أمان | NEXTAUTH_SECRET يُولّد تلقائياً | `auth-config.ts:32-42` |
| 11 | أمان | عداد WebAuthn دائماً 0 | `auth.service.ts:281` |
| 12 | أمان | لا DTOs — @Body() body: any | جميع وحدات التحكم |
| 13 | أمان | مصادقة Dashboard معطلة افتراضياً | `middleware.ts` |
| 14 | AI | SignalService يتجاوز المنسق | `signal.service.ts:85` |
| 15 | AI | لا exponential backoff في قاطع الدائرة | `ai-orchestrator.service.ts` |
| 16 | AI | مهلة Ollama 120s تحظر الاحتياطي | `ollama.service.ts` |
| 17 | AI | AI_COUNCIL استراتيجية وهمية في Backtest | `backtest-runner.service.ts` |
| 18 | AI | 8 مكالمات AI لتحليل نص خبر واحد | `news.service.ts:107-185` |
| 19 | قاعدة بيانات | علاقات FK مفقودة (5+ جداول) | `schema.prisma` |
| 20 | قاعدة بيانات | مولد ID غير متسق (cuid vs uuid) | Order, OrderEvent, PaperOrder |
| 21 | قاعدة بيانات | updatedAt مفقود في 10 نماذج | `schema.prisma` |
| 22 | قاعدة بيانات | متجهات embedding كسلاسل JSON | `schema.prisma` |
| 23 | قاعدة بيانات | P&L اليومي محسوب بشكل مكرر | 4+ خدمات |
| 24 | أداء | CCXT instances تُنشأ لكل طلب | `trading.service.ts:738-753` |
| 25 | أداء | مصادر أخبار تُجلب بشكل متسلسل | `news.service.ts:274-308` |
| 26 | أداء | لا إلغاء تكرار للطلبات المتزامنة | نظام الصرف |
| 27 | أداء | RAG service بدون تخزين Redis مؤقت | `rag.service.ts` |
| 28 | واجهة | P/L يظهر +$0.00 للصفر | `positions/page.tsx`, `portfolio/page.tsx` |
| 29 | واجهة | PDF تصدير إنجليزي فقط | `api/neural/export/route.ts` |

### 🟡 طفيف (18)

| # | الفئة | المشكلة |
|---|-------|---------|
| 1 | خلفية | أنماط try-catch المتكررة (catch + re-throw) |
| 2 | واجهة | لا تحديث تلقائي في صفحة المراكز |
| 3 | واجهة | جداول تفيض على الموبايل |
| 4 | واجهة | تصميم 3 أعمدة ثابت في صفحة AI |
| 5 | واجهة | err: any في كتل catch |
| 6 | واجهة | فهرس المصفوفة كمفتاح بديل |
| 7 | واجهة | لا وظيفة تسجيل خروج |
| 8 | واجهة | رموز USDT/USD غير متسقة |
| 9 | AI | مفتاح Gemini API في URL |
| 10 | AI | Council Scheduler: 35 مكالمة AI كل 15 دقيقة |
| 11 | قاعدة بيانات | حذف cascade على Trade (يجب أرشفة) |
| 12 | قاعدة بيانات | حقول JSON كسلاسل غير قابلة للاستعلام |
| 13 | قاعدة بيانات | SignalUsage.confidence Float vs Signal Int |
| 14 | أمان | next-auth v4 (الإصدار الحالي v5) |
| 15 | أمان | حذف كوكي logout قد يفشل |
| 16 | أداء | 4 خطوط Google محملة بشكل حريص |
| 17 | أداء | لا `optimizePackageImports` في next.config |
| 18 | أداء | ExchangeGateway يستقصي كل 5s بدلاً من استخدام Broadcaster |

---

## 10. التوصيات

### 🔴 توصيات عاجلة (قبل الإطلاق التجريبي)

| # | التوصية | التفاصيل | الجهد |
|---|---------|---------|-------|
| 1 | إزالة نقطة نهاية debug | حذف `/api/auth/debug` أو إضافة مصادقة + حماية بيئة الإنتاج | 30 دقيقة |
| 2 | إصلاح SSRF في Caddyfile | إزالة `XTransformPort` أو تقييده بمنافذ معروفة | 15 دقيقة |
| 3 | تغيير sameSite إلى 'lax' | في جميع مواقع تعيين الكوكيز الستة | 30 دقيقة |
| 4 | إضافة Helmet | تثبيت `helmet` وإضافته إلى NestJS | 1 ساعة |
| 5 | إزالة .env من Git | `git rm --cached .env` + تدوير جميع بيانات الاعتماد | 1 ساعة |
| 6 | إضافة مصادقة لـ Scanner و News | `@UseGuards(AuthGuard)` على وحدات التحكم | 30 دقيقة |
| 7 | إصلاح IDOR في CoachController | استخدام `req.user.id` بدلاً من `body.userId` | 1 ساعة |
| 8 | إصلاح IV/authTag المشترك | تخزين IV و authTag منفصلين لكل حقل مشفر | 2 ساعة |

### 🟠 توصيات مهمة (خلال الأسبوع الأول)

| # | التوصية | التفاصيل | الجهد |
|---|---------|---------|-------|
| 9 | إصلاح N+1 في خدمات المراكز | استخدام `Promise.allSettled` + معاملات مجمعة | 4 ساعات |
| 10 | إضافة BullMQ لتحليل الأخبار | معالجة عناصر الأخبار مع عمال محدودة التزامن | 4 ساعات |
| 11 | تخزين مؤقت لنتائج AI | Redis cache لمخرجات التحليل مع TTL مناسب | 3 ساعات |
| 12 | إضافة فهارس مركبة | `@@index([userId, status])` على Position, Trade, Order, Signal | 1 ساعة |
| 13 | إصلاح Float → Decimal | تحويل حقول Position و Trade المالية إلى Decimal | 3 ساعات |
| 14 | إضافة DTOs مع class-validator | لجميع نقاط النهاية التي تقبل @Body | 6 ساعات |
| 15 | تقسيم الكود للواجهة | `next/dynamic` للمكونات الثقيلة + استيراد ديناميكي للتبعيات | 4 ساعات |
| 16 | إصلاح ألوان السمة | توحيد قيم الألوان عبر Portfolio و AI و Coach | 2 ساعة |

### 🟡 تحسينات طويلة المدى

| # | التوصية | التفاصيل |
|---|---------|---------|
| 17 | إنشاء نظام migrations | `prisma migrate dev` بدلاً من `prisma db push` |
| 18 | تشفير OAuth tokens | تشفير access_token و refresh_token في قاعدة البيانات |
| 19 | تحديث Prisma | من 6.19.2 إلى أحدث إصدار |
| 20 | إضافة pgvector | لناقلات embedding بدلاً من سلاسل JSON |
| 21 | قيم ثقة ديناميكية | اشتقاق الثقة من جودة استجابة النموذج |
| 22 | كشف نفي في الإجماع | تحليل سياقي للكلمات المفتاحية العربية |
| 23 | إصلاح تواريخ Backtest | تغيير الافتراضي إلى 2024-2025 |
| 24 | دعم العربية في تصدير PDF | إضافة خطوط عربية لـ pdfkit |
| 25 | إلغاء تكرار الطلبات | نمط "in-flight request" لطلبات الصرف المتزامنة |
| 26 | ترقية next-auth | من v4 إلى v5 (Auth.js) |
| 27 | rotation الجلسات | إبطال الجلسات القديمة عند تسجيل الدخول |

---

## 11. تقييم الجاهزية للإطلاق التجريبي

### نتيجة التقييم: ⚠️ غير جاهز — يحتاج إصلاحات عاجلة

| المعيار | النتيجة | التفاصيل |
|---------|--------|---------|
| الأمان | 🔴 2/10 | ثغرات SSRF، CSRF، debug مكشوفة، بيانات اعتماد في Git |
| الاستقرار | 🟠 4/10 | N+1 استعلامات، عنق زجاجة AI، لا معاملات مالية |
| الوظائف | 🟡 6/10 | معظم الميزات تعمل لكن الأسهم والذهب لا يعملان |
| الأداء | 🟠 3/10 | حزمة ثقيلة، لا تخزين مؤقت، استهلاك AI مرتفع |
| جودة الكود | 🟡 5/10 | بنية جيدة عموماً لكن نمط أخطاء غير متسق، لا DTOs |
| قاعدة البيانات | 🟠 4/10 | Float للماليات، لا migrations، فهارس مفقودة |

### الحد الأدنى للإطلاق التجريبي (8 إصلاحات عاجلة):

1. ✅ إصلاح مصادقة 401 (تم — middleware يحقن Authorization header)
2. ❌ إزالة نقطة نهاية debug
3. ❌ إصلاح SSRF في Caddyfile
4. ❌ تغيير sameSite إلى 'lax'
5. ❌ إزالة .env من Git + تدوير بيانات الاعتماد
6. ❌ إضافة مصادقة لـ Scanner و News
7. ❌ إصلاح IDOR في CoachController
8. ❌ إصلاح IV/authTag المشترك

**بعد إكمال هذه الإصلاحات الثمانية، يمكن اعتبار المنصة جاهزة للإطلاق التجريبي المحدود (beta) مع مراقبة مكثفة. الإصلاحات المهمة (N+1، تخزين مؤقت AI، تقسيم الكود) يجب أن تُنفذ خلال الأسبوع الأول من التجربة.**

---

*تم إنشاء هذا التقرير بواسطة فريق ضمان الجودة التلقائي — منصة رؤى ROUA*
