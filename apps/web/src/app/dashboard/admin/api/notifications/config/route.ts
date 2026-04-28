import { NextRequest, NextResponse } from 'next/server'
import { db, ensureDbReady } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ configs: [], error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const configs = await db.notificationConfig.findMany({
      orderBy: { type: 'asc' },
    })

    return NextResponse.json({
      configs: configs.map(c => ({
        id: c.id,
        type: c.type,
        enabled: c.enabled,
        config: JSON.parse(c.config || '{}'),
        description: c.description,
        lastTriggeredAt: c.lastTriggeredAt?.toISOString() || null,
        triggerCount: c.triggerCount,
        createdAt: c.createdAt.toISOString(),
      })),
    })
  } catch (error: any) {
    console.error('[admin/notifications/config] GET Error:', error?.message || error)
    return NextResponse.json({ configs: [] })
  }
}

export async function POST(req: NextRequest) {
  try {
    const dbReady = await ensureDbReady()
    if (!dbReady) {
      return NextResponse.json({ error: 'قاعدة البيانات غير متاحة' }, { status: 503 })
    }

    const { type, enabled, config } = await req.json()

    if (!type) {
      return NextResponse.json({ error: 'نوع التنبيه مطلوب' }, { status: 400 })
    }

    const existing = await db.notificationConfig.findUnique({ where: { type } })

    if (existing) {
      const updateData: any = {}
      if (typeof enabled === 'boolean') updateData.enabled = enabled
      if (config) updateData.config = JSON.stringify(config)

      const updated = await db.notificationConfig.update({
        where: { type },
        data: updateData,
      })

      return NextResponse.json({
        config: {
          id: updated.id,
          type: updated.type,
          enabled: updated.enabled,
          config: JSON.parse(updated.config || '{}'),
          description: updated.description,
        },
      })
    } else {
      const created = await db.notificationConfig.create({
        data: {
          type,
          enabled: enabled ?? false,
          config: JSON.stringify(config || {}),
        },
      })

      return NextResponse.json({
        config: {
          id: created.id,
          type: created.type,
          enabled: created.enabled,
          config: JSON.parse(created.config || '{}'),
          description: created.description,
        },
      })
    }
  } catch (error: any) {
    console.error('[admin/notifications/config] POST Error:', error?.message || error)
    return NextResponse.json({ error: 'فشل في حفظ الإعدادات' }, { status: 500 })
  }
}
