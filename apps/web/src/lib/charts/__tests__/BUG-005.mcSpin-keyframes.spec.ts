/**
 * BUG-005 Regression Test: @keyframes mcSpin must be defined.
 *
 * The bug: Three loading spinners use `animation: 'mcSpin 1s linear infinite'` but
 * @keyframes mcSpin was NEVER defined. Spinners rendered as static circles.
 *
 * The fix: Added @keyframes mcSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
 *
 * Run: npx tsx apps/web/src/lib/charts/__tests__/BUG-005.mcSpin-keyframes.spec.ts
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// The keyframes could be defined in RouaChart.tsx ScopedStyle, ChartGridCellHeader.tsx,
// or any CSS file. Scan all .ts/.tsx/.css files in components/charts/ and lib/charts/.
const SCAN_DIRS = [
  path.resolve(__dirname, '..', '..', '..'), // apps/web/src
];

function walk(dir: string, out: string[]): void {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.next') continue;
      walk(full, out);
    } else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx') || e.name.endsWith('.css'))) {
      out.push(full);
    }
  }
}

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-005: @keyframes mcSpin must be defined somewhere in the codebase\n');

const files: string[] = [];
for (const dir of SCAN_DIRS) walk(dir, files);

let mcSpinDefinitionFile: string | null = null;
let mcSpinDefinitionLine = 0;
for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  const match = content.match(/@keyframes\s+mcSpin\s*\{/);
  if (match) {
    mcSpinDefinitionFile = file;
    mcSpinDefinitionLine = content.slice(0, match.index).split('\n').length;
    break;
  }
}

test('@keyframes mcSpin is defined somewhere in apps/web/src', () => {
  assert.ok(mcSpinDefinitionFile,
    'BUG-005 REGRESSED: @keyframes mcSpin is NOT defined anywhere — spinners will be static');
  console.log(`     Found in: ${path.relative(process.cwd(), mcSpinDefinitionFile!)}:${mcSpinDefinitionLine}`);
});

test('@keyframes mcSpin has rotate transform', () => {
  if (!mcSpinDefinitionFile) return;
  const content = fs.readFileSync(mcSpinDefinitionFile, 'utf8');
  // Find the mcSpin block and verify it has rotate transforms
  const mcSpinBlock = content.match(/@keyframes\s+mcSpin\s*\{([^}]*\}[^}]*)\}/);
  assert.ok(mcSpinBlock, '@keyframes mcSpin block not parseable');

  const block = mcSpinBlock[1];
  assert.ok(/rotate\(/.test(block),
    'Expected: @keyframes mcSpin block contains rotate() transform');
});

test('Spinner elements still reference mcSpin animation', () => {
  // Confirm at least one element uses 'mcSpin' animation
  let found = false;
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    if (/animation:\s*['"]?mcSpin/.test(content)) {
      found = true;
      break;
    }
  }
  assert.ok(found, 'No element uses mcSpin animation — test is moot');
});

console.log('\n' + (process.exitCode === 1 ? '❌ BUG-005 REGRESSION DETECTED\n' : '✅ BUG-005 fix is intact\n'));
