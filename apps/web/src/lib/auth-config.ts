import { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { db, ensureDbReady } from '@/lib/db'

/**
 * Shared NextAuth configuration — NO PrismaAdapter.
 *
 * Why no adapter?
 * 1. PrismaAdapter requires exact schema match and fails with "Configuration" error
 * 2. We use JWT strategy (not database sessions) so adapter is not needed
 * 3. User creation is handled in the signIn callback instead
 * 4. The google/callback bridge route creates roua_session separately
 *
 * NEXTAUTH_URL is fixed in [...nextauth]/route.ts before each request.
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
      /**
       * signIn callback: Auto-create user in our DB when they sign in with Google.
       * Without PrismaAdapter, NextAuth doesn't create users in the DB automatically.
       */
      async signIn({ user, account, profile }) {
        if (account?.provider === 'google' && user.email) {
          try {
            await ensureDbReady()

            // Check if user exists in our DB
            const existingUser = await db.user.findUnique({
              where: { email: user.email },
            })

            if (!existingUser) {
              // Create user in our DB
              const newUser = await db.user.create({
                data: {
                  email: user.email,
                  displayName: user.name || user.email.split('@')[0],
                  avatar: (profile as any)?.picture || null,
                },
              })
              // Set the user ID so JWT callback can capture it
              user.id = newUser.id
            } else {
              // Update avatar from Google if available
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
            console.error('[NextAuth] signIn callback error:', error)
            // Don't block sign-in for DB errors — we'll handle it in the callback bridge
          }
        }
        return true
      },

      async jwt({ token, user, account }) {
        // On first sign-in, `user` is populated
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
       * After successful Google OAuth, redirect to our bridge route
       * that creates a roua_session cookie.
       *
       * Use NEXTAUTH_URL (which we fixed in the route handler) to build
       * the redirect URL — never use baseUrl directly as it may be wrong.
       */
      async redirect({ url, baseUrl }) {
        // If we have a valid NEXTAUTH_URL, use it to build the callback URL
        const nextauthUrl = process.env.NEXTAUTH_URL || baseUrl
        // Always redirect to our bridge after Google sign-in
        const callbackUrl = `${nextauthUrl}/api/auth/google/callback`
        console.log(`[NextAuth] redirect callback: ${callbackUrl} (baseUrl: ${baseUrl}, NEXTAUTH_URL: ${process.env.NEXTAUTH_URL})`)
        return callbackUrl
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
