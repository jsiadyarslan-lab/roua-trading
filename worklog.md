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

---
Task ID: 3
Agent: Main Agent
Task: Fix TDZ runtime error "Cannot access 'tx' before initialization"

Work Log:
- Identified that 'tx' in minified production build corresponds to tfSeconds (useMemo)
- The minifier was reordering the `let tfSeconds = useMemo(...)` declaration
- Since onCandleUpdate callback used tfSeconds, and the minifier moved the let declaration after the callback definition, TDZ error occurred
- Fix: Converted tfSeconds from useMemo to useRef with useEffect update
- Refs are hoisted and always initialized before closures capture them
- Removed unused useMemo import
- Build succeeded

Stage Summary:
- Root cause: Production minifier reordering let declarations causing TDZ
- Fix: tfSeconds converted from useMemo to useRef (immune to reordering)
- Commit: f2df238a "FIX: Resolve TDZ error 'Cannot access tx before initialization'"
- Also noted: 503 errors on /api/exchange/quote are due to Binance API IP blocking on Railway servers (infrastructure issue, not code bug)

---
Task ID: 4
Agent: Main Agent
Task: Remove performance monitor and incremental updateCandle that broke candles

Work Log:
- Analyzed screenshot showing chart was broken after adding performance monitor
- Investigated root cause: incremental updateCandle() created data inconsistency
- The two candlesRef refs (RouaChart vs useChart) could diverge when updateLastCandle and updateCandle ran concurrently
- updateCandle() only updated the LAST candle on chart, dropping updates for non-last candles
- Performance monitor's wsConnectionStateRef added TDZ risk
- Removed all performance monitoring code (perfRef, perfStats, wsConnectionStateRef, perf stats useEffect, JSX overlay)
- Reverted incremental updateCandle() back to simple setCandles() approach
- Fixed volume accumulation: changed from additive to replacement (WebSocket sends total volume)
- Kept tfSecondsRef fix (still needed to prevent TDZ errors)
- Build succeeded with no errors

Stage Summary:
- Root cause: incremental updateCandle() caused data inconsistency between two candlesRef copies
- Fix: Removed all perf monitoring, reverted to simple setCandles() for all WS updates
- Commit: 82f2afcc "FIX: Remove performance monitor and revert incremental updateCandle that broke candles"

---
Task ID: chart-perf-overhaul
Agent: main
Task: Deep audit and performance overhaul of the chart system

Work Log:
- Read and analyzed all chart source files (useChart.ts, RouaChart.tsx, useChartWebSocket.ts, config.ts, types.ts)
- Researched lightweight-charts v5 best practices (update() vs setData(), rAF batching, indicator management, data conflation)
- Identified 5 critical performance gaps: setData() on every tick, indicator destruction per tick, dual candlesRef, no rAF batching, missing v5.1 features
- Implemented incremental update() via updateCandle() with rAF batching
- Added skipIndicatorRebuild option to setCandles() to preserve indicators during WS updates
- Added periodic indicator refresh (60s) to keep indicator values accurate
- Enabled data conflation (v5.1+) for large datasets
- Added rAF buffer cleanup on symbol/timeframe change and chart unmount
- Fixed TypeScript errors in CommandPalette indicator toggle
- Added updateCandleRef for stale-closure prevention
- Built and tested successfully — no TypeScript errors in modified files
- Committed and pushed as c55393e4

Stage Summary:
- Chart performance improved from O(n log n) per WS tick to O(1) for existing candle updates
- Indicators no longer destroyed/recreated on every WebSocket tick
- rAF batching reduces chart updates to max 60/s regardless of WS message rate
- Data conflation enabled for zoomed-out views with 10K+ data points
- All TypeScript errors in modified files resolved
---
Task ID: chart-overhaul-1
Agent: main
Task: Comprehensive chart system overhaul — fix candles-as-dots + performance + code quality

Work Log:
- Created chart-utils.ts shared utility file with sanitizeTime, isValidNumber, binarySearchByTime, CHART_COLORS, MAX_VISIBLE_CANDLES, ThrottledChartUpdater, getStorageKey
- Fixed candles-as-dots: added conflationThresholdFactor=100 to CandlestickSeries (LWC v5.1+ conflation was merging OHLC data into single points)
- Added global conflationThresholdFactor=1.0 to timeScale (conflate only when <0.5px per point)
- Replaced 4 copies of sanitizeTime with shared import from chart-utils.ts
- Replaced inline isValid/isValidNum with shared isValidNumber
- Replaced 6+ hardcoded volume colors with SHARED_COLORS constants
- Added binary search O(log n) in crosshair handler (was O(n) findIndex)
- Added rAF batching to useChartWebSocket — buffers WS messages, flushes once per frame
- Added Binance k.x (isKlineClosed) field usage — distinguishes forming vs closed candles
- Added 24-hour connection rotation — proactively reconnects before Binance 24h cutoff
- Added MAX_VISIBLE_CANDLES=3000 limit in setCandles
- Added resetPatternEngineState() to pattern-engine.ts
- Added resetPatternRendererState() to pattern-renderer.ts
- Called reset functions from RouaChart on symbol/timeframe change
- Fixed IndicatorCalculator.ts to use shared sanitizeTimeForIndicator

Stage Summary:
- 7 files changed, 421 insertions, 76 deletions
- Commit: 1031bb1b
- Key fix: conflationThresholdFactor=100 on CandlestickSeries prevents dots
- Key perf: Binary search + rAF batching + WS k.x field + 24h rotation
- Key quality: Shared utilities eliminate 4x sanitizeTime, 6+ color duplicates
