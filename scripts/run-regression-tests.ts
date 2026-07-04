#!/usr/bin/env tsx
/**
 * run-regression-tests.ts — Runs all BUG-NNN regression tests.
 *
 * Each test is a standalone .spec.ts file that uses node:assert (no test framework needed).
 * This script discovers and runs them all, then reports a summary.
 *
 * Exit code: 0 if all pass, 1 if any fail.
 *
 * Usage:
 *   npx tsx scripts/run-regression-tests.ts
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT, 'apps/web/src/lib/charts/__tests__');

function findTests(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.startsWith('BUG-') && f.endsWith('.spec.ts'))
    .map(f => path.join(dir, f))
    .sort();
}

const tests = findTests(TEST_DIR);
if (tests.length === 0) {
  console.log('\n⚠️  No regression tests found in', path.relative(ROOT, TEST_DIR));
  process.exit(0);
}

console.log(`\n🧪 Running ${tests.length} regression test(s)\n`);
console.log('═'.repeat(70));

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const test of tests) {
  const name = path.basename(test);
  process.stdout.write(`  ▶ ${name.padEnd(55)} `);
  try {
    execSync(`npx tsx "${test}"`, { stdio: 'pipe', cwd: ROOT });
    console.log('✅ PASS');
    passed++;
  } catch (err: any) {
    console.log('❌ FAIL');
    failed++;
    failures.push(name);
    // Print last 5 lines of stderr/stdout for context
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '');
    const lines = output.split('\n').filter(Boolean).slice(-5);
    for (const line of lines) console.log(`     ${line}`);
  }
}

console.log('═'.repeat(70));
console.log(`  ${passed} passed, ${failed} failed, ${tests.length} total\n`);

if (failed > 0) {
  console.log('❌ FAILED tests:');
  for (const f of failures) console.log(`   - ${f}`);
  console.log();
  process.exit(1);
}
console.log('✅ All regression tests passed.\n');
process.exit(0);
