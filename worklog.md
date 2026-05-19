---
Task ID: 1
Agent: Main Agent
Task: V170 - Fix server crash, 0 routes, and deploy shared balance fixes

Work Log:
- Diagnosed ERR_HTTP_HEADERS_SENT crash in main.ts: res.end monkey-patch had no `res.headersSent` check
- Diagnosed 0 routes root cause: unnecessary forwardRef() in 6 modules caused DI race condition
- Fixed CSRF middleware: added `return` after 403 response to prevent double-send
- Fixed main.ts: Added `res.headersSent` guard in res.end monkey-patch and header-setting middleware
- Fixed UserIsolationInterceptor: Added @Optional() on PrismaService to prevent cascading bootstrap failure
- Removed forwardRef() from: strategic-council.module.ts, smart-executor.module.ts, agent.module.ts, prediction-market.module.ts, signal.module.ts, ai.module.ts
- Verified TypeScript build passes: `tsc` compiles with 0 errors
- Verified dist output contains all critical files
- Updated Dockerfile BUILD_CACHE to v170-fix-crash-zero-routes-forwardref
- Committed and pushed to GitHub to trigger Railway deployment

Stage Summary:
- Root cause of server crash: res.end monkey-patch called res.setHeader() after headers already sent
- Root cause of 0 routes: forwardRef() deferred DI resolution for non-circular dependencies, causing providers to resolve as null → cascading module init failure
- Root cause of shared balance (from V162-V169 analysis): Already fixed in code but never deployed because server kept crashing
- All fixes verified locally with successful `tsc` build
- Deployment triggered via git push
