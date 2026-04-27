import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/trading/* → NestJS backend
 *
 * Uses the shared NestJS proxy utility which:
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Injects Authorization and x-roua-session headers
 * - Sets the cookie on the response for subsequent requests
 *
 * All trading routes are proxied to NestJS which enforces:
 * - RiskGatekeeper (5 safety checks)
 * - IdempotencyService (prevent duplicate orders)
 * - BullMQ execution queue
 * - Proper AES-256-GCM encryption for credentials
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
