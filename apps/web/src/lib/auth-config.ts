import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── FIX RAILWAY ENV VARS AT MODULE LOAD TIME ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Railway sets NEXTAUTH_URL to "http://0.0.0.0:8080" (internal bind address).
// This MUST be fixed BEFORE NextAuth reads it — which happens at module load.
;(function fixRailwayEnvVars() {
  const url = process.env.NEXTAUTH_URL
  if (url && (url.includes('0.0.0.0') || url.includes('127.0.0.1'))) {
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
    if (railwayDomain) {
      process.env.NEXTAUTH_URL = `https://${railwayDomain}`
    } else {
      const staticUrl = process.env.RAILWAY_STATIC_URL
      if (staticUrl) {
        try {
          const parsed = new URL(staticUrl.startsWith('http') ? staticUrl : `https://${staticUrl}`)
          process.env.NEXTAUTH_URL = parsed.origin
        } catch {}
      }
      if (process.env.NEXTAUTH_URL === url) {
        process.env.NEXTAUTH_URL = 'https://roua-trading-production.up.railway.app'
      }
    }
    console.log(`[auth-config] Fixed NEXTAUTH_URL: "${url}" → "${process.env.NEXTAUTH_URL}"`)
  } else if (!url && process.env.NODE_ENV === 'production') {
    process.env.NEXTAUTH_URL = 'https://roua-trading-production.up.railway.app'
    console.log(`[auth-config] Set missing NEXTAUTH_URL to "${process.env.NEXTAUTH_URL}"`)
  }

  // Auto-generate NEXTAUTH_SECRET if not set
  if (!process.env.NEXTAUTH_SECRET) {
    const cryptoModule = require('crypto')
    const seed = [
      process.env.GOOGLE_CLIENT_ID || '',
      process.env.GOOGLE_CLIENT_SECRET || '',
      process.env.DATABASE_URL || '',
      process.env.RAILWAY_STATIC_URL || '',
    ].join('|')
    process.env.NEXTAUTH_SECRET = cryptoModule.createHash('sha256').update(seed).digest('hex')
    console.log('[auth-config] Auto-generated NEXTAUTH_SECRET from env var hash')
  }
})()

/**
 * Shared NextAuth configuration.
 *
 * KEY DESIGN DECISIONS:
 * - NO PrismaAdapter — we handle user creation in signIn callback
 * - JWT strategy — not database sessions for NextAuth
 * - roua_session cookie is created in jwt callback (after successful sign-in)
 *   so we don't need a separate bridge route
 * - redirect callback sends user to /dashboard after Google sign-in
 */
export function getAuthOptions(): NextAuthOptions {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const hasSecret = !!process.env.NEXTAUTH_SECRET
  const nextauthUrl = process.env.NEXTAUTH_URL

  console.log(`[auth-config] getAuthOptions — URL: ${nextauthUrl}, hasSecret: ${hasSecret}, hasGoogleId: ${!!clientId}, hasGoogleSecret: ${!!clientSecret}`)

  if (!clientId || !clientSecret) {
    console.error(`[auth-config] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing!`)
  }

  return {
    providers: [
      GoogleProvider({
        clientId: clientId || '',
        clientSecret: clientSecret || '',
      }),
    ],
    session: {
      strategy: 'jwt',
    },
    callbacks: {
      /**
       * signIn callback:
       * 1. Auto-create user in our DB when they sign in with Google
       * 2. Create a roua_session in our custom session system
       * 3. Store the session token in the user object for the jwt callback to pick up
       */
      async signIn({ user, account, profile }) {
        console.log(`[NextAuth] signIn — provider: ${account?.provider}, email: ${user.email}`)

        if (account?.provider === 'google' && user.email) {
          try {
            await ensureDbReady()

            let existingUser = await db.user.findUnique({
              where: { email: user.email },
            })

            if (!existingUser) {
              existingUser = await db.user.create({
                data: {
                  email: user.email,
                  displayName: user.name || user.email.split('@')[0],
                  avatar: (profile as any)?.picture || null,
                },
              })
              console.log(`[NextAuth] Created new user: ${user.email}`)
            } else {
              // Update avatar from Google if available
              if ((profile as any)?.picture && !existingUser.avatar) {
                try {
                  await db.user.update({
                    where: { id: existingUser.id },
                    data: { avatar: (profile as any).picture },
                  })
                } catch {}
              }
            }

            // Create a roua_session in our custom session system
            const sessionToken = crypto.randomBytes(32).toString('hex')
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

            await db.session.create({
              data: {
                userId: existingUser.id,
                token: sessionToken,
                expiresAt,
              },
            })

            // Store the session token on the user object so jwt callback can access it
            ;(user as any).rouaSessionToken = sessionToken
            ;(user as any).rouaUserId = existingUser.id

            console.log(`[NextAuth] roua_session created for ${user.email}`)
          } catch (error) {
            console.error('[NextAuth] signIn callback error:', error)
            // Don't block sign-in — the session will be created on next request
          }
        }
        return true
      },

      /**
       * jwt callback:
       * On first sign-in, capture the roua session token from the user object.
       * We need this in the session callback to set the cookie.
       */
      async jwt({ token, user, account }) {
        if (user) {
          token.id = user.id
          token.email = user.email
          token.tier = (user as any).tier || 'FREE'
          // Capture roua session token from signIn callback
          if ((user as any).rouaSessionToken) {
            token.rouaSessionToken = (user as any).rouaSessionToken
          }
          if ((user as any).rouaUserId) {
            token.rouaUserId = (user as any).rouaUserId
          }
        }
        return token
      },

      /**
       * session callback:
       * Pass the roua session token to the client so we can set the cookie.
       */
      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.rouaUserId as string || token.id as string
          session.user.email = token.email as string
          ;(session.user as any).tier = token.tier || 'FREE'
          ;(session.user as any).rouaSessionToken = token.rouaSessionToken as string | undefined
        }
        return session
      },

      /**
       * redirect callback:
       * After successful Google OAuth, redirect to /dashboard
       * (not to our old bridge route — we handle everything in callbacks now)
       */
      async redirect({ url, baseUrl }) {
        // If url is already our site, go there
        if (url.startsWith(baseUrl)) return url
        // After Google sign-in, always go to dashboard
        return `${baseUrl}/dashboard`
      },
    },
    pages: {
      signIn: '/',
      error: '/',
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: true,
  }
}
