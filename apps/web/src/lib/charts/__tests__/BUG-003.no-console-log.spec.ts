/**
 * BUG-003 Regression Test: No verbose console.log in DrawingRenderer.syncPrimitive.
 *
 * The bug: A `console.log(`[DrawingRenderer] syncPrimitive: TF=...`)` fired on every
 * syncPrimitive call (every mousemove during drawing). Flooded console, degraded perf.
 *
 * The fix: Removed the console.log statement.
 *
 * Run: npx tsx apps/web/src/lib/charts/__tests__/BUG-003.no-console-log.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'DrawingRenderer.ts');
const SOURCE = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-003: No verbose console.log in DrawingRenderer.syncPrimitive\n');

test('Source file exists', () => {
  assert.ok(SOURCE.length > 0);
});

test('No `console.log(`[DrawingRenderer] syncPrimitive` statement present', () => {
  // The BUGGY pattern: console.log(`[DrawingRenderer] syncPrimitive: TF=...
  const buggyPattern = /console\.log\(\s*`\[DrawingRenderer\]\s+syncPrimitive/;
  assert.ok(!buggyPattern.test(SOURCE),
    'BUG-003 REGRESSED: found console.log(`[DrawingRenderer] syncPrimitive...`) — performance bug is back');
});

test('Fix marker comment is present (documents the removal)', () => {
  // The fix added a comment to document the removal
  const markerPattern = /BUG-003 FIX/;
  assert.ok(markerPattern.test(SOURCE),
    'Expected: BUG-003 FIX comment marker (documents the removal)');
});

console.log('\n' + (process.exitCode === 1 ? '❌ BUG-003 REGRESSION DETECTED\n' : '✅ BUG-003 fix is intact\n'));
