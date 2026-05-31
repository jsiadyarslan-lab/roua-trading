import { redirect } from '@/i18n/navigation'

/**
 * /auth/login → redirect to /login
 *
 * Users often expect the login page at /auth/login.
 * This redirect ensures both paths work.
 */
export default function AuthLoginPage() {
  redirect('/login')
}
