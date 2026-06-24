import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/assistant/* → NestJS backend
 *
 * V464: Assistant module endpoints (chat, functions, context, languages, glossary, cache)
 *
 * Note: SSE streaming endpoint /api/assistant/chat/stream has its own
 * route handler at apps/web/src/app/api/assistant/chat/stream/route.ts
 * because createNestJSProxyHandlers buffers the response (breaks SSE).
 *
 * Uses the shared NestJS proxy utility which:
 * - Auto-creates a guest session if no roua_session cookie exists
 * - Injects Authorization and x-roua-session headers
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
