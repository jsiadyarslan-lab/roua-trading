import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/coach/history
 *
 * Get advice history (currently returns empty as we don't persist in BFF)
 * In a full implementation, this would call NestJS /api/coach/history
 */
export async function GET(req: NextRequest) {
  try {
    // For now, return empty history since we compute advice on-the-fly
    // In a full implementation with auth, we'd call NestJS:
    // const origin = req.nextUrl.origin
    // const res = await fetch(`${origin}:3001/api/coach/history?userId=${userId}`)
    return NextResponse.json({
      success: true,
      data: [],
    })
  } catch (error: any) {
    console.error('[coach/history] Error:', error?.message || error)
    return NextResponse.json({
      success: true,
      data: [],
    })
  }
}
