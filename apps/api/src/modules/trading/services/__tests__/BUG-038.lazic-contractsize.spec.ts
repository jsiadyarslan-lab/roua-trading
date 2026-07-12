/**
 * BUG-038 Regression Test: Lazic must NOT hardcode contractSize.
 *
 * This test verifies that lazic.service.ts:
 *   1. Does NOT use the binary hardcoded `isCrypto ? 1 : 100000` pattern
 *   2. DOES use getSymbolMetadata() to look up contractSize dynamically
 *
 * If this test FAILS, BUG-038 has REGRESSED — the hardcoded binary is back,
 * and gold/silver/oil/indices sizing will silently break again.
 *
 * Run: npx tsx apps/api/src/modules/trading/services/__tests__/BUG-038.lazic-contractsize.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FILE = path.resolve(__dirname, '../../../..', 'agents/lazic/lazic.service.ts');
const SOURCE = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-038: Lazic contractSize must use getSymbolMetadata, not hardcoded binary\n');

test('Source file exists', () => {
  assert.ok(SOURCE.length > 0, 'lazic.service.ts is empty or missing');
});

test('Does NOT use hardcoded binary `isCrypto ? 1 : 100000` for contractSize', () => {
  // The OPEN pattern: a line that defines contractSize from a binary isCrypto check.
  // This is the BUG-038 OPEN pattern — must NOT appear in the file.
  const badPattern = /const\s+contractSize\s*=\s*isCrypto\s*\?\s*1\s*:\s*100000/;
  assert.ok(
    !badPattern.test(SOURCE),
    'Found `const contractSize = isCrypto ? 1 : 100000;` — BUG-038 has REGRESSED. ' +
    'Replace with `const contractSize = getSymbolMetadata(symbol).contractSize;`',
  );
});

test('Imports getSymbolMetadata from symbol-metadata', () => {
  const importPattern = /import\s*\{[^}]*getSymbolMetadata[^}]*\}\s*from\s*['"][^'"]*symbol-metadata['"]/;
  assert.ok(
    importPattern.test(SOURCE),
    'getSymbolMetadata is not imported — Lazic cannot look up contractSize correctly.',
  );
});

test('Uses getSymbolMetadata() for contractSize lookup', () => {
  // The FIXED pattern: a line that reads contractSize from getSymbolMetadata
  const fixedPattern = /getSymbolMetadata\([^)]*\)\.contractSize/;
  assert.ok(
    fixedPattern.test(SOURCE),
    'Did not find `getSymbolMetadata(...).contractSize` — BUG-038 fix is missing.',
  );
});

console.log('\n(if all ✅ above, BUG-038 fix is in place)\n');
