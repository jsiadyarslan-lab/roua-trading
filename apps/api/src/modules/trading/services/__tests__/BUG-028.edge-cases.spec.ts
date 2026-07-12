/**
 * BUG-028 Edge Case Tests
 * Tests findSwingLevels + calculateStructureBasedSLTP on dangerous scenarios.
 */
import * as assert from 'node:assert';
import { calculateStructureBasedSLTP, findSwingLevels, calculateATR, CandleData } from '../sl-tp-calculator';

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${name}`); }
  catch (e: any) { console.error(`  ❌ ${name}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\n🧪 BUG-028 Edge Case Tests\n');

// ─── Scenario 1: Flat market (all candles identical) ─────────────────────
test('Flat market: all candles identical → SL must not be 0 or NaN', () => {
  const candles: CandleData[] = Array.from({ length: 50 }, (_, i) => ({
    time: i, open: 100, high: 100, low: 100, close: 100, volume: 1000,
  }));
  const result = calculateStructureBasedSLTP(candles, 100, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(!isNaN(result.tp), 'TP is NaN!');
  assert.ok(result.sl > 0, `SL should be positive, got ${result.sl}`);
  assert.ok(result.tp > 0, `TP should be positive, got ${result.tp}`);
  assert.ok(result.sl < 100, `SL should be below entry for BUY, got ${result.sl}`);
  assert.ok(result.tp > 100, `TP should be above entry for BUY, got ${result.tp}`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource} (flat → fallback)`);
});

// ─── Scenario 2: Empty candles array ─────────────────────────────────────
test('Empty candles: [] → SL/TP must not crash', () => {
  const result = calculateStructureBasedSLTP([], 100, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(!isNaN(result.tp), 'TP is NaN!');
  assert.ok(result.sl > 0, `SL should be positive`);
  assert.ok(result.tp > 0, `TP should be positive`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 3: Only 1 candle ───────────────────────────────────────────
test('Single candle: [1] → SL/TP must not crash', () => {
  const candles: CandleData[] = [{ time: 1, open: 100, high: 101, low: 99, close: 100, volume: 1000 }];
  const result = calculateStructureBasedSLTP(candles, 100, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(!isNaN(result.tp), 'TP is NaN!');
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 4: All swing lows ABOVE current price (no support found) ───
test('No swing low below price: BUY → must fallback safely', () => {
  const candles: CandleData[] = Array.from({ length: 50 }, (_, i) => ({
    time: i, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000,
  }));
  const currentPrice = 50;
  const result = calculateStructureBasedSLTP(candles, currentPrice, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(result.sl < currentPrice, `SL should be below entry, got ${result.sl} vs ${currentPrice}`);
  assert.ok(result.tp > currentPrice, `TP should be above entry, got ${result.tp} vs ${currentPrice}`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 5: ATR = 0 (all closes equal) ──────────────────────────────
test('ATR = 0: buffer calculation must not produce NaN', () => {
  const candles: CandleData[] = Array.from({ length: 20 }, (_, i) => ({
    time: i, open: 100, high: 100, low: 100, close: 100, volume: 1000,
  }));
  const atr = calculateATR(candles, 14);
  assert.strictEqual(atr, 0, 'ATR should be 0 for identical candles');
  const result = calculateStructureBasedSLTP(candles, 100, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN when ATR=0!');
  assert.ok(!isNaN(result.tp), 'TP is NaN when ATR=0!');
  assert.ok(result.sl < 100, `SL should be below entry`);
  assert.ok(result.tp > 100, `TP should be above entry`);
  console.log(`     ATR=${atr} SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 6: Swing low TOO CLOSE to current price ────────────────────
test('Swing low too close: SL must respect minSLPercent', () => {
  const candles: CandleData[] = [
    { time: 1, open: 100, high: 101, low: 99.9, close: 100, volume: 1000 },
    ...Array.from({ length: 48 }, (_, i) => ({
      time: i + 2, open: 100, high: 100.5, low: 100, close: 100, volume: 1000,
    })),
  ];
  const result = calculateStructureBasedSLTP(candles, 100, 'BUY', { minSLPercent: 0.005 });
  const slDist = Math.abs(100 - result.sl);
  const slPct = slDist / 100;
  assert.ok(slPct >= 0.004, `SL distance ${slPct * 100}% should be >= 0.5% (got ${result.sl})`);
  console.log(`     SL=${result.sl} (${(slPct * 100).toFixed(3)}%) source=${result.slSource}`);
});

// ─── Scenario 7: Swing low TOO FAR from current price ────────────────────
test('Swing low too far: SL must respect maxSLPercent (8%)', () => {
  const candles: CandleData[] = [
    { time: 1, open: 100, high: 101, low: 50, close: 100, volume: 1000 },
    ...Array.from({ length: 48 }, (_, i) => ({
      time: i + 2, open: 100, high: 100.5, low: 100, close: 100, volume: 1000,
    })),
  ];
  const result = calculateStructureBasedSLTP(candles, 100, 'BUY', { maxSLPercent: 0.08 });
  const slDist = Math.abs(100 - result.sl);
  const slPct = slDist / 100;
  assert.ok(slPct <= 0.081, `SL distance ${slPct * 100}% should be <= 8% (got ${result.sl})`);
  console.log(`     SL=${result.sl} (${(slPct * 100).toFixed(3)}%) source=${result.slSource}`);
});

// ─── Scenario 8: SELL direction ──────────────────────────────────────────
test('SELL: swing high above price → SL above entry', () => {
  const candles: CandleData[] = Array.from({ length: 50 }, (_, i) => ({
    time: i,
    open: 100 + Math.sin(i / 5) * 5,
    high: 105 + Math.sin(i / 5) * 5,
    low: 95 + Math.sin(i / 5) * 5,
    close: 100 + Math.sin(i / 5) * 5,
    volume: 1000,
  }));
  const result = calculateStructureBasedSLTP(candles, 100, 'SELL');
  assert.ok(result.sl > 100, `SL should be above entry for SELL, got ${result.sl}`);
  assert.ok(result.tp < 100, `TP should be below entry for SELL, got ${result.tp}`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 9: BTC-like volatility ─────────────────────────────────────
test('High volatility (BTC at $100K): SL/TP in reasonable range', () => {
  const basePrice = 100000;
  const candles: CandleData[] = Array.from({ length: 50 }, (_, i) => ({
    time: i,
    open: basePrice + (Math.random() - 0.5) * 5000,
    high: basePrice + (Math.random() - 0.5) * 5000 + 2000,
    low: basePrice + (Math.random() - 0.5) * 5000 - 2000,
    close: basePrice + (Math.random() - 0.5) * 5000,
    volume: 1000,
  }));
  const result = calculateStructureBasedSLTP(candles, basePrice, 'BUY');
  const slPct = Math.abs(basePrice - result.sl) / basePrice;
  const tpPct = Math.abs(result.tp - basePrice) / basePrice;
  assert.ok(slPct > 0.001, `SL too tight: ${slPct * 100}%`);
  assert.ok(slPct < 0.10, `SL too wide: ${slPct * 100}%`);
  assert.ok(tpPct > 0.001, `TP too tight: ${tpPct * 100}%`);
  assert.ok(result.rrRatio >= 1.0, `R:R too low: 1:${result.rrRatio.toFixed(2)}`);
  console.log(`     SL=${result.sl} (${(slPct * 100).toFixed(2)}%) TP=${result.tp} (${(tpPct * 100).toFixed(2)}%) R:R=1:${result.rrRatio.toFixed(2)}`);
});

// ─── Scenario 10: EUR/USD-like low volatility ────────────────────────────
test('Low volatility (EUR/USD at 1.08): SL/TP in reasonable range', () => {
  const basePrice = 1.0800;
  const candles: CandleData[] = Array.from({ length: 50 }, (_, i) => ({
    time: i,
    open: basePrice + (Math.random() - 0.5) * 0.005,
    high: basePrice + (Math.random() - 0.5) * 0.005 + 0.002,
    low: basePrice + (Math.random() - 0.5) * 0.005 - 0.002,
    close: basePrice + (Math.random() - 0.5) * 0.005,
    volume: 100000,
  }));
  const result = calculateStructureBasedSLTP(candles, basePrice, 'BUY');
  const slPct = Math.abs(basePrice - result.sl) / basePrice;
  assert.ok(slPct > 0.001, `SL too tight: ${slPct * 100}%`);
  assert.ok(slPct < 0.10, `SL too wide: ${slPct * 100}%`);
  assert.ok(result.sl < basePrice, `SL should be below entry`);
  assert.ok(result.tp > basePrice, `TP should be above entry`);
  console.log(`     SL=${result.sl.toFixed(5)} (${(slPct * 100).toFixed(3)}%) TP=${result.tp.toFixed(5)} R:R=1:${result.rrRatio.toFixed(2)}`);
});

// ─── Scenario 11: NaN in candle data ─────────────────────────────────────
test('NaN in candle data: must not crash or produce NaN SL', () => {
  const candles: CandleData[] = [
    { time: 1, open: NaN, high: 101, low: 99, close: 100, volume: 1000 },
    ...Array.from({ length: 49 }, (_, i) => ({
      time: i + 2, open: 100, high: 101, low: 99, close: 100, volume: 1000,
    })),
  ];
  const result = calculateStructureBasedSLTP(candles, 100, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN with NaN input!');
  assert.ok(!isNaN(result.tp), 'TP is NaN with NaN input!');
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 12: findSwingLevels with minimum data ──────────────────────
test('findSwingLevels with 5 candles (minimum for lookback=2)', () => {
  const candles: CandleData[] = [
    { time: 1, open: 100, high: 102, low: 98, close: 100, volume: 1000 },
    { time: 2, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { time: 3, open: 100, high: 105, low: 95, close: 100, volume: 1000 },
    { time: 4, open: 100, high: 101, low: 99, close: 100, volume: 1000 },
    { time: 5, open: 100, high: 102, low: 98, close: 100, volume: 1000 },
  ];
  const { swingHighs, swingLows } = findSwingLevels(candles, 2);
  assert.ok(swingHighs.length > 0, 'Should find at least 1 swing high');
  assert.ok(swingLows.length > 0, 'Should find at least 1 swing low');
  console.log(`     Found ${swingHighs.length} highs, ${swingLows.length} lows`);
});

// ─── Scenario 13: Price = 0 (dangerous) ──────────────────────────────────
test('Price = 0: must return safe defaults, not 0 or NaN', () => {
  const result = calculateStructureBasedSLTP([], 0, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(!isNaN(result.tp), 'TP is NaN!');
  assert.ok(result.sl > 0, `SL should be positive, got ${result.sl}`);
  assert.ok(result.tp > 0, `TP should be positive, got ${result.tp}`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 14: Price = NaN (dangerous) ────────────────────────────────
test('Price = NaN: must return safe defaults, not NaN', () => {
  const result = calculateStructureBasedSLTP([], NaN, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(!isNaN(result.tp), 'TP is NaN!');
  assert.ok(result.sl > 0, `SL should be positive`);
  assert.ok(result.tp > 0, `TP should be positive`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

// ─── Scenario 15: Price = negative (impossible but safety) ───────────────
test('Price = -100: must return safe defaults, not negative', () => {
  const result = calculateStructureBasedSLTP([], -100, 'BUY');
  assert.ok(!isNaN(result.sl), 'SL is NaN!');
  assert.ok(!isNaN(result.tp), 'TP is NaN!');
  assert.ok(result.sl > 0, `SL should be positive, got ${result.sl}`);
  assert.ok(result.tp > 0, `TP should be positive, got ${result.tp}`);
  console.log(`     SL=${result.sl} TP=${result.tp} source=${result.slSource}`);
});

console.log('\n' + (process.exitCode === 1 ? '❌ SOME TESTS FAILED\n' : '✅ All edge case tests passed\n'));
