import { NextResponse } from 'next/server'

/**
 * Debug endpoint to inspect auth-related environment variables.
 * This helps diagnose Configuration errors on Railway.
 * Only shows partial values for security.
 */
export async function GET() {
  const mask = (val: string | undefined, show: number = 6) => {
    if (!val) return '(not set)'
    if (val.length <= show * 2) return val
    return `${val.slice(0, show)}...${val.slice(-show)}`
  }

  const envInfo = {
    NEXTAUTH_URL: process.env.NEXTAUTH_URL || '(not set)',
    NEXTAUTH_SECRET: mask(process.env.NEXTAUTH_SECRET),
    GOOGLE_CLIENT_ID: mask(process.env.GOOGLE_CLIENT_ID),
    GOOGLE_CLIENT_SECRET: mask(process.env.GOOGLE_CLIENT_SECRET),
    NODE_ENV: process.env.NODE_ENV || '(not set)',
    PORT: process.env.PORT || '(not set)',
    HOSTNAME: process.env.HOSTNAME || '(not set)',
    RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN || '(not set)',
    RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL || '(not set)',
    RP_ID: process.env.RP_ID || process.env.WEBAUTHN_RP_ID || '(not set)',
    ORIGIN: process.env.ORIGIN || '(not set)',
    DATABASE_URL: mask(process.env.DATABASE_URL, 10),
  }

  return NextResponse.json(envInfo, { headers: { 'Cache-Control': 'no-store' } })
}
