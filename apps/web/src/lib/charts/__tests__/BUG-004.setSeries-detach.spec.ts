/**
 * BUG-004 Regression Test: OverlayRegistry.setSeries() must detach from OLD series first.
 *
 * The bug: setSeries(series) reassigned `this.series = series` BEFORE calling clearAll(),
 * so clearAll() tried to detach primitives from the NEW series (where they were never
 * attached). OLD series kept orphaned primitives → memory leak.
 *
 * The fix: Detach from OLD series BEFORE reassigning this.series.
 *
 * Run: npx tsx apps/web/src/lib/charts/__tests__/BUG-004.setSeries-detach.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const FILE = path.resolve(__dirname, '..', 'OverlayRegistry.ts');
const SOURCE = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-004: OverlayRegistry.setSeries() must detach from OLD series first\n');

test('Source file exists', () => {
  assert.ok(SOURCE.length > 0);
});

test('setSeries method detaches from old series BEFORE reassigning', () => {
  // Extract the setSeries method body
  const setSeriesMatch = SOURCE.match(/setSeries\(series[^)]*\):\s*void\s*\{([\s\S]*?)\n\s{2}\}/);
  assert.ok(setSeriesMatch, 'setSeries method not found');

  const body = setSeriesMatch[1];

  // The fix should detach from this.series (old) BEFORE assigning this.series = series (new)
  const detachPattern = /this\.series!\.detachPrimitive\(primitive\)|this\.series\.detachPrimitive\(primitive\)/;
  assert.ok(detachPattern.test(body),
    'Expected: this.series.detachPrimitive(primitive) call in setSeries body');

  // The detach should come BEFORE `this.series = series`
  const detachIdx = body.search(detachPattern);
  const reassignIdx = body.indexOf('this.series = series');

  assert.ok(reassignIdx > -1, 'Expected: this.series = series assignment in setSeries');
  assert.ok(detachIdx > -1 && detachIdx < reassignIdx,
    `Expected: detach (idx ${detachIdx}) BEFORE reassign (idx ${reassignIdx}) — BUG-004 REGRESSED`);
});

test('No buggy "reassign first, then clearAll" pattern', () => {
  // The BUGGY pattern: this.series = series; ... this.clearAll(); (no detach before)
  const setSeriesMatch = SOURCE.match(/setSeries\(series[^)]*\):\s*void\s*\{([\s\S]*?)\n\s{2}\}/);
  if (!setSeriesMatch) return; // already failed above
  const body = setSeriesMatch[1];

  // Check that there's NO path where this.series = series happens without a preceding detach
  const reassignIdx = body.indexOf('this.series = series');
  const detachIdx = body.search(/detachPrimitive/);

  if (reassignIdx > -1 && detachIdx > -1) {
    assert.ok(detachIdx < reassignIdx,
      'BUG-004 REGRESSED: this.series = series happens BEFORE detachPrimitive');
  }
});

console.log('\n' + (process.exitCode === 1 ? '❌ BUG-004 REGRESSION DETECTED\n' : '✅ BUG-004 fix is intact\n'));
