import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/notifications/* → NestJS backend
 *
 * Handles all notification operations: list, unread count, read/unread
 * marking, preferences, and deletion.
 *
 * Proxied to NestJS with auth header injection via shared proxy utility.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
