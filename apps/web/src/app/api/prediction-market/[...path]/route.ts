import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/prediction-market/* → NestJS backend
 *
 * Prediction Market routes handle:
 * - GET  /prediction-market/events          — List active events
 * - GET  /prediction-market/events/:id       — Event details + impact
 * - GET  /prediction-market/gaps/:symbol     — Prediction gaps for symbol
 * - GET  /prediction-market/gaps/top         — Top gap events
 * - GET  /prediction-market/vote/:symbol     — 8th model vote for AI Council
 * - GET  /prediction-market/portfolio        — Events affecting user's portfolio
 * - POST /prediction-market/sync             — Force sync from Polymarket
 * - POST /prediction-market/analyze/:id      — Force AI probability calc
 *
 * Legal Disclaimer:
 * Prediction markets are educational and analytical tools only.
 * They do not constitute investment advice. Trading in prediction
 * markets may be prohibited in some jurisdictions.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
