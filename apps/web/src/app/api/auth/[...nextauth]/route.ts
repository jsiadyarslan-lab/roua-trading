import NextAuth from 'next-auth'
import { getAuthOptions } from '@/lib/auth-config'

// NextAuth route handler.
// NEXTAUTH_URL and NEXTAUTH_SECRET are fixed at module load time in auth-config.ts
// (before NextAuth ever reads them), so we can use the simple pattern here.
const handler = NextAuth(getAuthOptions())

export { handler as GET, handler as POST }
