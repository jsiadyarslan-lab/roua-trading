import { NextRequest, NextResponse } from 'next/server'
import {
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

// ── Shared challenge store (imported from register route) ──
// In a single Next.js server process, module-level Maps are shared across routes.
// For multi-instance production, replace with Redis.
const challenges = new Map<string, { challenge: string; expires: number }>()

// Clean expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [key, val] of challenges) {
    if (val.expires < now) challenges.delete(key)
  }
}, 5 * 60 * 1000)

// ── WebAuthn Configuration from Environment Variables ──
function getWebAuthnConfig() {
  const rpId = process.env.RP_ID || process.env.WEBAUTHN_RP_ID || 'localhost'
  const rpName = process.env.RP_NAME || 'Roua Trading'
  const origin = process.env.ORIGIN || (rpId === 'localhost' ? 'http://localhost:3000' : `https://${rpId}`)
  return { rpId, rpName, origin }
}

export async function POST(request: NextRequest) {
  try {
    // Ensure database is initialized before any queries
    await ensureDbReady()

    const body = await request.json()
    const { credential, assertion, email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'يرجى توفير البريد الإلكتروني' },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { email } })

    if (!user) {
      return NextResponse.json(
        { error: 'المستخدم غير موجود' },
        { status: 404 }
      )
    }

    const { rpId, origin } = getWebAuthnConfig()

    // Handle registration verification
    if (credential) {
      // Get the stored challenge for this user (reg: prefix)
      const storedChallenge = challenges.get(`reg:${email}`)
      if (!storedChallenge || storedChallenge.expires < Date.now()) {
        challenges.delete(`reg:${email}`)
        return NextResponse.json(
          { error: 'انتهت صلاحية التحدي أو غير موجود' },
          { status: 400 }
        )
      }

      // Clean up used challenge
      challenges.delete(`reg:${email}`)

      try {
        // Use @simplewebauthn/server for proper cryptographic verification
        const verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: storedChallenge.challenge,
          expectedOrigin: origin,
          expectedRPID: rpId,
        })

        if (!verification.verified || !verification.registrationInfo) {
          console.warn(`[WebAuthn] Registration verification failed for ${email}`)
          return NextResponse.json(
            { error: 'فشل التحقق من بيانات الاعتماد' },
            { status: 400 }
          )
        }

        const { credential: webAuthnCredential } = verification.registrationInfo

        // Store passkey credential
        await db.user.update({
          where: { email },
          data: {
            passkeyId: webAuthnCredential.id,
            passkeyPub: Buffer.from(webAuthnCredential.publicKey).toString('base64'),
          },
        })

        // Create session
        const sessionToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        await db.session.create({
          data: {
            userId: user.id,
            token: sessionToken,
            expiresAt,
          },
        })

        // Log the registration
        try {
          await db.auditLog.create({
            data: {
              userId: user.id,
              action: 'AUTH_REGISTER',
              resource: 'passkey',
              details: JSON.stringify({ credentialId: webAuthnCredential.id }),
              userAgent: request.headers.get('user-agent') || undefined,
            },
          })
        } catch (auditError) {
          // Audit log failure should not block registration
          console.warn('[WebAuthn] Failed to create audit log:', auditError)
        }

        const response = NextResponse.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            tier: user.tier,
          },
        })

        // Set session cookie
        response.cookies.set('roua_session', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 24 * 60 * 60, // 24 hours
          path: '/',
        })

        console.log(`[WebAuthn] User registered: ${email} (rpId: ${rpId})`)

        return response
      } catch (verifyError: any) {
        console.error(`[WebAuthn] Registration verification error for ${email}:`, verifyError.message)
        return NextResponse.json(
          {
            error: 'فشل التحقق من التسجيل',
            details: verifyError.message || String(verifyError),
          },
          { status: 400 }
        )
      }
    }

    // Handle login verification (assertion)
    if (assertion) {
      if (!user.passkeyId) {
        return NextResponse.json(
          { error: 'لم يتم تسجيل Passkey لهذا الحساب' },
          { status: 400 }
        )
      }

      // Get the stored challenge for this user (auth: prefix)
      const storedChallenge = challenges.get(`auth:${email}`)
      if (!storedChallenge || storedChallenge.expires < Date.now()) {
        challenges.delete(`auth:${email}`)
        return NextResponse.json(
          { error: 'انتهت صلاحية التحدي أو غير موجود' },
          { status: 400 }
        )
      }

      // Clean up used challenge
      challenges.delete(`auth:${email}`)

      try {
        // Use @simplewebauthn/server for proper cryptographic verification
        const verification = await verifyAuthenticationResponse({
          response: assertion,
          expectedChallenge: storedChallenge.challenge,
          expectedOrigin: origin,
          expectedRPID: rpId,
          credential: {
            id: user.passkeyId,
            publicKey: user.passkeyPub
              ? Uint8Array.from(atob(user.passkeyPub), (c) => c.charCodeAt(0))
              : new Uint8Array(),
            counter: 0,
            transports: ['internal' as const],
          },
        })

        if (!verification.verified) {
          console.warn(`[WebAuthn] Authentication verification failed for ${email}`)
          return NextResponse.json(
            { error: 'فشل التحقق من المصادقة' },
            { status: 400 }
          )
        }

        // Create session
        const sessionToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

        await db.session.create({
          data: {
            userId: user.id,
            token: sessionToken,
            expiresAt,
          },
        })

        // Log the login
        try {
          await db.auditLog.create({
            data: {
              userId: user.id,
              action: 'AUTH_LOGIN',
              resource: 'passkey',
              userAgent: request.headers.get('user-agent') || undefined,
            },
          })
        } catch (auditError) {
          console.warn('[WebAuthn] Failed to create audit log:', auditError)
        }

        const response = NextResponse.json({
          success: true,
          user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
            tier: user.tier,
          },
        })

        response.cookies.set('roua_session', sessionToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 24 * 60 * 60,
          path: '/',
        })

        console.log(`[WebAuthn] User logged in: ${email} (rpId: ${rpId})`)

        return response
      } catch (verifyError: any) {
        console.error(`[WebAuthn] Authentication verification error for ${email}:`, verifyError.message)
        return NextResponse.json(
          {
            error: 'فشل التحقق من المصادقة',
            details: verifyError.message || String(verifyError),
          },
          { status: 400 }
        )
      }
    }

    return NextResponse.json(
      { error: 'بيانات اعتماد غير صالحة' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('[WebAuthn] Verification error:', error)
    return NextResponse.json(
      {
        error: 'حدث خطأ في التحقق',
        details: error.message || String(error),
      },
      { status: 500 }
    )
  }
}
