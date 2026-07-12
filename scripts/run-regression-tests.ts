#!/usr/bin/env tsx
/**
 * run-regression-tests.ts — Runs all BUG-NNN regression tests.
 *
 * Each test is a standalone .spec.ts file that uses node:assert (no test framework needed).
 * This script discovers and runs them all, then reports a summary.
 *
 * IMPROVEMENTS (per code review feedback):
 * 1. Run tests IN-PROCESS (dynamic import) instead of spawning `npx tsx` per test
 *    — eliminates ~500ms startup × N tests overhead.
 * 2. Add timeout support (default 10s per test) — prevents hung tests from blocking.
 * 3. Add `--bug BUG-NNN` filter — run a single test (like verify-bugs.ts).
 * 4. Add `--verbose` flag — show full test output on success.
 * 5. Recursive test discovery — finds tests in subdirectories.
 * 6. Better error output — show full failure context, not just last 5 lines.
 * 7. ANSI colors (auto-detected for TTY, disabled for CI/logs).
 *
 * Exit code: 0 if all pass, 1 if any fail, 2 if script error.
 *
 * Usage:
 *   npx tsx scripts/run-regression-tests.ts
 *   npx tsx scripts/run-regression-tests.ts --verbose
 *   npx tsx scripts/run-regression-tests.ts --bug BUG-001
 *   npx tsx scripts/run-regression-tests.ts --timeout 30000
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const TEST_DIRS = [
  path.join(ROOT, 'apps/web/src/lib/charts/__tests__'),
  // BUG-038: Added API-side regression tests directory
  path.join(ROOT, 'apps/api/src/modules/trading/services/__tests__'),
];

const DEFAULT_TIMEOUT_MS = 10_000;

// ─── ANSI Colors (auto-disabled in non-TTY) ──────────────────────────────────

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
function color(code: string, text: string): string {
  return useColor ? `\x1b[${code}m${text}\x1b[0m` : text;
}
const c = {
  green: (t: string) => color('32', t),
  red: (t: string) => color('31', t),
  yellow: (t: string) => color('33', t),
  cyan: (t: string) => color('36', t),
  dim: (t: string) => color('2', t),
  bold: (t: string) => color('1', t),
};

// ─── Argument Parsing ────────────────────────────────────────────────────────

interface Args {
  verbose: boolean;
  bugFilter: string | null;
  timeoutMs: number;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const result: Args = { verbose: false, bugFilter: null, timeoutMs: DEFAULT_TIMEOUT_MS };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--verbose' || args[i] === '-v') {
      result.verbose = true;
    } else if (args[i] === '--bug' && args[i + 1]) {
      result.bugFilter = args[i + 1];
      i++;
    } else if (args[i] === '--timeout' && args[i + 1]) {
      const ms = parseInt(args[i + 1], 10);
      if (!isNaN(ms) && ms > 0) result.timeoutMs = ms;
      i++;
    }
  }
  return result;
}

// ─── Test Discovery (recursive) ──────────────────────────────────────────────

function findTests(dirs: string[], bugFilter: string | null): string[] {
  const tests: string[] = [];
  for (const dir of dirs) {
    walk(dir, tests);
  }

  let filtered = tests.sort();
  if (bugFilter) {
    filtered = filtered.filter(t => path.basename(t).startsWith(bugFilter));
    if (filtered.length === 0) {
      console.error(`\n${c.red('ERROR')}: No test matches filter "${bugFilter}"`);
      console.error(`   Available tests: ${tests.map(t => path.basename(t)).join(', ')}`);
      process.exit(2);
    }
  }
  return filtered;
}

function walk(dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile() && e.name.startsWith('BUG-') && e.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
}

// ─── Test Runner (in-process with timeout) ───────────────────────────────────

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'TIMEOUT';
  durationMs: number;
  output: string;
  error?: Error;
}

async function runTest(testPath: string, timeoutMs: number): Promise<TestResult> {
  const name = path.basename(testPath);
  const start = Date.now();
  let output = '';
  let error: Error | undefined;

  // Capture console.log output from the test
  const originalLog = console.log;
  const originalError = console.error;
  const captured: string[] = [];
  console.log = (...args: any[]) => { captured.push(args.map(String).join(' ')); };
  console.error = (...args: any[]) => { captured.push(args.map(String).join(' ')); };

  // Set exitCode guard — tests use `process.exitCode = 1` to signal failure
  const originalExitCode = process.exitCode;
  process.exitCode = 0;

  try {
    // Dynamic import runs the test file's top-level code (which calls assert)
    // Use a timeout wrapper to prevent hung tests
    await Promise.race([
      import(`file://${testPath}`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  } catch (err: any) {
    error = err;
  } finally {
    console.log = originalLog;
    console.error = originalError;
    output = captured.join('\n');
  }

  const durationMs = Date.now() - start;
  const failed = process.exitCode !== 0 || error !== undefined;
  // Restore exitCode (don't let one test's failure cascade)
  process.exitCode = originalExitCode;

  return {
    name,
    status: error?.message?.startsWith('Timeout') ? 'TIMEOUT' : failed ? 'FAIL' : 'PASS',
    durationMs,
    output,
    error,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs();
  const tests = findTests(TEST_DIRS, args.bugFilter);

  if (tests.length === 0) {
    console.log(`\n${c.yellow('⚠️')}  No regression tests found in:`);
    for (const dir of TEST_DIRS) console.log(`   ${path.relative(ROOT, dir)}`);
    process.exit(0);
  }

  console.log(`\n${c.bold('🧪 Running')} ${tests.length} regression test(s)${args.bugFilter ? ` matching "${args.bugFilter}"` : ''}\n`);
  console.log('═'.repeat(70));

  const results: TestResult[] = [];
  for (const test of tests) {
    const name = path.basename(test);
    process.stdout.write(`  ▶ ${name.padEnd(55)} `);
    const result = await runTest(test, args.timeoutMs);
    results.push(result);

    if (result.status === 'PASS') {
      console.log(`${c.green('✅ PASS')} ${c.dim(`(${result.durationMs}ms)`)}`);
      if (args.verbose && result.output) {
        for (const line of result.output.split('\n')) {
          if (line) console.log(`     ${c.dim(line)}`);
        }
      }
    } else if (result.status === 'TIMEOUT') {
      console.log(`${c.red('⏱  TIMEOUT')} ${c.dim(`(>${args.timeoutMs}ms)`)}`);
    } else {
      console.log(`${c.red('❌ FAIL')}`);
      // Show full failure output (not just last 5 lines)
      if (result.output) {
        const lines = result.output.split('\n').filter(Boolean);
        const toShow = args.verbose ? lines : lines.slice(-8);
        for (const line of toShow) console.log(`     ${c.red(line)}`);
        if (!args.verbose && lines.length > 8) {
          console.log(`     ${c.dim(`... (${lines.length - 8} more lines — use --verbose to see all)`)}`);
        }
      }
      if (result.error?.stack) {
        console.log(`     ${c.red(result.error.message)}`);
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  console.log('═'.repeat(70));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const timedOut = results.filter(r => r.status === 'TIMEOUT').length;
  const totalMs = results.reduce((s, r) => s + r.durationMs, 0);

  console.log(`  ${c.green(`${passed} passed`)}, ${c.red(`${failed} failed`)}, ${timedOut ? c.yellow(`${timedOut} timed out`) + ', ' : ''}${results.length} total ${c.dim(`(${totalMs}ms)`)}\n`);

  if (failed > 0 || timedOut > 0) {
    console.log(`${c.red('❌ FAILED tests:')}`);
    for (const r of results) {
      if (r.status !== 'PASS') console.log(`   - ${r.name}`);
    }
    console.log();
    process.exit(1);
  }
  console.log(`${c.green('✅ All regression tests passed.')}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`\n${c.red('FATAL')}: ${err.message}`);
  console.error(err.stack);
  process.exit(2);
});
