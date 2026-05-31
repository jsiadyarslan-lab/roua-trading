import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/smart-executor/* → NestJS backend
 * Routes: status, start, stop, positions, user/enable, user/disable, user/status
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
