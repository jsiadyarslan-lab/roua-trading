import NextAuth from 'next-auth'
import { getAuthOptions } from '@/lib/auth-config'

/**
 * NextAuth route handler with NEXTAUTH_URL fix for Railway.
 *
 * Railway sets NEXTAUTH_URL to "http://0.0.0.0:8080" (internal bind address).
 * Browsers cannot reach this URL, causing ERR_CONNECTION_REFUSED on redirects.
 *
 * Fix: Before each request, detect the public URL from request headers
 * and set NEXTAUTH_URL to the correct value.
 */
async function handler(req: Request, context: any) {
  // ── Fix NEXTAUTH_URL from request headers ──
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('host')

  if (host && !host.includes('0.0.0.0') && !host.includes('127.0.0.1')) {
    const publicUrl = `${proto}://${host}`
    if (process.env.NEXTAUTH_URL !== publicUrl) {
      console.log(`[NextAuth] Setting NEXTAUTH_URL to ${publicUrl} (was: ${process.env.NEXTAUTH_URL || '(empty)'})`)
      process.env.NEXTAUTH_URL = publicUrl
    }
  } else if (process.env.NEXTAUTH_URL && (process.env.NEXTAUTH_URL.includes('0.0.0.0') || process.env.NEXTAUTH_URL.includes('127.0.0.1'))) {
    // NEXTAUTH_URL is still the internal address and we can't detect public URL from headers
    // Fallback: try to use the known Railway production URL
    console.warn(`[NextAuth] NEXTAUTH_URL is "${process.env.NEXTAUTH_URL}" and host header is "${host}" — cannot detect public URL`)
    // Don't delete it, just leave it — deleting causes Configuration error
  }

  const nextAuthHandler = NextAuth(getAuthOptions())
  return nextAuthHandler(req, context)
}

export { handler as GET, handler as POST }
