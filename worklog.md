---
Task ID: 2
Agent: Main Agent
Task: فصل البوت عن المجلس — خطة تطوير 5 مراحل

Work Log:
- فحص عميق لهيكل المشروع: اكتشاف 3 أنظمة متداخلة (Engine + AutonomousTrader + StrategicCouncil/SmartExecutor)
- المرحلة 1: إزالة TradingBotService و CouncilSchedulerService من EngineModule
- المرحلة 1: تحديث EngineController لإزالة نقاط نهاية البوت والمجلس القديمة
- المرحلة 2: تطوير StrategicCouncilService كمحرك إجماع وحيد + markBriefExecuted() + Redis pub/sub
- المرحلة 2: إضافة EXECUTED إلى BriefReviewStatus في Prisma schema
- المرحلة 3: تطوير SmartExecutorService ليدعم المستخدمين فردياً + TradingService + Paper Trading
- المرحلة 3: إضافة نقاط نهاية /api/smart-executor/user/enable, /user/disable, /user/status
- المرحلة 4: تحديث الواجهة الأمامية (bot/page.tsx) لاستخدام النقاط الجديدة
- المرحلة 4: بناء API + Frontend ناجح بدون أخطاء
- المرحلة 5: Commit + Push إلى GitHub (6673de3)

Stage Summary:
- الهيكل الجديد مفصول تماماً: المجلس (فقط يحلل ويصدر Briefs) ← المنفذ (فقط ينفذ)
- EngineModule أصبح بنية تحتية فقط: Scanner + Monitor + Broadcaster
- SmartExecutor يدعم per-user execution مع Redis state + TradingService integration
- StrategicCouncil هو المحرك الوحيد للإجماع (CouncilSchedulerService القديم ملغى)
- نقاط النهاية الجديدة:
  - GET /api/strategic-council/briefs/active
  - GET /api/strategic-council/briefs/history
  - GET /api/strategic-council/briefs/count
  - POST /api/strategic-council/trigger
  - GET /api/strategic-council/session/last
  - GET /api/smart-executor/status
  - POST /api/smart-executor/start
  - POST /api/smart-executor/stop
  - GET /api/smart-executor/positions
  - POST /api/smart-executor/user/enable
  - POST /api/smart-executor/user/disable
  - GET /api/smart-executor/user/status
