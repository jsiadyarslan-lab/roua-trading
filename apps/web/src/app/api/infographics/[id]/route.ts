import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbReady } from '@/lib/db'
import { isValidImageUrl, isPollinationsUrl } from '@/lib/image-gen'

export const dynamic = 'force-dynamic'

/**
 * GET /api/infographics/[id]
 *
 * Get a single infographic by ID or slug.
 * GOLDEN RULE (V5): Pollinations URLs are accepted as valid image URLs.
 * Infographics with Pollinations images are NOT marked as "missing".
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()

    const { id } = await params

    // Try to find by ID first, then by slug
    let infographic = await db.infographic.findUnique({ where: { id } })

    if (!infographic) {
      infographic = await db.infographic.findUnique({ where: { slug: id } })
    }

    if (!infographic) {
      return NextResponse.json(
        { error: 'الإنفوغرافيك غير موجود' },
        { status: 404 }
      )
    }

    // Increment view count (non-blocking)
    db.infographic.update({
      where: { id: infographic.id },
      data: { views: { increment: 1 } },
    }).catch(() => { /* non-critical */ })

    // GOLDEN RULE: Check if image is valid
    // Pollinations URLs ARE valid — don't flag them as missing
    const hasValidImage = isValidImageUrl(infographic.imageUrl)

    return NextResponse.json({
      success: true,
      data: {
        ...infographic,
        tags: typeof infographic.tags === 'string' ? JSON.parse(infographic.tags) : infographic.tags,
        relatedSymbols: typeof infographic.relatedSymbols === 'string' ? JSON.parse(infographic.relatedSymbols) : infographic.relatedSymbols,
        hasValidImage,
        isPollinationsImage: isPollinationsUrl(infographic.imageUrl),
      },
    })
  } catch (error: any) {
    console.error('[infographics/[id] GET] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في جلب الإنفوغرافيك' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/infographics/[id]
 *
 * Update an infographic (e.g., fix image URL, change status).
 * GOLDEN RULE (V5): Pollinations URLs are accepted as valid imageUrl values.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()

    const { id } = await params
    const body = await request.json()

    // Verify infographic exists
    const existing = await db.infographic.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الإنفوغرافيك غير موجود' },
        { status: 404 }
      )
    }

    // Build update data — only allow specific fields
    const updateData: any = {}
    if (body.titleAr !== undefined) updateData.titleAr = body.titleAr
    if (body.titleEn !== undefined) updateData.titleEn = body.titleEn
    if (body.contentAr !== undefined) updateData.contentAr = body.contentAr
    if (body.contentEn !== undefined) updateData.contentEn = body.contentEn
    if (body.summaryAr !== undefined) updateData.summaryAr = body.summaryAr
    if (body.summaryEn !== undefined) updateData.summaryEn = body.summaryEn
    if (body.category !== undefined) updateData.category = body.category
    if (body.categoryAr !== undefined) updateData.categoryAr = body.categoryAr
    if (body.tags !== undefined) updateData.tags = JSON.stringify(body.tags)
    if (body.relatedSymbols !== undefined) updateData.relatedSymbols = JSON.stringify(body.relatedSymbols)

    // Image fields — Pollinations URLs are accepted
    if (body.imageUrl !== undefined) {
      updateData.imageUrl = body.imageUrl
      updateData.imageSource = isPollinationsUrl(body.imageUrl) ? 'pollinations' : 'r2'
    }
    if (body.imagePrompt !== undefined) updateData.imagePrompt = body.imagePrompt

    // Status
    if (body.status !== undefined) {
      updateData.status = body.status
      if (body.status === 'PUBLISHED' && !existing.publishedAt) {
        updateData.publishedAt = new Date()
      }
    }

    const updated = await db.infographic.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        slug: updated.slug,
        titleAr: updated.titleAr,
        imageUrl: updated.imageUrl,
        imageSource: updated.imageSource,
        status: updated.status,
        hasValidImage: isValidImageUrl(updated.imageUrl),
      },
    })
  } catch (error: any) {
    console.error('[infographics/[id] PATCH] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في تحديث الإنفوغرافيك' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/infographics/[id]
 *
 * Archive (soft-delete) an infographic.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureDbReady()

    const { id } = await params

    const existing = await db.infographic.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json(
        { error: 'الإنفوغرافيك غير موجود' },
        { status: 404 }
      )
    }

    // Soft delete — archive instead of hard delete
    const archived = await db.infographic.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    })

    return NextResponse.json({
      success: true,
      message: 'تم أرشفة الإنفوغرافيك',
    })
  } catch (error: any) {
    console.error('[infographics/[id] DELETE] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في حذف الإنفوغرافيك' },
      { status: 500 }
    )
  }
}
