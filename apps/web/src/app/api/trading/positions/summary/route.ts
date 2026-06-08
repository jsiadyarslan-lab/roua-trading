import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * GET /api/trading/positions/summary
 *
 * P1 FIX: This route was missing (404) causing usePositionsStore to always
 * fallback to equity=0 and buyingPower=0, which broke BotEngine risk calc.
 *
 * FIX: Use the NestJS proxy instead of direct fetch, so auto-session
 * creation works for unauthenticated mobile clients.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
