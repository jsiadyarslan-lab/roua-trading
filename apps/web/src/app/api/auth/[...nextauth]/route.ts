import NextAuth from 'next-auth'
import { getAuthOptions } from '@/lib/auth-config'
import { NextRequest, NextResponse } from 'next/server'

/**
 * NextAuth route handler with roua_session cookie bridging.
 *
 * After Google OAuth, NextAuth's redirect callback returns /dashboard.
 * But we also need to set the roua_session cookie (our custom session system).
 * 
 * We do this by intercepting the NextAuth response after a successful
 * Google sign-in. When we detect that a new session was created
 * (via the rouaSessionToken in the JWT), we set the roua_session cookie.
 */
async function handler(req: NextRequest, context: any) {
  const authOptions = getAuthOptions()
  const nextAuthHandler = NextAuth(authOptions)

  const response = await nextAuthHandler(req, context)

  // After successful Google OAuth callback, set the roua_session cookie
  // We check if the response is a redirect to /dashboard
  if (response instanceof Response) {
    const location = response.headers.get('location')
    if (location && location.includes('/dashboard')) {
      // Try to get the session to find our roua session token
      // We need to read the JWT token from the response cookies
      const sessionCookie = req.cookies.get('__Secure-next-auth.session-token')?.value
        || req.cookies.get('next-auth.session-token')?.value

      if (sessionCookie) {
        // Decode the JWT to get the rouaSessionToken
        try {
          // JWT is base64url encoded: header.payload.signature
          const parts = sessionCookie.split('.')
          if (parts.length >= 2) {
            const payload = JSON.parse(
              Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
            )
            const rouaToken = payload.rouaSessionToken
            if (rouaToken) {
              // Set the roua_session cookie on the response
              const newResponse = new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: response.headers,
              })
              newResponse.headers.append('Set-Cookie',
                `roua_session=${rouaToken}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=86400`
              )
              console.log(`[NextAuth] Set roua_session cookie for Google OAuth user`)
              return newResponse
            }
          }
        } catch (e) {
          console.warn('[NextAuth] Failed to decode JWT for roua_session:', e)
        }
      }
    }
  }

  return response
}

export { handler as GET, handler as POST }
