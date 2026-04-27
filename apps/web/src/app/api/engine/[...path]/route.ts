import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/engine/* → NestJS backend
 *
 * Engine routes handle bot enable/disable/status and engine health checks.
 * Proxied to NestJS with auth header injection via shared proxy utility.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
