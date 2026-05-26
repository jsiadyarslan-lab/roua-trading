import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch } from '@/lib/alpacaClient'
import { verifyUserSession } from '@/lib/session-auth'

/**
 * DELETE /api/alpaca/positions/[symbol]
 * إغلاق مركز محدد عبر Alpaca
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const auth = await verifyUserSession(req)
  if (auth.error) return auth.error

  try {
    const resolvedParams = await params
    const symbol = decodeURIComponent(resolvedParams.symbol)
    const res = await alpacaFetch(`/v2/positions/${symbol}`, { method: 'DELETE' })

    if (!res.ok) {
      const errBody = await res.text()
      let userError = `Alpaca Error ${res.status}: ${errBody}`
      
      if (res.status === 403) {
        userError = 'مفاتيح Alpaca غير صالحة أو منتهية الصلاحية'
        console.error('[alpaca/positions] DELETE 403 Forbidden — API keys may be invalid:', errBody)
      }
      
      return NextResponse.json(
        { success: false, error: userError, alpacaStatus: res.status },
        { status: res.status === 403 ? 503 : res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'فشل إغلاق المركز' },
      { status: 500 }
    )
  }
}
