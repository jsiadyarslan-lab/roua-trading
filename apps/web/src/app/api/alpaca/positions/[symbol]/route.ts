import { NextRequest, NextResponse } from 'next/server'
import { alpacaFetch } from '@/lib/alpacaClient'

/**
 * Verify that the request has a valid roua_session cookie.
 */
function requireAuth(request: NextRequest): NextResponse | null {
  const sessionToken = request.cookies.get('roua_session')?.value
  if (!sessionToken) {
    // Return graceful empty response instead of 401 to prevent cascading UI errors
    return NextResponse.json(
      { success: false, error: 'الرجاء تسجيل الدخول أولاً' },
      { status: 200 }
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
