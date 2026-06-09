#!/usr/bin/env node
/**
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *  سكريبت فحص مزامنة البيانات — Roua Trading iOS
 *  Data Synchronization Diagnostic Script
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 *  يفحص هذا السكريبت خطوة بخطوة تدفق البيانات من الباكند إلى iOS:
 *  1. المصادقة (OTP login / session validation)
 *  2. تجديد التوكن (token refresh)
 *  3. بيانات المحفظة (/trading/v2/portfolio)
 *  4. بيانات الحساب (/trading/account)
 *  5. بيانات الاعتمادات (/portfolio/credentials)
 *  6. مزامنة الجلسة (/auth/sync)
 *  7. سلوك البروكسي للموبايل (guest session prevention)
 *  8. مقارنة شكل البيانات مع موديلات iOS
 *
 *  الاستخدام:
 *    node scripts/test-mobile-sync.mjs
 *    node scripts/test-mobile-sync.mjs --email=user@example.com --otp=123456
 *    node scripts/test-mobile-sync.mjs --token=existing_session_token
 */

const BASE_URL = process.env.API_URL || 'https://roua-trading-production.up.railway.app'

// ── Helpers ──

let passCount = 0
let failCount = 0
let warnCount = 0
const results = []

function log(emoji, msg) {
  console.log(`${emoji} ${msg}`)
}

function pass(msg) {
  passCount++
  results.push({ status: 'PASS', msg })
  log('✅', msg)
}

function fail(msg, detail = '') {
  failCount++
  results.push({ status: 'FAIL', msg, detail })
  log('❌', msg)
  if (detail) console.log(`   → ${detail}`)
}

function warn(msg, detail = '') {
  warnCount++
  results.push({ status: 'WARN', msg, detail })
  log('⚠️', msg)
  if (detail) console.log(`   → ${detail}`)
}

function info(msg) {
  log('ℹ️', msg)
}

function section(title) {
  console.log(`\n${'═'.repeat(60)}`)
  console.log(`  ${title}`)
  console.log(`${'═'.repeat(60)}`)
}

async function apiCall(method, path, options = {}) {
  const url = `${BASE_URL}${path}`
  const headers = {
    'Content-Type': 'application/json',
    'X-Platform': 'ios',
    ...options.headers,
  }

  const fetchOptions = {
    method,
    headers,
    signal: AbortSignal.timeout(15000),
  }

  if (options.body && ['POST', 'PUT', 'PATCH'].includes(method)) {
    fetchOptions.body = JSON.stringify(options.body)
  }

  try {
    const res = await fetch(url, fetchOptions)
    const text = await res.text()
    let json = null
    try { json = JSON.parse(text) } catch {}

    return {
      status: res.status,
      ok: res.status >= 200 && res.status < 300,
      headers: Object.fromEntries(res.headers.entries()),
      json,
      raw: text.substring(0, 2000),
    }
  } catch (err) {
    return {
      status: 0,
      ok: false,
      headers: {},
      json: null,
      raw: err.message,
      error: err,
    }
  }
}

// ── iOS Model Definitions ──

const IOS_MODELS = {
  PortfolioSummary: {
    required: ['totalBalance', 'dailyPnL', 'dailyPnLPercent', 'totalExposure', 'usedMargin', 'openPositionsCount', 'maxDrawdownPercent', 'unrealizedPnL', 'positions'],
    codingKeys: { marginUsed: 'usedMargin', unrealizedPnl: 'unrealizedPnL' },
  },
  PositionSummary: {
    required: ['totalUnrealizedPnl', 'totalValue', 'totalPositions', 'positions'],
    codingKeys: { totalPositionValue: 'totalValue', positionCount: 'totalPositions' },
  },
  Position: {
    required: ['id', 'symbol', 'side', 'entryPrice', 'quantity', 'unrealizedPnL'],
    codingKeys: { unrealizedPnl: 'unrealizedPnL' },
    flexible: true,
  },
  AuthMeResponse: {
    required: ['authenticated'],
    optional: ['user', 'sessionToken', 'refreshToken'],
  },
  AuthSyncResponse: {
    required: ['authenticated'],
    optional: ['user', 'error'],
  },
  RefreshResponse: {
    required: [],
    optional: ['refreshed', 'authenticated', 'user', 'data'],
    nestedData: ['token', 'refresh'],
  },
}

// ── Check Functions ──

function checkResponseShape(testName, response, modelName) {
  const model = IOS_MODELS[modelName]
  if (!model) { fail(`${testName}: Unknown model ${modelName}`); return }
  if (!response.json) { fail(`${testName}: No JSON (status ${response.status})`, response.raw?.substring(0, 200)); return }

  let data = response.json
  if (response.json.success === true && response.json.data !== undefined) {
    data = response.json.data
    pass(`${testName}: Wrapped in { success, data }`)
  } else if (response.json.success === false) {
    fail(`${testName}: Backend returned success: false`, `error: ${response.json.error || 'unknown'}`)
    return
  }

  const missingRequired = model.required.filter(f => data[f] === undefined && data[f] !== 0)
  if (missingRequired.length > 0) {
    fail(`${testName}: Missing fields: ${missingRequired.join(', ')}`, `Available: ${Object.keys(data).join(', ')}`)
  } else {
    pass(`${testName}: All required fields present`)
  }

  if (model.codingKeys) {
    for (const [swiftName, backendName] of Object.entries(model.codingKeys)) {
      if (data[backendName] !== undefined) {
        pass(`${testName}: ${swiftName} ← ${backendName} = ${data[backendName]}`)
      } else {
        warn(`${testName}: CodingKey ${swiftName} ← ${backendName} not found`)
      }
    }
  }

  if (model.nestedData && data) {
    for (const field of model.nestedData) {
      if (data[field] !== undefined) {
        pass(`${testName}: data.${field} present`)
      } else {
        warn(`${testName}: data.${field} missing — iOS can't extract`)
      }
    }
  }

  if (typeof data === 'object' && data !== null) {
    const summary = {}
    for (const [k, v] of Object.entries(data)) {
      summary[k] = Array.isArray(v) ? `[${v.length} items]` : (typeof v === 'object' && v !== null ? `{...}` : v)
    }
    info(`  Shape: ${JSON.stringify(summary)}`)
  }
}

// ── Parse CLI args ──

const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace(/^--/, '').split('=')
  acc[key] = val || true
  return acc
}, {})

// ── Main ──

async function main() {
  console.log('━'.repeat(60))
  console.log('  🔍 سكريبت فحص مزامنة البيانات — Roua Trading iOS')
  console.log(`  Target: ${BASE_URL}`)
  console.log('━'.repeat(60))

  let sessionToken = args.token || null
  let refreshToken = null

  // ═══ TEST 1: Server Reachability ═══
  section('TEST 1: الاتصال بالخادم — Server Reachability')
  const healthCheck = await apiCall('GET', '/api/auth/me')
  if (healthCheck.status === 0) { fail('Server unreachable', healthCheck.raw); printSummary(); return }
  pass(`Server responds (status ${healthCheck.status})`)

  // ═══ TEST 2: Authentication ═══
  section('TEST 2: المصادقة — Authentication')
  if (sessionToken) {
    info(`Using provided token: ${sessionToken.substring(0, 10)}...`)
  } else if (args.email && args.otp) {
    const otpSend = await apiCall('POST', '/api/auth/otp/send', { body: { email: args.email } })
    if (otpSend.ok) { pass('OTP send OK') } else { warn('OTP send failed', `${otpSend.status}: ${otpSend.raw?.substring(0, 150)}`) }

    const otpVerify = await apiCall('POST', '/api/auth/otp/verify', { body: { email: args.email, otp: args.otp } })
    if (otpVerify.ok && otpVerify.json?.authenticated) {
      pass('OTP verify OK')
      if (otpVerify.json.sessionToken) { pass('sessionToken in body'); sessionToken = otpVerify.json.sessionToken }
      else { fail('sessionToken MISSING from body!', 'Backend must include it when X-Platform: ios') }
      if (otpVerify.json.refreshToken) { pass('refreshToken in body'); refreshToken = otpVerify.json.refreshToken }
      else { warn('refreshToken missing from body') }
    } else { fail('OTP verify failed', `${otpVerify.status}: ${otpVerify.raw?.substring(0, 200)}`) }
  } else { warn('No --email/--otp or --token provided — skipping auth') }

  // ═══ TEST 3: Session Validation ═══
  section('TEST 3: التحقق من الجلسة — /auth/me')
  if (sessionToken) {
    const me1 = await apiCall('GET', '/api/auth/me', { headers: { 'Authorization': `Bearer ${sessionToken}` } })
    checkResponseShape('auth/me (Bearer)', me1, 'AuthMeResponse')
    if (me1.json?.authenticated) pass('Bearer header accepted'); else fail('Bearer header NOT accepted')

    const me2 = await apiCall('GET', '/api/auth/me', { headers: { 'x-roua-session': sessionToken } })
    checkResponseShape('auth/me (x-roua-session)', me2, 'AuthMeResponse')
    if (me2.json?.authenticated) pass('x-roua-session header accepted'); else fail('x-roua-session header NOT accepted')
  }

  // ═══ TEST 4: Auth Sync ═══
  section('TEST 4: مزامنة الجلسة — /auth/sync')
  if (sessionToken) {
    const s1 = await apiCall('GET', '/api/auth/sync', { headers: { 'Authorization': `Bearer ${sessionToken}` } })
    checkResponseShape('auth/sync (Bearer)', s1, 'AuthSyncResponse')
    if (s1.json?.authenticated) pass('auth/sync accepts Bearer'); else fail('auth/sync rejects Bearer!', 'V171 fix not deployed?')

    const s2 = await apiCall('GET', '/api/auth/sync', { headers: { 'x-roua-session': sessionToken } })
    checkResponseShape('auth/sync (x-roua-session)', s2, 'AuthSyncResponse')
    if (s2.json?.authenticated) pass('auth/sync accepts x-roua-session'); else fail('auth/sync rejects x-roua-session!', 'V171 fix not deployed?')
  }

  // ═══ TEST 5: Token Refresh ═══
  section('TEST 5: تجديد التوكن — /auth/refresh')
  if (refreshToken) {
    const ref = await apiCall('POST', '/api/auth/refresh', {
      headers: { 'x-roua-refresh': refreshToken, 'Authorization': `Bearer ${refreshToken}`, 'Cookie': `roua_refresh=${refreshToken}` },
    })
    if (ref.ok) {
      pass('Refresh succeeded')
      checkResponseShape('auth/refresh', ref, 'RefreshResponse')
      if (ref.json?.data?.token) { pass('New token in body (data.token)'); sessionToken = ref.json.data.token }
      else { warn('New token NOT in body — iOS can\'t read Set-Cookie') }
      if (ref.json?.data?.refresh) { pass('New refresh in body (data.refresh)'); refreshToken = ref.json.data.refresh }
      else { warn('New refresh NOT in body') }
    } else { fail('Refresh failed', `${ref.status}: ${ref.raw?.substring(0, 200)}`) }
  }

  // ═══ TEST 6: Portfolio Data ═══
  section('TEST 6: بيانات المحفظة — /trading/v2/portfolio')
  if (sessionToken) {
    const port = await apiCall('GET', '/api/trading/v2/portfolio', {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'x-roua-session': sessionToken, 'Cookie': `roua_session=${sessionToken}` },
    })
    if (port.ok) {
      pass('Portfolio endpoint 200')
      checkResponseShape('Portfolio', port, 'PortfolioSummary')
      const d = port.json?.data || port.json
      if (d?.positions?.length > 0) checkResponseShape('Position[0]', { json: d.positions[0], status: 200, ok: true }, 'Position')
    } else { fail('Portfolio failed', `${port.status}: ${port.raw?.substring(0, 300)}`) }
  }

  // ═══ TEST 7: Account Data ═══
  section('TEST 7: بيانات الحساب — /trading/account')
  if (sessionToken) {
    const acc = await apiCall('GET', '/api/trading/account', {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'x-roua-session': sessionToken, 'Cookie': `roua_session=${sessionToken}` },
    })
    if (acc.ok) { pass('Account 200'); checkResponseShape('Account', acc, 'PositionSummary') }
    else { fail('Account failed', `${acc.status}: ${acc.raw?.substring(0, 200)}`) }
  }

  // ═══ TEST 8: Credentials ═══
  section('TEST 8: الاعتمادات — /portfolio/credentials')
  if (sessionToken) {
    const cred = await apiCall('GET', '/api/portfolio/credentials', {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'x-roua-session': sessionToken, 'Cookie': `roua_session=${sessionToken}` },
    })
    if (cred.ok) pass('Credentials 200'); else warn(`Credentials ${cred.status}`)
  }

  // ═══ TEST 9: Proxy Mobile Behavior ═══
  section('TEST 9: سلوك البروكسي — Proxy Guest Prevention')
  const bad = await apiCall('GET', '/api/trading/v2/portfolio', {
    headers: { 'Authorization': 'Bearer invalid_token', 'x-roua-session': 'invalid_token', 'Cookie': 'roua_session=invalid_token' },
  })
  if (bad.status === 401) pass('Proxy returns 401 for invalid mobile token (V171 OK)')
  else if (bad.status === 200 && bad.json?.totalBalance === 0) fail('CRITICAL: Proxy gives GUEST data to mobile! V171 NOT deployed')
  else warn(`Invalid token → ${bad.status}`)

  const noToken = await apiCall('GET', '/api/trading/v2/portfolio')
  if (noToken.status === 401) pass('No token → 401 for mobile (V170 OK)')
  else if (noToken.status === 200) fail('No token → 200! Guest session auto-created for mobile')
  else info(`No token → ${noToken.status}`)

  // ═══ TEST 10: iOS Model Field Matching ═══
  section('TEST 10: مقارنة الحقول — iOS Model Matching')
  if (sessionToken) {
    const port = await apiCall('GET', '/api/trading/v2/portfolio', {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'x-roua-session': sessionToken, 'Cookie': `roua_session=${sessionToken}` },
    })
    if (port.ok && port.json) {
      const data = port.json.data || port.json
      const checks = [
        ['totalBalance', 'totalBalance', 'number'],
        ['dailyPnL', 'dailyPnL', 'number'],
        ['dailyPnLPercent', 'dailyPnLPercent', 'number'],
        ['totalExposure', 'totalExposure', 'number'],
        ['usedMargin', 'marginUsed (CodingKey)', 'number'],
        ['openPositionsCount', 'openPositionsCount', 'number'],
        ['maxDrawdownPercent', 'maxDrawdownPercent', 'number'],
        ['unrealizedPnL', 'unrealizedPnl (CodingKey)', 'number'],
        ['positions', 'positions', 'array'],
      ]
      for (const [backend, ios, type] of checks) {
        const val = data[backend]
        if (val === undefined) fail(`"${backend}" → iOS "${ios}": MISSING!`, `Available: ${Object.keys(data).join(', ')}`)
        else {
          const actual = Array.isArray(val) ? 'array' : typeof val
          if (type === 'number' && actual !== 'number') fail(`"${backend}" → iOS "${ios}": expected number, got ${actual}`, `Value: ${JSON.stringify(val)?.substring(0, 80)}`)
          else pass(`"${backend}" → iOS "${ios}": ${actual} = ${Array.isArray(val) ? `[${val.length}]` : val}`)
        }
      }

      // Check position CodingKey specifically
      if (data.positions?.length > 0) {
        const p = data.positions[0]
        if (p.unrealizedPnL !== undefined) pass('Position.unrealizedPnL (capital L) — iOS CodingKey works')
        else if (p.unrealizedPnl !== undefined) fail('Position.unrealizedPnl (lowercase l) — iOS expects capital L!', 'This will cause silent decode failure')
        else warn('Position has no PnL field at all')
      }
    }
  }

  printSummary()
}

function printSummary() {
  section('الملخص — Summary')
  console.log(`  ✅ Passed:  ${passCount}`)
  console.log(`  ❌ Failed:  ${failCount}`)
  console.log(`  ⚠️  Warnings: ${warnCount}`)
  if (failCount > 0) {
    console.log('\n  🔴 Failed:')
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`     • ${r.msg}`)
      if (r.detail) console.log(`       ${r.detail}`)
    })
  }
  console.log()
  if (failCount === 0) console.log('  🟢 جميع الفحوصات نجحت! All tests passed!')
  else console.log('  🔴 هناك مشاكل تحتاج إصلاح. See failed tests above.')
  console.log('\n' + '━'.repeat(60))
  process.exit(failCount > 0 ? 1 : 0)
}

main().catch(err => { console.error('Error:', err); process.exit(2) })
