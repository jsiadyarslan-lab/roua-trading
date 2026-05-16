import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/agent/content/* → NestJS backend
 *
 * Proxies all content agent requests to NestJS:
 * - POST   /api/agent/content/generate       → Generate content
 * - POST   /api/agent/content/bulk-generate   → Bulk generate
 * - POST   /api/agent/content/breaking        → Breaking alert
 * - GET    /api/agent/content/feed            → Content feed
 * - GET    /api/agent/content/stats           → Statistics
 * - GET    /api/agent/content/trending        → Trending topics
 * - GET    /api/agent/content/gaps            → Content gaps
 * - GET    /api/agent/content/state           → Agent state
 * - GET    /api/agent/content/:id             → Single article
 * - POST   /api/agent/content/:id/publish     → Publish article
 * - POST   /api/agent/content/:id/schedule    → Schedule publication
 * - PUT    /api/agent/content/:id             → Update article
 * - DELETE /api/agent/content/:id             → Archive article
 *
 * Uses the shared NestJS proxy utility which:
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Injects Authorization and x-roua-session headers
 * - Sets the cookie on the response for subsequent requests
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
