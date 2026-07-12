/**
 * BUG-046 Regression Test: Backend must validate OANDA credentials via v20 API.
 *
 * Verifies that:
 *   1. _doValidateApiKey has an explicit OANDA branch (NOT falling through to CCXT)
 *   2. _validateOandaCredentials method exists
 *   3. It validates account ID format (XXX-XXX-XXXXX-XXX)
 *   4. It calls OANDA v20 REST API (GET /v3/accounts) for verification
 *   5. decryptCredential swaps passphrase → apiSecret for OANDA
 *
 * If this test FAILS, BUG-046 has REGRESSED — OANDA credentials accepted without verification.
 */
import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const FILE = path.join(ROOT, 'modules/portfolio/credentials/credentials.service.ts');

const SRC = fs.readFileSync(FILE, 'utf8');

function test(msg: string, fn: () => void) {
  try { fn(); console.log(`  ✅ ${msg}`); }
  catch (e: any) { console.error(`  ❌ ${msg}`); console.error(`     ${e.message}`); process.exitCode = 1; }
}

console.log('\nBUG-046: Backend must verify OANDA credentials via v20 REST API\n');

test('CredentialsService file exists', () => {
  assert.ok(SRC.length > 0, 'credentials.service.ts is missing');
});

test('_doValidateApiKey has explicit OANDA branch (before CCXT fallback)', () => {
  // Must have: if (isOanda) { return this._validateOandaCredentials(...)
  assert.ok(
    /const isOanda = \['oanda', 'oanda_practice', 'oanda_live'\]\.includes\(exchange\.toLowerCase\(\)\);[\s\S]{0,200}if \(isOanda\) \{[\s\S]{0,200}return this\._validateOandaCredentials/.test(SRC),
    'Missing OANDA branch in _doValidateApiKey — must be added before CCXT fallback',
  );
});

test('_validateOandaCredentials method exists', () => {
  assert.ok(
    /private async _validateOandaCredentials\s*\(/.test(SRC),
    '_validateOandaCredentials method must be defined',
  );
});

test('Account ID format validation (XXX-XXX-XXXXX-XXX regex)', () => {
  assert.ok(
    /\/\^\\d\{3\}-\\d\{3\}-\\d\{4,\}-\\d\{3\}\$\//.test(SRC),
    'Must validate account ID format with regex /^\\d{3}-\\d{3}-\\d{4,}-\\d{3}$/',
  );
});

test('Calls OANDA v20 REST API for verification', () => {
  assert.ok(
    /api-fxpractice\.oanda\.com[\s\S]{0,500}\/v3\/accounts/.test(SRC),
    'Must call https://api-fxpractice.oanda.com/v3/accounts for verification',
  );
  assert.ok(
    /api-fxtrade\.oanda\.com[\s\S]{0,500}\/v3\/accounts/.test(SRC) ||
    /api-fxtrade\.oanda\.com/.test(SRC),
    'Must support live URL https://api-fxtrade.oanda.com',
  );
});

test('Verifies account ID belongs to token (not just accepts any ID)', () => {
  assert.ok(
    /accounts\.find\(\(a: any\) => a\.id === accountId\)/.test(SRC) ||
    /accounts\.find\(\(a[^)]+\) => a\.id === accountId\)/.test(SRC),
    'Must verify that account ID appears in the list of accounts owned by this token',
  );
});

test('Returns Arabic error for invalid token (401/403)', () => {
  assert.ok(
    /OANDA API token غير صالح/.test(SRC),
    'Must return Arabic error for invalid OANDA token',
  );
});

test('Returns Arabic error when account ID not found in token\'s accounts', () => {
  assert.ok(
    /لا ينتمي لهذا الـ token/.test(SRC),
    'Must return Arabic error when account ID doesn\'t belong to token',
  );
});

test('decryptCredential swaps passphrase → apiSecret for OANDA', () => {
  // Look for the swap logic: if (isOanda && passphrase) return { apiKey, apiSecret: passphrase, ... }
  assert.ok(
    /isOanda && passphrase[\s\S]{0,200}return \{ apiKey, apiSecret: passphrase/.test(SRC),
    'decryptCredential must swap passphrase → apiSecret for OANDA credentials',
  );
});

console.log('\n(if all ✅ above, BUG-046 fix is in place — OANDA credentials are verified)\n');
