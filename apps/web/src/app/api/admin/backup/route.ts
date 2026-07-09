import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const adminToken = request.headers.get('x-admin-token')
  const expectedToken = process.env.ADMIN_PASSWORD || 'roua-admin-secret-2026'
  if (!adminToken || adminToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const backup: any = {
    timestamp: new Date().toISOString(),
    tables: {},
  }

  const tablesToExport = [
    { name: 'users', query: 'User', fields: 'id, email, "displayName", "passkeyCounter", tier, "riskTolerance", "createdAt", "updatedAt"' },
    { name: 'exchangeCredentials', query: 'ExchangeCredential', fields: 'id, "userId", exchange, label, "encryptedApiKey", "encryptedSecret", iv, "authTag", permissions, "isValid", "lastValidatedAt", "createdAt", "updatedAt", "secretAuthTag", "secretIv", "encryptedPassphrase", "passphraseIv", "passphraseAuthTag", testnet, "keyType"' },
    { name: 'positions', query: 'Position', fields: 'id, "userId", symbol, side, exchange, "credentialId", quantity, "entryPrice", "currentPrice", "stopLoss", "takeProfit", status, "realizedPnl", "unrealizedPnl", "openedAt", "closedAt", "closeReason", timeframe, version, "exchangeSymbol", source' },
    { name: 'trades', query: 'Trade', fields: 'id, "userId", "positionId", "orderId", symbol, side, exchange, "credentialId", quantity, price, "executedAt", type, "createdAt"' },
    { name: 'orders', query: 'Order', fields: 'id, "userId", "exchangeCredentialId", exchange, symbol, side, type, quantity, price, status, "createdAt", "updatedAt"' },
    { name: 'accounts', query: 'Account', fields: 'id, "userId", exchange, "accountType", balance, equity, "isActive", "createdAt"' },
  ]

  for (const { name, query, fields } of tablesToExport) {
    try {
      const data = await db.$queryRawUnsafe(`SELECT ${fields} FROM "${query}" ORDER BY "createdAt" DESC`)
      backup.tables[name] = { count: Array.isArray(data) ? data.length : 0, data }
    } catch (err: any) {
      backup.tables[name] = { error: err?.message?.substring(0, 200) }
    }
  }

  return NextResponse.json(backup)
}
