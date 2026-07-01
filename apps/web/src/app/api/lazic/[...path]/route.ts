import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/lazic/* → NestJS backend
 * Routes: status, enable, disable
 *
 * LazicPanel.tsx fetches /api/lazic/status every few seconds.
 * Without this proxy, requests hit Next.js (no route handler) → 404.
 * With this proxy, requests are forwarded to NestJS with auth injection
 * via createNestJSProxyHandlers() — same pattern as smart-executor
 * and strategic-council.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
