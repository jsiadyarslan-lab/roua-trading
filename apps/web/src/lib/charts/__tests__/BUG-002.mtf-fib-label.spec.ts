/**
 * BUG-002 Regression Test: MTF Fib label must NOT show "function map() { [native code] }".
 *
 * The bug: `(fib as any).ratios?.map` returns the .map METHOD REFERENCE (a function),
 * not the result of calling it. Template literal coerces to "function map() { [native code] }".
 *
 * The fix: `((fib as any).ratios || []).map((r: any) => r.label).join('+')`
 *
 * Run: npx tsx apps/web/src/lib/charts/__tests__/BUG-002.mtf-fib-label.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'overlay-renderer.ts');
const SOURCE = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-002: MTF Fib label must call .map() not reference it\n');

test('Source file exists', () => {
  assert.ok(SOURCE.length > 0);
});

test('No buggy `.ratios?.map || ([] as any[]).map` pattern present', () => {
  // The BUGGY pattern: ratios?.map || ([] as any[]).map
  // This evaluates `.ratios?.map` (a function ref), truthy, returns the function ref.
  const buggyPattern = /ratios\?\.map\s*\|\|\s*\(\[\]\s*as\s*any\[\]\)\.map/;
  assert.ok(!buggyPattern.test(SOURCE),
    'BUG-002 REGRESSED: found `.ratios?.map || ([] as any[]).map` — label will show "function map()..."');
});

test('Fixed pattern `((fib as any).ratios || []).map((r: any) => r.label)` is present', () => {
  const fixedPattern = /\(\(fib as any\)\.ratios \|\| \[\]\)\.map\(\(r: any\) => r\.label\)\.join/;
  assert.ok(fixedPattern.test(SOURCE),
    'Expected: ((fib as any).ratios || []).map((r: any) => r.label).join(...)');
});

console.log('\n' + (process.exitCode === 1 ? '❌ BUG-002 REGRESSION DETECTED\n' : '✅ BUG-002 fix is intact\n'));
