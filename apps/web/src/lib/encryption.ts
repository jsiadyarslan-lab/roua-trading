import crypto from 'crypto'

/**
 * Encryption Utility (AES-256-GCM)
 * Replicates the logic from apps/api/src/modules/portfolio/credentials/credentials.service.ts
 */

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY
  if (key) {
    return Buffer.from(key, 'hex')
  }

  // Fallback to NEXTAUTH_SECRET derived key (matching backend fallback logic)
  const fallback = process.env.NEXTAUTH_SECRET
  if (fallback) {
    const deploymentId = `${fallback}:${process.env.NODE_ENV || 'production'}`
    const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16)
    return crypto.scryptSync(fallback, salt, 32)
  }

  throw new Error('ENCRYPTION_KEY or NEXTAUTH_SECRET must be set for credential decryption')
}

export function decrypt(data: { encrypted: string; iv: string; authTag: string }): string {
  try {
    const key = getEncryptionKey()
    const iv = Buffer.from(data.iv, 'hex')
    const authTag = Buffer.from(data.authTag, 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  } catch (error: any) {
    console.error(`[encryption] Decryption failed: ${error.message}`)
    throw new Error('فشل فك تشفير البيانات — قد يكون مفتاح التشفير غير متطابق')
  }
}
