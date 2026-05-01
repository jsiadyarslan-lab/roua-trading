import { proxyToNestJS } from '@/lib/nestjs-proxy'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/signals/generate/:pair — Proxy to NestJS backend
 *
 * Uses the shared NestJS proxy utility for consistent auth handling.
 */
export async function POST(req: NextRequest) {
  return proxyToNestJS(req, 'POST')
}
