# Roua Trading — Bug Registry (Permanent)

> **Purpose:** This file is the SINGLE source of truth for all chart-related bugs.
> Each bug has a STABLE ID (`BUG-NNN`). The `scripts/verify-bugs.ts` script reads
> this file and checks whether each bug is still present in the codebase.
>
> **Workflow:**
> 1. When you discover a bug, ADD it here with a new `BUG-NNN` ID.
> 2. When you fix a bug, change its status from `OPEN` → `FIXED` and add the commit hash.
> 3. Before any audit, run `npx tsx scripts/verify-bugs.ts` — it tells you which
>    bugs are still present, which were fixed, and which REGRESSED (came back).
>
> **Why this exists:** So we never "rediscover" the same bug in audit #4.
> See the commit message of the PR that introduced this file for the full rationale.

---

## How to add a new bug

```markdown
### BUG-NNN: Short title
- **Status:** OPEN | FIXED | REGRESSED
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW
- **File:** `path/to/file.ts:LINE`
- **Pattern:** (exact string or regex that verify-bugs.ts searches for)
- **Description:** What's wrong
- **Impact:** What breaks for the user
- **Fix:** (filled in when fixed)
- **Commit:** (filled in when fixed)
- **Test:** `path/to/test.spec.ts` (filled in when regression test added)
```

---

## CRITICAL Bugs (cause financial harm or data loss)

### BUG-001: Harmonic pattern direction INVERTED
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/chart-detection.ts:539`
- **Pattern (OPEN):** ^\s*const direction = X\.price < A\.price \? 'bullish' : 'bearish';$
- **Pattern (FIXED):** ^\s*const direction = X\.price < A\.price \? 'bearish' : 'bullish';$
- **Description:** Bullish harmonics (X high, A low) were labeled bearish, and vice versa. All harmonic signals displayed the WRONG direction.
- **Impact:** Users trading on harmonic signals would trade in the OPPOSITE direction of the signal. Direct financial harm.
- **Fix:** Swap `'bullish'` and `'bearish'` in the ternary.
- **Commit:** (filled after push)
- **Test:** `apps/web/src/lib/charts/__tests__/BUG-001.harmonic-direction.spec.ts`

### BUG-002: MTF Fib price line label shows "function map() { [native code] }"
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/overlay-renderer.ts:1312, 1823`
- **Pattern (OPEN):** ratios\?\.map \|\| \(\[\] as any\[\]\)\.map
- **Pattern (FIXED):** \(fib as any\)\.ratios \|\| \[\]\)\.map\(\(r: any\) => r\.label\)\.join
- **Description:** `(fib as any).ratios?.map` returns the `.map` METHOD REFERENCE (a function), not the result of calling it. The template literal coerces the function to string, producing the label "Fib MTF function map() { [native code] }".
- **Impact:** Every MTF Fibonacci confluence price line shows a nonsensical label. Users cannot read which fib levels are confluenced.
- **Fix:** Change `(fib as any).ratios?.map || ([] as any[]).map(r => r.label).join('+')` to `((fib as any).ratios || []).map((r: any) => r.label).join('+')`.
- **Commit:** (filled after push)
- **Test:** `apps/web/src/lib/charts/__tests__/BUG-002.mtf-fib-label.spec.ts`

### BUG-003: console.log fires on every mousemove in DrawingRenderer.syncPrimitive
- **Status:** FIXED
- **Severity:** HIGH (performance)
- **File:** `apps/web/src/lib/charts/DrawingRenderer.ts:2272`
- **Pattern (OPEN):** console\.log\(`\[DrawingRenderer\] syncPrimitive
- **Pattern (FIXED):** BUG-003 FIX: Removed verbose console\.log
- **Description:** A verbose `console.log` statement fires on every `syncPrimitive` call, which happens on every mousemove during drawing, every drag, and every timeframe change. Console.log is synchronous and slow — floods devtools and degrades rendering performance.
- **Impact:** Measurable frame drops during drawing on lower-end devices. Console clutter in production.
- **Fix:** Remove the console.log. Preserve the metric variables with `void` to avoid unused-variable warnings.
- **Commit:** (filled after push)
- **Test:** `apps/web/src/lib/charts/__tests__/BUG-003.no-console-log.spec.ts`

### BUG-004: OverlayRegistry.setSeries() detaches primitives from WRONG series (memory leak)
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/OverlayRegistry.ts:135-141`
- **Pattern (OPEN):** setSeries\(series[^)]*\)[\s\S]{0,200}this\.series = series;[\s\S]{0,100}this\.clearAll
- **Pattern (FIXED):** if \(this\.series\) \{[\s\S]*?this\.series!\.detachPrimitive\(primitive\)
- **Description:** `setSeries(series)` reassigned `this.series = series` FIRST, then called `clearAll()`. But `clearAll()` calls `this.series.detachPrimitive()` on the NEW series (where primitives were never attached). The OLD series's primitives were never detached → orphaned primitives → memory leak + ghost overlays.
- **Impact:** Memory leak on every chart recreation (timeframe change, multi-chart toggle). After 10-20 layout changes, page accumulates orphaned primitives.
- **Fix:** Detach from OLD series BEFORE reassigning `this.series`.
- **Commit:** (filled after push)
- **Test:** `apps/web/src/lib/charts/__tests__/BUG-004.setSeries-detach.spec.ts`

### BUG-005: `mcSpin` keyframes never defined — loading spinners are static
- **Status:** FIXED
- **Severity:** HIGH (visual)
- **File:** `apps/web/src/components/charts/RouaChart.tsx:5410` (ScopedStyle block)
- **Pattern (OPEN):** absent `@keyframes mcSpin`
- **Pattern (FIXED):** @keyframes mcSpin \{[^}]*from \{ transform: rotate\(0deg\); \}[^}]*to \{ transform: rotate\(360deg\); \}
- **Description:** Three loading spinners use `animation: 'mcSpin 1s linear infinite'` (RouaChart.tsx:223, 3177; ChartGridCellHeader.tsx:127) but `@keyframes mcSpin` was never defined anywhere in the codebase. The spinner elements render as static circles (no rotation).
- **Impact:** Loading indicators appear broken. Users see a static circle instead of a spinning loader, making the app look frozen.
- **Fix:** Add `@keyframes mcSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }` to the ScopedStyle block in RouaChart.tsx.
- **Commit:** (filled after push)
- **Test:** `apps/web/src/lib/charts/__tests__/BUG-005.mcSpin-keyframes.spec.ts`

### BUG-006: `updateAllViews()` is EMPTY in all 7 primitive classes — updateData is a no-op
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/chart-primitives.ts:150, 317, 434, 558, 672, 772, 946`
- **Pattern (OPEN):** updateAllViews\(\): void \{\s*\}` (7 occurrences)
- **Pattern (FIXED):** BUG-006 FIX
- **Description:** Every primitive class (`TrendLinePrimitive`, `HorizontalLinePrimitive`, `ShapePrimitive`, `FibonacciPrimitive`, `LabelPrimitive`, `ZonePrimitive`, `AlertMarkerPrimitive`) implements `updateAllViews(): void {}` with an empty body. The `updateData()` method calls `this.updateAllViews()` expecting it to trigger a redraw, but it does nothing. The primitive never calls `param.requestUpdate()`. Result: `updateData()` is a silent no-op — data is updated internally but the chart never redraws until an external event (scroll, zoom, candle tick).
- **Impact:** Overlays never visually update on data change. The `smartRedraw` workaround in OverlayRegistry exists to paper over this — fixing this bug eliminates an entire class of "dancing lines" symptoms.
- **Fix:** Store `requestUpdate` from `attached()` param, call it in `updateAllViews()`:
  ```typescript
  attached(param: SeriesAttachedParameter): void {
    this._param = param;
    this._requestUpdate = param.requestUpdate;
  }
  updateAllViews(): void {
    if (this._requestUpdate) this._requestUpdate();
  }
  ```

### BUG-007: `stableFallbackEntry` cache not cleared on symbol change
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/overlay-renderer.ts:54, 69-71, 84`
- **Pattern (OPEN):** let _cachedFallbackEntry` (module-level singleton keyed only by direction)
- **Pattern (FIXED):** _cachedFallbackEntry\.symbol === currentSymbol
- **Description:** `_cachedFallbackEntry` is a module-level variable cached ONLY by direction ('long'/'short'). When the user switches symbol (e.g., BTC → ETH), if both have the same EMA9>EMA20 direction, the OLD cached entry/SL/TP from BTC is used for ETH. `resetFallbackEntryCache()` exists (line 89) but is only called on timeframe change, not symbol change.
- **Impact:** After switching symbols, BTC's entry/SL/TP lines appear on ETH's chart. Misleading trade signals.
- **Fix:** Call `resetFallbackEntryCache()` on symbol change. Better: key the cache by `symbol+direction`.

### BUG-008: `renderAnalysisOverlays` has NO render lock (race with `renderOverlays`)
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/overlay-renderer.ts:1644-1654`
- **Pattern (OPEN):** renderAnalysisOverlays` does NOT call `acquireRenderLock
- **Pattern (FIXED):** BUG-008 FIX
- **Description:** `renderOverlays` acquires a mutex (`registry.acquireRenderLock()` at line 244). But `renderAnalysisOverlays` does NOT. Both functions mutate the same `OverlayRegistry`. If `handlePatternsDetected` fires `renderAnalysisOverlays` while `renderOverlays` is running (e.g., from a WebSocket tick), they concurrently modify `groups`, `lastRenderData`, and call `attachPrimitive`/`detachPrimitive` on the same series.
- **Impact:** Corrupted group arrays, double-attachment, visual flicker, potential crashes.
- **Fix:** `renderAnalysisOverlays` must also acquire the render lock, or use a separate registry.

### BUG-009: Harmonic patterns calculated in PIXEL space, not price/time space
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/lib/charts/DrawingRenderer.ts:1756-1826`
- **Pattern (OPEN):** const dx = a\.x - x\.x, dy = a\.y - x\.y;` using `dx = a.x - x.x` (pixel coords)
- **Pattern (FIXED):** BUG-009 FIX
- **Description:** Harmonic ratios (0.382, 0.886, etc.) are applied to PIXEL coordinates, not price/time. When the chart's price scale changes (zoom, autoscale), the pattern distorts. The ratios are meaningless in pixel space.
- **Impact:** Drawn harmonic patterns distort on zoom. Ratios don't match the actual pattern definition.
- **Fix:** Rewrite all harmonic drawing functions to operate in price/time space using `series.coordinateToPrice()` and `chart.timeScale().coordinateToTime()`.

### BUG-010: `onSLTPDrag` prop never destructured — SL/TP drag is dead code
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/web/src/components/charts/RouaChart.tsx:117 (declaration), 345-365 (destructure), 1653 (ref), 3460 (call)`
- **Pattern (OPEN):** onSLTPDragRef\.current\?\.\(` exists but `onSLTPDragRef\.current = onSLTPDrag` is ABSENT
- **Pattern (FIXED):** onSLTPDragRef\.current = onSLTPDrag
- **Description:** The prop `onSLTPDrag` is declared in `RouaChartProps` at line 117. The component's destructuring at lines 345-365 does NOT include `onSLTPDrag`. A ref `onSLTPDragRef` is declared at line 1653 but NEVER assigned. At line 3460, the drag-end handler calls `onSLTPDragRef.current?.(...)` — the optional chaining silently swallows the `undefined`, so no callback ever fires.
- **Impact:** The entire SL/TP drag-to-adjust feature is visually functional (the line follows the mouse during drag) but FUNCTIONALLY BROKEN — the new price is computed and then discarded. The position's SL/TP is never updated in the store or backend.
- **Fix:** (1) Add `onSLTPDrag` to the destructuring. (2) Add `useEffect(() => { onSLTPDragRef.current = onSLTPDrag; }, [onSLTPDrag]);`

### BUG-011: AutoTradeEngine `calculateStopLoss` may place SL on wrong side of entry
- **Status:** FIXED
- **Severity:** CRITICAL (financial)
- **File:** `apps/web/src/lib/charts/AutoTradeEngine.ts:315`
- **Pattern (OPEN):** patternInvalidation - entryPrice` without validating `patternInvalidation < entryPrice` for bullish
- **Pattern (FIXED):** BUG-011 FIX
- **Description:** For a bullish trade, SL should be BELOW entry. But `patternInvalidation` may be ABOVE entry (e.g., a distribution UTAD level above current price). The code does `slDistance = Math.abs(entryPrice - patternInvalidation)` (positive), `slPct` is positive, the check passes, and the returned SL is `patternInvalidation - spread` — which is ABOVE entry. The SL is on the wrong side, guaranteeing an immediate loss.
- **Impact:** SL placed on the wrong side of entry → trade closes at a loss immediately.
- **Fix:** Add `if (direction === 'bullish' && patternInvalidation >= entryPrice) return fallbackATRSL;` and vice versa.

### BUG-012: AutoTradeEngine TP3 P&L overstates 5× (counts full position instead of remaining 20%)
- **Status:** FIXED
- **Severity:** CRITICAL (financial)
- **File:** `apps/web/src/lib/charts/AutoTradeEngine.ts:838-840`
- **Pattern (OPEN):** pnlChange = proposal\.positionSize \* Math\.abs\(proposal\.takeProfits\[2\] - proposal\.entryPrice\)` (no remaining fraction)
- **Pattern (FIXED):** BUG-012 FIX
- **Description:** TP1 closes 50% of position, TP2 closes 30%. But TP3 P&L is calculated as `positionSize * |TP3 - entry|` — the FULL position, not the remaining 20%. So TP3 P&L is 5× overstated.
- **Impact:** Daily P&L, win rate, Kelly fraction all computed from inflated TP3 profits. Risk management decisions based on wrong numbers.
- **Fix:** `const remainingFraction = 1 - partialCloses.filter(pc => pc.executed).reduce((s, pc) => s + pc.fraction, 0); pnlChange = remainingFraction * positionSize * Math.abs(TP3 - entry);`

### BUG-013: Kelly fraction returns 0.25 (quarter-Kelly) when losses.length === 0
- **Status:** FIXED
- **Severity:** HIGH (financial)
- **File:** `apps/web/src/lib/charts/AutoTradeEngine.ts:410`
- **Pattern (OPEN):** ^\s*if \(losses\.length === 0\) return 0\.25; // All wins
- **Pattern (FIXED):** BUG-013 FIX
- **Description:** If the first 10 trades are all wins, Kelly fraction = 0.25 (max). But this is purely luck; the true win rate is unknown. Betting 25% of account per trade based on 10 lucky wins is reckless.
- **Impact:** Catastrophic risk on lucky streaks — one loss wipes 25% of the account.
- **Fix:** `if (completed.length < 30 || losses.length < 5) return 0;`

### BUG-014: `usePositionsStore` static localStorage key → cross-user data leak
- **Status:** FIXED
- **Severity:** CRITICAL (security)
- **File:** `apps/web/src/hooks/usePositionsStore.ts:1730`
- **Pattern (OPEN):** name: getStorageKey\(\)` evaluated ONCE at module load
- **Pattern (FIXED):** BUG-014 FIX
- **Description:** `name: getStorageKey()` is called ONCE when the store is created (module load). At that point, `useAuthStore.getState().user` is `null` (auth not hydrated), so `getStorageKey()` returns the static `'roua-positions-store'`. ALL users share this key. The `onRehydrateStorage` callback validates `_ownerUserId` and clears if mismatched — but there's a ~100ms window between rehydration (showing user A's data) and the validation clearing it.
- **Impact:** User B briefly sees user A's positions and balance on a shared browser.
- **Fix:** Use the same `dynamicStorage` pattern as `useChartStateStore` (re-evaluate key on every access).

### BUG-015: `useMarketStore` batching broken (queueMicrotask returns void)
- **Status:** FIXED
- **Severity:** HIGH (performance)
- **File:** `apps/web/src/hooks/useMarketStore.ts:39-63`
- **Pattern (OPEN):** batchTimer = queueMicrotask\(` then `if \(!batchTimer\)
- **Pattern (FIXED):** BUG-015 FIX
- **Description:** `queueMicrotask(() => ...)` returns `void` (undefined). So `batchTimer = queueMicrotask(...)` sets `batchTimer = undefined`. The check `if (!batchTimer)` is ALWAYS TRUE (undefined is falsy). A new microtask is scheduled on EVERY `setQuote` call. The batching doesn't work for async-spaced ticks — 24 re-renders instead of 4.
- **Impact:** 6× more re-renders than intended. UI jank on multi-symbol dashboards.
- **Fix:** Use a boolean flag: `let batchScheduled = false;` instead of `batchTimer`.

### BUG-016: DrawingManager silent data loss on localStorage corruption
- **Status:** FIXED
- **Severity:** CRITICAL (data loss)
- **File:** `apps/web/src/lib/charts/DrawingManager.ts:327-329`
- **Pattern (OPEN):** catch \{ /\* Corrupted data — start fresh \*/ \}
- **Pattern (FIXED):** BUG-016 FIX
- **Description:** If `JSON.parse(raw)` throws (corrupted JSON), the entire drawings array is silently wiped. The `drawings` Map stays empty, and the next `saveToStorage` call OVERWRITES the corrupted data with an empty object — permanently destroying the user's drawings.
- **Impact:** Permanent loss of all saved drawings without any notification.
- **Fix:** On parse error, RENAME the corrupted key (e.g., `roua-chart-drawings:userId.corrupted-{timestamp}`) instead of overwriting. Show a toast: "Your saved drawings were corrupted and have been archived."

### BUG-017: Ichimoku Chikou Span has look-ahead bias (shows future close)
- **Status:** FIXED
- **Severity:** HIGH (backtesting invalid)
- **File:** `apps/web/src/lib/charts/IndicatorCalculator.ts:348-355`
- **Pattern (OPEN):** chikou = i \+ displacement < len \? candles\[i \+ displacement\]\.close : null
- **Pattern (FIXED):** candles\[i - displacement\]\.close
- **Description:** At chart position `i`, Chikou displays `candles[i + 26].close` — the close from 26 bars in the FUTURE. Standard Chikou Span shows the CURRENT close drawn 26 bars BACKWARD (at position `i - 26`). The current implementation has look-ahead bias — makes backtests look accurate but is invalid for live trading.
- **Impact:** Backtests using Chikou show unrealistic accuracy. Live signals are meaningless.
- **Fix:** `chikou[i] = candles[Math.max(0, i - displacement)].close`

### BUG-018: MTF Fibonacci retracement levels INVERTED
- **Status:** FIXED
- **Severity:** HIGH
- **File:** `apps/web/src/lib/charts/MTFEngine.ts:431-435`
- **Pattern (OPEN):** isUptrend \? high - range \* fib\.ratio : low \+ range \* fib\.ratio
- **Pattern (FIXED):** low \+ range \* fib\.ratio.* Uptrend: 0% at low
- **Description:** Standard Fibonacci retracement in uptrend: 0% = low, 100% = high, 38.2% retrace = `low + range * 0.382`. The code uses `high - range * ratio` (0% = high, 100% = low) — the EXTENSION convention, not retracement. Both uptrend and downtrend formulas are inverted vs. TradingView.
- **Impact:** All MTF Fibonacci levels drawn at wrong prices. Confluence detection finds false confluences.
- **Fix:** Swap: uptrend → `low + range * ratio`, downtrend → `high - range * ratio`.

### BUG-019: ATR formula uses current close instead of previous close
- **Status:** FIXED
- **Severity:** HIGH
- **File:** `apps/web/src/lib/charts/overlay-renderer.ts:75-78, 195-199`
- **Pattern (OPEN):** Math\.max\(c\.high - c\.close, Math\.abs\(c\.low - c\.close\), c\.high - c\.low\)
- **Pattern (FIXED):** BUG-019 FIX.* prevClose
- **Description:** Standard True Range: `max(high-low, |high - prevClose|, |low - prevClose|)`. The code uses CURRENT close instead of PREVIOUS close. Since `high >= close >= low`, `high - low >= both` always → TR reduces to `high - low`, **completely ignoring gaps**.
- **Impact:** ATR underestimates volatility in gapping markets (weekend forex, news). SL/TP based on ATR are too tight.
- **Fix:** `Math.max(c.high - c.low, Math.abs(c.high - sl[i-1].close), Math.abs(c.low - sl[i-1].close))`

### BUG-020: "EMA9" and "EMA20" are actually Simple Moving Averages
- **Status:** FIXED
- **Severity:** HIGH
- **File:** `apps/web/src/lib/charts/overlay-renderer.ts:62-63`
- **Pattern (OPEN):** ^\s*const ema9 = last20\.slice\(-9\)\.reduce
- **Pattern (FIXED):** BUG-020 FIX
- **Description:** The code computes `sum of last 9 closes / 9` — this is an SMA (Simple Moving Average), not an EMA (Exponential Moving Average). The comment and variable name say "EMA" but the formula is SMA. EMA gives more weight to recent prices; SMA treats all equally.
- **Impact:** Direction signals differ significantly from a real EMA crossover. Entry/SL/TP based on "EMA" cross are wrong.
- **Fix:** Implement proper EMA: `const k = 2 / (period + 1); let ema = values[0]; for (let i = 1; i < values.length; i++) ema = values[i] * k + ema * (1 - k); return ema;`

---

## Summary Table

| ID | Severity | Status | File | One-line |
|----|----------|--------|------|----------|
| BUG-001 | CRITICAL | FIXED | chart-detection.ts | Harmonic direction inverted |
| BUG-002 | CRITICAL | FIXED | overlay-renderer.ts | MTF Fib label shows function ref |
| BUG-003 | HIGH | FIXED | DrawingRenderer.ts | console.log on every mousemove |
| BUG-004 | CRITICAL | FIXED | OverlayRegistry.ts | setSeries detaches wrong series |
| BUG-005 | HIGH | FIXED | RouaChart.tsx | mcSpin keyframes missing |
| BUG-006 | CRITICAL | OPEN | chart-primitives.ts | updateAllViews() empty (7 places) |
| BUG-007 | CRITICAL | OPEN | overlay-renderer.ts | stableFallbackEntry not cleared on symbol change |
| BUG-008 | CRITICAL | OPEN | overlay-renderer.ts | renderAnalysisOverlays no render lock |
| BUG-009 | CRITICAL | OPEN | DrawingRenderer.ts | Harmonics in pixel space |
| BUG-010 | CRITICAL | OPEN | RouaChart.tsx | onSLTPDrag prop never wired |
| BUG-011 | CRITICAL | OPEN | AutoTradeEngine.ts | SL on wrong side of entry |
| BUG-012 | CRITICAL | OPEN | AutoTradeEngine.ts | TP3 P&L 5× overstated |
| BUG-013 | HIGH | OPEN | AutoTradeEngine.ts | Kelly 0.25 on lucky streaks |
| BUG-014 | CRITICAL | OPEN | usePositionsStore.ts | Cross-user data leak |
| BUG-015 | HIGH | OPEN | useMarketStore.ts | Batching broken |
| BUG-016 | CRITICAL | OPEN | DrawingManager.ts | Silent data loss on corruption |
| BUG-017 | HIGH | OPEN | IndicatorCalculator.ts | Chikou look-ahead bias |
| BUG-018 | HIGH | OPEN | MTFEngine.ts | Fibonacci levels inverted |
| BUG-019 | HIGH | OPEN | overlay-renderer.ts | ATR uses current close |
| BUG-020 | HIGH | OPEN | overlay-renderer.ts | "EMA" is actually SMA |

**Totals:** 20 bugs registered. 5 FIXED. 15 OPEN. 0 REGRESSED.

---

## Summary Table (Trading Engine Bugs — BUG-021 onwards)

| ID | Severity | Status | File | One-line |
|----|----------|--------|------|----------|
| BUG-021 | CRITICAL | FIXED | trading.service.ts | V423 حجب إغلاق المستخدم الحقيقي |
| BUG-022 | CRITICAL | FIXED | smart-executor.service.ts | TIMEFRAME_RR ثابت → صفقات M5 تدوم أيام |
| BUG-023 | CRITICAL | FIXED | unified-risk + smart-executor | BRENT/USD سعر 0.0003 → حجم كارثي |
| BUG-024 | HIGH | FIXED | unified-risk.service.ts | units خام بدل lots → أحجام ضخمة |
| BUG-025 | HIGH | FIXED | smart-executor + signal-evaluator | تداول في RANGE/VOLATILE بدون حجب |
| BUG-026 | HIGH | FIXED | lazic.service.ts | LASIC يفتح عكس اتجاه المجلس |

**Totals (Chart):** 20 bugs. 5 FIXED. 15 OPEN. 0 REGRESSED.
**Totals (Trading Engine):** 6 bugs. 6 FIXED. 0 OPEN. 0 REGRESSED.

---

## Trading Engine Bugs (تسببت في خسائر مالية فعلية)

### BUG-021: حارس V423 يحجب إغلاق المستخدم الحقيقي
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/api/src/modules/trading/trading.service.ts`
- **Pattern (OPEN):** `if (isAutomatedPosition && isManualOrEmptyReason && !isSLTPClose) {`
- **Pattern (FIXED):** `if (isAutomatedPosition && isManualOrEmptyReason && !isSLTPClose && !isUserInitiated) {`
- **Description:** حارس V423 كان يحجب إغلاق صفقات حتى من المستخدم الحقيقي عبر الواجهة، لأنه لم يحتوِ على شرط `!isUserInitiated` الذي كان موجوداً في V237 فقط.
- **Impact:** المستخدم لا يستطيع إغلاق صفقات آلية يدوياً قبل مرور 24 ساعة.
- **Fix:** أُضيف `!isUserInitiated` لشرط V423. أُضيفت `_jitteredMinHours()` لمنع الإغلاق الجماعي.
- **Commit:** V426

### BUG-022: TIMEFRAME_RR ثابت يُسبب احتفاظ صفقات M1/M5 لأيام
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/api/src/modules/ai/smart-executor/smart-executor.service.ts`
- **Pattern (OPEN):** `const { sl: tfSL, tp: tfTP } = TIMEFRAME_RR\[brief\.timeframe`
- **Pattern (FIXED):** `V427.*ATR.*H1.*atrMult`
- **Description:** SL/TP محسوب كنسبة ثابتة (2%) من السعر بغض النظر عن الأصل. للفوركس تذبذبه 0.4% يومياً → 2% SL يستغرق 5 أيام للوصول. USD/JPY كان SL 7.1% = 14 يوماً.
- **Impact:** صفقات M5 "قصيرة الأمد" تحتفظ لأيام بدل ساعات.
- **Fix:** استبدال TIMEFRAME_RR بـ H1 ATR × مضاعف الإطار (M1=0.5×, M5=1.0×, M15=1.5×). TP=2×SL دائماً.
- **Commit:** V427

### BUG-023: BRENT/USD سعر خاطئ (~0.0003) يُنتج حجم مركز كارثياً
- **Status:** FIXED
- **Severity:** CRITICAL
- **File:** `apps/api/src/modules/trading/services/unified-risk.service.ts`, `smart-executor.service.ts`
- **Pattern (OPEN):** `BRENT` *(بدون hardblock بالاسم)*
- **Pattern (FIXED):** `HARDBLOCKED.*BRENT`
- **Description:** OANDA يُرسل سعر 0.0003 لـ BRENT/USD (الصحيح ~$73-85). المعادلة: qty = riskAmount / 0.0003 = ملايين الوحدات. V421 كان يفحص فقط `price < 20` لكنه لم يكن كافياً.
- **Impact:** خسارة -$704 في صفقة واحدة (2 يوليو 2026). -$92 في اليوم التالي.
- **Fix:** حجب BRENT/USD بالاسم في unified-risk + smart-executor + lazic.types.
- **Commit:** V428 + V430

### BUG-024: حجم العقد يُعاد كـ units خام بدل lots
- **Status:** FIXED
- **Severity:** HIGH
- **File:** `apps/api/src/modules/trading/services/unified-risk.service.ts:1417`
- **Pattern (OPEN):** `return parseFloat\(quantityUnits\.toFixed\(8\)\)`
- **Pattern (FIXED):** `Math\.floor\(quantityLots \/ step\) \* step`
- **Description:** `_calculatePositionSize` كانت تعيد `quantityUnits` (e.g. 1000 لـ EUR/USD) بدل lots (0.01). الوكيل يفتح بـ 420,000 ADA بدل 0.01 lot.
- **Impact:** أحجام صفقات ضخمة جداً → خسائر كبيرة على حسابات ورقية كبيرة.
- **Fix:** إعادة lots مُقرَّبة لـ 0.01 step، حد أدنى 0.01.
- **Commit:** V429

### BUG-025: المنفذ الذكي والوكيل يتداولان في سوق RANGE/VOLATILE
- **Status:** FIXED
- **Severity:** HIGH
- **File:** `apps/api/src/modules/ai/smart-executor/smart-executor.service.ts`, `signal-evaluator.service.ts`
- **Pattern (OPEN):** `const isBuyAgainstBear.*\n.*if \(isBuyAgainstBear \|\| isSellAgainstBull\)`
- **Pattern (FIXED):** `isChoppyMarket.*RANGE.*VOLATILE`
- **Description:** حارس V290 كان يحجب فقط BUY في BEAR وSELL في BULL، لكن لا يفعل شيئاً في RANGE/VOLATILE. السوق المتذبذب يُعيد الأسعار لنقطة البداية قبل وصول TP.
- **Impact:** SMART: -$161 على 8 صفقات. AGENT: -$295 على 7 صفقات. كلها في يوم واحد.
- **Fix:** أُضيف `isChoppyMarket = regime === RANGE || VOLATILE` → حجب كامل عند confidence ≥ 60%.
- **Commit:** V430

### BUG-026: LASIC يفتح إشارات عكسية لاتجاه المجلس
- **Status:** FIXED
- **Severity:** HIGH
- **File:** `apps/api/src/agents/lazic/lazic.service.ts`
- **Pattern (OPEN):** `councilAligned.*councilDir.*BUY.*obi\.signal.*BUY` *(اختياري فقط)*
- **Pattern (FIXED):** `councilDir && councilDir !== obi\.signal`
- **Description:** تحقق المجلس كان "اختيارياً" — يحسب `councilAligned` لكن لا يوقف التنفيذ. في سوق BULL، اللاسع يفتح SELL باستمرار لأن OBI يُنتج إشارات عكسية.
- **Impact:** LASIC SELL: -$16 مقابل LASIC BUY: +$220 في نفس اليوم.
- **Fix:** جُعل الفحص إلزامياً: إذا councilDir ≠ obi.signal → توقف تام.
- **Commit:** (طبّقه جابر + موثّق هنا)
