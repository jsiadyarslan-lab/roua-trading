import { proxyToNestJS } from '@/lib/nestjs-proxy'
import { NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/signals/:id — Proxy to NestJS backend
 *
 * Uses the shared NestJS proxy utility for consistent auth handling.
 */
export async function DELETE(req: NextRequest) {
  return proxyToNestJS(req, 'DELETE')
}
