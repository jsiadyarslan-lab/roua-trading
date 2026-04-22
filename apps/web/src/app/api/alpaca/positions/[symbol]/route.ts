import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch, toAlpacaSymbol } from '@/lib/alpacaClient'

/**
 * DELETE /api/alpaca/positions/[symbol]
 * إغلاق مركز محدد عبر Alpaca
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  try {
    const resolvedParams = await params
    const symbol = decodeURIComponent(resolvedParams.symbol)
    const res = await alpacaFetch(`/v2/positions/${symbol}`, { method: 'DELETE' })

    if (!res.ok) {
      const errBody = await res.text()
      return NextResponse.json(
        { success: false, error: `Alpaca Error ${res.status}: ${errBody}` },
        { status: res.status }
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
