---
Task ID: 1
Agent: main
Task: Fix multi-chart symbol switching - watchlist clicks + grid cell symbol selector + toolbar symbol dropdown

Work Log:
- Analyzed the root cause: clicking a symbol in WatchlistMini/currency bar only called setSelectedSymbol() which updates the global useSymbolStore, but grid cell RouaCharts override with their own symbolProp from useMultiChartStore
- Added `setSymbol()` method to ChartControlAPI interface in multi-chart-registry.ts
- Added `onSetSymbol` prop to ChartToolbar with a dropdown symbol selector (visible in multi-chart mode)
- Replaced grid cell header (plain text symbol) with interactive header featuring:
  - Symbol selector dropdown (POPULAR_SYMBOLS_MINI list)
  - Timeframe mini-buttons (1m, 5m, 15m, 1H, 4H, 1D)
  - Each changes the specific chart cell via updateChartConfig()
- Added `onSelectSymbol` callback override to WatchlistMini component
- Created `handleSelectSymbol()` in dashboard page that routes to active chart cell in multi-chart mode
- Updated SidebarContentPanel WatchlistMini usage to route to active chart cell
- Updated WatchlistOverlay, MiniHeatmap, SmartGrid onSwitchToChart in RouaChart to route to active chart cell
- Updated currency bar buttons in dashboard page to use handleSelectSymbol
- Resolved rebase conflict (bumpPanelStateVersion from remote + setSymbol from our commit)
- Build verified successfully
- Pushed to remote: dbcbf646

Stage Summary:
- 6 files modified: multi-chart-registry.ts, RouaChart.tsx, ChartToolbar.tsx, WatchlistMini.tsx, SidebarContentPanel.tsx, dashboard/page.tsx
- All symbol selection points now route to the active chart cell in multi-chart mode
- Grid cell headers now have interactive symbol/timeframe selectors
- Main toolbar has symbol dropdown in multi-chart mode
