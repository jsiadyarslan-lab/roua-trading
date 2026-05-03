import { NextRequest } from 'next/server'

/**
 * Get the public origin URL for OAuth redirect_uri construction.
 *
 * In containerized environments (Railway), request.nextUrl.origin
 * resolves to the internal address (e.g. http://0.0.0.0:3000)
 * which causes redirect_uri_mismatch errors with Google OAuth.
 *
 * Priority:
 * 1. ORIGIN env var (explicitly set by admin)
 * 2. RAILWAY_PUBLIC_DOMAIN (auto-set by Railway)
 * 3. X-Forwarded-Host header (set by Railway's reverse proxy)
 * 4. request.nextUrl.origin (last resort — may be wrong in containers)
 */
export function getPublicOrigin(request: NextRequest): string {
  // 1. ORIGIN env var (explicitly set)
  // In production: reject localhost/0.0.0.0 (causes redirect_uri_mismatch with OAuth)
  // In development: allow localhost (needed for local OAuth testing)
  const origin = process.env.ORIGIN?.replace(/\/+$/, '')
  const isProduction = process.env.NODE_ENV === 'production'
  if (origin) {
    if (isProduction && (origin.includes('0.0.0.0') || origin.includes('localhost'))) {
      // Skip — will fall through to Railway detection
    } else {
      return origin
    }
  }

  // 2. Railway provides RAILWAY_PUBLIC_DOMAIN (e.g. "roua.up.railway.app")
  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
  if (railwayDomain) return `https://${railwayDomain}`

  // 3. X-Forwarded-Host header (set by Railway's reverse proxy)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`

  // 4. Last resort: nextUrl.origin (may be wrong in containers)
  return request.nextUrl.origin
}
