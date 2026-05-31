import { createNestJSProxyHandlers } from '@/lib/nestjs-proxy'

/**
 * Catch-all proxy for /api/portfolio/* → NestJS backend
 *
 * Portfolio routes handle credentials & sanctuary operations.
 * Credentials MUST use proper AES-256-GCM encryption (no base64 fallback).
 * Sanctuary MUST use NestJS risk analysis with live P&L tracking.
 * Proxied to NestJS with auth header injection via shared proxy utility.
 */

export const dynamic = 'force-dynamic'

const { GET, POST, PUT, PATCH, DELETE } = createNestJSProxyHandlers()
export { GET, POST, PUT, PATCH, DELETE }
