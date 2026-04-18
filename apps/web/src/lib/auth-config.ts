import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Shared NextAuth configuration.
 *
 * Used by:
 * - [...nextauth]/route.ts (main NextAuth handler)
 * - google/callback/route.ts (bridge that creates roua_session)
 *
 * IMPORTANT: NEXTAUTH_URL auto-detection is handled in [...nextauth]/route.ts
 * because it needs access to the request object.
 */
export function getAuthOptions(): NextAuthOptions {
  return {
    // @ts-expect-error -- PrismaAdapter types are slightly mismatched with next-auth v4
    adapter: PrismaAdapter(db),
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
      async signIn({ user, account, profile }) {
        try {
          await ensureDbReady()
        } catch {
          return false
        }

        // If signing in with Google, update avatar from profile
        if (account?.provider === 'google' && profile?.picture) {
          try {
            await db.user.update({
              where: { id: user.id },
              data: { avatar: profile.picture },
            })
          } catch {
            // Non-critical
          }
        }

        return true
      },

      async jwt({ token, user }) {
        if (user) {
          token.id = user.id
          token.tier = (user as any).tier || 'FREE'
        }
        return token
      },

      async session({ session, token }) {
        if (session.user && token.id) {
          session.user.id = token.id as string
          ;(session.user as any).tier = token.tier || 'FREE'
        }
        return session
      },

      /**
       * After successful Google OAuth, redirect to our bridge route
       * that creates a roua_session cookie.
       */
      async redirect({ url, baseUrl }) {
        if (url.includes('/api/auth/callback/google') || url === baseUrl || url === `${baseUrl}/`) {
          return `${baseUrl}/api/auth/google/callback`
        }
        if (url.includes('/api/auth/google/callback')) {
          return url
        }
        if (url.startsWith('/')) {
          return `${baseUrl}/api/auth/google/callback`
        }
        return `${baseUrl}/api/auth/google/callback`
      },
    },
    pages: {
      signIn: '/',
      error: '/',
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: process.env.NODE_ENV === 'development',
  }
}
