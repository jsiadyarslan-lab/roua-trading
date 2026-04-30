import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/analytics/* → NestJS backend
 *
 * Analytics routes provide trading analytics and statistics.
 * Proxied to NestJS with auth header injection via shared proxy utility.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
