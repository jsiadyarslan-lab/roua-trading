---
Task ID: 1
Agent: Main Agent
Task: V157 CRITICAL FIX - Balance shared across all users

Work Log:
- Deep investigation of why all users see the same balance
- Found ROOT CAUSE #1: `cachedGuestUserId` module-level singleton in nestjs-proxy.ts shared across ALL requests
- Found ROOT CAUSE #2: `addCredential()` and `deleteCredential()` don't call `invalidateBalanceCache()`
- Found ROOT CAUSE #3: $10,000 fallback applied to authenticated users when APIs fail
- Fixed ROOT CAUSE #1: Removed `cachedGuestUserId` module-level variable. Now reads from per-browser `roua_guest_id` cookie only
- Fixed ROOT CAUSE #2: Added `this.invalidateBalanceCache(userId)` in both `addCredential()` and `deleteCredential()`
- Fixed ROOT CAUSE #3: Authenticated users with userId no longer get $10,000 fallback
- Fixed build error: Duplicate `currentUserId` variable in usePositionsStore.ts
- Built both frontend (Next.js) and backend (NestJS) successfully
- Pushed to GitHub (2 commits: V157 fix + BUILD_CACHE bump)
- Verified Railway rebuilt with new code: buildCache changed from v161 to v157-critical-balance-fix
- Verified health endpoint: all checks OK, 30s uptime

Stage Summary:
- 3 files modified:
  1. apps/web/src/lib/nestjs-proxy.ts - Removed cachedGuestUserId singleton (ROOT CAUSE #1)
  2. apps/api/src/modules/portfolio/credentials/credentials.service.ts - Added invalidateBalanceCache calls (ROOT CAUSE #2)
  3. apps/web/src/hooks/usePositionsStore.ts - Better $10,000 fallback protection (ROOT CAUSE #3)
- Production deployed and verified: buildCache=v157-critical-balance-fix, health=ok
- Key insight: Module-level variables in Next.js Route Handlers are shared across ALL concurrent requests
