#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V194b Deep Production Test — Tests the EXACT same logic as the backend
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Usage: METAAPI_TOKEN=xxx MT5_LOGIN=11230892 MT5_PASSWORD=xxx MT5_SERVER=xxx node scripts/test-mt5-balance.mjs
//
// This script mimics the V194b logic exactly:
//   1. Find account (or auto-create)
//   2. Quick REST attempt (fast path — 100-500ms)
//   3. If REST fails → deploy/redeploy + waitConnected (root cause fix)
//   4. Retry REST after deploy/redeploy
//   5. RPC fallback
//
// KEY INSIGHT: deploy() is a NO-OP on already-deployed accounts!
// For DEPLOYED+DISCONNECTED accounts, we MUST use redeploy().
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import MetaApiModule from 'metaapi.cloud-sdk';
import https from 'https';

const MetaApi = MetaApiModule.default || MetaApiModule;

const token = process.env.METAAPI_TOKEN;
const mt5Login = process.env.MT5_LOGIN || '11230892';
const mt5Password = process.env.MT5_PASSWORD || '';
const mt5Server = process.env.MT5_SERVER || '';

if (!token) {
  console.error('❌ METAAPI_TOKEN مطلوب!');
  console.error('الاستخدام: METAAPI_TOKEN=xxx node scripts/test-mt5-balance.mjs');
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 V194b اختبار عميق — نفس منطق الباكند بالضبط');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📋 MT5 Login: ${mt5Login}`);
console.log(`📋 Token: ${token.substring(0, 8)}... (${token.length} chars)`);
console.log('');

// ─── REST API test (same as _fetchMT5BalanceViaREST) ───
function fetchViaREST(metaApiAccountId, metaApiToken) {
  const startMs = Date.now();
  return new Promise((resolve, reject) => {
    const url = `https://mt-client-api-v1.agiliumtrade.agiliumtrade.ai/users/current/accounts/${metaApiAccountId}/account-information`;
    const req = https.request(url, {
      method: 'GET',
      headers: {
        'auth-token': metaApiToken,
        'Accept': 'application/json',
      },
      timeout: 8000,
      rejectUnauthorized: false, // V192: bypass expired SSL certs
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const elapsed = Date.now() - startMs;
        console.log(`   REST HTTP ${res.statusCode} (${data.length} bytes, ${elapsed}ms)`);
        if (res.statusCode === 200) {
          try {
            const info = JSON.parse(data);
            resolve(info);
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        } else if (res.statusCode === 404) {
          reject(new Error(`REST API 404: account ${metaApiAccountId} not found or not deployed`));
        } else if (res.statusCode === 401 || res.statusCode === 403) {
          reject(new Error(`REST API auth error (${res.statusCode}): token may be invalid`));
        } else {
          reject(new Error(`REST API returned ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(); reject(new Error('REST API timeout (8s)')); });
    req.end();
  });
}

async function runTest() {
  const results = [];

  // ═══════ STEP 1: Find the account in MetaAPI ═══════
  console.log('⏳ STEP 1: البحث عن حساب MT5 في MetaAPI...');
  const api = new MetaApi(token);
  const accountApi = api.metatraderAccountApi;

  let account;
  let metaApiAccountId;

  try {
    const allAccounts = await accountApi.getAccountsWithInfiniteScrollPagination();
    console.log(`   ✅ عدد الحسابات المسجلة: ${allAccounts.length}`);

    for (const acc of allAccounts) {
      console.log(`   ┌─ login: ${acc.login || 'N/A'}, id: ${acc.id}`);
      console.log(`   │ state: ${acc.state || '?'}, connectionStatus: ${acc.connectionStatus || '?'}`);
      console.log(`   │ type: ${acc.type || '?'}, server: ${acc.server || '?'}`);
      console.log(`   └─ name: ${acc.name || '?'}`);
    }

    const existing = allAccounts.find(a => String(a.login) === String(mt5Login));
    if (existing) {
      account = await accountApi.getAccount(existing.id);
      metaApiAccountId = existing.id;
      console.log(`\n   ✅ وجد حساب ${mt5Login} (MetaAPI ID: ${existing.id})`);
      results.push({ step: 'STEP 1: Find account', status: 'PASS', detail: `id=${existing.id}` });
    } else {
      console.log(`\n   ⚠️ لم يتم العثور على حساب ${mt5Login} في MetaAPI`);
      results.push({ step: 'STEP 1: Find account', status: 'FAIL', detail: 'Not found — will try auto-create' });
    }
  } catch (err) {
    console.error(`   ❌ فشل البحث: ${err.message}`);
    results.push({ step: 'STEP 1: Find account', status: 'ERROR', detail: err.message?.substring(0, 100) });
  }

  // ═══════ STEP 1b: Auto-create if not found ═══════
  if (!account && mt5Password && mt5Server) {
    console.log('\n⏳ STEP 1b: محاولة auto-create للحساب...');
    try {
      account = await accountApi.createAccount({
        login: mt5Login,
        password: mt5Password,
        server: mt5Server,
        type: 'cloud-g2',
        name: `Roua-Test-${Date.now()}`,
        platform: 'mt5',
        magic: 123456,
        quoteStreamingIntervalInSeconds: 2.5,
        reliability: 'high',
      });
      metaApiAccountId = account.id;
      console.log(`   ✅ تم إنشاء الحساب! MetaAPI ID: ${account.id}`);

      await account.deploy();
      console.log('   ⏳ جاري waitDeployed()...');
      await Promise.race([
        account.waitDeployed(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (30s)')), 30_000)),
      ]);
      console.log('   ✅ تم النشر!');

      try {
        await Promise.race([
          account.waitConnected(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (30s)')), 30_000)),
        ]);
        console.log('   ✅ تم الاتصال بالوسيط!');
      } catch {
        console.log('   ⚠️ waitConnected timeout — قد يحتاج وقت أكبر');
      }

      results.push({ step: 'STEP 1b: Auto-create', status: 'PASS', detail: `id=${account.id}` });
    } catch (createErr) {
      console.log(`   ❌ فشل إنشاء الحساب: ${createErr.message}`);
      results.push({ step: 'STEP 1b: Auto-create', status: 'FAIL', detail: createErr.message?.substring(0, 150) });
    }
  }

  if (!account || !metaApiAccountId) {
    console.log('\n❌ لا يوجد حساب للاختبار — تأكد من MT5_LOGIN و METAAPI_TOKEN');
    printSummary(results);
    process.exit(1);
  }

  // ═══════ STEP 2: Quick REST attempt (fast path) ═══════
  // This is the KEY V194b optimization: try REST first, only fix if needed
  console.log('\n⏳ STEP 2: محاولة REST سريعة (المسار السريع)...');
  let accountInfo = null;

  try {
    const restResult = await fetchViaREST(metaApiAccountId, token);
    accountInfo = restResult;
    console.log(`   ✅ REST API نجح من أول مرة! (المسار السريع)`);
    console.log(`   💰 balance: $${restResult.balance}, equity: $${restResult.equity}`);
    console.log(`   💰 margin: $${restResult.margin}, freeMargin: $${restResult.freeMargin}`);
    console.log(`   💰 currency: ${restResult.currency}`);
    results.push({ step: 'STEP 2: REST quick check', status: 'PASS', detail: `balance=$${restResult.balance}, equity=$${restResult.equity}` });
  } catch (err) {
    console.log(`   ❌ REST API فشل: ${err.message}`);
    results.push({ step: 'STEP 2: REST quick check', status: 'FAIL', detail: err.message?.substring(0, 100) });
  }

  // ═══════ STEP 3: If REST failed → fix account and retry ═══════
  if (!accountInfo) {
    const accountState = account.state;
    const connectionStatus = account.connectionStatus;
    console.log(`\n⏳ STEP 3: REST فشل — فحص صحة الحساب...`);
    console.log(`   state: ${accountState || '?'}`);
    console.log(`   connectionStatus: ${connectionStatus || '?'}`);

    const needsDeploy = accountState && !['DEPLOYED', 'DEPLOYING'].includes(accountState);
    const needsReconnect = connectionStatus && connectionStatus !== 'CONNECTED';

    if (needsDeploy || needsReconnect) {
      console.log(`   ⚠️ الحساب يحتاج إصلاح — ${needsDeploy ? 'deploy' : 'redeploy'} مطلوب...`);

      // 🔴 CRITICAL TEST: deploy() vs redeploy() on DEPLOYED+DISCONNECTED
      if (needsDeploy) {
        console.log('   📝 Account is NOT deployed — calling deploy()...');
        try {
          await account.deploy();
          await Promise.race([
            account.waitDeployed(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (30s)')), 30_000)),
          ]);
          console.log('   ✅ deploy() + waitDeployed() تم!');
        } catch (deployErr) {
          console.log(`   ❌ deploy() فشل: ${deployErr.message}`);
          results.push({ step: 'STEP 3: deploy()', status: 'FAIL', detail: deployErr.message?.substring(0, 100) });
        }
      } else {
        // Account is DEPLOYED but DISCONNECTED — MUST use redeploy()!
        // deploy() is a NO-OP on already-deployed accounts!
        console.log('   📝 Account is DEPLOYED but DISCONNECTED — calling redeploy()...');
        console.log('   ⚠️ NOTE: deploy() would be a NO-OP here (server ignores it)!');
        try {
          await account.redeploy();
          console.log('   ⏳ redeploy() تم — جاري waitDeployed()...');
          await Promise.race([
            account.waitDeployed(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (30s)')), 30_000)),
          ]);
          console.log('   ✅ redeploy() + waitDeployed() تم!');
        } catch (redeployErr) {
          console.log(`   ❌ redeploy() فشل: ${redeployErr.message}`);
          results.push({ step: 'STEP 3: redeploy()', status: 'FAIL', detail: redeployErr.message?.substring(0, 100) });
        }
      }

      // Wait for broker connection
      try {
        await Promise.race([
          account.waitConnected(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout (20s)')), 20_000)),
        ]);
        console.log('   ✅ waitConnected() تم! — الحساب متصل بالوسيط');
        results.push({ step: 'STEP 3: Deploy/redeploy + connect', status: 'PASS', detail: 'Connected to broker' });
      } catch (connErr) {
        console.log(`   ⚠️ waitConnected() timeout: ${connErr.message}`);
        results.push({ step: 'STEP 3: Deploy/redeploy + connect', status: 'PARTIAL', detail: `Deployed but not connected: ${connErr.message}` });
      }

      // Refresh and check new state
      const refreshed = await accountApi.getAccount(metaApiAccountId);
      console.log(`   📊 بعد الإصلاح: state=${refreshed.state}, connStatus=${refreshed.connectionStatus}`);

      // ═══════ STEP 3b: Retry REST after fix ═══════
      console.log('\n⏳ STEP 3b: إعادة محاولة REST بعد الإصلاح...');
      try {
        const retryResult = await fetchViaREST(metaApiAccountId, token);
        accountInfo = retryResult;
        console.log(`   ✅ REST API نجح بعد الإصلاح!`);
        console.log(`   💰 balance: $${retryResult.balance}, equity: $${retryResult.equity}`);
        results.push({ step: 'STEP 3b: REST after fix', status: 'PASS', detail: `balance=$${retryResult.balance}, equity=$${retryResult.equity}` });
      } catch (err) {
        console.log(`   ❌ REST API لا يزال يفشل: ${err.message}`);
        results.push({ step: 'STEP 3b: REST after fix', status: 'FAIL', detail: err.message?.substring(0, 100) });
      }
    } else {
      console.log('   ✅ الحساب مُنشر ومتصل — المشكلة ليست في حالة الحساب!');
      results.push({ step: 'STEP 3: Account health', status: 'PASS', detail: 'Account is healthy' });
    }
  }

  // ═══════ STEP 4: RPC fallback test ═══════
  console.log('\n⏳ STEP 4: اختبار RPC connection...');
  try {
    const connection = account.getRPCConnection();
    await Promise.race([
      (async () => {
        await connection.connect();
        await connection.waitSynchronized();
      })(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('connect timeout (8s)')), 8_000)),
    ]);
    console.log('   ✅ RPC connect + sync نجح!');

    const info = await Promise.race([
      connection.getAccountInformation(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('getInfo timeout (5s)')), 5_000)),
    ]);
    console.log(`   💰 RPC balance: $${info.balance}, equity: $${info.equity}`);
    results.push({ step: 'STEP 4: RPC connection', status: 'PASS', detail: `balance=$${info.balance}, equity=$${info.equity}` });
  } catch (err) {
    console.log(`   ❌ RPC فشل: ${err.message}`);
    results.push({ step: 'STEP 4: RPC connection', status: 'FAIL', detail: err.message?.substring(0, 100) });
  }

  // ═══════ Summary ═══════
  printSummary(results);

  const failCount = results.filter(r => r.status === 'FAIL').length;
  process.exit(failCount > 0 ? 1 : 0);
}

function printSummary(results) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 ملخص نتائج الاختبار');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status === 'PARTIAL' ? '⚠️' : '⏭️';
    console.log(`${icon} ${r.step}: ${r.status} — ${r.detail}`);
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const passCount = results.filter(r => r.status === 'PASS').length;
  const failCount = results.filter(r => r.status === 'FAIL').length;
  const partialCount = results.filter(r => r.status === 'PARTIAL').length;
  console.log(`\n✅ نجح: ${passCount} | ❌ فشل: ${failCount} | ⚠️ جزئي: ${partialCount}`);
}

runTest().catch(err => {
  console.error('خطأ غير متوقع:', err);
  process.exit(1);
});
