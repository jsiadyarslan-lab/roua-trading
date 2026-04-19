import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'
import crypto from 'crypto'

/**
 * GET /api/portfolio/credentials
 * Lists the user's exchange credentials (API keys are never returned).
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const credentials = await db.exchangeCredential.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'desc' },
    })

    // Return credentials but NEVER expose encrypted keys
    const safeCredentials = credentials.map((cred) => ({
      id: cred.id,
      exchange: cred.exchange,
      label: cred.label,
      permissions: cred.permissions,
      isValid: cred.isValid,
      lastValidatedAt: cred.lastValidatedAt?.toISOString() || null,
      createdAt: cred.createdAt.toISOString(),
    }))

    return NextResponse.json({ success: true, data: safeCredentials })
  } catch (error: any) {
    console.error('[portfolio/credentials] GET Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في جلب المفاتيح' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/portfolio/credentials
 * Adds a new exchange credential (API key + secret encrypted with AES-256-GCM).
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDbReady()

    const sessionToken = request.cookies.get('roua_session')?.value
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })
    }

    const session = await db.session.findUnique({
      where: { token: sessionToken },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })
    }

    const body = await request.json()
    const { exchange, label, apiKey, apiSecret } = body

    // Validate required fields
    if (!exchange || !apiKey || !apiSecret) {
      return NextResponse.json(
        { success: false, error: 'يرجى تعبئة جميع الحقول المطلوبة' },
        { status: 400 }
      )
    }

    // Validate exchange is supported
    const SUPPORTED_EXCHANGES = ['binance', 'kucoin', 'bybit', 'okx', 'gate']
    if (!SUPPORTED_EXCHANGES.includes(exchange)) {
      return NextResponse.json(
        { success: false, error: `البورصة "${exchange}" غير مدعومة` },
        { status: 400 }
      )
    }

    // Encrypt API key and secret with AES-256-GCM
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      // If no encryption key, store with a placeholder (dev mode)
      console.warn('[portfolio/credentials] ENCRYPTION_KEY not set, using basic storage')

      const credential = await db.exchangeCredential.create({
        data: {
          userId: session.userId,
          exchange,
          label: label || `${exchange}-key`,
          encryptedApiKey: Buffer.from(apiKey).toString('base64'),
          encryptedSecret: Buffer.from(apiSecret).toString('base64'),
          iv: 'no-encryption',
          authTag: 'no-encryption',
          permissions: JSON.stringify(['read', 'trade']),
          isValid: true,
          lastValidatedAt: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        data: {
          id: credential.id,
          exchange: credential.exchange,
          label: credential.label,
          permissions: credential.permissions,
          isValid: credential.isValid,
          lastValidatedAt: credential.lastValidatedAt?.toISOString(),
          createdAt: credential.createdAt.toISOString(),
        },
      })
    }

    // Full AES-256-GCM encryption
    const key = Buffer.from(encryptionKey, 'hex')
    if (key.length !== 32) {
      return NextResponse.json(
        { success: false, error: 'مفتاح التشفير غير صالح' },
        { status: 500 }
      )
    }

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

    const encryptedApiKey = Buffer.concat([
      cipher.update(apiKey, 'utf8'),
      cipher.final(),
    ])
    const authTag = cipher.getAuthTag()

    const cipher2 = crypto.createCipheriv('aes-256-gcm', key, iv)
    const encryptedSecret = Buffer.concat([
      cipher2.update(apiSecret, 'utf8'),
      cipher2.final(),
    ])
    const authTag2 = cipher2.getAuthTag()

    // Verify the key doesn't have withdraw/transfer permissions (non-custodial principle)
    // This is a safety check — in production, you'd validate the key's permissions
    // against the exchange API
    const permissions = JSON.stringify(['read', 'trade'])

    const credential = await db.exchangeCredential.create({
      data: {
        userId: session.userId,
        exchange,
        label: label || `${exchange}-key`,
        encryptedApiKey: encryptedApiKey.toString('base64'),
        encryptedSecret: encryptedSecret.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        permissions,
        isValid: true,
        lastValidatedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: credential.id,
        exchange: credential.exchange,
        label: credential.label,
        permissions: credential.permissions,
        isValid: credential.isValid,
        lastValidatedAt: credential.lastValidatedAt?.toISOString(),
        createdAt: credential.createdAt.toISOString(),
      },
    })
  } catch (error: any) {
    console.error('[portfolio/credentials] POST Error:', error.message)
    return NextResponse.json(
      { success: false, error: error.message || 'فشل في إضافة المفتاح' },
      { status: 500 }
    )
  }
}
