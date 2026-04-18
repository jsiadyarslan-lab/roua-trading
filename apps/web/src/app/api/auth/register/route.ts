import { NextRequest, NextResponse } from 'next/server'
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from '@simplewebauthn/server'
import { db } from '@/lib/db'

// In-memory challenge store (in production, use Redis)
const challenges = new Map<string, { challenge: string; expires: number }>()

// Clean expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of challenges) {
    if (val.expires < now) challenges.delete(key)
  }
}, 5 * 60 * 1000)

// ── WebAuthn Configuration from Environment Variables ──
// Supports both RP_ID (standard) and WEBAUTHN_RP_ID (legacy) for backwards compatibility
function getWebAuthnConfig() {
  const rpId = process.env.RP_ID || process.env.WEBAUTHN_RP_ID || 'localhost'
  const rpName = process.env.RP_NAME || 'Roua Trading'
  const origin = process.env.ORIGIN || (rpId === 'localhost' ? 'http://localhost:3000' : `https://${rpId}`)

  console.log(`[WebAuthn] Config — rpId: ${rpId}, rpName: ${rpName}, origin: ${origin}`)

  return { rpId, rpName, origin }
}

function getUserIdBuffer(email: string): string {
  // Create a deterministic user ID from email using Web Crypto API
  const encoder = new TextEncoder()
  const data = encoder.encode(email)
  // Use a simple hash approach for compatibility
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(email).digest('base64url')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, displayName } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'يرجى إدخال بريد إلكتروني صحيح' },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email } })

    if (existingUser && existingUser.passkeyId) {
      return NextResponse.json(
        { error: 'هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.' },
        { status: 409 }
      )
    }

    const { rpId, rpName } = getWebAuthnConfig()
    const userId = getUserIdBuffer(email)
    const userIdBuffer = Uint8Array.from(atob(userId), (c) => c.charCodeAt(0))

    // Use @simplewebauthn/server for proper WebAuthn option generation
    const options = await generateRegistrationOptions({
      rpID: rpId,
      rpName: rpName,
      userID: userIdBuffer,
      userName: email,
      userDisplayName: displayName || email.split('@')[0],
      attestationType: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'required',
      },
      // Exclude existing credentials if user exists
      excludeCredentials: existingUser?.passkeyId
        ? [{ id: existingUser.passkeyId, transports: ['internal' as const] }]
        : [],
      timeout: 60000,
    })

    // Store challenge
    challenges.set(email, {
      challenge: options.challenge,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    })

    // Create user if doesn't exist
    if (!existingUser) {
      await db.user.create({
        data: {
          email,
          displayName: displayName || email.split('@')[0],
        },
      })
    }

    console.log(`[WebAuthn] Registration challenge generated for ${email} (rpId: ${rpId})`)

    return NextResponse.json(options)
  } catch (error: any) {
    console.error('[WebAuthn] Registration challenge error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في إنشاء التحدي', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}

// GET: Return authentication challenge for existing user
export async function GET(request: NextRequest) {
  try {
    const email = request.nextUrl.searchParams.get('email')

    if (!email) {
      return NextResponse.json(
        { error: 'يرجى توفير البريد الإلكتروني' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({
      where: { email },
    })

    if (!user || !user.passkeyId) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود. يرجى التسجيل أولاً.' },
        { status: 404 }
      )
    }

    const { rpId } = getWebAuthnConfig()

    // Use @simplewebauthn/server for proper authentication options
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: [
        {
          id: user.passkeyId,
          transports: ['internal' as const],
        },
      ],
      userVerification: 'required',
      timeout: 60000,
    })

    challenges.set(email, {
      challenge: options.challenge,
      expires: Date.now() + 5 * 60 * 1000,
    })

    console.log(`[WebAuthn] Authentication challenge generated for ${email} (rpId: ${rpId})`)

    return NextResponse.json(options)
  } catch (error: any) {
    console.error('[WebAuthn] Auth challenge error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
      { status: 500 }
    )
  }
}
