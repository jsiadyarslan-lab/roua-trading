import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch } from '@/lib/alpacaClient'

/**
 * Verify that the request has a valid roua_session cookie.
 */
function requireAuth(request: NextRequest): NextResponse | null {
  const sessionToken = request.cookies.get('roua_session')?.value
  if (!sessionToken) {
    return NextResponse.json(
      { success: false, error: 'لم يتم تقديم رمز المصادقة' },
      { status: 401 }
    )
  }
  return null
}

/**
 * DELETE /api/alpaca/positions/[symbol]
 * إغلاق مركز محدد عبر Alpaca
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const authError = requireAuth(req)
  if (authError) return authError

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
