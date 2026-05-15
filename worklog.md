---
Task ID: 0
Agent: Main Agent (Super Z)
Task: Clone and deeply inspect the roua-trading project

Work Log:
- Cloned repository from https://github.com/jsiadyarslan-lab/roua-trading.git
- Examined full project file tree (400+ files)
- Read and analyzed: package.json (root, web, api), prisma/schema.prisma, .env, .env.production, docker-compose.yml
- Read and analyzed: .sixth/RULES.md, .sixth/AGENT_MANIFEST.md, .sixth/ROUTING.md, PROGRESS.md
- Read and analyzed: apps/web/src/app/layout.tsx, dashboard/layout.tsx, dashboard/page.tsx
- Read and analyzed: apps/web/tailwind.config.ts, globals.css, next.config.ts
- Read and analyzed: design-tokens.ts, unified-tokens.ts, AppHeader.tsx
- Read and analyzed: turbo.json, COST_REDUCTION_IMPLEMENTATION.md

Stage Summary:
- Full project understanding achieved. Ready for instructions.
---
Task ID: 1
Agent: Main Agent
Task: تنفيذ 7 إصلاحات حرجة لمشروع Roua Trading

Work Log:
- قراءة وتحليل 10+ ملفات مصدرية لفهم المشاكل
- إصلاح زر إغلاق الصفقة (AlpacaPositions.tsx) - refreshAfterTrade + fallback
- إصلاح تكرار الصفقات (BotEngine.tsx) - cooldown 5min + cross-source dedup
- إصلاح سعر البريف القديم (dashboard/page.tsx) - live price + stale warning
- إصلاح فلتر سجل الوكيل (autonomous-trader/page.tsx) - filter buttons
- إصلاح حساب الرصيد الحي (usePositionsStore.ts) - equity = cash + positions + pnl
- إصلاح رصيد التداول الورقي (usePositionsStore.ts + API routes) - $10,000 default
- إضافة إشعارات تغير الرصيد (GlobalLogicEngine.tsx) - >$10 threshold
- البناء نجح بدون أخطاء
- النشر على GitHub (Railway سيبني تلقائياً)

Stage Summary:
- 8 ملفات معدّلة، 372 سطر مضاف، 68 سطر محذوف
- جميع الإصلاحات السبعة تم تنفيذها بنجاح
- البناء ينجح (next build --webpack)
- تم النشر على GitHub: commit 0d0fdc6e
- الإنتاج: https://roua-trading-production.up.railway.app/
