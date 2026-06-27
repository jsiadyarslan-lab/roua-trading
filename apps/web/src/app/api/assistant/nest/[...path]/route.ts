import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/assistant/nest/* → NestJS backend /api/assistant/*
 *
 * This activates the FULL NestJS Assistant system:
 * - 6 context layers (user trading, council, learning, market, news, system health)
 * - 12 executable functions (getTradeJournalSummary, suggestAction, etc.)
 * - Intent classifier (analysis/news/council/performance/diagnosis)
 * - Arabic + English system prompts with 5-section template
 * - Response cleaner + cache
 *
 * Routes proxied:
 *   POST /api/assistant/nest/chat          → NestJS /api/assistant/chat
 *   POST /api/assistant/nest/chat/stream   → NestJS /api/assistant/chat/stream
 *   GET  /api/assistant/nest/context       → NestJS /api/assistant/context
 *   GET  /api/assistant/nest/functions     → NestJS /api/assistant/functions
 *   POST /api/assistant/nest/functions/execute → NestJS /api/assistant/functions/execute
 *   GET  /api/assistant/nest/intelligence/* → NestJS /api/assistant/intelligence/*
 *   GET  /api/assistant/nest/health        → NestJS /api/assistant/health
 *
 * Auth: auto-handled by createNestJSProxyHandlers (session injection)
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
