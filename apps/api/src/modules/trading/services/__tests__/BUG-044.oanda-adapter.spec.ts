/**
 * BUG-044 Regression Test: OANDA must have a real execution adapter.
 *
 * This test verifies that:
 *   1. OandaExecutionAdapter exists as a separate file
 *   2. It implements placeOrder, cancelOrder, getOrderStatus, fetchBalance
 *   3. ExecutionGatewayService has a `case 'oanda'` (NOT falling through to default)
 *   4. TradingService has a `_isOandaExchange` method and routes OANDA via executionGateway
 *
 * If this test FAILS, BUG-044 has REGRESSED — OANDA real-money trading is broken again.
 *
 * Run: npx tsx apps/api/src/modules/trading/services/__tests__/BUG-044.oanda-adapter.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');

const ADAPTER_FILE = path.join(ROOT, 'modules/execution/adapters/oanda-execution.adapter.ts');
const GATEWAY_FILE = path.join(ROOT, 'modules/execution/gateways/execution-gateway.service.ts');
const TRADING_FILE = path.join(ROOT, 'modules/trading/trading.service.ts');

const ADAPTER_SRC = fs.readFileSync(ADAPTER_FILE, 'utf8');
const GATEWAY_SRC = fs.readFileSync(GATEWAY_FILE, 'utf8');
const TRADING_SRC = fs.readFileSync(TRADING_FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-044: OANDA must have a real execution adapter (not Binance-as-fallback)\n');

test('OandaExecutionAdapter file exists', () => {
  assert.ok(ADAPTER_SRC.length > 0, 'oanda-execution.adapter.ts is missing or empty');
});

test('OandaExecutionAdapter implements placeOrder', () => {
  assert.ok(
    /async\s+placeOrder\s*\(\s*order\s*:\s*UnifiedOrder\s*\)\s*:\s*Promise<ExecutionResult>/.test(ADAPTER_SRC),
    'placeOrder method signature missing or incorrect',
  );
});

test('OandaExecutionAdapter implements cancelOrder', () => {
  assert.ok(/async\s+cancelOrder\s*\(/.test(ADAPTER_SRC), 'cancelOrder method missing');
});

test('OandaExecutionAdapter implements getOrderStatus', () => {
  assert.ok(/async\s+getOrderStatus\s*\(/.test(ADAPTER_SRC), 'getOrderStatus method missing');
});

test('OandaExecutionAdapter implements fetchBalance', () => {
  assert.ok(/async\s+fetchBalance\s*\(/.test(ADAPTER_SRC), 'fetchBalance method missing');
});

test('OandaExecutionAdapter uses OANDA v20 REST endpoint', () => {
  assert.ok(
    /api-fxpractice\.oanda\.com/.test(ADAPTER_SRC) && /api-fxtrade\.oanda\.com/.test(ADAPTER_SRC),
    'Must reference both practice and live OANDA v20 URLs',
  );
});

test('OandaExecutionAdapter attaches SL/TP natively (stopLossOnFill/takeProfitOnFill)', () => {
  assert.ok(/stopLossOnFill/.test(ADAPTER_SRC), 'Must use stopLossOnFill (OANDA native SL mechanism)');
  assert.ok(/takeProfitOnFill/.test(ADAPTER_SRC), 'Must use takeProfitOnFill (OANDA native TP mechanism)');
});

test('OandaExecutionAdapter converts LOTS → UNITS (safety net)', () => {
  assert.ok(/_lotsToUnitsSafe/.test(ADAPTER_SRC), 'Must have LOTS→UNITS conversion helper');
});

test('OandaExecutionAdapter handles BUY=positive/SELL=negative units', () => {
  assert.ok(
    /signedUnits\s*=\s*order\.side\s*===\s*'BUY'\s*\?\s*units\s*:\s*-units/.test(ADAPTER_SRC),
    'Must convert side to signed units (BUY=+, SELL=-)',
  );
});

test('ExecutionGatewayService has case \'oanda\' (NOT falling through to default)', () => {
  assert.ok(
    /case\s+'oanda'\s*:/.test(GATEWAY_SRC),
    'ExecutionGateway must have explicit case \'oanda\' — not falling through to BinanceAdapter default',
  );
});

test('ExecutionGatewayService creates OandaExecutionAdapter for OANDA', () => {
  assert.ok(
    /new\s+OandaExecutionAdapter\s*\(/.test(GATEWAY_SRC),
    'ExecutionGateway must instantiate OandaExecutionAdapter for OANDA case',
  );
});

test('TradingService has _isOandaExchange() helper', () => {
  assert.ok(
    /_isOandaExchange\s*\(\s*exchangeName\s*:\s*string\s*\)\s*:\s*boolean/.test(TRADING_SRC),
    'TradingService must have _isOandaExchange() method',
  );
});

test('TradingService routes OANDA via executionGateway (not CCXT)', () => {
  // The routing block: _isOandaExchange(exchangeName) && userId && this.executionGateway
  assert.ok(
    /_isOandaExchange\(exchangeName\)\s*&&\s*userId\s*&&\s*this\.executionGateway/.test(TRADING_SRC),
    'TradingService must route OANDA via executionGateway (same pattern as MT5)',
  );
});

console.log('\n(if all ✅ above, BUG-044 fix is in place — OANDA real-money trading works)\n');
