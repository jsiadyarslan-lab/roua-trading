# Roua Trading (رؤى)

> منصة تداول ذكية متعددة الأصول مع تحليل AI، شارت احترافي، وتنفيذ تلقائي.

**الإنتاج**: https://roua-trading-production.up.railway.app/
**المستودع**: https://github.com/jsiadyarslan-lab/roua-trading

---

## 🚀 للمطورين الجدد — ابدأ هنا

### الإعداد الأول (مرة واحدة بعد الاستنساخ)

```bash
# 1. تثبيت الاعتماديات
npm ci --legacy-peer-deps

# 2. تثبيت pre-commit hook (إلزامي!)
bash scripts/install-hooks.sh

# 3. قراءة قواعد المساهمة
cat CONTRIBUTING.md

# 4. فحص حالة الأخطاء الحالية
npx tsx scripts/verify-bugs.ts
```

### القاعدة الذهبية

> **أي تعديل على كود (.ts/.tsx) يجب أن يُصاحبه تحديث `BUGS.md` — بدون استثناءات.**

هذا يشمل: إصلاح خطأ، إضافة ميزة، تحسين أداء، إعادة هيكلة، حتى تعديل سطر واحد.

### كيف تعمل؟ (3 طبقات حماية)

```
┌─────────────────────────────────────────────────────────────┐
│  الطبقة 1: pre-commit hook (محلي، قبل الـ commit)           │
│  ├─ يُثبَّت تلقائياً عبر scripts/install-hooks.sh            │
│  ├─ يمنع commit أي .ts/.tsx بدون تحديث BUGS.md             │
│  └─ يعطيك تعليمات واضحة عند الفشل                           │
├─────────────────────────────────────────────────────────────┤
│  الطبقة 2: CI pipeline (GitHub Actions، عند فتح PR)         │
│  ├─ check-registry.ts: يفشل إذا كود تغيّر بدون BUGS.md      │
│  ├─ verify-bugs.ts: يفشل إذا خطأ FIXED انتكس               │
│  └─ run-regression-tests.ts: يفشل إذا اختبار فشل            │
├─────────────────────────────────────────────────────────────┤
│  الطبقة 3: لوحة بصرية (الإنتاج + localhost)                 │
│  ├─ /dashboard/chart-bugs: عرض كل الأخطاء بصرياً            │
│  └─ /api/chart-bugs: API JSON للتكامل                       │
└─────────────────────────────────────────────────────────────┘
```

### سير العمل اليومي

```bash
# 1. قبل البدء: اعرف الوضع الحالي
npx tsx scripts/verify-bugs.ts

# 2. أصلح/أضف الكود
# ... عدّل الملفات ...

# 3. حدّث BUGS.md
#    - إذا أصلحت خطأ: غيّر Status إلى FIXED + أضف Pattern (FIXED)
#    - إذا اكتشفت خطأً: أضف BUG-NNN جديد بـ Status: OPEN
#    - إذا أضفت ميزة: أضف ملاحظة في BUGS.md

# 4. أضف اختبار انحدار (إذا أصلحت خطأ)
#    apps/web/src/lib/charts/__tests__/BUG-NNN.name.spec.ts

# 5. تحقق محلياً
npx tsx scripts/verify-bugs.ts           # يجب: 0 REGRESSED
npx tsx scripts/run-regression-tests.ts  # يجب: all pass

# 6. Commit (الـ hook سيفحص تلقائياً)
git add -A
git commit -m "fix(BUG-NNN): description"
git push

# 7. افتح PR — القالب سيذكّرك بالقواعد
#    CI سيفحص تلقائياً
```

---

## 📂 هيكل المشروع

```
roua-trading/
├── apps/
│   ├── web/                    # Next.js 16 + React (الواجهة)
│   │   └── src/
│   │       ├── app/            # صفحات Next.js (App Router)
│   │       ├── components/     # مكونات React
│   │       │   └── charts/     # مكونات الشارت (RouaChart, etc.)
│   │       ├── hooks/          # React hooks
│   │       └── lib/
│   │           └── charts/     # محركات الشارت + أدوات الرسم
│   │               └── __tests__/  # اختبارات الانحدار BUG-NNN.spec.ts
│   └── api/                    # NestJS (الـ backend)
├── BUGS.md                     # ⚠️ سجل الأخطاء الدائم (إلزامي)
├── CONTRIBUTING.md             # قواعد المساهمة (اقرأها!)
├── scripts/
│   ├── verify-bugs.ts          # فاحص الأخطاء
│   ├── run-regression-tests.ts # مشغّل الاختبارات
│   ├── check-registry.ts       # فاحص تحديث BUGS.md
│   ├── install-hooks.sh        # تثبيت pre-commit hook
│   └── README.md               # دليل السكربتات
├── .github/
│   ├── workflows/
│   │   └── chart-bug-prevention.yml  # CI pipeline
│   └── PULL_REQUEST_TEMPLATE.md      # قالب PR
└── Dockerfile                  # نشر Railway
```

---

## 🧪 الأوامر المفيدة

| الأمر | الوظيفة |
|-------|---------|
| `npx tsx scripts/verify-bugs.ts` | فحص حالة كل الأخطاء (FIXED/PRESENT/REGRESSED) |
| `npx tsx scripts/run-regression-tests.ts` | تشغيل كل اختبارات الانحدار |
| `npx tsx scripts/verify-bugs.ts --bug BUG-001` | فحص خطأ واحد |
| `npx tsx scripts/verify-bugs.ts --verbose` | تفاصيل كاملة |
| `npx tsx scripts/run-regression-tests.ts --bug BUG-001 --verbose` | اختبار واحد + تفاصيل |
| `bash scripts/install-hooks.sh` | تثبيت pre-commit hook |

### من المتصفح
- **لوحة الأخطاء**: https://roua-trading-production.up.railway.app/dashboard/chart-bugs
- **API**: https://roua-trading-production.up.railway.app/api/chart-bugs

---

## 📚 وثائق إضافية

| الملف | المحتوى |
|-------|---------|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | قواعد المساهمة الإلزامية |
| [`BUGS.md`](./BUGS.md) | سجل الأخطاء الدائم (20 خطأ مسجَّل) |
| [`scripts/README.md`](./scripts/README.md) | دليل السكربتات التفصيلي |
| [`.github/PULL_REQUEST_TEMPLATE.md`](./.github/PULL_REQUEST_TEMPLATE.md) | قالب PR |

---

## 🏗️ التقنيات

- **Frontend**: Next.js 16, React, TypeScript, Tailwind CSS, lightweight-charts
- **Backend**: NestJS, Prisma, PostgreSQL, Redis
- **AI**: 30+ محرك (Wyckoff, Elliott, SMC, harmonic, Bayesian)
- **Deploy**: Railway (Docker, single-container)
- **i18n**: 32 لغة (عربي أولاً)
