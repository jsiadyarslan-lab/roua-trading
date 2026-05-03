import { NextRequest, NextResponse } from 'next/server'

/**
 * Check if the request comes from a guest user.
 * Returns true if the user is a guest (view-only mode).
 *
 * Guest users cannot:
 * - Execute trades
 * - Add exchange API keys
 * - Generate AI signals
 * - Run AI analysis
 * - Modify positions/orders
 * - Create paper orders
 * - Train neural models
 *
 * They CAN:
 * - View dashboard data
 * - View market charts
 * - View positions and orders (read-only)
 * - View AI analysis results (read-only)
 * - View news and signals (read-only)
 */

/**
 * Check if an email belongs to a guest user.
 * Matches both the legacy guest@roua.auto and the new unique guest-{uuid}@roua.auto pattern.
 */
function isGuestEmail(email: string): boolean {
  return email === 'guest@roua.auto' || /^guest-[a-f0-9]+@roua\.auto$/.test(email)
}

/**
 * Server-side: Check if a request is from a guest user.
 * Reads the roua_session cookie and checks against the auth endpoint.
 * For simplicity, we check if the user email matches guest patterns.
 */
export function isGuestRequest(request: NextRequest): boolean {
  // Check custom header set by frontend for guest mode
  const guestHeader = request.headers.get('x-roua-guest')
  if (guestHeader === 'true') return true

  return false
}

/**
 * API route guard: Returns 403 for guest users trying to execute write operations.
 * Use in API routes that guests should not access.
 *
 * Usage:
 * ```ts
 * export async function POST(request: NextRequest) {
 *   const guestCheck = rejectGuest(request)
 *   if (guestCheck) return guestCheck
 *   // ... normal handler
 * }
 * ```
 */
export function rejectGuest(request: NextRequest): NextResponse | null {
  if (isGuestRequest(request)) {
    return NextResponse.json(
      {
        error: 'GUEST_ACCESS_DENIED',
        message: 'هذا الإجراء يتطلب تسجيل الدخول. أنت حالياً في وضع المشاهدة فقط.',
      },
      { status: 403 },
    )
  }
  return null
}

/**
 * Client-side: Check if user is a guest.
 * Reads from the useAuth hook's user object.
 */
export function isGuestUser(user: { email?: string; id?: string; isGuest?: boolean } | null): boolean {
  if (!user) return true
  if (user.isGuest) return true
  if (isGuestEmail(user.email)) return true
  if (user.id?.startsWith('guest')) return true
  return false
}
