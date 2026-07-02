# Roua Trading — سجل الجلسات والحالة الحالية

> **لأي جلسة Claude جديدة: اقرأ هذا الملف بالكامل قبل أي شيء آخر.**
> هذا الملف هو نقطة الانطلاق الرسمية للمشروع — يُحدَّث في نهاية كل جلسة عمل.

**آخر تحديث:** 2 يوليو 2026
**حالة المشروع:** إنتاج فعلي — أموال حقيقية، تعامل بحذر شديد مع أي تعديل.

---

## 1. قواعد عمل ثابتة (لا تُكسر أبداً)

- **لا `git push --force` على `main` إطلاقاً** — يُعطّل الوكلاء الحيّين على Railway.
- **فحص عميق للكود الفعلي قبل أي افتراض أو إصلاح.** جابر صريح: "لا تخمين ولا افتراضات — فحص الكود أولاً". كل خطأ يُكتشف لاحقاً يُضيّع أياماً من المراقبة.
- **لا تثق بملخصات الجلسات السابقة دون تحقق بـ `grep`.** مثال: "V425" كان مذكوراً في ملخص سابق كحارس كامل — لم يكن موجوداً في الكود إطلاقاً.
- **أي تغيير في `schema.prisma` يجب أن يرافقه migration SQL في نفس الـ commit.**
- **فحص الأنواع الفعلية قبل الكتابة:** في جلسة 2 يوليو، سبّبت أخطاء TypeScript في اللاسع بسبب عدم فحص `BinancePriceUpdate` و`OrderSide`/`OrderType` مسبقاً — اضطر جابر لإصلاح 10 commits في 10 ساعات.
- الفروع تُنشأ منفصلة، لكن جابر يطلب أحياناً "ادفع وادمج مباشرة" — الدمج العادي (non-force) مقبول.

---

## 2. البنية التقنية (مرجع سريع)

| الخدمة | التقنية | ملاحظات |
|---|---|---|
| Frontend | Next.js (Railway) | port 8080 |
| Backend | NestJS (Railway) | port 3001 |
| DB | PostgreSQL + Prisma | Railway managed |
| Cache | Redis | Railway managed |
| Queue | RabbitMQ | Railway managed |
| File Storage | Cloudflare R2 | صور ولقطات |
| Market Data | OANDA + Binance + TwelveData + Finnhub | |
| AI Models | 8 نماذج: Groq, Gemini, GLM, Bedrock, HF, OpenRouter, Ollama | |
| المستودع | `github.com/jsiadyarslan-lab/roua-trading` (main) | |
| الإنتاج | `https://roua-trading-production.up.railway.app/` | |

**نقطة حرجة:** وكيل الإصلاح ووكيل المراقبة على Railway — **كودهما في `agents/self-healing-agent/` و`agents/monitor-agent/`** (مجلد `agents/` في جذر المستودع، ليس في `apps/api/src/agents/`). يستخدم وكيل الإصلاح: `GITHUB_ACCESS_TOKEN`, `TELEGRAM_TOKEN`, `RAILWAY_API_TOKEN`, `GLM_API_KEY`.

---

## 3. هيكل نظام التداول الآلي (الحالة الحالية — 2 يوليو 2026)

النظام مكوّن من ثلاث طبقات زمنية متكاملة:

### اللاسع (`apps/api/src/agents/lazic/`)
- **الأفق:** ثوانٍ إلى دقائق
- **الإشارة:** Order Book Imbalance (OBI) — ضغط السوق اللحظي
- **SL/TP:** كريبتو: 0.2% SL / 0.5% TP | فوركس: 0.05% SL / 0.1% TP
- **حجم الصفقة:** risk% × balance ÷ SL distance، step size: كريبتو=0.01، فوركس=100
- **شروط الأمان:** OBI ثابت 3 ticks متتالية + spread ≤ 1.5× المتوسط + لا مركز مفتوح على نفس الزوج (DB check)
- **إعدادات قابلة للتخصيص لكل مستخدم:** `obiThreshold`, `maxSpreadMultiplier`, `riskPerTradePct`, `cooldownMs`, `maxDailyTrades`, `maxOpenPositions`
- **حقل DB:** `AgentSettings.lazicEnabled` (migration: `20260701000000_add_lazic_enabled`)
- **أداء أول جلسة (2 يوليو 2026):** 15 صفقة، 60% نسبة نجاح، $2.36 ربح صافٍ، R/R=1.02
- **ملاحظة مهمة:** BUY: $2.74 ربح | SELL: -$0.38 — OBI أقوى في إشارات الشراء. يحتاج مراقبة أسبوع لتحديد هل هذا نمط ثابت.
- **الاسم الصحيح:** اللاسع (وليس اللاذع — خطأ في الجلسة السابقة)

### المنفذ الذكي (`apps/api/src/modules/ai/smart-executor/`)
- **الأفق:** ساعات (M1/M5/M15)
- **الإشارة:** المجلس الاستراتيجي (8 نماذج AI)
- **SL/TP:** ATR-based بعد V427 (1 يوليو 2026):
  - M1: 0.5× H1 ATR | M5: 1.0× H1 ATR | M15: 1.5× H1 ATR
  - TP = 2.0× SL دائماً (R:R = 1:2)
  - Fallback: TIMEFRAME_RR الثابت إذا ATR غير متوفر
- **المشكلة المحلولة:** كان SL ثابت 2% يُسبب احتفاظ صفقات الفوركس لأيام (USD/JPY: 14 يوم!) لأن تذبذب الفوركس 0.4-0.8% يومياً مقابل 2-5% للكريبتو

### الوكيل الآلي (`apps/api/src/agents/autonomous-trader/`)
- **الأفق:** أيام
- **الإشارة:** تحليل متعدد الأطر + RL trade manager
- **الحد الأدنى للاحتفاظ:** 48 ساعة (مع jitter 0.85x-1.25x لمنع الإغلاق الجماعي)

---

## 4. الإصلاحات المنفّذة هذه الجلسة (1-2 يوليو 2026)

### V426 — إغلاق المستخدم + توزيع الأسقف الزمنية
**الملف:** `apps/api/src/modules/trading/trading.service.ts`
- أُضيف `!isUserInitiated` لحارس V423 — المستخدم الحقيقي يستطيع إغلاق صفقاته متى شاء
- `_jitteredMinHours()` — hash حتمي لكل صفقة يُنتج معامل 0.85x-1.25x على أسقف V423/V237
- تسجيل جنائي دائم في `AuditLog` لكل محاولة إغلاق (محجوبة أو ناجحة)

### V427 — ATR-based SL/TP للمنفذ الذكي
**الملف:** `apps/api/src/modules/ai/smart-executor/smart-executor.service.ts`
- استبدل TIMEFRAME_RR الثابت بـ H1 ATR × مضاعف الإطار
- ATR مُرفَّع من استدعاء `detectRegime()` الموجود — لا API call إضافي

### اللاسع — البناء الكامل
**المجلد:** `apps/api/src/agents/lazic/`
- 4 ملفات: `lazic.types.ts`, `lazic.service.ts`, `lazic.controller.ts`, `lazic.module.ts`
- Migration: `prisma/migrations/20260701000000_add_lazic_enabled/`
- Widget في الواجهة: `apps/web/src/components/dashboard/LazicPanel.tsx`
- موقعه في القرار التشغيلي: **بين المنفذ الذكي والوكيل الآلي**
- ⚠️ تنبيه: أخطاء TypeScript في الكود الأولي أجبرت جابر على 10 commits إضافية لإصلاحها — السبب: عدم فحص `BinancePriceUpdate` و`PlaceOrderRequest` قبل الكتابة

---

## 5. قيد المراقبة (لا تُعدّل حتى تُجمع بيانات)

- **اللاسع:** مراقبة أسبوع على الأقل قبل أي تعديل في الإعدادات
- **V427 (ATR SL/TP):** مراقبة 3-7 أيام لمقارنة مدة صفقات المنفذ قبل/بعد
- **مشكلة SELL في اللاسع:** BUY يربح، SELL يخسر في أول جلسة — قد يكون ظرف السوق يوم 2 يوليو، يحتاج تأكيداً

---

## 6. مفتوح ولم يُعالج بعد

1. **وكيل الإصلاح ووكيل المراقبة:** سلوكهما الداخلي موثّق جزئياً الآن (انظر قسم 2)، لكن `docs/external-agents.md` لم يُكتب بعد
2. **ثغرة exchange-sync:** `exchange-sync.service.ts:387` و`credentials.service.ts:2416/2494` يُغلقان صفقات مباشرة في DB بدون الحراس
3. **تنسيق بين الطبقات الثلاث:** اللاسع والمنفذ والوكيل يعملون مستقلين — قد يتعارض اتجاه اللاسع مع الوكيل على نفس الأصل
4. **AuditLog query:** بعد أيام مراقبة، استعلم عن `POSITION_CLOSE_BLOCKED` لتحديد هوية المُغلِق المجهول

```sql
SELECT "createdAt", "ipAddress", "userAgent", "details"
FROM "AuditLog"
WHERE action = 'POSITION_CLOSE_BLOCKED'
ORDER BY "createdAt" DESC
LIMIT 50;
```

---

## 7. الرؤية العامة للمشروع

منصة تداول احترافية بُنيت في 4 أشهر بدون خبرة برمجية سابقة. تتميز عن المنافسين بـ:
- **طبقات زمنية ثلاث متكاملة** (ثوانٍ/ساعات/أيام) — نادر في السوق
- **مجلس استراتيجي من 8 نماذج AI** بدل نموذج واحد
- **الإشارات أثبتت دقتها بأموال حقيقية** — ليس backtesting
- المشكلة الأساسية كانت في إدارة الصفقة (SL/TP/توقيت الإغلاق)، وليس في جودة الإشارة — وهذا أسهل بكثير في الحل

---

## كيف تُحدَّث هذه الوثيقة
في نهاية أي جلسة عمل: ماذا اكتُشف بالفحص الفعلي، ماذا نُفّذ وأين (مسار + commit)، الحالة الحالية، والخطوة التالية.
