import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/agent/trader/* → NestJS backend
 *
 * Proxies all autonomous trader agent requests to NestJS:
 * - GET  /api/agent/trader/status       → Agent status
 * - POST /api/agent/trader/start         → Start agent
 * - POST /api/agent/trader/stop          → Stop agent
 * - GET  /api/agent/trader/performance   → Performance metrics
 * - GET  /api/agent/trader/open-positions → Open positions
 * - PUT  /api/agent/trader/strategy      → Change strategy
 * - PUT  /api/agent/trader/risk-params   → Update risk params
 *
 * Uses the shared NestJS proxy utility which:
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Injects Authorization and x-roua-session headers
 * - Sets the cookie on the response for subsequent requests
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
