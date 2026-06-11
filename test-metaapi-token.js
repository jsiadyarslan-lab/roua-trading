/**
 * Quick test for a new MetaAPI token
 * Tests: token validity, existing accounts, and ability to deploy
 * 
 * Usage: METAAPI_TOKEN=your_token node test-metaapi-token.js
 */

const TOKEN = process.env.METAAPI_TOKEN;
const ACCOUNT_ID = '11230892'; // MT5 account login
const PASSWORD = process.env.MT5_PASSWORD || '';
const SERVER = 'ICMarketsSC-MT5-4';

async function main() {
  if (!TOKEN) {
    console.log('❌ METAAPI_TOKEN not set. Usage: METAAPI_TOKEN=xxx node test-metaapi-token.js');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('🔍 MetaAPI Token Diagnostic');
  console.log('='.repeat(60));
  console.log(`Token length: ${TOKEN.length} chars`);
  console.log(`Token starts with: ${TOKEN.substring(0, 10)}...`);
  console.log('');

  // Step 1: Import SDK
  let metaApi;
  try {
    const metaApiModule = await import('metaapi.cloud-sdk');
    const MetaApiClass = metaApiModule.default || metaApiModule;
    metaApi = new MetaApiClass(TOKEN);
    console.log('✅ SDK imported successfully');
  } catch (err) {
    console.log(`❌ SDK import failed: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Validate token by listing accounts
  const accountApi = metaApi.metatraderAccountApi;
  let allAccounts = [];
  try {
    allAccounts = await accountApi.getAccountsWithInfiniteScrollPagination();
    console.log(`✅ Token is valid — found ${allAccounts.length} account(s) in this MetaAPI account`);
    
    if (allAccounts.length > 0) {
      for (const acc of allAccounts) {
        console.log(`   📋 Account: login=${acc.login}, id=${acc.id}, state=${acc.state}, conn=${acc.connectionStatus || '?'}`);
      }
    }
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('Invalid token')) {
      console.log(`❌ Token is INVALID: ${msg.substring(0, 120)}`);
    } else {
      console.log(`⚠️ Token validation error: ${msg.substring(0, 120)}`);
    }
    process.exit(1);
  }

  // Step 3: Check if our MT5 account already exists
  const existing = allAccounts.find(a => String(a.login) === String(ACCOUNT_ID));
  if (existing) {
    console.log('');
    console.log(`✅ MT5 account ${ACCOUNT_ID} already exists in this MetaAPI account`);
    console.log(`   State: ${existing.state}`);
    console.log(`   Connection: ${existing.connectionStatus || '?'}`);
    console.log(`   Region: ${existing.region || 'default'}`);
    
    // Try to deploy if UNDEPLOYED
    if (existing.state !== 'DEPLOYED') {
      console.log('');
      console.log(`🔄 Attempting to deploy account ${ACCOUNT_ID}...`);
      try {
        const fullAccount = await accountApi.getAccount(existing.id);
        await fullAccount.deploy();
        console.log('⏳ Waiting for deployment (max 60s)...');
        await Promise.race([
          fullAccount.waitDeployed(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000)),
        ]);
        console.log('✅ Account deployed successfully!');
        
        // Wait for broker connection
        try {
          await Promise.race([
            fullAccount.waitConnected(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 30_000)),
          ]);
          console.log('✅ Broker connected!');
        } catch {
          console.log('⚠️ Broker not connected yet (may connect later)');
        }
      } catch (deployErr) {
        console.log(`❌ Deploy failed: ${deployErr.message}`);
      }
    } else {
      console.log('✅ Account is already DEPLOYED');
    }
  } else {
    console.log('');
    console.log(`ℹ️ MT5 account ${ACCOUNT_ID} NOT found in this MetaAPI account`);
    console.log('   This is normal for a new MetaAPI account.');
    
    if (!PASSWORD) {
      console.log('');
      console.log('💡 To auto-create the account, set MT5_PASSWORD:');
      console.log('   METAAPI_TOKEN=xxx MT5_PASSWORD=your_password node test-metaapi-token.js');
    } else {
      // Try to create the account
      console.log('');
      console.log(`🔄 Creating MT5 account ${ACCOUNT_ID} in MetaAPI...`);
      try {
        const newAccount = await accountApi.createAccount({
          login: ACCOUNT_ID,
          password: PASSWORD,
          server: SERVER,
          type: 'cloud-g2',
          name: 'Roua-MT5-Real',
          platform: 'mt5',
          magic: 123456,
          quoteStreamingIntervalInSeconds: 2.5,
          reliability: 'high',
        });
        console.log(`✅ Account created! MetaAPI ID: ${newAccount.id}`);
        
        // Deploy
        console.log('🔄 Deploying...');
        await newAccount.deploy();
        await Promise.race([
          newAccount.waitDeployed(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 60_000)),
        ]);
        console.log('✅ Deployed! Waiting for broker connection...');
        
        try {
          await Promise.race([
            newAccount.waitConnected(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 45_000)),
          ]);
          console.log('✅ Broker connected!');
        } catch {
          console.log('⚠️ Broker connection timed out (may connect later)');
        }
      } catch (createErr) {
        console.log(`❌ Account creation failed: ${createErr.message}`);
      }
    }
  }

  // Step 4: Test REST API if account exists and is deployed
  const finalAccounts = await accountApi.getAccountsWithInfiniteScrollPagination();
  const ourAccount = finalAccounts.find(a => String(a.login) === String(ACCOUNT_ID));
  if (ourAccount && ourAccount.state === 'DEPLOYED') {
    console.log('');
    console.log('🔄 Testing REST API...');
    const https = await import('https');
    const region = ourAccount.region || 'agiliumtrade';
    const domain = 'agiliumtrade.agiliumtrade.ai';
    const url = `https://mt-client-api-v1.${region}.${domain}/users/current/accounts/${ourAccount.id}/account-information`;
    
    const result = await new Promise((resolve, reject) => {
      const req = https.request(url, {
        method: 'GET',
        headers: { 'auth-token': TOKEN, 'Accept': 'application/json' },
        timeout: 10000,
        rejectUnauthorized: false,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try { resolve(JSON.parse(data)); } catch { reject(new Error('Parse error')); }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
      req.end();
    }).catch(err => ({ error: err.message }));

    if (result.error) {
      console.log(`❌ REST API failed: ${result.error}`);
    } else {
      console.log('✅ REST API works!');
      console.log(`   Balance: $${result.balance}`);
      console.log(`   Equity: $${result.equity}`);
      console.log(`   Currency: ${result.currency}`);
      console.log(`   Leverage: ${result.leverage}`);
      console.log(`   Margin: $${result.margin}`);
      console.log(`   Free Margin: $${result.freeMargin}`);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('✅ Diagnostic complete');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
