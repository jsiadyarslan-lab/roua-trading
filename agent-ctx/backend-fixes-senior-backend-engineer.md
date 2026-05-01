# Backend API Fixes — Senior Backend Engineer

## Task ID: backend-fixes
## Agent: senior-backend-engineer
## Date: 2025-03-04

## Summary

Fixed 8 distinct backend API issues across 9 files in the roua-trading project. All fixes are minimal, targeted, and preserve existing code style.

## Fixes Applied

### 1. Fix AI Coach broken internal API calls — `/api/coach/ask/route.ts`
- **Problem**: Called non-existent `/api/trading/trades` endpoint via fetch
- **Fix**: Replaced with direct Prisma `db.trade.findMany()` query
- **Also**: Added session cookie resolution (`roua_session`) to identify the user, instead of fetching all trades
- **Import added**: `db` from `@/lib/db`

### 2. Fix AI Coach broken internal API calls — `/api/coach/performance/route.ts`
- **Problem**: Called non-existent `/api/trading/trades` and `/api/trading/positions/history` endpoints
- **Fix**: Replaced both with direct Prisma queries:
  - `db.trade.findMany()` for trades
  - `db.position.findMany({ where: { userId, status: 'CLOSED' } })` for closed positions
- **Also**: Added session cookie resolution to prefer authenticated userId over body param
- **Import added**: `db` from `@/lib/db`

### 3. Fix AI Council endpoint path — `/api/ai/consensus/route.ts`
- **Problem**: Called `${origin}/api/ai/consensus-nest` which doesn't exist on Next.js or NestJS
- **Fix**: Changed to `${apiTarget}/api/ai/consensus` where `apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001'`
- **Rationale**: The NestJS AI controller has `@Post('consensus')` under `@Controller('ai')` with prefix `api`, so the correct endpoint is `POST /api/ai/consensus` on port 3001

### 4. Fix hardcoded userId — `/api/chart-preference/route.ts`
- **Problem**: Used hardcoded `userId = 'default-user'` in both GET and POST handlers
- **Fix**: Created `resolveUserId()` helper that:
  1. Returns `dev-user-00000000` in DEV_MODE (matching `/api/auth/me` pattern)
  2. Reads `roua_session` cookie and looks up the session in DB
  3. Falls back to `'default-user'` for anonymous users
- **Import added**: `NextRequest`, `ensureDbReady` from `@/lib/db`

### 5. Fix Math.random() — `/api/ai/backtest/route.ts`
- **Problem**: Used `Math.random()` for `tradesSimulated` count, making results non-deterministic
- **Fix**: Replaced with deterministic hash-based approach:
  ```typescript
  const pairHash = pair.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  const tradesSimulated = 150 + (pairHash % 100) + tradeCount
  ```
- Same pair + same parameters will now always produce the same trade count

### 6. Fix race condition in DELETE `/api/auth/me/route.ts`
- **Problem**: `deleteMany` then `findUnique` — findUnique always returns null after delete, so audit log never fires
- **Fix**: Reversed the order — find the session first, then log audit, then delete:
  1. `db.session.findUnique()` to get userId
  2. `db.auditLog.create()` with the userId
  3. `db.session.delete()` by id
  4. Fallback: if session not found, `deleteMany` as cleanup

### 7. Fix JSON.parse without try-catch — `/api/strategies/route.ts`
- **Problem**: Five `JSON.parse()` calls without error handling — malformed data would crash the route
- **Fix**: Added `safeJsonParse()` helper that wraps `JSON.parse` in try-catch with configurable fallback values:
  - `decision` → `{}`
  - `matrix` → `[]`
  - `risk` → `{}`
  - `flow` → `{}`
  - `deepAnalysis` → `[]`

### 8. Fix RSS regex parsing — `/api/news/latest/route.ts`
- **Problem**: Fragile regex patterns for XML parsing that didn't handle CDATA sections robustly
- **Fix**: Replaced inline regex with two dedicated helper functions:
  - `extractXmlElement()`: Extracts text from a single XML element, trying CDATA first then normal text, with XML entity decoding
  - `extractXmlElements()`: Extracts text from multiple repeating elements (e.g., multiple `<category>` tags)
- Also updated variable references (`linkMatch` → `link`, `pubDateMatch` → `pubDate`, etc.)

### 9. Fix empty catch blocks — `/api/ai/chat/route.ts` and `/api/ai/status/route.ts`
- **Problem**: Empty catch blocks silently swallowing errors
- **Fix**:
  - `/api/ai/status/route.ts`: Added `console.warn('[ai/status] NestJS models endpoint unavailable:', error?.message || error)`
  - `/api/ai/chat/route.ts`: Added `console.error('[ai/chat] Local analysis fallback failed:', error?.message || error)` in the local fallback catch
  - `/api/news/latest/route.ts`: Added `console.warn('[news/latest] NestJS news endpoint unavailable, using local RSS fallback:', error?.message || error)`

## Files Modified

1. `apps/web/src/app/api/coach/ask/route.ts`
2. `apps/web/src/app/api/coach/performance/route.ts`
3. `apps/web/src/app/api/ai/consensus/route.ts`
4. `apps/web/src/app/api/chart-preference/route.ts`
5. `apps/web/src/app/api/ai/backtest/route.ts`
6. `apps/web/src/app/api/auth/me/route.ts`
7. `apps/web/src/app/api/strategies/route.ts`
8. `apps/web/src/app/api/news/latest/route.ts`
9. `apps/web/src/app/api/ai/chat/route.ts`
10. `apps/web/src/app/api/ai/status/route.ts`

## No-Touch Zones Respected

- ✅ No security-related code modified (auth middleware, CSRF, security headers, rate limiting, debug endpoint)
- ✅ No landing page or login/registration pages modified
