# اختبارات المحاسبة

## تشغيل الاختبارات
```bash
node tests/accounting.test.js
```

## القاعدة
**لا تُنشر أي تعديل في نظام الحساب قبل تشغيل هذه الاختبارات والتأكد من نجاحها.**

## النموذج الثابت (V174)

### عند فتح صفقة:
```
paperBalance -= qty × entryPrice / leverage
```

### عند الإغلاق:
```
grossPnl = (exitPrice - entryPrice) × qty  [BUY]
         = (entryPrice - exitPrice) × qty  [SELL]
pnl      = grossPnl - (exitPrice × qty × 0.001)   ← exit fee فقط
paperBalance += (qty × entryPrice / leverage) + pnl
```

### العرض:
```
equity    = paperBalance + usedMargin + unrealizedPnL
available = paperBalance + unrealizedPnL  
displayed الرصيد = paperBalance + usedMargin  ← ثابت بين الصفقات
displayed الحالي = equity                     ← يتحرك مع الأسعار
```
