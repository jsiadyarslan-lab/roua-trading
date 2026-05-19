# Roua Trading — Worklog

---
Task ID: 1
Agent: Main Agent
Task: Deep investigation of shared balance bug — why all users see the same balance

Work Log:
- Traced the ENTIRE data flow from API endpoint → NestJS service → Prisma query → Redis cache → Frontend display
- Found PrismaExtensionService exists but is NEVER USED in any service
- Found Position Monitor queries ALL positions without userId filter (intentional for background service)
- Found AuthGuard properly extracts userId from JWT/session
- Found Redis cache keys properly include userId (balances:{userId})
- Found frontend V162 fix properly handles allRealExchangesFailed flag

Stage Summary:
- ROOT CAUSE CHAIN: Binance API fails from Railway → paper trading fallback → Smart Executor opens identical positions for ALL users → same PnL → same displayed balance
- PrismaExtensionService exists but was never integrated into services
- V162 frontend fix already handles "exchange unavailable" for users with real credentials
- For paper-trading-only users, they all see the same balance because they all start with $10,000 and get same positions

---
Task ID: 2
Agent: Main Agent
Task: Implement 6-layer Defense-in-Depth user data isolation fix (V169)

Work Log:
- Created PostgreSQL RLS migration with policies on 13 user-scoped tables
- Created UserIsolationInterceptor for automatic RLS context management
- Created UserIdValidationInterceptor with isValidUserId() and validateUserId() helpers
- Updated PrismaService with RLS helper methods (setRlsUserId, clearRlsUserId, enableRlsBypass, disableRlsBypass, withRlsUser, withRlsBypass)
- Updated AuthGuard to set RLS context on session validation
- Updated Position Monitor to use RLS bypass for cross-user monitoring
- Updated CredentialsService to inject PrismaExtensionService and add userId validation
- Build succeeded with `bun run build`
- Committed as V169 and pushed to GitHub

Stage Summary:
- 6-layer security fix implemented:
  - Layer 1: PrismaExtensionService (existed, now integrated)
  - Layer 2: PostgreSQL RLS (13 tables, user policies + superuser bypass)
  - Layer 3: userId validation in service entry points
  - Layer 4: Redis cache keys verified (already correct)
  - Layer 5: AuthGuard RLS integration + context cleanup
  - Layer 6: Background service RLS bypass pattern
- Key files created: RLS migration, UserIsolationInterceptor, UserIdValidationInterceptor
- Key files modified: PrismaService, AuthGuard, PositionMonitor, CredentialsService
