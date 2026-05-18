---
Task ID: 2
Agent: Main Agent (Super Z)
Task: V148 - Fix margin calculation showing full notional instead of leverage-aware margin

Work Log:
- Analyzed user's dashboard data: Balance $10,147.98, Used margin $19,548.41 (192.8%!), P&L -$8.24
- Traced exact data flow: credentials.service.ts → usePositionsStore.ts → dashboard/page.tsx
- Found ROOT CAUSE: frontend uses `positionsMarketValue` (full notional = qty × price) as fallback for margin
- For EUR/USD at 50:1: notional $108,000 → margin should be $2,160 but showed $108,000
- Fixed backend credentials.service.ts: added totalUsedMargin to API response
- Fixed backend trading.service.ts: added usedMargin (leverage-aware) to getPositionSummary()
- Fixed backend position-manager.service.ts: added usedMargin to getPortfolioSummary()
- Fixed backend order.events.ts: added usedMargin field to PortfolioSummary class
- Fixed frontend usePositionsStore.ts: 5 fixes across all 4 API fallback paths
  - Path 1: use totalUsedMargin from backend instead of equity-available || positionsMarketValue
  - Path 2: use summary.usedMargin instead of summary.totalExposure
  - Path 4: estimate leverage-aware margin instead of using full notional
  - Real-time update: preserve backend's leverage-aware margin, never fall back to full notional
- Fixed frontend dashboard/page.tsx: never fall back to positionsValue as initialMargin
- Fixed frontend price-format.ts: added full symbol registry (EUR/USD→5, XRP/USDT→4, etc.)
- Both API and web projects build and type-check successfully
- Pushed to GitHub: V148 commit

Stage Summary:
- V148 fixes the critical margin display bug that made "مستخدم" show $19,548 instead of ~$390
- The bug existed in 5 different places across the frontend, all now fixed
- Added totalUsedMargin to backend API response so frontend always has correct data
- Price decimals now use full symbol registry matching the backend
---
Task ID: 1
Agent: Main Agent (Super Z)
Task: V147 - Fix decimal numbers, high margin, and balance/P&L mismatch

Work Log:
- Investigated full data flow: backend fetchBalance → credentials.service → frontend fetchAccount → dashboard display
- Found 6 root causes for the reported issues
- Fixed credentials.service.ts: replaced raw exposure (qty×price) with leverage-aware calculateMargin()
- Fixed credentials.service.ts: now computes equity = paperBalance + unrealizedPnL (not just paperBalance)
- Fixed usePositionsStore.ts: eliminated double P&L counting for paper-trading users
- Fixed usePositionsStore.ts: effectiveCash now shows raw balance (equity - PnL) for paper users
- Fixed dashboard page.tsx: initialMargin now uses backend's leverage-aware margin, not full notional
- Fixed _priceDecimals() in both trading.service.ts and paper-trading.adapter.ts to use symbol-metadata
- Added spot SELL block in order-executor.service.ts as last line of defense
- Fixed Risk Calculator _getPortfolioValue() to always use paperBalance for paper users
- Both API and web projects build successfully

Stage Summary:
- V147 fixes 6 interconnected bugs causing "balance drops by thousands but P&L is small"
- Root cause: margin was calculated as full notional (qty×price) instead of leverage-aware (notional/leverage)
- For forex with 50:1 leverage, $2,500 notional should use $50 margin, not $2,500
- Double P&L counting in frontend also made equity appear lower than actual
- Risk Calculator was using positionsValue instead of paperBalance for paper users
