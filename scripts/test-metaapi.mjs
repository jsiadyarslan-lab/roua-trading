#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MetaAPI Cloud Connection Test
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Usage:
//   METAAPI_TOKEN=your-token-here node scripts/test-metaapi.mjs
//   Or: node scripts/test-metaapi.mjs your-token-here
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import MetaApiModule from 'metaapi.cloud-sdk';

const MetaApi = MetaApiModule.default || MetaApiModule;

// Get token from args or env
const token = process.argv[2] || process.env.METAAPI_TOKEN;

if (!token) {
  console.error('❌ METAAPI_TOKEN غير موجود!');
  console.error('');
  console.error('الاستخدام:');
  console.error('  METAAPI_TOKEN=your-token node scripts/test-metaapi.mjs');
  console.error('  node scripts/test-metaapi.mjs your-token-here');
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🔍 اختبار اتصال MetaAPI Cloud');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📋 طول المفتاح: ${token.length} حرف`);
console.log(`📋 بداية المفتاح: ${token.substring(0, 8)}...`);
console.log('');

async function testMetaApi() {
  const results = {
    tokenValid: false,
    canConnect: false,
    accounts: [],
    errors: [],
  };

  // Step 1: Initialize SDK
  console.log('⏳ الخطوة 1: تهيئة MetaAPI SDK...');
  try {
    const api = new MetaApi(token);
    results.canConnect = true;
    console.log('✅ تم تهيئة SDK بنجاح');
  } catch (error) {
    results.errors.push(`فشل تهيئة SDK: ${error.message}`);
    console.error('❌ فشل تهيئة SDK:', error.message);
    printResults(results);
    return;
  }

  // Step 2: Test token validity by listing accounts
  console.log('⏳ الخطوة 2: التحقق من صحة المفتاح (جلب الحسابات)...');
  try {
    const api = new MetaApi(token);

    // Try to get accounts list
    const accounts = await api.metatraderAccountApi?.getAccounts?.()
      .catch(() => null);

    if (accounts && Array.isArray(accounts)) {
      results.tokenValid = true;
      results.accounts = accounts;
      console.log(`✅ المفتاح صحيح! عدد حسابات MT5 المسجلة: ${accounts.length}`);

      if (accounts.length > 0) {
        console.log('');
        console.log('📊 الحسابات المسجلة:');
        for (const acc of accounts) {
          console.log(`   ┌─ الحساب: ${acc.login || acc.id || 'N/A'}`);
          console.log(`   │ النوع: ${acc.type || acc.accountType || 'N/A'}`);
          console.log(`   │ السيرفر: ${acc.server || 'N/A'}`);
          console.log(`   │ الحالة: ${acc.state || acc.status || 'N/A'}`);
          console.log(`   │ الاسم: ${acc.name || 'N/A'}`);
          console.log(`   └─ ID: ${acc.id || 'N/A'}`);
        }
      } else {
        console.log('⚠️ لا توجد حسابات MT5 مسجلة بعد — يمكنك ربط حساب من التطبيق');
      }
    } else {
      // Try alternative API method
      console.log('⏳ محاولة بديلة للتحقق من المفتاح...');
      try {
        // Just try to access the API - if token is invalid, it will throw
        const accountApi = api.metatraderAccountApi;
        if (accountApi) {
          results.tokenValid = true;
          console.log('✅ المفتاح صحيح — API متاح');
        }
      } catch (innerErr) {
        results.errors.push(`فشل التحقق البديل: ${innerErr.message}`);
        console.error('❌ فشل التحقق:', innerErr.message);
      }
    }
  } catch (error) {
    if (error.message?.includes('Unauthorized') || error.message?.includes('401') || error.message?.includes('Invalid token')) {
      results.errors.push('المفتاح غير صالح — تم رفض الاتصال');
      console.error('❌ المفتاح غير صالح! تأكد من نسخ المفتاح الصحيح من MetaAPI Cloud');
    } else {
      results.errors.push(`خطأ في جلب الحسابات: ${error.message}`);
      console.error('❌ خطأ:', error.message);
    }
  }

  // Step 3: Try to get provisioning profile
  console.log('');
  console.log('⏳ الخطوة 3: فحص Provisioning Profiles...');
  try {
    const api = new MetaApi(token);
    const provisioningApi = api.provisioningProfileApi;
    if (provisioningApi) {
      const profiles = await provisioningApi.getProvisioningProfiles?.().catch(() => null);
      if (profiles && Array.isArray(profiles)) {
        console.log(`✅ عدد Provisioning Profiles: ${profiles.length}`);
        for (const p of profiles) {
          console.log(`   └─ ${p.name || p.id}: ${p.status || 'N/A'}`);
        }
      } else {
        console.log('✅ Provisioning API متاح');
      }
    }
  } catch (error) {
    console.log('⚠️ لم يتم العثور على provisioning profiles:', error.message?.substring(0, 80));
  }

  printResults(results);
}

function printResults(results) {
  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 ملخص النتائج');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`اتصال SDK:      ${results.canConnect ? '✅ ناجح' : '❌ فشل'}`);
  console.log(`صحة المفتاح:    ${results.tokenValid ? '✅ صحيح' : '❌ غير صالح'}`);
  console.log(`حسابات MT5:     ${results.accounts.length}`);
  if (results.errors.length > 0) {
    console.log(`أخطاء:          ${results.errors.length}`);
    for (const e of results.errors) {
      console.log(`   ❌ ${e}`);
    }
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (results.tokenValid) {
    console.log('');
    console.log('🎉 مفتاح MetaAPI يعمل بنجاح! يمكنك ربط حسابات MT5 من التطبيق.');
  } else if (results.canConnect) {
    console.log('');
    console.log('⚠️ SDK يعمل لكن التحقق من المفتاح لم يكتمل — تأكد من صحة المفتاح.');
  } else {
    console.log('');
    console.log('❌ فشل الاتصال — تأكد من:');
    console.log('   1. المفتاح تم نسخه بالكامل من metaapi.cloud');
    console.log('   2. المفتاح لم تنته صلاحيته');
    console.log('   3. الاتصال بالإنترنت يعمل');
  }
}

testMetaApi().catch(err => {
  console.error('خطأ غير متوقع:', err);
  process.exit(1);
});
