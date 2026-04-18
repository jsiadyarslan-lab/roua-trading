import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import crypto from 'crypto'

// Session store (in production, use Redis with TTL)
const sessions = new Map<string, { userId: string; expires: number }>()

export async function POST(request: NextRequest) {
  try {
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

    // Handle registration verification
    if (credential) {
      // In a production environment, we would verify the attestation
      // using @simplewebauthn/server's verifyRegistrationResponse()
      // For now, store the credential ID and public key
      const credentialId = credential.id

      await db.user.update({
        where: { email },
        data: {
          passkeyId: credentialId,
          passkeyPub: JSON.stringify(credential.response),
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
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_REGISTER',
          resource: 'passkey',
          details: JSON.stringify({ credentialId }),
          userAgent: request.headers.get('user-agent') || undefined,
        },
      })

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
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      })

      return response
    }

    // Handle login verification (assertion)
    if (assertion) {
      if (!user.passkeyId) {
        return NextResponse.json(
          { error: 'لم يتم تسجيل Passkey لهذا الحساب' },
          { status: 400 }
        )
      }

      // In production, verify assertion using @simplewebauthn/server
      // const verification = verifyAuthenticationResponse({ ... })

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
      await db.auditLog.create({
        data: {
          userId: user.id,
          action: 'AUTH_LOGIN',
          resource: 'passkey',
          userAgent: request.headers.get('user-agent') || undefined,
        },
      })

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
        sameSite: 'lax',
        maxAge: 24 * 60 * 60,
        path: '/',
      })

      return response
    }

    return NextResponse.json(
      { error: 'بيانات اعتماد غير صالحة' },
      { status: 400 }
    )
  } catch (error: any) {
    console.error('Verification error:', error)
    return NextResponse.json(
      { error: 'حدث خطأ في التحقق' },
      { status: 500 }
    )
  }
}
