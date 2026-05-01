# Task 2: Session Refresh Endpoint + Auto-Refresh Logic

## Agent: Auth & Session Engineer
## Date: 2026-03-05

## Work Completed

### 1. Created `/apps/web/src/app/api/auth/refresh/route.ts`
- POST endpoint that refreshes existing sessions (sliding sessions)
- Reads `roua_session` cookie and validates session in database
- If session expires within 60 minutes: creates new session token, deletes old one, sets new cookie
- If session is expired: returns 401, deletes session and cookie
- If session is valid and not near expiry: returns current user info without refresh
- Rejects guest sessions (deletes them and returns 401)
- Returns 503 if database is unavailable
- Session duration: 30 days
- Refresh threshold: 60 minutes before expiry

### 2. Created `/apps/web/src/lib/auth-store.ts`
- Complete Zustand auth store with:
  - `AuthUser` type (id, email, displayName, tier, isGuest)
  - `refreshUser()` — fetches `/api/auth/me`, updates state, starts auto-refresh
  - `loginWithEmail(email)` — creates session via email login flow
  - `logout()` — deletes session, stops auto-refresh, clears cache, redirects to /login
  - `setUser(user)` — direct state setter
  - `startAutoRefresh()` — setInterval every 15 minutes calling `/api/auth/refresh`
  - `stopAutoRefresh()` — clears the interval
- LocalStorage caching with 5-minute TTL (CACHE_KEY, CACHE_TIME_KEY)
- `initAuthFromCache()` helper for app startup
- Guest user detection (GUEST_EMAIL, id starts with 'guest')
- Auto-refresh handles 401 (session expired → redirect) and network errors (silent retry)

### 3. Updated `/apps/web/src/components/dashboard/AuthGuard.tsx`
- Fixed duplicate `useAuthStore` import
- Added `useAuthStore.getState().stopAutoRefresh()` in cleanup return
- Auto-refresh is already started via `refreshUser()` which calls `startAutoRefresh()` internally

## Files Created
- `apps/web/src/app/api/auth/refresh/route.ts` (new)
- `apps/web/src/lib/auth-store.ts` (new)

## Files Modified
- `apps/web/src/components/dashboard/AuthGuard.tsx` (fixed duplicate import, added cleanup)

## TypeScript Verification
- Zero TypeScript errors in all created/modified files
- Pre-existing TS errors in other files are unrelated to this task
