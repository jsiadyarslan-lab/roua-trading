---
Task ID: 1
Agent: Main Agent
Task: Deep investigation and fix for shared balance bug ($12,342.85 across all accounts)

Work Log:
- Traced complete balance retrieval chain: Frontend → nestjs-proxy → NestJS AuthGuard → CredentialsController → CredentialsService → CCXT/Binance API
- Identified ROOT CAUSE #1: ensureSession() in nestjs-proxy.ts silently creates guest sessions when real user sessions expire, causing ALL expired users to share the same guest identity and balance
- Identified ROOT CAUSE #2: Binance balance fetch timeout was only 5 seconds, causing real exchange balance to fail, falling back to paper-trading balance (which can be same across users)
- Identified ROOT CAUSE #3: Frontend silently mixes failed Binance balance (0) with paper-trading balance, making all users appear to have the same total
- Fixed ensureSession() to return 401 instead of creating guest sessions for expired real users
- Added detection of stale guest sessions when browser has roua_refresh cookie
- Increased Binance timeout from 5s to 15s with retry logic
- Added frontend logic to properly separate real vs paper-trading balance when exchange fails
- Added diagnostic logging in CredentialsService to trace balance fetch path
- Updated BUILD_CACHE to v158-critical-balance-fix
- Pushed to git and verified Railway deployment started

Stage Summary:
- V158 critical fix deployed to production
- Three root causes identified and fixed:
  1. Session identity confusion (expired real users → guest identity → shared balance)
  2. Binance timeout too short (5s → 15s with retry)
  3. Frontend silently mixing failed + paper-trading balance
- Key files changed: nestjs-proxy.ts, credentials.service.ts, usePositionsStore.ts, Dockerfile
