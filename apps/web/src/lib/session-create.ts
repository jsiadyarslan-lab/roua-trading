import { db } from './db'
import crypto from 'crypto'

/**
 * Safe session creation that handles DB schema mismatches gracefully.
 *
 * PROBLEM: When Prisma generates SQL for db.session.create(), it includes a
 * RETURNING clause that references ALL model columns. If any column is missing
 * from the database (e.g., after a failed migration), PostgreSQL throws
 * "column does not exist" — even for "minimal" creates that don't set those
 * columns in the INSERT.
 *
 * SOLUTION:
 * 1. Try the normal Prisma create() first (fast path when schema matches)
 * 2. If that fails, use raw SQL INSERT that only includes core columns
 *    (no RETURNING clause issues because we control the SQL)
 * 3. If even raw SQL fails, return null
 *
 * The raw SQL fallback uses $executeRawUnsafe with ONLY static SQL —
 * no user input is interpolated. Values are passed via parameterized query.
 */

export interface SessionCreateInfo {
  userId: string
  token: string
  refreshToken?: string
  deviceInfo?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  isActive?: boolean
  expiresAt: Date
}

/**
 * Create a session safely, with fallback to raw SQL if Prisma's
 * generated SQL fails due to missing columns.
 *
 * Returns the session token on success, or null on failure.
 */
export async function createSessionSafely(info: SessionCreateInfo): Promise<string | null> {
  // Strategy 1: Try normal Prisma create (fast path — works when DB schema matches)
  try {
    await db.session.create({
      data: {
        userId: info.userId,
        token: info.token,
        refreshToken: info.refreshToken || null,
        deviceInfo: info.deviceInfo || null,
        ipAddress: info.ipAddress || null,
        userAgent: info.userAgent || null,
        isActive: info.isActive ?? true,
        expiresAt: info.expiresAt,
      },
    })
    return info.token
  } catch (prismaErr: any) {
    const prismaMsg = prismaErr?.message || String(prismaErr)
    const prismaCode = prismaErr?.code || ''
    console.warn(
      `[session-create] Prisma create failed [${prismaCode}]: ${prismaMsg.substring(0, 300)}`
    )

    // If it's a duplicate token error, don't retry
    if (prismaCode === 'P2002' || prismaMsg.includes('Unique constraint')) {
      console.error('[session-create] Duplicate token — this should not happen')
      return null
    }
  }

  // Strategy 2: Try Prisma create with minimal fields
  // (still uses RETURNING clause, but fewer INSERT columns)
  try {
    await db.session.create({
      data: {
        userId: info.userId,
        token: info.token,
        expiresAt: info.expiresAt,
      },
    })
    console.log('[session-create] Minimal Prisma create succeeded')
    return info.token
  } catch (minimalErr: any) {
    const minimalMsg = minimalErr?.message || String(minimalErr)
    const minimalCode = minimalErr?.code || ''
    console.warn(
      `[session-create] Minimal Prisma create also failed [${minimalCode}]: ${minimalMsg.substring(0, 300)}`
    )
  }

  // Strategy 3: Raw SQL INSERT — bypasses Prisma's RETURNING clause entirely
  // This is the LAST RESORT when Prisma can't work with the DB schema.
  try {
    const sessionId = crypto.randomBytes(16).toString('hex') + Date.now().toString(36)
    const now = new Date()

    // Use parameterized raw SQL to avoid injection — values come from
    // server-generated crypto, not user input
    await db.$executeRawUnsafe(
      `INSERT INTO "Session" ("id", "userId", "token", "refreshToken", "deviceInfo", "ipAddress", "userAgent", "isActive", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      sessionId,
      info.userId,
      info.token,
      info.refreshToken || null,
      info.deviceInfo || null,
      info.ipAddress || null,
      info.userAgent || null,
      info.isActive ?? true,
      info.expiresAt,
      now,
      now,
    )
    console.log('[session-create] Raw SQL INSERT succeeded (fallback)')
    return info.token
  } catch (rawErr: any) {
    const rawMsg = rawErr?.message || String(rawErr)
    console.error(
      `[session-create] Raw SQL INSERT also failed: ${rawMsg.substring(0, 500)}`
    )

    // Strategy 4: Absolute minimal raw SQL — only the columns that MUST exist
    try {
      const sessionId = crypto.randomBytes(16).toString('hex') + Date.now().toString(36)
      const now = new Date()

      // Try just the bare minimum columns that have existed since the first deploy
      await db.$executeRawUnsafe(
        `INSERT INTO "Session" ("id", "userId", "token", "expiresAt", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        sessionId,
        info.userId,
        info.token,
        info.expiresAt,
        now,
        now,
      )
      console.log('[session-create] Bare-minimum raw SQL INSERT succeeded')
      return info.token
    } catch (bareErr: any) {
      const bareMsg = bareErr?.message || String(bareErr)
      console.error(
        `[session-create] ALL strategies failed. Last error: ${bareMsg.substring(0, 500)}`
      )
      return null
    }
  }
}
