---
Task ID: 1
Agent: Main Agent
Task: Fix Bug #2 - Candles appear as dots when selecting drawing tools

Work Log:
- Analyzed current code state: DrawingRenderer.ts already converted to Plugin System (ISeriesPrimitive)
- Identified root cause: `setChartInteractionEnabled()` called `chart.applyOptions()` which triggered full chart re-render → GPU compositing layer recomposition → candle bodies disappear (appear as dots)
- Implemented fix: Replaced `chart.applyOptions()` approach with capture-phase event listeners
  - Added `onWheelCapture()` - blocks wheel events (zoom) during drawing mode
  - Added `onTouchStartCapture()` - blocks single-finger touch (pan) during drawing mode
  - Added `onTouchMoveCapture()` - blocks single-finger touch move (pan) during drawing mode
  - Made `setChartInteractionEnabled()` a NO-OP (kept for compatibility with existing call sites)
- Increased default `barSpacing` from 6/12 to 8/14 for better candle visibility
- Increased `minBarSpacing` from 2/4 to 3/5 for minimum candle width
- Build succeeds with no TypeScript errors
- Dev server starts and responds correctly

Stage Summary:
- Key fix: Eliminated ALL `chart.applyOptions()` calls during drawing tool activation
- Event capture approach: Events are intercepted in capture phase before reaching chart's internal handlers
- No canvas CSS modifications, no chart re-renders during tool switching → no GPU recomposition → candles remain visible
- Files modified: DrawingRenderer.ts, useChart.ts
---
Task ID: 1
Agent: Main Agent
Task: Fix candles appearing as dots in Roua Trading chart

Work Log:
- Read all chart source files: useChart.ts, DrawingRenderer.ts, RouaChart.tsx
- Confirmed DrawingRenderer.ts already uses Plugin System (ISeriesPrimitive) — no overlay canvas
- Searched internet for lightweight-charts v5 candle dots issue
- Found root cause: `fitContent()` with 300 candles compresses barSpacing below 4px → candle body width = 1-3px → appears as dots
- Applied 3 fixes to useChart.ts:
  1. Replaced `resetView`'s `fitContent()` with `setVisibleRange()` showing last 120 candles (80 on mobile)
  2. Increased `minBarSpacing` from 3→4 on mobile to prevent barSpacing dropping below visible threshold
  3. Changed `zoomOut` minimum barSpacing from 4→6 to prevent zooming out too far
- Build succeeded

Stage Summary:
- Root cause: fitContent() with 300 data points → auto barSpacing < 4px → candle bodies invisible
- Fix: Use setVisibleRange() to show only ~120 candles, keeping barSpacing ≥ 8px
- All changes in /home/z/my-project/apps/web/src/hooks/useChart.ts
- Build verified: turbo build successful
