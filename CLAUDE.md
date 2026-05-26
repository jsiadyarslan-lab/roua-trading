# Roua Trading — قواعد العمل الإلزامية لـ Claude

## ⛔ القاعدة الأولى: افحص قبل أن تلمس

قبل تعديل أي ملف:
1. اقرأ الملف كاملاً
2. ابحث عن كل المستهلكين: `grep -rn "اسم_الدالة" apps/ --include="*.ts"`
3. إذا غيّرت معنى حقل في DB — حدّث كل مكان يقرأه في نفس الـ commit

## ⛔ القاعدة الثانية: TypeScript صفر أخطاء

```bash
cd apps/api && npx tsc --noEmit 2>&1 | grep "error TS"
cd apps/web && npx tsc --noEmit 2>&1 | grep "error TS"
```
**لا push حتى يكون الناتج فارغاً** أو تثبت أن الأخطاء موجودة مسبقاً.

## ⛔ القاعدة الثالثة: الاختبارات أولاً

```bash
node tests/accounting.test.js
```
10/10 يجب أن تنجح قبل كل push يمس الرصيد أو الهامش أو PnL.

## ⛔ القاعدة الرابعة: تحقق من الـ build

بعد كل push انتظر وتحقق:
```bash
curl https://roua-trading-production.up.railway.app/api/health | grep buildId
```
إذا لم يتغير `buildId` = البناء فشل. لا تقل "تم" قبل رؤية buildId جديد.

## ⛔ القاعدة الخامسة: بيانات حقيقية قبل الكود

قبل أي إصلاح في الحسابات — اجلب البيانات أولاً:
```
GET /api/trading/positions/history?limit=3
GET /api/agent/trader/settings
GET /api/portfolio/credentials/balances
```
احسب يدوياً، قارن مع ما يظهر، ثم اكتب الكود.

## ⛔ القاعدة السادسة: commit واحد = إصلاح واحد

لا تجمع إصلاحات متعددة في commit واحد. كل مشكلة = commit منفصل.

## ⛔ القاعدة السابعة: Union types — عدّل كل الفروع

إذا أضفت حقلاً لـ TypeScript type يحتوي `|`:
- أضفه لكل الفروع A | B | C
- أضفه للـ fallback objects أيضاً
- هذا الخطأ تكرر 3 مرات في هذا المشروع

## ⛔ القاعدة الثامنة: لا تمس ما يعمل

إذا كانت المشكلة في `closePosition` — لا تلمس `getBalances`.
إذا كانت في الـ frontend — لا تلمس الـ backend إلا بدليل من البيانات.

---

## نموذج المحاسبة الثابت (V174)

```
فتح:    paperBalance -= qty × entryPrice / leverage
إغلاق:  pnl = grossPnl - (exitPrice × qty × 0.001)   ← exit fee فقط
        paperBalance += (qty × entryPrice / leverage) + pnl

equity    = paperBalance + usedMargin(entryPrice) + unrealizedPnL
available = paperBalance + unrealizedPnL
الرصيد   = paperBalance + usedMargin   ← ثابت بين الصفقات
الحالي   = equity                       ← يتحرك مع الأسعار
usedMargin يُحسب دائماً بـ entryPrice لا currentPrice
leverage يأتي من AgentSettings — لا hardcoded
```

## الإجراء القياسي لكل إصلاح

```
1. افتح المتصفح → اجلب البيانات الحقيقية
2. احسب يدوياً → حدد الفرق بدقة
3. ابحث في الكود عن السبب الجذري
4. اكتب الإصلاح
5. شغّل: npx tsc --noEmit
6. شغّل: node tests/accounting.test.js
7. push
8. تحقق من buildId في /api/health
9. تحقق من البيانات في المتصفح
```

## أخطاء تكررت — لا تكررها

| الخطأ | الدرس |
|---|---|
| تغيير `paperBalance` دون تحديث كل المستهلكين | أي تغيير في نموذج البيانات = audit كامل |
| إضافة `paperBalance` لنوع TypeScript واحد من أربعة | دائماً ابحث عن كل الفروع |
| Migration تستخدم حقل غير موجود في schema | تحقق من `prisma/schema.prisma` أولاً |
| Double entry fee في PnL | entry fee تُدفع عند الفتح — لا تُخصم مجدداً |
| Build يفشل وتعلن النجاح | تحقق من buildId دائماً |
