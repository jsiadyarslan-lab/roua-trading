import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db, ensureDbReady } from '@/lib/db'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── FIX RAILWAY ENV VARS AT MODULE LOAD TIME ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Railway sets NEXTAUTH_URL to "http://0.0.0.0:8080" (internal bind address).
// This MUST be fixed BEFORE NextAuth reads it — which happens at module load.
// Fixing it inside a route handler is TOO LATE because NextAuth's internal
// modules cache the URL during initialization.
//
// Similarly, NEXTAUTH_SECRET must be set or NextAuth throws Configuration error.
;(function fixRailwayEnvVars() {
  // ── Fix NEXTAUTH_URL ──
  const url = process.env.NEXTAUTH_URL
  if (url && (url.includes('0.0.0.0') || url.includes('127.0.0.1'))) {
    // Try Railway-specific env vars first
    const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
    if (railwayDomain) {
      process.env.NEXTAUTH_URL = `https://${railwayDomain}`
    } else {
      // Fallback: derive from RAILWAY_STATIC_URL or use known production URL
      const staticUrl = process.env.RAILWAY_STATIC_URL
      if (staticUrl) {
        try {
          const parsed = new URL(staticUrl)
          process.env.NEXTAUTH_URL = parsed.origin
        } catch {}
      }
      if (process.env.NEXTAUTH_URL === url) {
        // Still the bad URL — use known Railway production URL
        process.env.NEXTAUTH_URL = 'https://roua-trading-production.up.railway.app'
      }
    }
    console.log(`[auth-config] Fixed NEXTAUTH_URL: "${url}" → "${process.env.NEXTAUTH_URL}"`)
  } else if (!url) {
    // NEXTAUTH_URL not set at all — use known production URL in production
    if (process.env.NODE_ENV === 'production') {
      process.env.NEXTAUTH_URL = 'https://roua-trading-production.up.railway.app'
      console.log(`[auth-config] Set missing NEXTAUTH_URL to "${process.env.NEXTAUTH_URL}"`)
    }
  }

  // ── Auto-generate NEXTAUTH_SECRET if not set ──
  // Without a secret, NextAuth throws Configuration error in production
  if (!process.env.NEXTAUTH_SECRET) {
    // Generate a stable secret from other env vars (so it's consistent across instances)
    // In production, you should set NEXTAUTH_SECRET explicitly
    const crypto = require('crypto')
    const seed = [
      process.env.GOOGLE_CLIENT_ID || '',
      process.env.GOOGLE_CLIENT_SECRET || '',
      process.env.DATABASE_URL || '',
      process.env.RAILWAY_STATIC_URL || '',
    ].join('|')
    process.env.NEXTAUTH_SECRET = crypto.createHash('sha256').update(seed).digest('hex')
    console.log('[auth-config] Auto-generated NEXTAUTH_SECRET from env var hash')
  }
})()

/**
 * Shared NextAuth configuration — NO PrismaAdapter.
 *
 * Why no adapter?
 * 1. PrismaAdapter requires exact schema match and fails with "Configuration" error
 * 2. We use JWT strategy (not database sessions) so adapter is not needed
 * 3. User creation is handled in the signIn callback instead
 * 4. The google/callback bridge route creates roua_session separately
 */
export function getAuthOptions(): NextAuthOptions {
  // Log current config for debugging
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const hasSecret = !!process.env.NEXTAUTH_SECRET
  const nextauthUrl = process.env.NEXTAUTH_URL

  console.log(`[auth-config] getAuthOptions called — URL: ${nextauthUrl}, hasSecret: ${hasSecret}, hasGoogleId: ${!!clientId}, hasGoogleSecret: ${!!clientSecret}`)

  if (!clientId || !clientSecret) {
    console.error(`[auth-config] GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is missing! Google OAuth will not work.`)
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
       * signIn callback: Auto-create user in our DB when they sign in with Google.
       */
      async signIn({ user, account, profile }) {
        console.log(`[NextAuth] signIn callback — provider: ${account?.provider}, email: ${user.email}`)

        if (account?.provider === 'google' && user.email) {
          try {
            await ensureDbReady()

            const existingUser = await db.user.findUnique({
              where: { email: user.email },
            })

            if (!existingUser) {
              const newUser = await db.user.create({
                data: {
                  email: user.email,
                  displayName: user.name || user.email.split('@')[0],
                  avatar: (profile as any)?.picture || null,
                },
              })
              user.id = newUser.id
            } else {
              user.id = existingUser.id
              if ((profile as any)?.picture && !existingUser.avatar) {
                try {
                  await db.user.update({
                    where: { id: existingUser.id },
                    data: { avatar: (profile as any).picture },
                  })
                } catch {}
              }
            }
          } catch (error) {
            console.error('[NextAuth] signIn callback DB error:', error)
          }
        }
        return true
      },

      async jwt({ token, user }) {
        if (user) {
          token.id = user.id
          token.email = user.email
          token.tier = (user as any).tier || 'FREE'
        }
        return token
      },

      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id as string
          session.user.email = token.email as string
          ;(session.user as any).tier = token.tier || 'FREE'
        }
        return session
      },

      /**
       * After successful Google OAuth, redirect to our bridge route.
       */
      async redirect({ url, baseUrl }) {
        const nextauthUrl = process.env.NEXTAUTH_URL || baseUrl
        const callbackUrl = `${nextauthUrl}/api/auth/google/callback`
        console.log(`[NextAuth] redirect — to: ${callbackUrl}, baseUrl: ${baseUrl}, NEXTAUTH_URL: ${nextauthUrl}`)
        return callbackUrl
      },
    },
    pages: {
      signIn: '/',
      error: '/',
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: true, // Always enable debug for now to see logs in Railway
  }
}
