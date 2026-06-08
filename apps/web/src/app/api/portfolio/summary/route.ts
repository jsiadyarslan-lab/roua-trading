import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * GET /api/portfolio/summary
 *
 * CRITICAL FIX: This route previously used a hand-rolled proxy that:
 * 1. Only read auth from cookies (not Authorization/x-roua-session headers)
 * 2. Did NOT auto-create guest sessions for unauthenticated users
 * 3. Did NOT support mobile clients that send tokens via headers
 * 4. Had a shorter 10s timeout vs the shared proxy's 30s
 *
 * Now uses createNestJSProxyHandlers() which:
 * - Reads tokens from Cookie, Authorization: Bearer, and x-roua-session
 * - Auto-creates guest sessions for unauthenticated requests
 * - Has proper retry logic for 401/404/NestJS warmup
 * - Sets roua_session cookie on the response
 *
 * The route proxies to NestJS `/api/trading/positions/summary` (mapped
 * from portfolio → trading since NestJS doesn't have a separate
 * portfolio/summary endpoint).
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
