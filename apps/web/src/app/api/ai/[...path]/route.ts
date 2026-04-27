import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/ai/* → NestJS backend
 *
 * Uses the shared NestJS proxy utility which:
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Injects Authorization and x-roua-session headers
 * - Sets the cookie on the response for subsequent requests
 *
 * Note: Specific AI routes (backtest, status, consensus, narrator, chat)
 * have their own Route Handlers which take priority over this catch-all.
 * This handler covers AI endpoints that only exist on NestJS
 * (analyze, analyze/all, models, consensus-nest).
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
