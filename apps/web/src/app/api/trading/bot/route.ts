import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    await ensureDbReady()
    const sessionToken = req.cookies.get('roua_session')?.value
    if (!sessionToken) return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })

    const session = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session) return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })

    let bot = await db.tradingBot.findFirst({
      where: { userId: session.userId }
    })

    if (!bot) {
      // Mock some daily logic for seed
      bot = await db.tradingBot.create({
        data: {
          userId: session.userId,
          name: 'HFT-Alpha',
          strategy: 'السلخ الدقيق (Scalping)',
          isActive: true,
          winRate: 68.4,
          totalTrades: 142,
          dailyPnl: 452.10,
          statusMessage: 'API_SYNCED'
        }
      })
    }

    return NextResponse.json({ success: true, data: bot })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDbReady()
    const sessionToken = req.cookies.get('roua_session')?.value
    if (!sessionToken) return NextResponse.json({ success: false, error: 'غير مصادق' }, { status: 401 })

    const session = await db.session.findUnique({
      where: { token: sessionToken },
    })

    if (!session) return NextResponse.json({ success: false, error: 'جلسة غير صالحة' }, { status: 401 })

    const { isActive } = await req.json()

    let bot = await db.tradingBot.findFirst({ where: { userId: session.userId } })
    if (bot) {
      bot = await db.tradingBot.update({
        where: { id: bot.id },
        data: { isActive }
      })
    }

    return NextResponse.json({ success: true, data: bot })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
