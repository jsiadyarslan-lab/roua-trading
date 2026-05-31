# Multi-Chart Best Practices for Trading Applications
## Comprehensive Research & Technical Recommendations

---

## 1. TradingView Multi-Chart Implementation

### Layout System
TradingView uses a **predefined grid layout system** with fixed configuration options:
- **2x1** (2 charts, side by side)
- **2x2** (4 charts, 2x2 grid) — most popular
- **3x3** (9 charts)
- **Custom**: Free-form arrangement with drag-and-drop

Key architectural details:
- Each chart cell is an **independent chart instance** with its own canvas
- The layout selector is in the **top-right toolbar area** (layout icon button)
- Charts within a layout are selected by clicking — the **active chart** gets a subtle highlight border
- The top-level toolbar applies actions to the **currently active chart** only

### Sync Features
- **Symbol/Interval Sync**: Users can group charts to share symbol or interval changes. Clicking the sync icon on a chart's status line lets you assign it to a "sync group" (A, B, C, etc.)
  - When Symbol Sync is ON: Changing the symbol on one chart changes it on all charts in the group
  - When Interval Sync is ON: Changing the timeframe on one applies to all grouped charts
- **Crosshair Sync**: In multi-chart layout, crosshairs can be synchronized across charts sharing the same time axis
- **Indicator Propagation**: When switching to multi-chart mode, indicators from the original chart are **cloned** to all new charts

### Toolbar Architecture
- **Single shared toolbar** at the top of the layout (not per-chart)
- Toolbar actions target the **active/selected chart**
- Active chart is indicated by a colored border/glow
- Chart-specific controls (symbol, interval) appear in each chart's own header/status line
- The layout selector itself is a dropdown in the toolbar

### Lessons for Our Implementation
1. Use a **single shared toolbar** — not per-chart toolbars
2. Track the **active chart** via click/focus and route toolbar actions to it
3. Implement **sync groups** for symbol/interval cross-chart coordination
4. Clone chart configuration when splitting into multi-chart views

---

## 2. MetaTrader 5 (MT5) Multi-Chart System

### Chart Tiling
MT5 is a **native desktop app (C++)** using MDI (Multiple Document Interface):
- **Window Menu → Tile Horizontally / Tile Vertically / Cascade**
- The "Tile" button on the toolbar instantly arranges all open charts into an equal grid
- Charts can be manually resized by dragging their borders
- Maximum practical limit: ~8-12 charts before they become too small

### Toolbar Behavior
- **Each chart has its own mini-toolbar** at the top of its frame
- The **main application toolbar** (top of window) has chart-type buttons (candlestick, line, etc.)
- Main toolbar actions apply to the **active/focused chart** (clicked chart)
- Chart-specific settings (period, symbol) are in each chart's own toolbar
- There is **no shared crosshair sync** — each chart operates independently

### Layout Persistence
- MT5 supports **workspace/profile saving** — saves all chart arrangements, indicators, and settings
- Profiles can be loaded to restore a complete workspace

### Lessons for Our Implementation
1. Tile/arrange buttons for quick layout changes are essential UX
2. Per-chart mini-toolbars for chart-type selection are useful alongside a shared toolbar
3. Layout persistence (save/load) is a must-have for professional traders
4. MT5's lack of crosshair sync is a weakness — we should implement it

---

## 3. Lightweight-Charts v5 Multi-Instance

### Official Crosshair Sync API
Lightweight Charts provides first-class API for crosshair synchronization:

```typescript
// Set crosshair on chart B from chart A's data
chartB.setCrosshairPosition(dataPoint.value, dataPoint.time, seriesB);
chartB.clearCrosshairPosition();

// Subscribe to crosshair movement
chartA.subscribeCrosshairMove((param) => {
  if (!param.time) {
    chartB.clearCrosshairPosition();
    return;
  }
  const dataPoint = param.seriesData.get(seriesA);
  if (dataPoint) {
    chartB.setCrosshairPosition(dataPoint.value, dataPoint.time, seriesB);
  }
});
```

### Visible Range Sync (Scroll/Zoom)
```typescript
chartA.timeScale().subscribeVisibleLogicalRangeChange((timeRange) => {
  chartB.timeScale().setVisibleLogicalRange(timeRange);
});
// Bidirectional — must guard against infinite loops!
```

**Critical Bug (Issue #1608)**: Scrolling one chart while crosshairs are synced can cause flickering/jumping. The fix is to use a **flag/mutex** to prevent re-entrant sync callbacks:

```typescript
let isSyncing = false;

chartA.timeScale().subscribeVisibleLogicalRangeChange((timeRange) => {
  if (isSyncing) return;
  isSyncing = true;
  chartB.timeScale().setVisibleLogicalRange(timeRange);
  isSyncing = false;
});

chartB.timeScale().subscribeVisibleLogicalRangeChange((timeRange) => {
  if (isSyncing) return;
  isSyncing = true;
  chartA.timeScale().setVisibleLogicalRange(timeRange);
  isSyncing = false;
});
```

### Multi-Pane Support (v5 Native)
Lightweight Charts v5 introduced **native pane support** within a single chart instance:
- Use `paneIndex` during `addSeries()` to create multiple panes
- Price chart on pane 0, volume on pane 1, RSI on pane 2, etc.
- Panes share the **same time scale** automatically
- Pane separators are **resizable** with drag handles
- `PaneApi`: `getHeight()`, `setHeight()`, `moveTo(paneIndex)`

```typescript
const volumeSeries = chart.addSeries(HistogramSeries, {
  priceFormat: { type: 'volume' },
}, 1); // pane index 1

chart.applyOptions({
  layout: {
    panes: {
      separatorColor: '#333',
      separatorHoverColor: '#555',
      enableResize: true,
    },
  },
});
```

**Important distinction**: Panes share a single time axis within ONE chart. For **different symbols** on different charts, you still need separate chart instances.

### GitHub Issues Summary
| Issue | Description | Status |
|-------|-------------|--------|
| #50 | Multiple panes support | **Implemented in v5** |
| #1163 | Synchronizing across multiple windows | Closed — use `setCrosshairPosition` API |
| #1608 | Scroll sync causes flickering | Known — use mutex/flag pattern |
| #1808 | Markers with many datapoints slow | Performance issue — v5.1 data conflation helps |
| #2000 | Persistent lag after detaching primitives | Bug — monitor for fix |
| #2049 | Removing many series is slow | v5 issue — batch operations recommended |

---

## 4. React Multi-Chart Patterns

### State Management: Zustand (Recommended)
For managing multiple chart instances with shared state, **Zustand** is the best choice:

```typescript
// stores/chartStore.ts
import { create } from 'zustand';

interface ChartState {
  // Layout
  layout: '1x1' | '2x1' | '2x2' | '3x3';
  setLayout: (layout: ChartState['layout']) => void;

  // Active chart tracking
  activeChartId: string | null;
  setActiveChartId: (id: string) => void;

  // Per-chart config
  charts: Record<string, {
    symbol: string;
    interval: string;
    chartType: 'candle' | 'line' | 'area';
    indicators: string[];
  }>;
  updateChart: (id: string, updates: Partial<ChartState['charts'][string]>) => void;

  // Sync groups
  syncGroups: Record<string, { symbol: boolean; interval: boolean; crosshair: boolean }>;
  setSyncGroup: (chartId: string, group: string, settings: ...) => void;

  // Crosshair sync
  crosshairTime: number | null;
  setCrosshairTime: (time: number | null) => void;
}
```

**Why Zustand over Context/Redux**:
- No provider wrapping needed — charts at any depth can access the store
- Selector-based subscriptions prevent unnecessary re-renders
- Minimal boilerplate for complex state like chart configurations
- Easy to persist with `zustand/middleware` (localStorage)

### Shared Toolbar Pattern
```
┌─────────────────────────────────────────────────┐
│  [BTC/USDT ▼] [1H ▼] [🕯] [─] [📈] [⊥] [🔲] │  ← Shared Toolbar
│  (operates on active chart)                      │
├─────────────────────┬───────────────────────────┤
│                     │                           │
│   Chart A (active)  │     Chart B               │
│   ← blue border     │                           │
│                     │                           │
├─────────────────────┼───────────────────────────┤
│                     │                           │
│   Chart C           │     Chart D               │
│                     │                           │
│                     │                           │
└─────────────────────┴───────────────────────────┘
```

Implementation approach:
```tsx
function SharedToolbar() {
  const { activeChartId, charts, updateChart } = useChartStore();

  const activeChart = activeChartId ? charts[activeChartId] : null;

  const handleSymbolChange = (symbol: string) => {
    if (!activeChartId) return;
    updateChart(activeChartId, { symbol });

    // If sync is enabled, update all charts in the same sync group
    // ... sync group logic
  };

  return (
    <Toolbar>
      <SymbolSelector value={activeChart?.symbol} onChange={handleSymbolChange} />
      <IntervalSelector value={activeChart?.interval} onChange={handleIntervalChange} />
      <ChartTypeButtons value={activeChart?.chartType} onChange={handleChartTypeChange} />
      <LayoutSelector />
    </Toolbar>
  );
}
```

### Synchronized Crosshairs in React
```tsx
function useCrosshairSync(charts: ChartApi[], series: ISeriesApi[]) {
  const syncFlag = useRef(false);

  useEffect(() => {
    const handlers = charts.map((chart, i) => {
      return chart.subscribeCrosshairMove((param) => {
        if (syncFlag.current) return;
        syncFlag.current = true;

        const dataPoint = param.seriesData.get(series[i]);
        charts.forEach((otherChart, j) => {
          if (j === i) return;
          if (dataPoint && param.time) {
            otherChart.setCrosshairPosition(
              (dataPoint as any).value ?? (dataPoint as any).close,
              param.time,
              series[j]
            );
          } else {
            otherChart.clearCrosshairPosition();
          }
        });

        syncFlag.current = false;
      });
    });

    return () => handlers.forEach((h, i) => charts[i].unsubscribeCrosshairMove(h));
  }, [charts, series]);
}
```

### Active Chart Detection
```tsx
function ChartContainer({ chartId }: { chartId: string }) {
  const setActiveChartId = useChartStore((s) => s.setActiveChartId);
  const activeChartId = useChartStore((s) => s.activeChartId);

  return (
    <div
      className={cn(
        'chart-cell',
        activeChartId === chartId && 'chart-cell--active'
      )}
      onMouseDown={() => setActiveChartId(chartId)}
    >
      <ChartComponent chartId={chartId} />
    </div>
  );
}
```

### Key Patterns from IBM Research
IBM's article on synchronizing charts in React lists recommends:
1. **Single source of truth** for chart configuration in a store
2. **Event bus pattern** for cross-chart communication (alternative to direct API calls)
3. **Debounced resize** to prevent layout thrashing when multiple charts resize simultaneously
4. **Lazy initialization** — only create chart instances when they become visible

---

## 5. CSS Grid vs Flexbox for Trading Layouts

### Verdict: Use Both, But CSS Grid for the Chart Layout

| Aspect | CSS Grid | Flexbox |
|--------|----------|---------|
| **2D layouts (rows + cols)** | ✅ Native | ❌ Requires nesting |
| **Equal chart cells** | ✅ `1fr 1fr` | ⚠️ `flex: 1` works but less explicit |
| **Resizable drag handles** | ⚠️ Requires JS | ⚠️ Requires JS |
| **Gap management** | ✅ `gap` property | ✅ `gap` property |
| **Dynamic grid changes** | ✅ `grid-template` changes | ❌ Awkward |
| **Subgrid for nested panels** | ✅ CSS Subgrid | ❌ N/A |
| **Simple toolbar row** | ⚠️ Overkill | ✅ Perfect |

### Recommended Architecture
```css
/* Chart grid — CSS Grid */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 1px;
  height: 100%;
}

/* Toolbar — Flexbox */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}
```

### Resizable Panels: Use a Library
**CSS Grid alone cannot provide drag-to-resize** between cells. Use one of these libraries:

| Library | Stars | Size | React | Key Feature |
|---------|-------|------|-------|-------------|
| **react-resizable-panels** | 4k+ | 6KB | Native | By Brian Vaughn (React team). Imperative API, persistence, accessibility |
| **allotment** | 2k+ | 15KB | Native | VS Code-style split views. Nested splits, snap sizes |
| **split.js** | 7k+ | 8KB | Agnostic | Framework-agnostic, CSS-driven, tiny |
| **react-split-pane** | 3k+ | — | Native | Older, less maintained |

**Recommendation**: **react-resizable-panels** or **allotment**. Both are well-maintained and designed for IDE-style layouts.

### Implementation with Allotment
```tsx
import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

function ChartGrid2x2() {
  return (
    <Allotment defaultSizes={[50, 50]}>
      <Allotment vertical defaultSizes={[50, 50]}>
        <ChartCell chartId="chart-0" />
        <ChartCell chartId="chart-1" />
      </Allotment>
      <Allotment vertical defaultSizes={[50, 50]}>
        <ChartCell chartId="chart-2" />
        <ChartCell chartId="chart-3" />
      </Allotment>
    </Allotment>
  );
}
```

### Implementation with react-resizable-panels
```tsx
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';

function ChartGrid2x2() {
  return (
    <PanelGroup direction="horizontal">
      <Panel defaultSize={50}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={50}>
            <ChartCell chartId="chart-0" />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={50}>
            <ChartCell chartId="chart-1" />
          </Panel>
        </PanelGroup>
      </Panel>
      <PanelResizeHandle className="resize-handle" />
      <Panel defaultSize={50}>
        <PanelGroup direction="vertical">
          <Panel defaultSize={50}>
            <ChartCell chartId="chart-2" />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={50}>
            <ChartCell chartId="chart-3" />
          </Panel>
        </PanelGroup>
      </Panel>
    </PanelGroup>
  );
}
```

---

## 6. Performance with Multiple Lightweight-Charts Instances

### Memory Usage Per Chart Instance
| Component | Memory per Instance |
|-----------|-------------------|
| Canvas context | ~2-5 MB |
| OHLCV data (1 year, 1min) | ~2 MB |
| OHLCV data (1 year, 1H) | ~20 KB |
| Series rendering buffers | ~1-3 MB |
| Event listeners | ~10 KB |
| **Total per chart (1yr 1min)** | **~5-10 MB** |
| **Total per chart (1yr 1H)** | **~3-8 MB** |

**Practical limit**: 4-8 charts on a modern device with 8-16GB RAM. Beyond 8 charts, consider:
- Virtualizing (only render visible charts)
- Reducing data resolution (1H instead of 1min for background charts)

### WebSocket Connections
| Strategy | Connections | Pros | Cons |
|----------|-------------|------|------|
| **One WS per chart** | N connections | Simple, independent | High resource usage, more connections to manage |
| **Single shared WS** | 1 connection | Efficient, single reconnect | Subscription management needed |
| **WS per symbol** | ≤ N (deduplicated) | Balanced | Medium complexity |

**Recommendation**: **One WebSocket connection per unique symbol**. Multiple charts showing the same symbol share one data feed. This is the approach used by TradingView and most professional platforms.

```typescript
// DataFeedManager — singleton WebSocket per symbol
class DataFeedManager {
  private connections = new Map<string, WebSocket>();
  private subscribers = new Map<string, Set<ChartInstance>>();

  subscribe(symbol: string, chart: ChartInstance) {
    if (!this.connections.has(symbol)) {
      this.createConnection(symbol);
    }
    this.subscribers.get(symbol)!.add(chart);
  }

  unsubscribe(symbol: string, chart: ChartInstance) {
    const subs = this.subscribers.get(symbol);
    subs?.delete(chart);
    if (subs?.size === 0) {
      this.connections.get(symbol)?.close();
      this.connections.delete(symbol);
      this.subscribers.delete(symbol);
    }
  }
}
```

### Resize Handling
**Critical performance issue**: When resizing panels, all visible charts receive resize events. Without debouncing, this causes massive repaints.

```typescript
// Debounced resize for all charts
const resizeObserver = new ResizeObserver(
  debounce((entries) => {
    entries.forEach((entry) => {
      const chart = getChartForElement(entry.target);
      chart?.applyOptions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
  }, 16) // ~1 frame at 60fps
);
```

**Alternative**: Use `autoSize: true` in LWC v5, which handles resize internally:
```typescript
const chart = createChart(container, {
  autoSize: true, // automatically resizes with container
});
```

### Data Conflation (v5.1+)
Lightweight Charts v5.1 introduced **data conflation** — automatically reducing visible data points when zoomed out:

```typescript
chart.applyOptions({
  conflation: {
    enabled: true, // default in v5.1+
  },
});
```

This significantly improves performance for large datasets. For charts with 10,000+ data points, conflation can reduce rendering time by 50-80%.

### Performance Optimization Checklist
1. ✅ Use `autoSize: true` or debounced resize (not both)
2. ✅ Share WebSocket connections per symbol (not per chart)
3. ✅ Enable data conflation for large datasets
4. ✅ Lazy-create chart instances only when visible in the grid
5. ✅ Destroy chart instances when removed from layout (`chart.remove()`)
6. ✅ Use mutex/flag to prevent infinite sync loops
7. ✅ Batch series data updates (don't call `setData` in a loop)
8. ✅ Use `requestAnimationFrame` for crosshair sync to avoid jank
9. ✅ Consider `IntersectionObserver` to pause rendering for off-screen charts
10. ✅ Limit marker count per chart (Issue #1808 — markers are expensive)

---

## 7. Recommended Architecture for Shared-Toolbar Multi-Chart System

### Component Hierarchy
```
<TradingApp>
  <SharedToolbar>                    ← Single toolbar, operates on active chart
    <SymbolSelector />
    <IntervalSelector />
    <ChartTypeSelector />
    <IndicatorMenu />
    <LayoutSelector />               ← Switches between 1x1, 2x1, 2x2, etc.
    <SyncControls />                 ← Toggle sync groups
  </SharedToolbar>

  <ChartGrid layout={layout}>        ← Resizable panel layout
    <ChartCell chartId="0" />        ← Each cell tracks active state
    <ChartCell chartId="1" />
    <ChartCell chartId="2" />
    <ChartCell chartId="3" />
  </ChartGrid>
</TradingApp>
```

### State Store (Zustand)
```typescript
interface TradingStore {
  // Layout
  layout: LayoutConfig;
  setLayout: (layout: LayoutConfig) => void;

  // Active chart
  activeChartId: string;
  setActiveChartId: (id: string) => void;

  // Chart configurations
  charts: Record<string, ChartConfig>;
  updateChartConfig: (id: string, config: Partial<ChartConfig>) => void;

  // Sync
  syncEnabled: { symbol: boolean; interval: boolean; crosshair: boolean; scroll: boolean };
  setSyncEnabled: (sync: Partial<TradingStore['syncEnabled']>) => void;

  // Crosshair state (for sync)
  crosshairTime: number | null;
  crosshairSource: string | null;  // which chart originated the crosshair
  setCrosshairTime: (time: number | null, sourceChartId: string | null) => void;
}
```

### Data Flow
```
User clicks toolbar symbol dropdown
  → store.updateChartConfig(activeChartId, { symbol: 'ETH/USDT' })
  → if syncEnabled.symbol: update all charts' symbols
  → ChartCell re-renders with new symbol
  → DataFeedManager subscribes to new symbol, unsubscribes old
  → WebSocket sends new data
  → chart.setData() / chart.update() called
```

### Sync Architecture
```
Chart A crosshair moves
  → chartA.subscribeCrosshairMove()
  → store.setCrosshairTime(time, 'chart-a')
  → All other ChartCells detect crosshairTime change
  → chartB.setCrosshairPosition(), chartC.setCrosshairPosition(), etc.
  → Mutex prevents re-entrant updates
```

### Key Implementation Details

1. **Chart Instance Registry**: Keep a `Map<string, IChartApi>` to reference all chart instances without prop drilling
2. **Event Delegation**: Route toolbar clicks to the active chart via the store, not via direct ref calls
3. **Layout Transitions**: When switching layouts (e.g., 1x1 → 2x2), preserve existing chart instances and redistribute them into new cells
4. **Persistence**: Save layout + chart configs to localStorage via Zustand middleware
5. **Cleanup**: Always call `chart.remove()` when unmounting a ChartCell to prevent memory leaks

---

## 8. Summary of Technical Recommendations

| Area | Recommendation | Priority |
|------|---------------|----------|
| **Layout Library** | `react-resizable-panels` or `allotment` | High |
| **State Management** | Zustand with localStorage persistence | High |
| **Chart Library** | lightweight-charts v5.2+ (native panes + conflation) | High |
| **WebSocket Strategy** | One connection per unique symbol, shared across charts | High |
| **Crosshair Sync** | `setCrosshairPosition` / `clearCrosshairPosition` with mutex flag | High |
| **Scroll/Zoom Sync** | `subscribeVisibleLogicalRangeChange` + `setVisibleLogicalRange` with mutex | High |
| **Resize Strategy** | `autoSize: true` in LWC v5 (or debounced ResizeObserver) | Medium |
| **Active Chart** | Click/focus detection → Zustand store → toolbar reads active chart config | High |
| **Shared Toolbar** | Single component, reads/writes active chart from store | High |
| **Sync Groups** | TradingView-style sync toggle (symbol/interval/crosshair) | Medium |
| **Layout Persistence** | Save to localStorage via Zustand persist middleware | Medium |
| **Performance** | Data conflation, lazy chart creation, shared WS, IntersectionObserver for off-screen | High |
| **CSS** | Grid for chart cells, Flexbox for toolbar, library for drag-resize | Medium |

---

## Sources

- TradingView Multi-Chart: https://www.tradingview.com/support/solutions/43000629990
- TradingView Layout Sync: https://www.tradingview.com/support/solutions/43000629992
- LWC Crosshair API: https://tradingview.github.io/lightweight-charts/tutorials/how_to/set-crosshair-position
- LWC Panes: https://tradingview.github.io/lightweight-charts/tutorials/how_to/panes
- LWC Sync Issue #1163: https://github.com/tradingview/lightweight-charts/issues/1163
- LWC Scroll Sync Bug #1608: https://github.com/tradingview/lightweight-charts/issues/1608
- LWC V5 Announcement: https://www.tradingview.com/blog/en/tradingview-lightweight-charts-version-5-50837
- LWC Release Notes: https://tradingview.github.io/lightweight-charts/docs/release-notes
- SO LWC Sync: https://stackoverflow.com/questions/73922838/how-to-sync-multiple-lightweight-chart-canvas
- IBM React Chart Sync: https://developer.ibm.com/articles/awb-synchronizing-multiple-charts-react
- react-resizable-panels: https://github.com/bvaughn/react-resizable-panels
- allotment: https://github.com/johnwalley/allotment
- SciChart JS Sync: https://www.scichart.com/blog/how-to-link-javascript-charts-and-synchronise-zooming-panning-crosshairs
- cTrader Chart Toolbar: https://help.ctrader.com/ctrader/charts/chart-toolbar
- MT5 Charts: https://www.metatrader5.com/en/terminal/help/charts_analysis/charts
