import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { db, ensureDatabaseUrl, ensureDbReady } from '@/lib/db'

// Ensure DATABASE_URL is valid before any Prisma operations
ensureDatabaseUrl()

export const authOptions: NextAuthOptions = {
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
          // Non-critical: avatar update failure shouldn't block sign-in
        }
      }

      return true
    },

    async jwt({ token, user }) {
      // On first sign-in, `user` is populated
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
  },
  pages: {
    signIn: '/',
    error: '/',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
