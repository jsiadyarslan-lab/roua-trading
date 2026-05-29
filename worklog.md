---
Task ID: 1
Agent: Main Agent
Task: Fix candles disappearing when switching trading pairs (Bug #2)

Work Log:
- Reverted broken commit 191444e5 ("FIX: Candles disappearing when switching trading pairs — sustainable fix")
- Deep analysis of data flow when symbol changes in useChart.ts and RouaChart.tsx
- Used Explore subagent for comprehensive code trace
- Identified root cause: savedVisibleRangeRef.current was being set by restoreChartState() with a saved zoom range from a previous session, which caused resetView() to apply a narrow visible range instead of fitContent()
- Applied ONE minimal fix: removed the line that sets savedVisibleRangeRef.current = saved.visibleRange in restoreChartState()
- This ensures resetView() always uses fitContent() to show all candles, which is the expected default behavior
- Build succeeded, commit pushed to origin/main

Stage Summary:
- Root cause: savedVisibleRangeRef applied narrow zoom from previous session on pair switch
- Fix: Removed savedVisibleRangeRef restoration in restoreChartState (one-line change)
- Result: resetView() always calls fitContent() which shows all candles correctly
- Commit: 24a01c07 "FIX: Remove savedVisibleRangeRef restoration — root cause of candles disappearing on pair switch"

---
Task ID: pwa-fix-v208
Agent: Super Z (Main)
Task: Fix PWA that didn't work on mobile - icons returning 307 redirect, missing SW registration, missing iOS meta tags

Work Log:
- Diagnosed 4 critical PWA issues preventing mobile installation
- Issue 1: Icons at /icon-192.png returned 307 redirect (next-intl middleware)
- Issue 2: Service Worker only registered on dashboard, not on landing page
- Issue 3: Missing apple-mobile-web-app-capable meta tag for iOS Safari
- Issue 4: No offline.html fallback page
- Solution: Created /api/pwa-asset route handler that serves PWA files (API routes bypass middleware)
- Updated all icon references to use /api/pwa-asset?file=...
- Created PWARegistrar component for SW registration on ALL pages
- Added apple-mobile-web-app-capable directly in HTML head
- Created Arabic offline.html page
- Deployed as v208 on Railway

Stage Summary:
- All PWA assets return 200 OK with correct content types
- Build: v208-pwa-apple-capable-head deployed on Railway
