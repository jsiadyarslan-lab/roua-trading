import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

// In-memory challenge store (in production, use Redis)
const challenges = new Map<string, { challenge: string; expires: number }>()

// Clean expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of challenges) {
    if (val.expires < now) challenges.delete(key)
  }
}, 5 * 60 * 1000)

function generateChallenge(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function getUserIdBuffer(email: string): string {
  // Create a deterministic user ID from email
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

    // Generate WebAuthn registration challenge
    const challenge = generateChallenge()
    const userId = getUserIdBuffer(email)

    // Store challenge
    challenges.set(email, {
      challenge,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    })

    const options = {
      challenge,
      rp: {
        name: 'Roua Trading',
        id: process.env.WEBAUTHN_RP_ID || 'localhost',
      },
      user: {
        id: userId,
        name: email,
        displayName: displayName || email.split('@')[0],
      },
      pubKeyCredParams: [
        { type: 'public-key' as const, alg: -7 },   // ES256
        { type: 'public-key' as const, alg: -257 },  // RS256
      ],
      timeout: 60000,
      attestation: 'none' as const,
      authenticatorSelection: {
        authenticatorAttachment: 'platform' as const,
        userVerification: 'required' as const,
        residentKey: 'required' as const,
      },
    }

    // Create user if doesn't exist
    if (!existingUser) {
      await db.user.create({
        data: {
          email,
          displayName: displayName || email.split('@')[0],
        },
      })
    }

    return NextResponse.json(options)
  } catch (error: any) {
    console.error('Registration challenge error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في إنشاء التحدي' },
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

    const challenge = generateChallenge()

    challenges.set(email, {
      challenge,
      expires: Date.now() + 5 * 60 * 1000,
    })

    const options = {
      challenge,
      rpId: process.env.WEBAUTHN_RP_ID || 'localhost',
      allowCredentials: [
        {
          type: 'public-key' as const,
          id: user.passkeyId,
          transports: ['internal' as const],
        },
      ],
      userVerification: 'required' as const,
      timeout: 60000,
    }

    return NextResponse.json(options)
  } catch (error: any) {
    console.error('Auth challenge error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ' },
      { status: 500 }
    )
  }
}
