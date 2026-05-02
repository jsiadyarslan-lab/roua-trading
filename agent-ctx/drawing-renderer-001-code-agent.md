# Task: DrawingRenderer Implementation

## Agent: Code Agent
## Task ID: drawing-renderer-001

## Summary

Created the complete `DrawingRenderer.ts` class that connects the 15 drawing tools in the ROUA Trading Chart to actual mouse interactions on the chart canvas.

## Files Created/Modified

### Created
- **`apps/web/src/lib/charts/DrawingRenderer.ts`** — New file (~1085 lines)

### Modified
- **`apps/web/src/hooks/useChart.ts`** — Integrated DrawingRenderer into the chart hook

## DrawingRenderer Architecture

### Core Design
- Creates an HTML5 canvas overlay positioned absolutely on top of the lightweight-charts canvas
- Canvas has `pointerEvents: 'none'` by default (allows chart pan/zoom)
- Switches to `pointerEvents: 'auto'` during active drawing to capture mouse moves
- DPI-aware rendering via `window.devicePixelRatio`

### Public API
- `start()` — Creates overlay canvas, attaches event listeners
- `stop()` — Removes canvas and cleans up all listeners
- `setTool(tool)` — Changes active tool, resets in-progress drawing
- `clearAndRedraw()` — Clears all persisted drawings and re-renders
- `redraw()` — Full redraw of all persisted drawings + any in-progress preview
- `cancelDrawing()` — Cancels current in-progress drawing

### Drawing Tool Support (all 15)
| Tool | Clicks | Behavior |
|------|--------|----------|
| cursor | 0 | No drawing |
| horizontal | 1 | Horizontal line at price |
| vertical | 1 | Vertical line at time |
| x-marker | 1 | X mark at point |
| trendline | 2 | Line from A to B |
| fibonacci | 2 | 7 Fibonacci retracement levels with labels |
| rectangle | 2 | Rectangle with fill |
| channel | 3 | Two parallel lines with fill |
| triangle | 3 | Triangle with fill |
| circle | 2 | Circle centered at A |
| arc | 2 | Arc from A to B |
| arrow | 2 | Arrow from A to B |
| extended-line | 2 | Line extending beyond both points |
| ray | 2 | Line from A through B infinitely |
| price-range | 2 | Vertical range with price labels |

### Key Technical Decisions
1. **Overlay canvas approach** — lightweight-charts v5 has no built-in drawing API, so we overlay a separate canvas
2. **Coordinate conversion** — Uses `chart.timeScale().coordinateToTime()` / `timeToCoordinate()` and `candleSeries.coordinateToPrice()` / `priceToCoordinate()`
3. **Re-render on scroll/zoom** — Subscribes to `chart.timeScale().subscribeVisibleTimeRangeChange()`
4. **Preview rendering** — Dashed, semi-transparent lines shown while mouse moves after first click
5. **Point persistence** — Completed drawings are stored via DrawingManager (localStorage)
6. **Context switching** — `clickedPoints` is temporarily swapped when rendering persisted drawings so Fibonacci/PriceRange can read their own price values

### Integration in useChart.ts
- Added `drawingRendererRef` ref
- Initializes renderer after chart + candleSeries creation
- `setTool()` now also calls `renderer.setTool()`
- `clearDrawings()` now also calls `renderer.clearAndRedraw()`
- `cancelDrawing()` now also calls `renderer.setTool('cursor')` + `renderer.cancelDrawing()`
- Renderer is stopped on cleanup and re-initialized on symbol change

## Type Check Results
- No TypeScript errors introduced (4 pre-existing errors in unrelated files)
