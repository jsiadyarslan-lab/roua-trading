import NextAuth from 'next-auth'
import { NextRequest } from 'next/server'
import { getAuthOptions } from '@/lib/auth-config'

/**
 * NextAuth handler with auto-detection of NEXTAUTH_URL.
 *
 * Railway sets NEXTAUTH_URL to "0.0.0.0:8080" (internal bind address)
 * which browsers cannot reach. This handler detects the real public URL
 * from request headers and sets it before processing.
 */
async function GET(request: NextRequest) {
  // Auto-detect NEXTAUTH_URL from request headers
  const host = request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') || 'https'
  if (host) {
    const detectedUrl = `${protocol}://${host}`
    const currentUrl = process.env.NEXTAUTH_URL

    // Only override if NEXTAUTH_URL is missing or points to an internal address
    const isInternalUrl = currentUrl && (
      currentUrl.includes('0.0.0.0') ||
      currentUrl.includes('127.0.0.1') ||
      (currentUrl.includes('localhost') && !host.includes('localhost'))
    )

    if (!currentUrl || isInternalUrl) {
      process.env.NEXTAUTH_URL = detectedUrl
      console.log(`[NextAuth] Auto-detected NEXTAUTH_URL: ${detectedUrl} (was: ${currentUrl || '(empty)'})`)
    }
  }

  const options = getAuthOptions()
  const handler = NextAuth(options)
  return handler(request as any)
}

async function POST(request: NextRequest) {
  // Same auto-detection for POST requests
  const host = request.headers.get('host')
  const protocol = request.headers.get('x-forwarded-proto') || 'https'
  if (host) {
    const detectedUrl = `${protocol}://${host}`
    const currentUrl = process.env.NEXTAUTH_URL

    const isInternalUrl = currentUrl && (
      currentUrl.includes('0.0.0.0') ||
      currentUrl.includes('127.0.0.1') ||
      (currentUrl.includes('localhost') && !host.includes('localhost'))
    )

    if (!currentUrl || isInternalUrl) {
      process.env.NEXTAUTH_URL = detectedUrl
    }
  }

  const options = getAuthOptions()
  const handler = NextAuth(options)
  return handler(request as any)
}

export { GET, POST }
