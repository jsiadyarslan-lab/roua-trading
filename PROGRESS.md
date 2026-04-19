# 🚀 Roua Trading (رؤى) — سجل التقدم

## المرحلة الأولى: الأساس — الأشهر 1-3

### الجلسة 1 — 18 أبريل 2026

#### ✅ تم إنجازه

1. **تصحيح المستند المعماري**
   - تصحيح متغير البيئة `GEMINI_API_KEY` → `GOOGLE_AI_STUDIO_API_KEY` في docker-compose
   - إضافة متغيرات بيئة مفقودة: `OLLAMA_API_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FINNHUB_API_KEY`, `STRAPI_URL`
   - إضافة خدمات `news-service` و `signal-service` في docker-compose

2. **إعداد بيئة التطوير**
   - تهيئة مشروع Next.js 16 مع TypeScript و Tailwind CSS 4
   - تثبيت الحزم: `@simplewebauthn/browser`, `@simplewebauthn/server`, `framer-motion`, `lucide-react`
   - إعداد قاعدة البيانات SQLite مع Prisma ORM

3. **مخطط قاعدة البيانات (Prisma Schema)**
   - `User` — المستخدمون مع WebAuthn Passkeys وأصناف الاشتراك
   - `ApiKey` — مفاتيح API مشفرة مع صلاحيات و IV
   - `Portfolio` + `PortfolioAsset` — المحافظ والأصول مع أنواع متعددة
   - `SignalUsage` — استخدام الإشارات مع توقيع إلكتروني
   - `Session` — جلسات المستخدمين
   - `AuditLog` — سجل المراجعة الشامل
   - `NewsArticle` — المقالات الإخبارية مع التضمينات

4. **Docker Compose**
   - PostgreSQL + pgvector للبيانات العلائقية والتضمينات الدلالية
   - Redis للتخزين المؤقت والجلسات
   - RabbitMQ لطابور الرسائل
   - شبكة خاصة `roua-network`
   - فحوصات صحة (healthchecks) لكل خدمة

5. **الواجهة الأمامية (Landing Page)**
   - صفحة هبوط كاملة بتصميم داكن RTL عربي
   - قسم البطل (Hero) مع شعار "رؤى" وتدرج لوني
   - قسم الركائز الأربع مع بطاقات تفاعلية
   - قسم سيمفونية الذكاء الاصطناعي مع النماذج الستة
   - قسم الميزات الثورية الخمس
   - قسم الأمان الصفري (Zero-Trust)
   - قسم خارطة الطريق بأربع مراحل
   - قسم CTA (دعوة للعمل)
   - حركات Framer Motion (fadeIn, stagger, scale)
   - تصميم متجاوب (Responsive) بالكامل

6. **خدمة المصادقة (Auth Service) — WebAuthn/Passkeys**
   - مكون `PasskeyLogin` مع واجهة تسجيل/دخول
   - API Route `/api/auth/register` — إنشاء تحدي التسجيل
   - API Route `/api/auth/verify` — التحقق من بيانات الاعتماد
   - API Route `/api/auth/session` — إدارة الجلسات
   - تسجيل المراجعة (Audit Logging) لكل عملية مصادقة
   - ملفات تعريف الارتباط (Cookies) آمنة مع httpOnly

7. **ملفات البيئة**
   - `.env.example` مع جميع المتغيرات المطلوبة

---

### الجلسة 2 — 18 أبريل 2026 — بناء الخادم الخلفي (Backend)

#### ✅ تم إنجازه

##### 1. تحويل المشروع إلى Turborepo Monorepo

تم تحويل هيكل المشروع من تطبيق Next.js واحد إلى Monorepo كامل:

```
roua-trading/                      ← الجذر (Turborepo)
├── apps/
│   ├── web/                       ← @roua/web (Next.js 16)
│   │   ├── src/
│   │   │   ├── app/               ← الصفحات و API Routes
│   │   │   ├── components/        ← المكونات
│   │   │   ├── hooks/             ← Custom Hooks
│   │   │   └── lib/               ← المكتبات المساعدة
│   │   ├── prisma/                ← مخطط قاعدة البيانات
│   │   ├── public/                ← الملفات الثابتة
│   │   └── package.json           ← @roua/web
│   │
│   └── api/                       ← @roua/api (NestJS 11)
│       ├── src/
│       │   ├── main.ts            ← نقطة الدخول (المنفذ 3001)
│       │   ├── app.module.ts      ← الوحدة الرئيسية
│       │   ├── auth/              ← وحدة المصادقة
│       │   ├── exchange/          ← وحدة الأسواق
│       │   ├── ai/                ← وحدة الذكاء الاصطناعي
│       │   ├── portfolio/         ← وحدة المحفظة
│       │   ├── audit/             ← وحدة سجل المراجعة
│       │   └── common/            ← خدمات مشتركة
│       │       ├── prisma/        ← PrismaService
│       │       ├── redis/         ← RedisService
│       │       └── guards/        ← AuthGuard
│       └── package.json           ← @roua/api
│
├── packages/
│   └── shared/                    ← @roua/shared (أنواع مشتركة)
│       └── src/
│           └── index.ts           ← DTOs و Interfaces مشتركة
│
├── prisma/
│   └── schema.prisma              ← مخطط قاعدة البيانات المشترك
├── docker-compose.yml             ← PostgreSQL + Redis + RabbitMQ
├── turbo.json                     ← إعدادات Turborepo
└── package.json                   ← إعدادات Monorepo الرئيسية
```

**المكونات الجديدة:**
- `turbo.json` — إعدادات Turborepo مع مهام `dev`, `build`, `lint`, `db:*`
- `package.json` رئيسي مع workspaces (`apps/*`, `packages/*`)
- أوامر موحدة: `bun run dev:web` و `bun run dev:api`

##### 2. إنشاء تطبيق NestJS (`apps/api`)

تم بناء تطبيق NestJS 11 كامل مع جميع الحزم المطلوبة:

**الحزم المثبتة:**
| الحزمة | الغرض |
|--------|-------|
| `@nestjs/common` + `@nestjs/core` + `@nestjs/platform-express` | إطار العمل الأساسي |
| `@nestjs/config` | إدارة متغيرات البيئة (isGlobal) |
| `@nestjs/throttler` | Rate Limiting (3 مستويات: short/medium/long) |
| `@nestjs/microservices` | جاهز لـ gRPC مستقبلاً |
| `@prisma/client` | اتصال قاعدة البيانات |
| `axios` | استدعاءات API الخارجية |
| `ioredis` | اتصال Redis للتخزين المؤقت والـ Rate Limiting |
| `cookie-parser` | قراءة ملفات تعريف الارتباط (Session Cookies) |
| `class-validator` + `class-transformer` | التحقق من البيانات وتحويلها |

**الإعدادات:**
- المنفذ: `3001` (قابل للتغيير عبر `API_PORT`)
- البادئة العالمية: `/api` لجميع المسارات
- CORS مُفعّل مع `credentials: true` للسماح بالكوكيز
- `ValidationPipe` عالمي مع `whitelist` و `transform`
- `cookie-parser` لقراءة جلسات `roua_session`
- ملف `.env` يُقرأ من الجذر (`../../.env`)

##### 3. الوحدات (Modules) المُنشأة

**AuthModule** — وحدة المصادقة الكاملة:
- `AuthService` — منطق WebAuthn/Passkeys مع Redis للتخزين المؤقت
  - `generateRegistrationChallenge()` — إنشاء تحدي التسجيل (مخزن في Redis بـ TTL 5 دقائق)
  - `generateAuthenticationChallenge()` — إنشاء تحدي المصادقة
  - `verifyRegistration()` — التحقق من بيانات التسجيل وإنشاء جلسة
  - `verifyAuthentication()` — التحقق من بيانات الدخول وإنشاء جلسة
  - `validateSession()` — التحقق من صلاحية الجلسة
  - `destroySession()` — إنهاء الجلسة (تسجيل الخروج)
- `AuthController` — واجهة REST:
  - `POST /api/auth/register` — إنشاء تحدي التسجيل
  - `GET /api/auth/challenge` — إنشاء تحدي المصادقة
  - `POST /api/auth/verify` — التحقق من بيانات الاعتماد (تسجيل أو دخول)
  - `GET /api/auth/session` — فحص الجلسة
  - `DELETE /api/auth/session` — تسجيل الخروج
- تم نقل منطق Passkeys من Next.js API Routes إلى NestJS مع تحسينات:
  - تخزين التحديات في Redis بدلاً من الذاكرة المؤقتة
  - تسجيل المراجعة التلقائي لكل عملية
  - Rate Limiting على مسارات المصادقة

**ExchangeModule** — طبقة تجريد الأسواق:
- `IExchangeAdapter` — واجهة موحدة لجميع مصادر بيانات السوق
  - `fetchQuote(symbol)` — جلب سعر مباشر
  - `fetchHistoricalData(symbol, interval, start, end)` — جلب بيانات تاريخية
- `UnifiedQuoteDto` — DTO موحد للأسعار يتضمن:
  - `symbol`, `name`, `exchange`, `currency`
  - `price`, `change`, `changePercent`
  - `open`, `high`, `low`, `close`, `volume`
  - `marketCap`, `fiftyTwoWeekHigh`, `fiftyTwoWeekLow`
  - `timestamp`, `source`
- `UnifiedCandleDto` — DTO موحد لبيانات OHLCV التاريخية
- `TwelveDataAdapter` — محول Twelve Data الكامل:
  - ينفذ `IExchangeAdapter`
  - استدعاءات API عبر `axios`:
    - `GET https://api.twelvedata.com/quote?symbol={symbol}&apikey={key}`
    - `GET https://api.twelvedata.com/time_series?symbol={symbol}&interval={interval}&start_date={start}&end_date={end}&apikey={key}`
  - **تخزين مؤقت عبر Redis:**
    - الأسعار: TTL 5 ثوانٍ (شعور بالوقت الحقيقي مع احترام Rate Limits)
    - البيانات التاريخية: TTL 5 دقائق
  - **Rate Limiting عبر Redis:**
    - 8 طلبات/دقيقة (حد الطبقة المجانية)
    - استخدام `INCR` + `EXPIRE` للعد والتتبع
    - رسالة خطأ واضحة بالعربية عند تجاوز الحد
  - تحويل البيانات (mapping) من استجابة Twelve Data إلى `UnifiedQuoteDto` و `UnifiedCandleDto`
- `ExchangeService` — خدمة إدارة المحولات:
  - حقن `IExchangeAdapter` عبر Dependency Injection
  - `getQuote(symbol)` — جلب سعر مباشر
  - `getHistoricalData(symbol, interval, start, end)` — جلب بيانات تاريخية
- `ExchangeController` — واجهة REST محمية بـ AuthGuard:
  - `GET /api/exchange/quote/:symbol` — سعر مباشر (30 طلب/دقيقة)
  - `GET /api/exchange/history/:symbol` — بيانات تاريخية (10 طلبات/دقيقة)

**AIModule** — هيكل فارغ للمستقبل:
- `AiService.orchestrate()` — جاهز لدمج الـ AI Symphony (Phase 2)
- `AiService.analyzeSentiment()` — جاهز لتحليل المشاعر
- `AiController` — مسارات REST:
  - `POST /api/ai/orchestrate` — توجيه الطلب للنموذج المناسب
  - `GET /api/ai/sentiment` — تحليل مشاعر السوق

**PortfolioModule** — وحدة المحفظة:
- `PortfolioService` — إدارة المحافظ والأصول:
  - `getUserPortfolios()` — جلب محافظ المستخدم
  - `createPortfolio()` — إنشاء محفظة جديدة
  - `addAsset()` — إضافة أصل للمحفظة
- `PortfolioController` — مسارات REST محمية:
  - `GET /api/portfolio` — جلب المحافظ
  - `POST /api/portfolio` — إنشاء محفظة
  - `POST /api/portfolio/:id/assets` — إضافة أصل

**AuditModule** — سجل المراجعة:
- `AuditService.log()` — تسجيل حدث في قاعدة البيانات
- `AuditService.getUserLogs()` — جلب سجلات مستخدم
- `AuditService.getLogsByAction()` — جلب سجلات حسب النوع
- `AuditService.getRecentLogs()` — جلب أحدث السجلات
- جميع وحدات المصادقة تستخدم AuditService تلقائياً

##### 4. الخدمات المشتركة (Common)

**PrismaService** — اتصال قاعدة البيانات:
- `@Global()` module متاح في جميع الوحدات
- اتصال تلقائي عند بدء التطبيق وقطع عند الإيقاف
- يستخدم نفس مخطط Prisma الموجود في الجذر

**RedisService** — اتصال Redis:
- `@Global()` module متاح في جميع الوحدات
- `get/set/del/incr/expire/exists` — عمليات أساسية
- `checkRateLimit()` — فحص Rate Limit عبر INCR + EXPIRE
- `cacheOrGet()` — تخزين مؤقت مع TTL (get from cache or set from factory)
- إعادة محاولة تلقائية عند فشل الاتصال

**AuthGuard** — حماية المسارات:
- قراءة `roua_session` من الكوكيز أو `Authorization` header
- فحص الجلسة في قاعدة البيانات عبر Prisma
- حذف الجلسات منتهية الصلاحية تلقائياً
- إرفاق بيانات المستخدم بالطلب (`request.user`)

##### 5. ربط الواجهة الأمامية (Next.js ↔ NestJS)

**API Proxy في Next.js:**
- تم إضافة `rewrites()` في `next.config.ts`:
  - `/api/exchange/*` → `http://localhost:3001/api/exchange/*`
  - `/api/ai/*` → `http://localhost:3001/api/ai/*`
  - `/api/portfolio/*` → `http://localhost:3001/api/portfolio/*`
- ملفات تعريف الارتباط (Cookies) تُمرر تلقائياً عبر البروكسي

**صفحة لوحة القيادة (`/dashboard`):**
- فحص المصادقة تلقائياً — إعادة توجيه لصفحة الهبوط إذا لم يكن مسجلاً
- شريط جانبي (Sidebar) مع أقسام: لوحة القيادة، الأسواق، سيمفونية الذكاء، المحفظة، الأخبار، الإعدادات
- بطاقات إحصائية: الأسواق المتابعة، نماذج الذكاء، المحفظة، الخطة
- معلومات المستخدم مع مستوى الاشتراك (مجاني/متميز/مؤسسي)
- تصميم RTL عربي متجاوب

**مكون MarketTicker:**
- عرض أسعار حية لـ 7 رموز: AAPL, MSFT, GOOGL, TSLA, AMZN, EUR/USD, BTC/USD
- تحديث تلقائي كل 5 ثوانٍ (قابل للتخصيص)
- بطاقات تفاعلية مع:
  - السعر الحالي بالعملة المحلية
  - نسبة التغير مع أيقونة صعود/هبوط
  - أعلى/أدنى سعر وحجم التداول
  - اسم البورصة ومصدر البيانات
- زر إيقاف مؤقت/استئناف التحديث
- إعادة محاولة تلقائية عند فشل الطلب
- رسالة تحذير عند عدم تعيين مفتاح API
- حركات Framer Motion للبطاقات

**مخطط سيمفونية الذكاء الاصطناعي:**
- عرض النماذج الستة كبطاقات مع حالة "قادم"
- Gemini 2.5 Pro, Groq/Llama 3, GLM-4, Ollama Cloud, Claude 4.6, Twelve Data

##### 6. الحزم المشتركة (`@roua/shared`)

أنواع و DTOs مشتركة بين الواجهة والخادم:
- `UnifiedQuote` — DTO موحد للأسعار
- `UnifiedCandle` — DTO موحد للبيانات التاريخية
- `IExchangeAdapter` — واجهة محولات الأسواق
- `AuthUser` / `AuthSession` — أنواع المصادقة
- `AuditLogEntry` — نوع سجل المراجعة
- `AssetType` / `Tier` — أنواع التعداد

#### 🏗️ هيكل الملفات المنشأة/المعدلة

```
apps/api/src/
├── main.ts                              # نقطة الدخول (المنفذ 3001)
├── app.module.ts                        # الوحدة الرئيسية
├── auth/
│   ├── auth.module.ts                   # وحدة المصادقة
│   ├── auth.controller.ts               # مسارات REST
│   └── auth.service.ts                  # منطق WebAuthn + Redis
├── exchange/
│   ├── exchange.module.ts               # وحدة الأسواق
│   ├── exchange.controller.ts           # مسارات REST المحمية
│   ├── exchange.service.ts              # خدمة إدارة المحولات
│   ├── exchange.types.ts                # DTOs و IExchangeAdapter
│   └── adapters/
│       └── twelve-data.adapter.ts       # محول Twelve Data الكامل
├── ai/
│   ├── ai.module.ts                     # وحدة الذكاء (هيكل)
│   ├── ai.controller.ts                 # مسارات REST
│   └── ai.service.ts                    # خدمة AI Orchestrator (هيكل)
├── portfolio/
│   ├── portfolio.module.ts              # وحدة المحفظة
│   ├── portfolio.controller.ts          # مسارات REST المحمية
│   └── portfolio.service.ts             # خدمة إدارة المحافظ
├── audit/
│   ├── audit.module.ts                  # وحدة سجل المراجعة
│   └── audit.service.ts                 # خدمة التسجيل
└── common/
    ├── prisma/
    │   ├── prisma.module.ts             # Prisma Global Module
    │   └── prisma.service.ts            # اتصال قاعدة البيانات
    ├── redis/
    │   ├── redis.module.ts              # Redis Global Module
    │   └── redis.service.ts             # اتصال Redis + Rate Limiting + Caching
    └── guards/
        └── auth.guard.ts                # حماية المسارات بالجلسة

apps/web/src/
├── app/
│   ├── dashboard/
│   │   └── page.tsx                     # لوحة القيادة الجديدة ★
│   └── ...                              # (الملفات الموجودة بدون تغيير)
├── components/
│   └── dashboard/
│       └── market-ticker.tsx            # مكون الأسعار الحية ★

packages/shared/src/
└── index.ts                             # أنواع مشتركة ★

turbo.json                               # إعدادات Turborepo ★
```

#### ⚠️ التحديات والحلول

| التحدي | الحل |
|--------|------|
| المشروع لم يكن Monorepo | تحويل كامل إلى Turborepo مع نقل Next.js إلى apps/web/ |
| Prisma schema في الجذر والـ API في apps/api | استخدام مسار مطلق في `db:generate` script |
| `@types/node` مفقود في apps/web | إضافته يدوياً إلى devDependencies |
| صلاحيات ملفات package.json (root-owned) | تعديل مباشر عبر أداة الكتابة |
| تمرير الكوكيز عبر البروكسي | تفعيل `credentials: true` في CORS + إعادة كتابة المسارات |
| Rate Limiting لـ Twelve Data | تنفيذ عبر Redis INCR+EXPIRE بدلاً من الذاكرة المؤقتة |
| تخزين تحديات WebAuthn | استخدام Redis بـ TTL 5 دقائق بدلاً من Map |

#### 📋 الخطوات التالية (تم إنجازها في Phase 3)

- [x] دمج Google Gemini API في AIModule
- [x] دمج Groq API في AIModule
- [x] دمج GLM-4 API في AIModule
- [x] بناء AI Orchestrator مع توجيه ذكي
- [x] إضافة WebSocket للأسعار الحية (Socket.IO)
- [x] إضافة محول Binance عبر CCXT
- [x] نظام إدارة مفاتيح API مشفر (AES-256-GCM)
- [ ] تشغيل Docker Compose (PostgreSQL + Redis + RabbitMQ)
- [ ] إضافة مفتاح `TWELVE_DATA_API_KEY` في .env
- [ ] اختبار مسار `GET /api/exchange/quote/AAPL` مع بيانات حقيقية
- [ ] نظام RAG مع pgvector
- [ ] تحويل Prisma من SQLite إلى PostgreSQL
- [ ] بناء صفحة المحفظة (Portfolio)
- [ ] بناء صفحة الأخبار (News Radar)

---

### الجلسة 3 — 18 أبريل 2026 — Phase 3: Live Markets, Security, and AI Orchestrator

#### ✅ تم إنجازه

##### 1. محول Binance عبر CCXT

تم إنشاء `BinanceAdapter` ينفذ واجهة `IExchangeAdapter` للأسواق المشفرة:

- **المكتبة**: `ccxt` — مكتبة موحدة لـ 100+ بورصة مشفرة
- **الرموز المدعومة**: `BTC/USDT`, `ETH/USDT`, `SOL/USDT`, إلخ.
- **التخزين المؤقت عبر Redis**:
  - الأسعار: TTL 3 ثوانٍ (العملات المشفرة تتغير بسرعة)
  - البيانات التاريخية: TTL دقيقة واحدة
- **Rate Limiting**: 100 طلب/دقيقة (حفاظياً من 1200 المسموحة)
- **تحويل الفترات الزمنية**: `1min` → `1m`, `1day` → `1d`, إلخ.
- **التوجيه التلقائي**: الرموز التي تحتوي `/` (مثل BTC/USDT) → Binance، البقية → TwelveData

```typescript
// استخدام CCXT
const exchange = new ccxt.binance({ enableRateLimit: true });
const ticker = await exchange.fetchTicker('BTC/USDT');
const ohlcv = await exchange.fetchOHLCV('BTC/USDT', '1h', since);
```

**الملف**: `apps/api/src/modules/exchange/adapters/binance.adapter.ts`

##### 2. بوابة WebSocket للأسعار الحية

تم إنشاء `ExchangeGateway` مع Socket.IO للأسعار الفورية:

- **المسار**: `/exchange` namespace
- **الأحداث (Events)**:
  - `subscribe` — اشتراك في رمز معين
  - `unsubscribe` — إلغاء الاشتراك
  - `ticker` — دفع بيانات السعر المحدثة
  - `ticker:error` — إخطار بالخطأ
- **دورة التحديث**: كل 5 ثوانٍ للرموز المشترك فيها
- **إدارة الاشتراكات**:
  - تتبع `socketId → Set<symbol>` لكل عميل
  - تتبع `symbol → Set<socketId>` للبث الفعال
  - بدء/إيقاف دورة التحديث تلقائياً
- **Redis Pub/Sub**: تخزين مؤقت لبيانات WebSocket عبر Redis
- **CORS**: مُكوّن لقبول اتصالات من `localhost:3000`

**Hook في الواجهة الأمامية**: `useWebSocketTicker`
- اتصال تلقائي عبر Socket.IO
- إعادة اتصال تلقائية (10 محاولات، تأخير 2 ثانية)
- الاشتراك/إلغاء اشتراك ديناميكي
- Fallback تلقائي لـ HTTP polling عند فصل WebSocket
- مؤشر حالة الاتصال (مباشر WS / استطلاع)

**تحديث مكون MarketTicker**:
- يستخدم WebSocket كالمصدر الأساسي
- HTTP polling كـ fallback تلقائي
- مؤشر حالة الاتصال (أخضر = مباشر، أصفر = استطلاع)
- إضافة رموز العملات المشفرة: `BTC/USDT`

**الملفات**:
- `apps/api/src/modules/exchange/gateway/exchange.gateway.ts`
- `apps/web/src/hooks/useWebSocketTicker.ts`
- `apps/web/src/components/dashboard/market-ticker.tsx` (محدّث)

##### 3. إدارة مفاتيح API المشفرة (AES-256-GCM)

تم بناء نظام آمن لإدارة مفاتيح بورصات المشفر:

**نموذج قاعدة البيانات (`ExchangeCredential`)**:
- `encryptedApiKey` — مفتاح API مشفر بـ AES-256-GCM
- `encryptedSecret` — المفتاح السري مشفر بـ AES-256-GCM
- `iv` — متجه التهيئة (Initialization Vector) بالنظام الست عشري
- `authTag` — علامة المصادقة GCM بالنظام الست عشري
- `permissions` — JSON: `["read", "trade"]` — لا يُسمح بـ "withdraw" أو "transfer"
- قيد فريد: `@@unique([userId, exchange, label])`

**خدمة الاعتمادات (`CredentialsService`)**:
- **التشفير**: AES-256-GCM مع مفتاح 256-bit من `ENCRYPTION_KEY`
- **مبدأ Non-Custodial**: رفض فوري لأي مفتاح يحتوي على صلاحيات:
  - `withdraw` / `withdrawal`
  - `transfer` / `internaltransfer`
- **التحقق من المفاتيح**: اختبار المفتاح مقابل البورصة الفعلية عبر CCXT قبل التخزين
- **سجل المراجعة**: تسجيل كل عملية (إضافة، رفض، حذف) في AuditLog
- **فك التشفير**: فقط للاستخدام الداخلي (مثل إجراء صفقات)، لا يُرسل للواجهة أبداً

**مسارات REST**:
- `GET /api/portfolio/credentials` — جلب مفاتيح المستخدم (بدون بيانات مشفرة)
- `POST /api/portfolio/credentials` — إضافة مفتاح جديد (مع التحقق والتشفير)
- `DELETE /api/portfolio/credentials/:id` — حذف مفتاح
- جميع المسارات محمية بـ `AuthGuard` + Rate Limiting (5 إضافات/دقيقة)

**صفحة الإعدادات** (`/dashboard/settings/exchange`):
- واجهة عربية RTL كاملة لإدارة المفاتيح
- اختيار البورصة: Binance, KuCoin, Bybit, OKX, Gate.io
- نموذج إضافة مفتاح مع تحقق وتشفير فوري
- عرض قائمة المفاتيح مع حالة الصلاحية والصلاحيات
- رسالة تحذيرية عن مبدأ Non-Custodial
- حذف مفاتيح مع تأكيد
- حركات Framer Motion

**الملفات**:
- `apps/api/src/modules/portfolio/credentials/credentials.module.ts`
- `apps/api/src/modules/portfolio/credentials/credentials.service.ts`
- `apps/api/src/modules/portfolio/credentials/credentials.controller.ts`
- `apps/web/src/app/dashboard/settings/exchange/page.tsx`

##### 4. منسق الذكاء الاصطناعي (AI Orchestrator)

تم بناء نظام ذكاء اصطناعي متعدد النماذج مع توجيه ذكي:

**خدمة Groq (Llama 3.3 70B)**:
- الأسرع في الاستدلال — مثالي لتحليل المشاعر الفوري
- درجة الثقة: 0.8
- درجة الحرارة: 0.3 (استجابات دقيقة ومتسقة)
- نموذج: `llama-3.3-70b-versatile`
- API: `https://api.groq.com/openai/v1/chat/completions`

**خدمة Gemini (2.0 Flash)**:
- الأقدر — مثالي للتحليل الإبداعي والاستراتيجي
- درجة الثقة: 0.9
- درجة الحرارة: 0.4 (استجابات إبداعية منظمة)
- نموذج: `gemini-2.0-flash`
- API: `https://generativelanguage.googleapis.com/v1beta/models`

**خدمة GLM-4 (Zhipu AI)**:
- الأمثل للعربية — سياق طويل 200k token
- درجة الثقة: 0.85
- درجة الحرارة: 0.4
- نموذج: `glm-4`
- API: `https://open.bigmodel.cn/api/paas/v4/chat/completions`
- مطالبة نظام عربية متخصصة بالتحليل المالي

**منسق الذكاء الاصطناعي (`AIOrchestratorService`)**:

| نوع المهمة | النموذج الأساسي | البديل 1 | البديل 2 |
|------------|----------------|----------|----------|
| `sentiment` (مشاعر) | Groq | GLM | Gemini |
| `market_analysis` (تحليل أسواق) | Gemini | GLM | Groq |
| `prediction` (توقعات) | GLM-4 | Gemini | Groq |
| `general` (عام) | Gemini | Groq | GLM |

- **سلسلة البديل**: أساسي → بديل 1 → بديل 2
- **كشف Stub**: إذا عاد نموذج بدون مفتاح API (confidence = 0)، ينتقل تلقائياً للتالي
- **تحليل متعدد النماذج**: `analyzeWithAllModels()` — تشغيل جميع النماذج بالتوازي
- **رسائل نظام متخصصة**: كل نموذج له مطالبة نظام مختلفة حسب نوع المهمة واللغة

**مسارات REST**:
- `POST /api/ai/analyze` — تحليل بنموذج واحد (أمثل تلقائياً) — 10 طلبات/دقيقة
- `POST /api/ai/analyze/all` — تحليل بجميع النماذج — 3 طلبات/دقيقة
- `GET /api/ai/models` — حالة النماذج المتاحة
- `GET /api/ai/sentiment?symbol=BTC/USDT` — تحليل مشاعر سريع
- جميع المسارات محمية بـ `AuthGuard`

**الملفات**:
- `apps/api/src/modules/ai/ai.module.ts`
- `apps/api/src/modules/ai/ai.controller.ts`
- `apps/api/src/modules/ai/services/ai-orchestrator.service.ts`
- `apps/api/src/modules/ai/services/groq.service.ts`
- `apps/api/src/modules/ai/services/gemini.service.ts`
- `apps/api/src/modules/ai/services/glm.service.ts`

##### 5. تنظيف الكود

- حذف الوحدات القديمة المكررة (dead code):
  - `src/exchange/` (استبدلت بـ `src/modules/exchange/`)
  - `src/ai/` (استبدلت بـ `src/modules/ai/`)
  - `src/portfolio/` (استبدلت بـ `src/modules/portfolio/credentials/`)
- تحديث `app.module.ts` لاستيراد الوحدات من المسارات الصحيحة فقط
- إصلاح رموز العملات المشفرة: `BTC/USD` → `BTC/USDT` (متوافق مع Binance)

#### 🏗️ هيكل الملفات بعد Phase 3

```
apps/api/src/
├── main.ts                              # نقطة الدخول (المنفذ 3001)
├── app.module.ts                        # الوحدة الرئيسية (محدّثة)
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   └── auth.service.ts
├── modules/                             # ★ هيكل تنظيمي جديد
│   ├── exchange/
│   │   ├── exchange.module.ts           # يسجل BinanceAdapter + TwelveDataAdapter
│   │   ├── exchange.controller.ts       # مسارات REST
│   │   ├── exchange.service.ts          # توجيه تلقائي حسب الرمز
│   │   ├── exchange.types.ts            # DTOs + IExchangeAdapter
│   │   ├── adapters/
│   │   │   ├── twelve-data.adapter.ts   # أسهم، فوركس، سلع
│   │   │   └── binance.adapter.ts       # ★ عملات مشفرة عبر CCXT
│   │   └── gateway/
│   │       └── exchange.gateway.ts      # ★ WebSocket للأسعار الفورية
│   ├── ai/
│   │   ├── ai.module.ts                # يسجل 3 خدمات + منسق
│   │   ├── ai.controller.ts            # مسارات REST محمية
│   │   └── services/
│   │       ├── ai-orchestrator.service.ts  # ★ توجيه ذكي للنماذج
│   │       ├── groq.service.ts             # ★ Llama 3.3 70B
│   │       ├── gemini.service.ts           # ★ Gemini 2.0 Flash
│   │       └── glm.service.ts              # ★ GLM-4 (Zhipu AI)
│   └── portfolio/
│       └── credentials/
│           ├── credentials.module.ts    # ★ وحدة إدارة المفاتيح
│           ├── credentials.service.ts   # ★ تشفير AES-256-GCM
│           └── credentials.controller.ts # ★ مسارات REST آمنة
├── audit/
│   ├── audit.module.ts
│   └── audit.service.ts
└── common/
    ├── prisma/
    │   ├── prisma.module.ts
    │   └── prisma.service.ts
    ├── redis/
    │   ├── redis.module.ts
    │   └── redis.service.ts
    └── guards/
        └── auth.guard.ts

apps/web/src/
├── app/
│   ├── dashboard/
│   │   ├── page.tsx                    # لوحة القيادة (محدّثة)
│   │   └── settings/
│   │       └── exchange/
│   │           └── page.tsx            # ★ صفحة مفاتيح البورصات
│   └── ...
├── components/
│   └── dashboard/
│       └── market-ticker.tsx           # ★ WebSocket + Fallback Polling
├── hooks/
│   └── useWebSocketTicker.ts           # ★ Hook للاتصال WebSocket
└── ...

prisma/schema.prisma                    # + ExchangeCredential model ★
```

#### ⚠️ التحديات والحلول في Phase 3

| التحدي | الحل |
|--------|------|
| كود مكرر (وحدات قديمة وجديدة) | حذف الوحدات القديمة وتوحيد الاستيرادات |
| `BTC/USD` لا يعمل مع Binance | تغيير إلى `BTC/USDT` (الزوج القياسي) |
| تشفير مفاتيح API بأمان | AES-256-GCM مع IV عشوائي 96-bit + AuthTag |
| رفض صلاحيات السحب/التحويل | فحص permissions بعد التحقق من المفتاح |
| سلسلة البديل في AI Orchestrator | تجربة النماذج بالترتيب مع كشف stub (confidence=0) |
| WebSocket + HTTP Fallback | Hook ذكي يتحول تلقائياً عند فقدان الاتصال |

#### 📋 الخطوات التالية (محدّثة بعد Phase 4)

- [ ] تشغيل Docker Compose (PostgreSQL + Redis + RabbitMQ)
- [ ] إضافة مفاتيح API الفعلية في .env
- [x] نظام RAG مع EmbeddingService
- [x] توليد إشارات تداول ذكية (Signal Generation)
- [x] تحليل مخاطر المحفظة (Portfolio Sanctuary)
- [x] صفحة الإشارات + صفحة الملاذ
- [ ] تحويل Prisma من SQLite إلى PostgreSQL + pgvector
- [ ] بناء صفحة الأخبار (News Radar)
- [ ] إضافة محولات أخرى (KuCoin, Bybit, OKX)
- [ ] تنفيذ الصفقات (Trade Execution)

---

### الجلسة 4 — 18 أبريل 2026 — Phase 4: RAG, Signals, and Portfolio Sanctuary

#### ✅ تم إنجازه

##### 1. نظام RAG (توليد معزز بالاسترجاع)

تم بناء طبقة ذكية مرجعية تمكّن AI Orchestrator من الاستفادة من أرشيف الأخبار:

**EmbeddingService** — تحويل النص إلى تضمينات متجهية:
- نموذج: `sentence-transformers/all-MiniLM-L6-v2` (384-بعد)
- واجهة HuggingFace Inference API (مع مفتاح `HUGGINGFACE_API_KEY`)
- Fallback: تضمينات مبنية على hash للتطوير بدون API
- حساب التشابه الجيبي (`cosineSimilarity`) للبحث الدلالي
- دعم الدفعات (`embedBatch`) لتحسين الأداء

**RagService** — استرجاع السياق المعزز:
- `retrieveRelevantContext(query, limit)`: البحث عن مقالات ذات صلة
  - تحويل الاستعلام إلى embedding
  - بحث بكلمات مفتاحية مسبق (pre-filtering) لتقليل مساحة البحث
  - حساب التشابه الدلالي وترتيب النتائج
  - عتبة صلة: 0.1 (minimum relevance threshold)
- `storeArticle()`: تخزين مقالة مع embedding
- `getArchiveStats()`: إحصائيات الأرشيف
- استخراج كلمات مفتاحية ذكي مع دعم العربية والإنجليزية

**تحديث AIOrchestratorService**:
- حقن `RagService` اختيارياً (`@Optional()`)
- قبل إرسال أي طلب لنموذج AI، يتم استرجاع سياق من أرشيف الأخبار
- السياق يُضاف إلى بداية الموجه (prompt) المرسل للنموذج
- أنواع مهام جديدة: `signal_generation`, `risk_analysis`
- RAG غير معيق (non-blocking): يُرجع استجابة فارغة عند الفشل

**الملفات**:
- `apps/api/src/modules/ai/services/embedding.service.ts`
- `apps/api/src/modules/ai/services/rag.service.ts`
- `apps/api/src/modules/ai/services/ai-orchestrator.service.ts` (محدّث)
- `apps/api/src/modules/ai/ai.module.ts` (محدّث)

##### 2. توليد إشارات "رؤى" (Roua Signals)

تم بناء نظام إشارات تداول ذكية متعدد الأبعاد:

**نموذج Signal في Prisma**:
- `pair`: زوج التداول (مثل `BTC/USDT`)
- `action`: BUY / SELL / WAIT
- `confidence`: نسبة الثقة (0-100)
- `reason`: شرح مفصل بالعربية
- `entryPrice`, `stopLoss`, `takeProfit`: مستويات السعر
- `status`: ACTIVE / EXPIRED / EXECUTED / CANCELLED
- `expiresAt`: انتهاء الصلاحية (24 ساعة تلقائياً)

**SignalService** — تدفق توليد الإشارة:
1. جلب بيانات السوق الحية من ExchangeService
2. استرجاع أخبار ذات صلة من RagService
3. تحليل المشاعر عبر GroqService (الأسرع)
4. توليد إشارة شاملة عبر AIOrchestratorService
5. تحليل رد AI واستخراج: الإجراء، الثقة، الأسعار، السبب
6. حفظ الإشارة في قاعدة البيانات مع سجل مراجعة

**مسارات API**:
- `POST /api/signals/generate/:pair` — توليد إشارة (5/دقيقة)
- `GET /api/signals/active` — الإشارات النشطة
- `GET /api/signals/history` — سجل الإشارات
- `DELETE /api/signals/:id` — إلغاء إشارة

**الملفات**:
- `apps/api/src/modules/signal/signal.module.ts`
- `apps/api/src/modules/signal/signal.service.ts`
- `apps/api/src/modules/signal/signal.controller.ts`
- `prisma/schema.prisma` (أضيف Signal + SignalAction + SignalStatus)

##### 3. ملاذ المحفظة (Portfolio Sanctuary)

تم بناء نظام تحليل مخاطر شامل عبر جميع الحسابات المرتبطة:

**SanctuaryService** — تدفق التحليل:
1. جلب جميع مفاتيح API المشفرة للمستخدم
2. فك تشفير المفاتيح وجلب الأرصدة من كل بورصة عبر CCXT
3. تجميع أصول المحفظة اليدوية من قاعدة البيانات
4. حساب مقاييس المخاطر:
   - **مخاطر التركيز**: HHI (Herfindahl-Hirschman Index) — هل أكثر من 20% في أصل واحد؟
   - **درجة التنويع**: مقلوب مخاطر التركيز
   - **VaR (القيمة المعرضة للمخاطر)**: أقصى خسارة متوقعة بثقة 95%
   - **التقلب المقدر**: تقلب المحفظة السنوي
5. إرسال تقرير موجز إلى AIOrchestratorService لصياغة توصيات بالعربية
6. إرجاع `RiskReport` شامل

**RiskReport** يحتوي على:
- `summary` — ملخص عربي
- `riskScore` — درجة المخاطر (0-100)
- `positions[]` — تفاصيل المراكز مع الأوزان
- `metrics` — مقاييس المخاطر التفصيلية
- `recommendations[]` — توصيات قابلة للتنفيذ
- `aiAnalysis` — تحليل الذكاء الاصطناعي الكامل

**مسار API**:
- `GET /api/portfolio/sanctuary` — تحليل المخاطر (5/دقيقة)

**الملفات**:
- `apps/api/src/modules/portfolio/sanctuary/sanctuary.service.ts`
- `apps/api/src/modules/portfolio/sanctuary/sanctuary.controller.ts`
- `apps/api/src/modules/portfolio/portfolio.module.ts` (جديد — يجمع Credentials + Sanctuary)

##### 4. واجهة المستخدم

**صفحة `/dashboard/signals`** — إشارات رؤى:
- توليد إشارة سريعة لـ 6 أزواج (BTC, ETH, SOL, AAPL, TSLA, GOLD)
- عرض الإشارات النشطة مع:
  - إجراء الشراء/البيع/الانتظار بألوان مميزة
  - نسبة الثقة مع لون ديناميكي
  - مستويات سعر الدخول / وقف الخسارة / جني الأرباح
  - شرح AI المفصل بالعربية
  - وقت الانتهاء المتبقي
- أزرار: تجديد، تنفيذ (قريباً)، إلغاء
- تحذير: الإشارات لأغراض تعليمية فقط

**صفحة `/dashboard/sanctuary`** — ملاذ المحفظة:
- بطاقة مستوى المخاطر (منخفض/متوسط/مرتفع) مع الدرجة
- 4 مقاييس رئيسية: التركيز، التنويع، VaR، التقلب
- قائمة المراكز مع الأوزان والتغيرات
- التوصيات القابلة للتنفيذ
- تحليل الذكاء الاصطناعي الكامل
- زر إعادة التحليل
- تحذير: التحليل لأغراض تعليمية فقط

**تحديث لوحة القيادة**:
- إضافة "إشارات رؤى" و"ملاذ المحفظة" في الشريط الجانبي
- روابط تنقل بين الصفحات

**الملفات**:
- `apps/web/src/app/dashboard/signals/page.tsx`
- `apps/web/src/app/dashboard/sanctuary/page.tsx`
- `apps/web/src/app/dashboard/page.tsx` (محدّث)
- `apps/web/next.config.ts` (أضيف `/api/signals/*` proxy)

#### 🏗️ هيكل الملفات بعد Phase 4

```
apps/api/src/
├── modules/
│   ├── ai/
│   │   ├── ai.module.ts               # + EmbeddingService + RagService
│   │   ├── ai.controller.ts
│   │   └── services/
│   │       ├── ai-orchestrator.service.ts  # ★ RAG integration
│   │       ├── groq.service.ts             # + signal_generation + risk_analysis types
│   │       ├── gemini.service.ts
│   │       ├── glm.service.ts
│   │       ├── embedding.service.ts        # ★ NEW: Text → Vector
│   │       └── rag.service.ts              # ★ NEW: Context retrieval
│   ├── signal/                             # ★ NEW Module
│   │   ├── signal.module.ts
│   │   ├── signal.service.ts
│   │   └── signal.controller.ts
│   ├── portfolio/
│   │   ├── portfolio.module.ts             # ★ NEW: Combines Credentials + Sanctuary
│   │   ├── credentials/
│   │   │   ├── credentials.module.ts
│   │   │   ├── credentials.service.ts
│   │   │   └── credentials.controller.ts
│   │   └── sanctuary/                     # ★ NEW
│   │       ├── sanctuary.service.ts
│   │       └── sanctuary.controller.ts
│   └── exchange/ (بدون تغيير)

prisma/schema.prisma                     # + Signal model + SignalAction/Status enums

apps/web/src/app/dashboard/
├── page.tsx                             # ★ محدّث: روابط جديدة
├── signals/
│   └── page.tsx                         # ★ NEW
├── sanctuary/
│   └── page.tsx                         # ★ NEW
└── settings/exchange/ (بدون تغيير)
```

#### ⚠️ التحديات والحلول في Phase 4

| التحدي | الحل |
|--------|------|
| `signal_generation` / `risk_analysis` غير معرّف في AIAnalysisRequest | إضافة النوعين الجديدين إلى union type |
| `totalValue` غير معرّف في `_generateRecommendations` | حساب محلي من `positions.reduce()` |
| HuggingFace API قد لا يكون متاحاً | تضمينات hash-based كـ fallback للتطوير |
| البحث المتجهي في SQLite | بحث بكلمات مفتاحية + تشابه دلالي في الذاكرة (حتى الانتقال لـ pgvector) |
| RAG قد يفشل | `@Optional()` injection + non-blocking: إرجاع سياق فارغ عند الفشل |

#### 📋 الخطوات التالية

- [ ] تشغيل Docker Compose (PostgreSQL + Redis + RabbitMQ)
- [ ] إضافة مفاتيح API الفعلية في .env
- [ ] تحويل Prisma من SQLite إلى PostgreSQL + pgvector
- [ ] تنفيذ الصفقات (Trade Execution)
- [ ] بناء صفحة الأخبار (News Radar)
- [ ] إضافة محولات أخرى (KuCoin, Bybit, OKX)
- [ ] نظام الإشعارات

## المرحلة الرابعة: الإطلاق — الأشهر 10-12

*(لم تبدأ بعد)*
