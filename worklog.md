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

---
Task ID: V150-margin-fix
Agent: Super Z (main)
Task: Fix margin display bug showing $20K instead of ~$390 + fix XRP/USDT BUY failures on Binance

Work Log:
- Deep investigation of all margin-related code paths (6 backend files, 5 frontend files)
- Found ROOT CAUSE #1: totalUsedMargin in credentials.service.ts only searched for currency==='USD' in assets, missing 'USDT' from Binance
- Found ROOT CAUSE #2: _backendMargin from localStorage preserved stale wrong values across sessions
- Found ROOT CAUSE #3: No pre-trade balance check for real exchanges in autonomous trader
- Fixed backend: Added usedMargin field directly to each exchange entry
- Fixed backend: totalUsedMargin now uses direct usedMargin field with USD+USDT fallback
- Fixed frontend: Added _marginVersion timestamp to detect stale _backendMargin
- Fixed frontend: Reject _backendMargin > 80% of equity as unreasonable
- Fixed agent: Added pre-trade balance check using CredentialsService
- Added PortfolioModule import to agent.module.ts for CredentialsService injection
- All TypeScript compilation checks pass
- Both API and web projects build successfully
- Changes committed and pushed to main branch

Stage Summary:
- V150 margin display fix deployed
- Key files modified:
  - apps/api/src/modules/portfolio/credentials/credentials.service.ts (backend margin calc)
  - apps/web/src/hooks/usePositionsStore.ts (frontend margin handling)
  - apps/api/src/agents/autonomous-trader/services/order-executor.service.ts (pre-trade check)
  - apps/api/src/agents/autonomous-trader/agent.module.ts (dependency injection)

---
Task ID: V151-margin-flickering-fix
Agent: Super Z (main)
Task: Fix margin flickering (appearing/disappearing between $0 and correct value)

Work Log:
- Analyzed user's dashboard: Balance $10,266.92, Used Margin $0.00, P&L -$31.74
- Found ROOT CAUSE: updatePositionPrice() (1s tick) and fetchAccount() (5-15s tick) competing to set margin
- V150's heuristic (reject margin > 80% equity) caused margin to flip between $0 and correct value
- When heuristic rejected backend margin → initialMargin = 0 → _backendMargin overwritten with 0 → loop
- Created /apps/web/src/lib/margin-calculator.ts — client-side leverage-aware margin calculation
  - getSymbolLeverage(): FOREX=50, GOLD=20, CRYPTO=1
  - calculateClientMargin(): notional / leverage per position
  - calculatePortfolioMargin(): sum across all positions
- Fixed usePositionsStore.ts updatePositionPrice():
  - Removed V150 heuristic (margin > 80% equity → reject)
  - Added THREE-TIER margin resolution:
    TIER 1: Fresh _backendMargin from fetchAccount() (authoritative)
    TIER 2: Client-side calculatePortfolioMargin() from positions (leverage-aware)
    TIER 3: Preserve current initialMargin (never reset to 0 when positions exist)
  - CRITICAL: _backendMargin and _marginVersion are NEVER overwritten by updatePositionPrice()
- Fixed usePositionsStore.ts fetchAccount():
  - Stage 1: Added THREE-TIER margin resolution (backend → client-side → equity-available)
  - Stage 2 (NestJS summary): Added client-side fallback when backend returns 0 margin
  - Stage 4 (positions fallback): Replaced old heuristic (/30) with calculatePortfolioMargin()
- Fixed dashboard page.tsx: Added inline client-side margin calc as fallback for initialMargin
- Fixed PortfolioMini.tsx: Same THREE-TIER margin resolution
- Fixed mobile/wallet/page.tsx: Same THREE-TIER margin resolution
- All files build successfully (Next.js build passes)

Stage Summary:
- V151 eliminates margin flickering by:
  1. Never overwriting _backendMargin in updatePositionPrice() (was the flickering loop cause)
  2. Client-side margin calculation as fallback (no more $0 when backend fails)
  3. Never resetting margin to $0 when positions exist (preserves last known value)
- Key files modified:
  - apps/web/src/lib/margin-calculator.ts (NEW - client-side margin calc)
  - apps/web/src/hooks/usePositionsStore.ts (V151 margin resolution)
  - apps/web/src/app/dashboard/page.tsx (V151 margin display)
  - apps/web/src/components/portfolio/PortfolioMini.tsx (V151 margin display)
  - apps/web/src/app/mobile/wallet/page.tsx (V151 margin display)
---
Task ID: V154
Agent: Main Agent
Task: Fix why all users see the same account balance

Work Log:
- Investigated the full balance fetch pipeline: frontend → BFF proxy → NestJS backend → CCXT/exchange
- Identified 3 ROOT CAUSES for same balance across all users:
  1. **CRITICAL**: `nestjs-proxy.ts` silently created guest sessions on 401, making ALL expired-session users share the same guest@roua.auto account ($10,000)
  2. **HIGH**: 4 hardcoded $10,000 fallbacks in `usePositionsStore.ts` that activate when any API call fails
  3. **HIGH**: `fetchAccount()` didn't check for user changes (unlike `fetchPositions()`)
- Applied V154 fix:
  - `nestjs-proxy.ts`: On 401, return the 401 response directly instead of creating a guest session. This ensures expired sessions trigger re-auth instead of silently showing guest data.
  - `usePositionsStore.ts`: Added user-change detection at the top of `fetchAccount()` (same as `fetchPositions()`)
  - `usePositionsStore.ts`: Added `checkAuthResponse()` helper that stops the fallback chain on 401 responses
  - `usePositionsStore.ts`: All 4 fetch attempts now check for 401 before falling through
  - `usePositionsStore.ts`: Attempt #4 (positions-only calculation) now fetches user's actual paper balance from API instead of hardcoding $10,000
  - `usePositionsStore.ts`: Final fallback now preserves existing account data instead of overwriting with $10,000
- Generated Prisma client to fix V153 TypeScript errors (paperForexLeverage etc. fields)
- Both frontend and backend TypeScript compiles cleanly

Stage Summary:
- V154 fix ensures each user sees THEIR OWN balance, not a shared $10,000
- Key insight: The proxy was "helpfully" creating guest sessions on auth failures, but this caused data mixing
- The $10,000 default now ONLY applies to brand new users with no previous account data
- All existing account data is preserved when APIs temporarily fail
