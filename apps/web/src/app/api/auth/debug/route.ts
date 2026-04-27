import { NextResponse } from 'next/server'

/**
 * Debug endpoint — DISABLED in production for security.
 * Only returns minimal info in development mode.
 */
export async function GET() {
  // Block in production — never expose environment variables
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is disabled in production' },
      { status: 403 }
    )
  }

  // In development, only return non-sensitive info
  const safeInfo = {
    NODE_ENV: process.env.NODE_ENV || '(not set)',
    PORT: process.env.PORT || '(not set)',
    NEXTAUTH_URL_SET: !!process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET_SET: !!process.env.NEXTAUTH_SECRET,
    DATABASE_URL_SET: !!process.env.DATABASE_URL,
    GOOGLE_CLIENT_ID_SET: !!process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET_SET: !!process.env.GOOGLE_CLIENT_SECRET,
    RP_ID: process.env.RP_ID || process.env.WEBAUTHN_RP_ID || '(not set)',
  }

  return NextResponse.json(safeInfo, { headers: { 'Cache-Control': 'no-store' } })
}
