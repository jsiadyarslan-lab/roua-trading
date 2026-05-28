# Multi-Chart Grid Architecture Research
## How TradingView, MetaTrader 5, cTrader, and Binance Implement Multi-Chart Layouts

> **Purpose:** Deep-dive into how the best trading platforms architect their multi-chart grid features, with actionable patterns for connecting a shared toolbar to multiple lightweight-charts instances in Roua Trading.

---

## 1. TradingView — Multi-Chart Layout

### Architecture Overview
TradingView's multi-chart layout is the industry gold standard. Available on desktop (web + app) for Pro+ and Premium tiers.

| Aspect | Implementation |
|--------|----------------|
| **Max charts** | Up to 8 (Premium), 4 (Pro+), 2 (Pro), 1 (Free) |
| **Layout options** | 1×1, 2×1, 1×2, 2×2, 3×1, 1×3, 2×3, 3×2 |
| **Layout persistence** | Saved to cloud account, synced across devices |
| **Independent controls** | Each chart has its own symbol, timeframe, indicators, drawings |

### How the Toolbar Connects
**Key Pattern: Active/Focused Chart + Shared Toolbar**

TradingView uses a **single shared toolbar** that operates on the **currently focused (clicked) chart cell**:

1. **Focus-based targeting**: When you click any chart in the grid, that chart becomes "active" (highlighted with a blue border). The toolbar at the top reflects the active chart's state — its symbol, timeframe, chart type, and indicators.

2. **Toolbar state mirrors active chart**: The symbol dropdown, timeframe buttons, chart type selector, and indicator list ALL show the state of the focused chart. Changing any toolbar control applies the change ONLY to that focused chart.

3. **Per-chart state isolation**: Each chart cell maintains its own:
   - Symbol/ticker
   - Timeframe
   - Chart type (candle, line, area, etc.)
   - Indicator stack (each chart can have different indicators)
   - Drawing layer (drawings are per-chart, not shared)
   - Color theme / scale settings

4. **Drawing tools per chart**: You CAN draw on each mini chart. When you click a chart and select a drawing tool (trend line, Fibonacci, etc.), drawings are created on that specific chart only. Each chart has its own drawing layer.

5. **Indicator application per chart**: When you add an indicator (RSI, MACD, etc.) with the toolbar, it's added to the active chart only — not to all charts simultaneously.

6. **Sync mode (linked charts)**: TradingView offers a "link" feature where charts can be:
   - **Unlinked**: Fully independent (different symbol + timeframe)
   - **Linked by symbol**: Same symbol, different timeframes (ideal for MTF)
   - **Linked by timeframe**: Same timeframe, different symbols
   - **Fully linked**: Same symbol + timeframe (redundant but useful for different indicator stacks)

### TradingView's Cell Header Design
Each mini chart cell has a **minimal inline header** (~24-28px) showing:
- Symbol name (clickable to change)
- Timeframe abbreviation
- Current price with change % (right-aligned)
- A maximize/fullscreen button

The **main toolbar** at the top is the primary control surface. The cell headers are secondary — quick-access for symbol/timeframe changes without needing the toolbar.

---

## 2. MetaTrader 5 — Multi-Chart System

### Architecture Overview
MT5 uses a **native desktop MDI (Multiple Document Interface)** approach.

| Aspect | Implementation |
|--------|----------------|
| **Max charts** | Unlimited (limited by system resources) |
| **Layout options** | Tile horizontal, tile vertical, cascade, custom drag-resize |
| **Layout persistence** | Saved as "profiles" (XML-based workspace files) |
| **Independent controls** | Each chart has its own complete toolbar |

### How MT5 Handles Toolbars
**Key Pattern: Per-Chart Toolbar (MDI approach)**

MT5 is fundamentally different from TradingView:

1. **Each chart has its own toolbar**: When you open multiple charts in MT5, each chart window has its own mini toolbar with timeframe buttons, chart type, zoom, and indicator access.

2. **Main toolbar is shared but targets active window**: MT5 has a global toolbar at the top, but it always operates on the **active (focused) chart window**. The concept is identical to TradingView's focus-based approach, just with a native MDI look.

3. **Template system**: MT5 uses "templates" (.tpl files) to apply the same indicator/drawing configuration to multiple charts. You can save a chart's setup as a template and apply it to other charts.

4. **No built-in drawing sync**: Drawings on one chart do not appear on another. Each chart is completely independent.

5. **Crosshair sync**: MT5 does NOT synchronize crosshairs across charts by default. Each chart's crosshair operates independently.

6. **Profile-based workspace**: The entire layout (which charts are open, their size, symbol, timeframe, indicators, drawings) can be saved as a "profile" and restored later.

### MT5's Grid Layout System
- Charts can be **tiled** (grid) or **overlapped** (tabbed)
- Tile horizontal: All charts stacked vertically
- Tile vertical: All charts side by side
- Cascade: Overlapping windows with offset
- Each chart can be individually resized by dragging borders

---

## 3. cTrader — Multi-Chart Layout

### Architecture Overview
cTrader (by Spotware) uses a modern dockable panel system.

| Aspect | Implementation |
|--------|----------------|
| **Max charts** | Up to 20+ (resource-limited) |
| **Layout options** | Free-form dockable panels, preset grid layouts |
| **Layout persistence** | Workspace save/restore, cloud sync (cTrader ID) |
| **Independent controls** | Each chart has its own toolbar |

### cTrader's Unique Features
1. **Dockable panel architecture**: Charts are dockable panels that can be:
   - Tabbed (multiple charts in same area, switch via tabs)
   - Split horizontally or vertically
   - Floating (detached from main window)
   - Auto-hidden (collapse to edge)

2. **Per-chart toolbars**: Each chart area has its own mini toolbar with:
   - Symbol selector
   - Timeframe buttons
   - Chart type
   - Quick indicator buttons
   - Drawing tools

3. **Crosshair sync option**: cTrader uniquely offers an option to synchronize the time axis crosshair across all open charts. When you move your mouse on one chart, the vertical crosshair line appears on all charts at the same time position. This is extremely useful for multi-timeframe analysis.

4. **Symbol link groups**: Charts can be assigned to "link groups" (color-coded). Charts in the same link group share symbol changes — changing the symbol on one chart changes it on all linked charts.

5. **cBot integration**: Automated strategies (cBots) can be attached to individual chart instances.

---

## 4. Binance — Multi-Chart Feature

### Architecture Overview
Binance's multi-chart is web-based, available on desktop trading view.

| Aspect | Implementation |
|--------|----------------|
| **Max charts** | Up to 4 on desktop |
| **Layout options** | 2×1, 1×2, 2×2 |
| **Layout persistence** | Browser-based, not cloud-saved |
| **Independent controls** | Each chart has inline controls |

### Binance's Approach
1. **Inline controls per chart**: Each mini chart has its own:
   - Symbol selector dropdown (top-left of each cell)
   - Timeframe buttons (next to symbol)
   - Small chart type selector
   - Current price display
   - 24h change percentage

2. **No global toolbar for grid**: When in multi-chart mode, Binance does NOT use the main toolbar to control individual charts. Instead, each chart cell has its own compact inline controls. The main toolbar is hidden or replaced by the grid top bar.

3. **No drawing tools in grid mode**: Binance's multi-chart mode is primarily for **monitoring** — you cannot draw trend lines or apply indicators to mini charts in grid mode. To use drawing tools, you must maximize a single chart.

4. **Order panel integration**: Each chart cell can have a compact buy/sell panel at the bottom.

5. **Synchronization**: No cross-chart sync. Each chart is fully independent.

---

## 5. Architectural Patterns Summary

### Pattern A: Shared Toolbar with Active Focus (TradingView-style)
```
┌─────────────────────────────────────────┐
│  [GLOBAL TOOLBAR] → targets active cell │
│  Symbol: BTC/USDT | 15m | 🕯 | IND |  │
├──────────────────┬──────────────────────┤
│  ┌─Cell A──────┐ │  ┌─Cell B──────┐    │
│  │ BTC/USDT 15m│ │  │ ETH/USDT 1h │    │
│  │ [ACTIVE ✓]  │ │  │             │    │
│  │  ▅▆▇█▇▆▅▄  │ │  │  ▃▄▅▆▇█▇▆  │    │
│  └─────────────┘ │  └─────────────┘    │
├──────────────────┼──────────────────────┤
│  ┌─Cell C──────┐ │  ┌─Cell D──────┐    │
│  │ SOL/USDT 4h │ │  │ XRP/USDT 1D │    │
│  │             │ │  │             │    │
│  │  ▃▅▇█▇▅▃▂  │ │  │  ▅▆▇▇▆▅▄▃  │    │
│  └─────────────┘ │  └─────────────┘    │
└──────────────────┴──────────────────────┘
```
**How it works:**
- One toolbar at the top
- `focusedCellId` state tracks which cell is active
- Toolbar reads state from `cells[focusedCellId]`
- Toolbar actions dispatch to `cells[focusedCellId]` only
- Click on a cell → set `focusedCellId` → toolbar updates

**Pros:** Clean UI, consistent experience, familiar to TradingView users
**Cons:** Requires click-to-focus before toolbar actions work

### Pattern B: Per-Cell Inline Controls (Binance-style)
```
┌─────────────────────────────────────────┐
│  [GRID TOOLBAR] grid size | sync | close│
├──────────────────┬──────────────────────┤
│ [BTC▼] [1m|5m|15m]│ [ETH▼] [1m|5m|15m]│
│  ▅▆▇█▇▆▅▄       │  ▃▄▅▆▇█▇▆         │
│  Price: $67,432   │  Price: $3,456      │
├──────────────────┼──────────────────────┤
│ [SOL▼] [1m|5m|15m]│ [XRP▼] [1m|5m|15m]│
│  ▃▅▇█▇▅▃▂       │  ▅▆▇▇▆▅▄▃          │
│  Price: $178.50   │  Price: $2.34       │
└──────────────────┴──────────────────────┘
```
**How it works:**
- Each cell has its own mini toolbar (symbol, timeframe, chart type)
- No global toolbar targeting individual cells
- Grid-level toolbar only controls grid layout (size, sync, close)

**Pros:** No ambiguity about which chart you're controlling, simpler state management
**Cons:** Takes space from each chart cell, limited tool access per cell

### Pattern C: Hybrid (Best Practice for lightweight-charts)
```
┌─────────────────────────────────────────┐
│  [SHARED TOOLBAR] → targets focused cell│
│  + [QUICK CONTROLS per cell]            │
│  Symbol | TF | Type | Draw | IND | ...  │
├──────────────────┬──────────────────────┤
│  BTC/USDT 15m ▾ │  ETH/USDT 1h ▾      │
│  ┌────────────┐  │  ┌────────────┐      │
│  │ [ACTIVE ✓] │  │  │            │      │
│  │ ▅▆▇█▇▆▅▄  │  │  │ ▃▄▅▆▇█▇▆  │      │
│  └────────────┘  │  └────────────┘      │
│  $67,432 +2.3%   │  $3,456 -0.8%       │
├──────────────────┼──────────────────────┤
│  SOL/USDT 4h ▾   │  XRP/USDT 1D ▾      │
│  ┌────────────┐  │  ┌────────────┐      │
│  │            │  │  │            │      │
│  │ ▃▅▇█▇▅▃▂  │  │  │ ▅▆▇▇▆▅▄▃  │      │
│  └────────────┘  │  └────────────┘      │
│  $178.50 -1.2%   │  $2.34 +0.5%        │
└──────────────────┴──────────────────────┘
```
**How it works:**
- Shared toolbar at top (full-featured) targets the focused cell
- Each cell has compact inline controls (symbol dropdown + timeframe buttons + price)
- Cell inline controls are always available for quick changes
- Full toolbar provides advanced features (drawing tools, indicators, overlays, AI panel)

**Pros:** Best of both worlds — quick access per cell + full tool access via shared toolbar
**Cons:** More complex implementation, two control surfaces to keep in sync

---

## 6. Best Practice for lightweight-charts Multiple Instances

### Core Challenge
`lightweight-charts` v5 creates independent chart instances. There is no built-in mechanism to "link" toolbars across instances. Each `createChart()` call produces a fully independent chart with its own API.

### Recommended Architecture: Registry Pattern with Focus

```typescript
// ── Chart Instance Registry ──
interface ChartCell {
  id: string;
  chart: IChartApi;           // lightweight-charts instance
  mainSeries: ISeriesApi;     // candlestick/line/area series
  volumeSeries: ISeriesApi;   // volume histogram
  symbol: string;
  timeframe: string;
  chartType: ChartType;
  indicators: Map<string, ActiveIndicator>;
  drawings: DrawingLayer;
  overlayRegistry: OverlayRegistry;
}

// Global registry — holds all chart instances
class ChartGridRegistry {
  private cells: Map<string, ChartCell> = new Map();
  private focusedCellId: string | null = null;
  private listeners: Set<(focusedId: string | null) => void> = new Set();

  register(id: string, cell: ChartCell) { this.cells.set(id, cell); }
  unregister(id: string) { this.cells.delete(id); }
  
  focus(id: string) {
    this.focusedCellId = id;
    this.listeners.forEach(fn => fn(id));
  }
  
  getFocused(): ChartCell | null {
    return this.focusedCellId ? this.cells.get(this.focusedCellId) ?? null : null;
  }

  // Toolbar calls this — routes action to focused chart
  applyToFocused(action: (cell: ChartCell) => void) {
    const cell = this.getFocused();
    if (cell) action(cell);
  }

  onFocusChange(listener: (id: string | null) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
```

### Toolbar Connection Pattern

```typescript
// ── Shared Toolbar Component ──
function ChartGridToolbar({ registry }: { registry: ChartGridRegistry }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [focusedCell, setFocusedCell] = useState<ChartCell | null>(null);

  // Subscribe to focus changes
  useEffect(() => {
    return registry.onFocusChange(id => {
      setFocusedId(id);
      setFocusedCell(id ? registry.getCell(id) : null);
    });
  }, []);

  // Toolbar actions route to focused chart
  const handleSetTimeframe = (tf: string) => {
    registry.applyToFocused(cell => {
      cell.timeframe = tf;
      // Re-fetch data for this cell's chart
      loadDataForCell(cell.id, cell.symbol, tf);
    });
  };

  const handleSetChartType = (type: ChartType) => {
    registry.applyToFocused(cell => {
      cell.chartType = type;
      // Recreate series on this cell's chart
      recreateSeries(cell, type);
    });
  };

  const handleAddIndicator = (indicator: ActiveIndicator) => {
    registry.applyToFocused(cell => {
      cell.indicators.set(indicator.key, indicator);
      // Apply indicator to this cell's chart instance
      applyIndicatorToChart(cell.chart, cell.mainSeries, indicator);
    });
  };

  const handleSetDrawingTool = (tool: DrawingTool) => {
    registry.applyToFocused(cell => {
      cell.drawings.setActiveTool(tool);
    });
  };

  // Toolbar reflects focused chart's state
  return (
    <Toolbar
      symbol={focusedCell?.symbol ?? ''}
      timeframe={focusedCell?.timeframe ?? '15min'}
      chartType={focusedCell?.chartType ?? 'candle'}
      indicators={focusedCell?.indicators ? Array.from(focusedCell.indicators.values()) : []}
      onSetTimeframe={handleSetTimeframe}
      onSetChartType={handleSetChartType}
      onAddIndicator={handleAddIndicator}
      onSetDrawingTool={handleSetDrawingTool}
      // ... other props
    />
  );
}
```

### Per-Cell Inline Controls

```typescript
// ── Cell Header with Quick Controls ──
function ChartCellHeader({ cell, onFocus, isFocused }: {
  cell: ChartCell;
  onFocus: () => void;
  isFocused: boolean;
}) {
  return (
    <div
      onClick={onFocus}
      style={{
        height: 28,
        borderBottom: isFocused ? '1px solid cyan' : '1px solid gray',
        // ... styling
      }}
    >
      {/* Symbol dropdown — changes this cell only */}
      <select
        value={cell.symbol}
        onChange={e => handleChangeSymbol(cell.id, e.target.value)}
      >
        {POPULAR_PAIRS.map(p => <option key={p}>{p}</option>)}
      </select>

      {/* Timeframe buttons — changes this cell only */}
      {TIMEFRAMES.map(tf => (
        <button
          key={tf.value}
          style={{ fontWeight: cell.timeframe === tf.value ? 700 : 400 }}
          onClick={() => handleChangeTimeframe(cell.id, tf.value)}
        >
          {tf.label}
        </button>
      ))}

      {/* Price display */}
      <span>{formatPrice(cell.currentPrice)}</span>
      <span>{cell.changePercent?.toFixed(2)}%</span>

      {/* Chart type mini selector */}
      <select
        value={cell.chartType}
        onChange={e => handleChangeChartType(cell.id, e.target.value)}
      >
        <option value="candle">🕯</option>
        <option value="line">📈</option>
        <option value="area">📊</option>
      </select>

      {/* Maximize button */}
      <button onClick={() => toggleFullscreen(cell.id)}>⛶</button>
    </div>
  );
}
```

### Key Implementation Details for lightweight-charts

#### 1. Chart Instance Lifecycle
```typescript
// Create chart for each cell
function createChartForCell(container: HTMLDivElement, cell: GridCell): ChartCell {
  const chart = createChart(container, {
    layout: { background: { color: '#0B0E14' }, textColor: '#8B92A8' },
    grid: { vertLines: { color: 'rgba(42,49,60,0.25)' }, horzLines: { color: 'rgba(42,49,60,0.25)' } },
    timeScale: { timeVisible: true, borderVisible: false },
    crosshair: { mode: 0 },
    handleScroll: true,
    handleScale: true,
  });

  const mainSeries = chart.addSeries(CandlestickSeries, { /* options */ });
  const volumeSeries = chart.addSeries(HistogramSeries, { priceScaleId: 'volume' });

  return {
    id: cell.id,
    chart,
    mainSeries,
    volumeSeries,
    symbol: cell.symbol,
    timeframe: cell.timeframe,
    chartType: cell.chartType,
    indicators: new Map(),
    drawings: new DrawingLayer(),
    overlayRegistry: new OverlayRegistry(),
  };
}

// Cleanup — CRITICAL to prevent memory leaks
function destroyChartCell(cell: ChartCell) {
  cell.overlayRegistry.clearAll();
  cell.indicators.clear();
  cell.chart.remove(); // Removes all series, primitives, listeners
}
```

#### 2. Crosshair Synchronization (cTrader-style)
```typescript
// Optional: Sync vertical crosshair across all charts
function setupCrosshairSync(registry: ChartGridRegistry) {
  registry.getAllCells().forEach(cell => {
    cell.chart.subscribeCrosshairMove(param => {
      if (!param.time) return;
      // Sync all other charts to the same time position
      registry.getAllCells().forEach(other => {
        if (other.id !== cell.id) {
          other.chart.setTimeScalePosition(param.time);
        }
      });
    });
  });
}
```

#### 3. Resize Handling
```typescript
// Single ResizeObserver for all chart containers
const observer = new ResizeObserver(entries => {
  for (const entry of entries) {
    const { width, height } = entry.contentRect;
    if (width > 0 && height > 0) {
      const cell = registry.getCellByContainer(entry.target);
      if (cell) {
        cell.chart.applyOptions({ width, height });
      }
    }
  }
});
```

#### 4. Memory Management
With multiple lightweight-charts instances, memory is a concern:

| Charts | Estimated RAM | Strategy |
|--------|--------------|----------|
| 1 | ~20 MB | No concern |
| 2×2 (4) | ~80 MB | Manageable |
| 3×2 (6) | ~120 MB | Monitor |
| 3×3 (9) | ~180 MB | Consider lazy-load |

**Best practices:**
- Use `chart.remove()` immediately when a cell is removed from the grid
- Limit visible candles (e.g., `chart.timeScale().fitContent()` rather than loading 10,000 candles)
- Destroy and recreate chart instances on symbol/timeframe change (lightweight-charts doesn't have a "clear and reload" API — it's cheaper to recreate)
- Use `requestAnimationFrame` for batch resize operations

---

## 7. Current Roua ChartGrid Analysis

### What Roua Currently Has
The existing `ChartGrid.tsx` implements **Pattern B (Per-Cell Inline Controls)** — each cell has:
- Symbol selector dropdown
- Timeframe buttons
- Chart type selector
- Price display with change %
- Maximize button

### What's Missing
1. **No shared toolbar**: The full-featured `ChartToolbar` (with drawing tools, indicators, AI panel, overlays, etc.) is NOT available in grid mode. Only the mini inline controls work.

2. **No indicator support**: Mini charts don't support adding technical indicators (RSI, MACD, etc.)

3. **No drawing tools**: Can't draw trend lines, Fibonacci, etc. on mini charts

4. **No AI panel**: The AISmartPanel (pattern detection, Wyckoff, Elliott, etc.) is not available

5. **No overlay support**: No trend lines, S/R levels, FVG, BOS, harmonic patterns

6. **No crosshair sync**: Each chart's crosshair operates independently

7. **No chart instance registry**: Chart instances are stored in loose refs (`chartInstancesRef`, `seriesRefs`, `volumeSeriesRefs`) without a unified registry

### Recommended Upgrades (Priority Order)

#### Phase 1: Focus-Based Shared Toolbar (Pattern C)
1. Add `focusedCellId` state with visual indication (cyan border)
2. Create `ChartGridRegistry` class for unified chart instance management
3. Connect the existing `ChartToolbar` to target the focused cell
4. Keep inline controls for quick symbol/timeframe changes

#### Phase 2: Drawing & Indicator Support
1. Add `DrawingLayer` per chart cell (reuse existing `DrawingRenderer`)
2. Add indicator management per cell (reuse existing `IndicatorPanel` logic)
3. Drawing tool selection in toolbar → applies to focused chart

#### Phase 3: Cross-Chart Features
1. Crosshair time synchronization (cTrader-style)
2. Symbol link groups (TradingView-style)
3. Chart template save/apply per cell
4. AI panel per focused chart

---

## 8. Decision Matrix: Which Pattern to Use

| Factor | Pattern A (Shared Only) | Pattern B (Inline Only) | Pattern C (Hybrid) ★ |
|--------|------------------------|------------------------|---------------------|
| Space efficiency | ★★★★★ | ★★☆☆☆ | ★★★★☆ |
| Feature access | ★★★★★ | ★★☆☆☆ | ★★★★★ |
| No ambiguity | ★★☆☆☆ | ★★★★★ | ★★★★☆ |
| TradingView-like | ★★★★★ | ★☆☆☆☆ | ★★★★★ |
| Implementation complexity | ★★★☆☆ | ★★☆☆☆ | ★★★★☆ |
| Mobile friendly | ★★☆☆☆ | ★★★★★ | ★★★★☆ |

**Recommendation: Pattern C (Hybrid)** — This is what TradingView uses and what professional traders expect. The shared toolbar provides full feature access while inline controls give quick per-cell control.

---

## 9. Key Technical Constraints for lightweight-charts v5

1. **No built-in multi-chart API**: Each `createChart()` is independent. No way to "group" charts.

2. **Series must be recreated on type change**: There's no `series.setType()` method. To switch from candle to line, you must remove the old series and add a new one.

3. **Primitives are per-chart**: `ISeriesPrimitive` objects attached to one chart's series don't transfer to another. Each chart needs its own primitive instances.

4. **TimeScale can be synchronized programmatically**: `chart.timeScale().subscribeVisibleTimeRangeChange()` + `chart.timeScale().setVisibleRange()` enables crosshair sync.

5. **Chart removal is mandatory**: Always call `chart.remove()` when destroying a cell. Failing to do so leaks WebGL contexts (browsers limit to ~16 WebGL contexts).

6. **Dynamic import is safe**: `import('lightweight-charts')` can be called multiple times — the module is cached after first load. Use dynamic import in the grid to avoid initial bundle bloat.

---

## 10. Implementation Skeleton

```typescript
// ── ChartGridRegistry.ts ──
export class ChartGridRegistry {
  private cells = new Map<string, ChartCell>();
  private _focusedId: string | null = null;
  private focusListeners = new Set<(id: string | null) => void>();

  register(id: string, cell: ChartCell) { this.cells.set(id, cell); }
  unregister(id: string) {
    const cell = this.cells.get(id);
    if (cell) { cell.chart.remove(); this.cells.delete(id); }
    if (this._focusedId === id) this._focusedId = null;
  }

  focus(id: string) {
    this._focusedId = id;
    this.focusListeners.forEach(fn => fn(id));
  }

  get focused(): ChartCell | null {
    return this._focusedId ? (this.cells.get(this._focusedId) ?? null) : null;
  }

  get focusedId(): string | null { return this._focusedId; }

  applyToFocused(fn: (cell: ChartCell) => void) {
    if (this.focused) fn(this.focused);
  }

  onFocusChange(fn: (id: string | null) => void): () => void {
    this.focusListeners.add(fn);
    return () => this.focusListeners.delete(fn);
  }

  get all(): ChartCell[] { return Array.from(this.cells.values()); }
}

// ── Usage in ChartGrid.tsx ──
const registryRef = useRef(new ChartGridRegistry());

// Shared toolbar reads/writes focused cell state
<ChartGridToolbar
  registry={registryRef.current}
  // Reuse existing ChartToolbar component but route actions through registry
/>

// Each cell registers/unregisters
useEffect(() => {
  return () => { registryRef.current.unregister(cell.id); };
}, [cell.id]);
```

---

## Sources & References
- TradingView Advanced Charting Library documentation (tradingview.com/charting-library-docs)
- MetaTrader 5 MQL5 documentation (mql5.com)
- cTrader Open API documentation (spotware.com)
- Binance Futures desktop trading interface
- lightweight-charts v5 GitHub (tradingview/lightweight-charts)
- Existing project research: `/docs/TRADING_APP_RESEARCH.md`, `/trading_analysis_platforms_research.md`
