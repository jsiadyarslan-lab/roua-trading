import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ── FIX RAILWAY ENV VARS AT MODULE LOAD TIME ──
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    console.log('[auth-config] Auto-generated NEXTAUTH_SECRET')
  }
})()

/**
 * NextAuth configuration — KEEP IT SIMPLE.
 *
 * Key design:
 * - JWT strategy (no database sessions for NextAuth)
 * - No PrismaAdapter (we handle user creation in /api/auth/sync)
 * - signIn callback: just allow sign-in, no DB operations
 *   (DB operations moved to /api/auth/sync to avoid errors)
 * - redirect callback: go to /dashboard after Google sign-in
 * - roua_session is created separately via /api/auth/sync
 */
export function getAuthOptions(): NextAuthOptions {
  return {
    providers: [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      }),
    ],
    session: {
      strategy: 'jwt',
    },
    callbacks: {
      async signIn({ user, account }) {
        // Just log and allow — no DB operations here
        // DB operations are done in /api/auth/sync after redirect
        console.log(`[NextAuth] signIn — provider: ${account?.provider}, email: ${user.email}`)
        return true
      },

      async jwt({ token, user }) {
        if (user) {
          token.id = user.id
          token.email = user.email
        }
        return token
      },

      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id as string
          session.user.email = token.email as string
        }
        return session
      },

      async redirect({ url, baseUrl }) {
        // After Google sign-in, go to dashboard
        if (url.startsWith('/')) return `${baseUrl}${url}`
        if (new URL(url).origin === baseUrl) return url
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
