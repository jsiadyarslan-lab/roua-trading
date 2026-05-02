import { proxyToNestJS } from '@/lib/nestjs-proxy'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/signals/active — Proxy to NestJS backend
 *
 * Uses the shared NestJS proxy utility for consistent auth handling.
 */
export async function GET(req: NextRequest) {
  return proxyToNestJS(req, 'GET')
}
