import NextAuth from 'next-auth'
import { getAuthOptions } from '@/lib/auth-config'

// Simple NextAuth handler - NO custom wrapping.
// Previous custom wrapper broke X-Auth-Return-Redirect header handling
// which caused signIn('google', {redirect: false}) to fail.
// roua_session cookie is now created via /api/auth/sync endpoint instead.
const handler = NextAuth(getAuthOptions())

export { handler as GET, handler as POST }
