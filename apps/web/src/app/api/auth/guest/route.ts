import { NextRequest, NextResponse } from 'next/server'

/**
 * /api/auth/guest — DISABLED
 *
 * Guest account creation has been permanently disabled.
 * No new guest accounts will be created.
 * Users must sign up with a real account (OTP or Google OAuth).
 *
 * Returns 403 Forbidden for all requests.
 */

export async function GET(request: NextRequest) {
  const isMobile = request.headers.get('x-platform')?.toLowerCase() === 'ios'
    || request.headers.get('x-platform')?.toLowerCase() === 'android'

  if (isMobile) {
    return NextResponse.json({
      authenticated: false,
      error: 'GUEST_ACCESS_DISABLED',
      message: 'تم تعطيل حسابات الزوار. يرجى تسجيل الدخول بحساب حقيقي.',
    }, { status: 403 })
  }

  // Web clients: redirect to login page
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('error', 'guest_disabled')
  return NextResponse.redirect(loginUrl)
}

export async function POST(request: NextRequest) {
  return NextResponse.json({
    authenticated: false,
    error: 'GUEST_ACCESS_DISABLED',
    message: 'تم تعطيل حسابات الزوار. يرجى تسجيل الدخول بحساب حقيقي.',
  }, { status: 403 })
}
