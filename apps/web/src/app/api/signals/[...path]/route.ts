import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/signals/* → NestJS backend
 *
 * Uses the shared NestJS proxy utility which:
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Injects Authorization and x-roua-session headers
 * - Sets the cookie on the response for subsequent requests
 *
 * Note: Specific signal routes (generate, active, smart) have their own
 * Route Handlers which take priority over this catch-all.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
