import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'global'
    const userId = 'default-user' // In production, get from session

    const pref = await db.chartPreference.findUnique({
      where: { userId_symbol: { userId, symbol } }
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('ChartPreference GET Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const symbol = searchParams.get('symbol') || 'global'
    const userId = 'default-user'
    
    const body = await req.json()
    const { settings, drawings } = body

    // Ensure the default user exists for development/demo purposes
    await db.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId, email: 'demo@rouatrading.com', displayName: 'Demo User' }
    })

    const pref = await db.chartPreference.upsert({
      where: { userId_symbol: { userId, symbol } },
      update: {
        settings: settings ? JSON.stringify(settings) : undefined,
        drawings: drawings ? JSON.stringify(drawings) : undefined,
      },
      create: {
        userId,
        symbol,
        settings: settings ? JSON.stringify(settings) : '{}',
        drawings: drawings ? JSON.stringify(drawings) : '[]',
      }
    })

    return NextResponse.json({ success: true, data: pref })
  } catch (error) {
    console.error('ChartPreference POST Error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
