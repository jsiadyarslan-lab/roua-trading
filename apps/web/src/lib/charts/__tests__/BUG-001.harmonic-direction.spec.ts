/**
 * BUG-001 Regression Test: Harmonic pattern direction must NOT be inverted.
 *
 * This test verifies that the harmonic pattern detection in chart-detection.ts
 * assigns 'bullish' direction when X is HIGH and A is LOW (X→A is DOWN move),
 * and 'bearish' when X is LOW and A is HIGH (X→A is UP move).
 *
 * If this test FAILS, BUG-001 has REGRESSED — the direction inversion is back.
 *
 * Run: npx tsx apps/web/src/lib/charts/__tests__/BUG-001.harmonic-direction.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'chart-detection.ts');
const SOURCE = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-001: Harmonic pattern direction (must be CORRECT, not inverted)\n');

test('Source file exists', () => {
  assert.ok(SOURCE.length > 0, 'chart-detection.ts is empty or missing');
});

test('Direction assignment uses correct formula (X<A = bearish, not bullish)', () => {
  // The CORRECT formula (after fix):
  //   const direction = X.price < A.price ? 'bearish' : 'bullish';
  // The WRONG (old, inverted) formula:
  //   const direction = X.price < A.price ? 'bullish' : 'bearish';
  const correctPattern = /const\s+direction\s*=\s*X\.price\s*<\s*A\.price\s*\?\s*['"]bearish['"]\s*:\s*['"]bullish['"]/;
  const wrongPattern = /const\s+direction\s*=\s*X\.price\s*<\s*A\.price\s*\?\s*['"]bullish['"]\s*:\s*['"]bearish['"]/;

  assert.ok(correctPattern.test(SOURCE),
    'Expected: const direction = X.price < A.price ? \'bearish\' : \'bullish\'');
  assert.ok(!wrongPattern.test(SOURCE),
    'BUG-001 REGRESSED: direction is inverted again (bullish/bearish swapped)');
});

test('No comment-only match (the actual code line must exist, not just a comment)', () => {
  // Find the line and ensure it's NOT inside a comment
  const lines = SOURCE.split('\n');
  const matchingLines = lines.filter(l => l.includes("X.price < A.price") && l.includes("'bearish'") && l.includes("'bullish'"));
  const codeLines = matchingLines.filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*'));
  assert.ok(codeLines.length >= 1,
    `Expected at least 1 non-comment line with the correct direction formula, found ${codeLines.length}`);
});

console.log('\n' + (process.exitCode === 1 ? '❌ BUG-001 REGRESSION DETECTED\n' : '✅ BUG-001 fix is intact\n'));
