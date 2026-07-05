/**
 * BUG-045 Regression Test: Frontend OANDA UI must collect account ID.
 *
 * Verifies that the OANDA credential form in exchange settings page:
 *   1. Has an explicit `isOanda` block in the JSX (not just declared as variable)
 *   2. Collects "API Token" in apiKey field
 *   3. Collects "Account ID" in passphrase field (NOT apiSecret)
 *   4. Has hidden apiSecret placeholder
 *   5. Submit button requires passphrase for OANDA
 *
 * If this test FAILS, BUG-045 has REGRESSED — OANDA users can't input account ID.
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// __dirname = .../apps/api/src/modules/trading/services/__tests__
// We need to climb 7 levels to reach project root (roua-trading), then descend to apps/web/...
const ROOT = path.resolve(__dirname, '../../../../../../../');
const FILE = path.join(
  ROOT,
  'apps/web/src/app/[locale]/dashboard/settings/exchange/page.tsx',
);

const SRC = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-045: Frontend must collect OANDA account ID (not just API token)\n');

test('Exchange settings page exists', () => {
  assert.ok(SRC.length > 0, 'page.tsx is missing or empty');
});

test('isOanda is defined AND used in JSX (not just declared)', () => {
  // Verify isOanda is referenced in JSX block — at minimum in ternary `isOanda ? (`
  assert.ok(
    /\} : isOanda \? \(/.test(SRC) || /\} isOanda \? \(/.test(SRC) || /isOanda \? \(/.test(SRC),
    'isOanda must be used as a JSX conditional — not just declared as a variable',
  );
});

test('Has OANDA API Token input field (stored in apiKey)', () => {
  assert.ok(/OANDA API Token/.test(SRC), 'Missing "OANDA API Token" label');
});

test('Has OANDA Account ID input field (stored in passphrase, not apiSecret)', () => {
  assert.ok(/OANDA Account ID/.test(SRC), 'Missing "OANDA Account ID" label');
  // The Account ID input must use passphrase state, not apiSecret
  assert.ok(
    /id="passphrase"[\s\S]{0,300}OANDA Account ID|OANDA Account ID[\s\S]{0,300}id="passphrase"/.test(SRC),
    'Account ID field must use id="passphrase" (stored in passphrase state)',
  );
});

test('Has hidden apiSecret placeholder for OANDA', () => {
  assert.ok(
    /oanda-no-secret/.test(SRC),
    'Must have hidden apiSecret="oanda-no-secret" placeholder (OANDA doesn\'t use apiSecret)',
  );
});

test('Account ID input has client-side pattern validation', () => {
  assert.ok(
    /pattern="\\d\{3\}-\\d\{3\}-\\d\{4,\}-\\d\{3\}"/.test(SRC),
    'Account ID input must have pattern="\\d{3}-\\d{3}-\\d{4,}-\\d{3}" for client-side validation',
  );
});

test('Submit button requires passphrase for OANDA (same as MT5)', () => {
  // The disabled condition must include isOanda in the passphrase requirement
  assert.ok(
    /\(\(isMT5 \|\| isOanda\) && !passphrase\)/.test(SRC),
    'Submit button must require passphrase for both MT5 and OANDA',
  );
});

test('Submit button has OANDA-specific loading text', () => {
  assert.ok(
    /جارٍ التحقق من حساب OANDA/.test(SRC),
    'Missing "جارٍ التحقق من حساب OANDA..." loading text',
  );
});

test('Submit button has OANDA-specific action text', () => {
  assert.ok(
    /ربط حساب OANDA/.test(SRC),
    'Missing "ربط حساب OANDA" button text',
  );
});

console.log('\n(if all ✅ above, BUG-045 fix is in place — OANDA UI collects account ID)\n');
