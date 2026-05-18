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
