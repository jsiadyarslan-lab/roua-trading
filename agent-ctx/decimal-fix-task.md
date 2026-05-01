# Decimal-to-Number Fix Task Summary

## Problem
The Prisma schema was changed from `Float` to `Decimal` for financial fields. This caused 77 TypeScript build errors because Prisma's `Decimal` type is not compatible with JavaScript `number` for arithmetic operations (`+`, `-`, `*`, `/`, `Math.max/min/abs`).

## Fix Strategy
Convert Prisma `Decimal` to JavaScript `number` at the point of use using `Number()`. This is the minimal-change approach that preserves the Prisma schema while making the application code compile correctly.

## Files Modified (12 files)

### 1. `apps/api/src/modules/analytics/signal-generator.service.ts`
- **Lines 200-214**: In `getSignalsForSymbol()` map, converted `s.stopLoss`, `s.takeProfit`, `s.entryPrice` from Decimal to number using `Number()` and null-safe patterns (`s.takeProfit != null ? Number(s.takeProfit) : null`)
- **Line 210**: In `_calculateRiskReward()` call, converted all three Decimal params to number

### 2. `apps/api/src/modules/engine/services/position-monitor.service.ts`
- **Line 177**: `Math.abs(currentPrice - pos.stopLoss) / pos.entryPrice` → `Math.abs(currentPrice - Number(pos.stopLoss)) / Number(pos.entryPrice)`
- **Line 182**: `Math.abs(currentPrice - pos.takeProfit) / pos.entryPrice` → `Math.abs(currentPrice - Number(pos.takeProfit)) / Number(pos.entryPrice)`

### 3. `apps/api/src/modules/engine/services/trading-bot.service.ts`
- **Line 207**: `sum + (t.pnl || 0)` → `sum + Number(t.pnl || 0)` (reduce pattern)
- **Lines 347-348**: `signal.entryPrice || 0` → `Number(signal.entryPrice) || 0` and same for `signal.stopLoss`
- **Line 356**: `Math.abs(entryPrice - stopLoss)` → `Math.abs(Number(entryPrice) - Number(stopLoss))`
- **Lines 378-379**: `signal.stopLoss || undefined` → `signal.stopLoss != null ? Number(signal.stopLoss) : undefined` (and same for takeProfit)

### 4. `apps/api/src/modules/execution/adapters/paper-trading.adapter.ts`
- **Line 193**: `p.quantity * (p.currentPrice || p.entryPrice)` → `Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice))`
- **Line 199**: `sum + (p.unrealizedPnl || 0)` → `sum + Number(p.unrealizedPnl || 0)`

### 5. `apps/api/src/modules/execution/services/order-lifecycle.service.ts`
- **Line 284**: `existingPosition.quantity + result.filledQuantity` → `Number(existingPosition.quantity) + result.filledQuantity`
- **Lines 285-287**: `existingPosition.entryPrice * existingPosition.quantity` → `Number(existingPosition.entryPrice) * Number(existingPosition.quantity)`

### 6. `apps/api/src/modules/portfolio/sanctuary/sanctuary.service.ts`
- **Line 121**: `asset.currentPrice || asset.avgPrice` → `Number(asset.currentPrice || asset.avgPrice)`
- **Line 129**: `asset.quantity * currentPrice` → `Number(asset.quantity) * currentPrice`
- **Line 135**: `quantity: asset.quantity` → `quantity: Number(asset.quantity)`

### 7. `apps/api/src/modules/trading/risk-manager.service.ts`
- **Line 189**: `portfolios._sum.totalValue || 0` → `Number(portfolios._sum.totalValue || 0)`
- **Lines 196-197**: `p.quantity * (p.currentPrice || p.entryPrice)` → `Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice))`
- **Line 215**: `sum + (t.pnl || 0)` → `sum + Number(t.pnl || 0)`

### 8. `apps/api/src/modules/trading/services/order-consumer.service.ts`
- **Line 252**: `existingPosition.quantity + filledQuantity` → `Number(existingPosition.quantity) + filledQuantity`
- **Lines 253-255**: `existingPosition.entryPrice * existingPosition.quantity` → `Number(existingPosition.entryPrice) * Number(existingPosition.quantity)`

### 9. `apps/api/src/modules/trading/services/position-manager.service.ts`
- **Lines 71-72**: `Math.max/min` with Decimal → `Math.max/min(Number(...), currentPrice)`
- **Lines 77-79**: `calculateUnrealizedPnL` params: `Number(position.entryPrice)`, `Number(position.quantity)`
- **Lines 86-91**: PositionInfo push: `Number(position.quantity)`, `Number(position.entryPrice)`, null-safe Decimal conversion for stopLoss/takeProfit
- **Lines 99-113**: Same fixes for the second PositionInfo push (failed quote branch)
- **Line 180**: `portfolios._sum.totalValue || 0` → `Number(portfolios._sum.totalValue || 0)`
- **Line 209**: `sum + (t.pnl || 0)` → `sum + Number(t.pnl || 0)`
- **Line 228**: `cumulativePnL += trade.pnl || 0` → `cumulativePnL += Number(trade.pnl || 0)`

### 10. `apps/api/src/modules/trading/services/risk-gatekeeper.service.ts`
- **Line 356**: `sum + (t.pnl || 0)` → `sum + Number(t.pnl || 0)` (daily drawdown check)
- **Line 447**: `portfolios._sum.totalValue || 0` → `Number(portfolios._sum.totalValue || 0)`
- **Lines 453-454**: `p.quantity * (p.currentPrice || p.entryPrice)` → `Number(p.quantity) * (Number(p.currentPrice) || Number(p.entryPrice))`
- **Line 497**: `sum + (t.pnl || 0)` → `sum + Number(t.pnl || 0)` (risk score calc)

### 11. `apps/api/src/modules/trading/trading.service.ts`
- **Lines 397-399**: Unrealized PnL calc: `Number(position.entryPrice)`, `Number(position.quantity)`
- **Lines 405-412**: `Math.max/min` with Decimal → wrapped with `Number()`
- **Lines 416-417**: In-memory position updates → `(position as any).currentPrice` to avoid Decimal assignment type error
- **Line 517**: `request.quantity || position.quantity` → `request.quantity ?? Number(position.quantity)`
- **Lines 518-520**: Comparison with Decimal → `Number(position.quantity)`
- **Lines 559-561**: Exit price fallback with Decimal → `Number(position.currentPrice)`, `Number(position.entryPrice)`
- **Lines 564-566**: PnL calc with Decimal → `Number(position.entryPrice)`
- **Line 600**: `closeQuantity >= position.quantity` → `closeQuantity >= Number(position.quantity)`
- **Lines 610-627**: Position update: `Number(position.quantity)`, `Number(position.realizedPnl || 0)`
- **Line 638**: `closeQuantity < position.quantity` → `closeQuantity < Number(position.quantity)`
- **Lines 889-893, 938-942**: Avg price calc in `_updatePosition`: `Number(existingPosition.quantity)`, `Number(existingPosition.entryPrice)`

### 12. No changes needed
- **`order.events.ts`**: PositionInfo interface keeps `number` types; fixes are at assignment points
- **`trading.types.ts`**: PlaceOrderRequest interface keeps `number` types; fixes are at assignment points

## Build Result
After all fixes, `tsc --noEmit` passes with **0 errors** (exit code 0).

## Patterns Used
1. **Arithmetic**: `Number(decimalField) + numberValue`
2. **Math functions**: `Math.max(Number(decimalField), numberValue)`
3. **Reduce patterns**: `(sum, t) => sum + Number(t.pnl || 0)`
4. **Null-safe assignment**: `field != null ? Number(field) : null`
5. **Aggregate sums**: `Number(portfolios._sum.totalValue || 0)`
6. **Type assertion for in-memory mutation**: `(position as any).currentPrice = value`
