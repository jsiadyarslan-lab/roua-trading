# Roua Trading — Improvement Plan Worklog

---
Task ID: phase-10
Agent: Main Agent + Sub-agents
Task: Fix Math.max(...array) / Math.min(...array) stack overflow across the codebase

Work Log:
- Added `safeMax()` and `safeMin()` functions to `/home/z/my-project/apps/web/src/lib/charts/chart-utils.ts` (shared utility)
- Updated `IndicatorCalculator.ts` to import safeMax/safeMin from chart-utils instead of local copy
- Fixed 15 Math.max + 15 Math.min in `overlay-renderer.ts`
- Fixed 37 Math.max/Math.min spread calls across 13 chart engine files (WyckoffEngine, GeometricPatterns, DrawingRenderer, IncrementalCalc, LiquidityZones, MTFEngine, EngineVerification, VolumeProfile, MarketScannerEngine, AnalysisValidator, WyckoffAnalysis, chart-primitives, zigzag)
- Fixed 21 Math.max/Math.min spread calls in `scanner.service.ts` (added inline helpers)
- Fixed 24 Math.max/Math.min spread calls across 9 React component files (SparklineChart, MiniHeatmap, HeatmapGrid, PatternsView, VolumeProfile, FootprintChart, PatternProgress, WatchlistOverlay, PortfolioSparkline)

Stage Summary:
- **110+ instances** of dangerous `Math.max(...spread)` / `Math.min(...spread)` replaced across **27 files**
- Zero stack overflow risk remaining for arrays of any size
- All changes use either shared `safeMax/safeMin` from chart-utils or inline helpers

---
Task ID: phase-3
Agent: Main Agent + Sub-agent
Task: Implement indicator caching + incremental updates

Work Log:
- Added `updateIndicatorSeriesData()` function to `chart-indicator-renderer.ts` — updates existing series data in-place using `series.setData()` instead of remove + recreate
- Added `refreshIndicatorsData()` function to `useChart.ts` — recalculates all active indicators and updates series in-place, falls back to full render when series missing
- Added debounced (500ms) indicator refresh after WebSocket candle updates in `_flushUpdateCandle`
- Added timer cleanup in unmount, symbol change, and timeframe change effects
- Cache reuse: refreshIndicatorsData checks indicator cache before recalculating

Stage Summary:
- **Before**: WS updates left indicators stale until next full `setCandles` call
- **After**: WS updates trigger debounced (500ms) indicator data refresh using in-place `series.setData()`
- **Before**: `setCandles` always removed ALL indicator series and recreated them
- **After**: `refreshIndicatorsData` updates existing series in-place, falls back to full render only for missing series
- Significant performance improvement during live market conditions

---
Task ID: phase-4
Agent: Main Agent + Sub-agent
Task: Split useChart.ts God Hook into sub-modules

Work Log:
- Created `/home/z/my-project/apps/web/src/lib/charts/chart-options.ts` with extracted pure functions:
  - `CHART_COLORS` constant (grid, crosshair, up/down colors)
  - `buildChartOptions()` — builds full lightweight-charts options object
  - `buildCandlestickOptions()` — builds candlestick series options
  - `buildVolumeOptions()` — builds volume histogram options
- Updated `useChart.ts` to import and use the extracted module
- Replaced 57-line inline chart options object with 9-line `buildChartOptions()` call
- Replaced inline candlestick/volume options with builder function calls
- Updated all 22 remaining `CHART_COLORS.` references to `CHART_OPTIONS_COLORS.`

Stage Summary:
- useChart.ts reduced from **2015 → 1938 lines** (77 lines removed)
- Chart initialization options extracted as pure, testable functions
- Mobile/desktop handling centralized in `chart-options.ts`

---
Task ID: phase-6
Agent: Main Agent
Task: Remove duplicate OverlayManager.ts

Work Log:
- Identified that `OverlayManager.ts` (LineSeries-based, singleton) was superseded by `OverlayRegistry.ts` (ISeriesPrimitive-based, singleton)
- Only usage: `resetOverlayManager()` in RouaChart.tsx on unmount
- Replaced with `resetOverlayRegistry()` from the active OverlayRegistry module
- Renamed `OverlayManager.ts` to `OverlayManager.ts.deprecated`

Stage Summary:
- Duplicate overlay manager removed
- RouaChart.tsx now uses `resetOverlayRegistry()` from the active `OverlayRegistry.ts`
- No functional change — both functions do the same cleanup (clear all, destroy singleton)
