import { NextRequest, NextResponse } from 'next/server'
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from '@simplewebauthn/server'
import { db, ensureDbReady } from '@/lib/db'
import { challengeStore } from '@/lib/challenge-store'
import crypto from 'crypto'

// ── WebAuthn Configuration from Environment Variables ──
function getWebAuthnConfig() {
  let rpId = process.env.RP_ID || process.env.WEBAUTHN_RP_ID || 'localhost'
  const rpName = process.env.RP_NAME || 'Roua Trading'
  // Strip any trailing slash, protocol, or port from rpId
  rpId = rpId.replace(/\/+$/, '').replace(/^https?:\/\//, '').replace(/:\d+$/, '')
  const origin = process.env.ORIGIN || (rpId === 'localhost' ? 'http://localhost:3000' : `https://${rpId}`)

  console.log(`[WebAuthn] Config — rpId: ${rpId}, rpName: ${rpName}, origin: ${origin}`)

  return { rpId, rpName, origin }
}

function getUserIdBuffer(email: string): Uint8Array {
  // Return raw bytes directly — avoid base64url/atob incompatibility
  return crypto.createHash('sha256').update(email).digest()
}

export async function POST(request: NextRequest) {
  try {
    // Ensure database is initialized before any queries
    await ensureDbReady()

    const body = await request.json()
    const { email, displayName } = body

    if (!email || !email.includes('@')) {
      return NextResponse.json(
        { error: 'يرجى إدخال بريد إلكتروني صحيح' },
        { status: 400 }
      )
    }

    // Check if user already exists
    let existingUser
    try {
      existingUser = await db.user.findUnique({ where: { email } })
    } catch (dbError: any) {
      console.error('[WebAuthn] Database error in findUnique:', dbError.message)
      return NextResponse.json(
        { error: 'خطأ في قاعدة البيانات', details: dbError.message },
        { status: 500 }
      )
    }

    if (existingUser && existingUser.passkeyId) {
      return NextResponse.json(
        { error: 'هذا البريد مسجل بالفعل. يرجى تسجيل الدخول.' },
        { status: 409 }
      )
    }

    const { rpId, rpName } = getWebAuthnConfig()
    const userIdBuffer = getUserIdBuffer(email)

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

    // Store challenge in DATABASE (not in-memory Map!)
    await challengeStore.set(`reg:${email}`, options.challenge)

    // Create user if doesn't exist
    if (!existingUser) {
      try {
        await db.user.create({
          data: {
            email,
            displayName: displayName || email.split('@')[0],
          },
        })
      } catch (dbError: any) {
        console.error('[WebAuthn] Database error in user create:', dbError.message)
        return NextResponse.json(
          { error: 'خطأ في إنشاء المستخدم', details: dbError.message },
          { status: 500 }
        )
      }
    }

    console.log(`[WebAuthn] Registration challenge generated for ${email} (rpId: ${rpId})`)

    return NextResponse.json(options)
  } catch (error: any) {
    console.error('[WebAuthn] Registration challenge error:', error)
    return NextResponse.json(
      {
        error: 'حدث خطأ في إنشاء التحدي',
        details: error.message || String(error),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}

// GET: Return authentication challenge for existing user
export async function GET(request: NextRequest) {
  try {
    // Ensure database is initialized before any queries
    await ensureDbReady()

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

    // Store challenge in DATABASE (not in-memory Map!)
    await challengeStore.set(`auth:${email}`, options.challenge)

    console.log(`[WebAuthn] Authentication challenge generated for ${email} (rpId: ${rpId})`)

    return NextResponse.json(options)
  } catch (error: any) {
    console.error('[WebAuthn] Auth challenge error:', error)
    return NextResponse.json(
      {
        error: 'حدث خطأ',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
