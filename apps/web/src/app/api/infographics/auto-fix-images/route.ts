import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbReady } from '@/lib/db'
import { fixImageUrl, isValidImageUrl, isPollinationsUrl } from '@/lib/image-gen'

export const dynamic = 'force-dynamic'

/**
 * POST /api/infographics/auto-fix-images
 *
 * PUBLIC endpoint (no admin auth required) to fix infographics with missing or broken images.
 * Scans all published infographics, finds those with invalid imageUrl,
 * and regenerates them via Pollinations.
 *
 * V5 FIX: Pollinations URLs are now treated as valid.
 * Only truly missing/invalid images will be fixed.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDbReady()

    const body = await request.json().catch(() => ({}))
    const limit = Math.min(body.limit || 50, 200)

    // Find all published infographics
    const infographics = await db.infographic.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        titleAr: true,
        imageUrl: true,
        imagePrompt: true,
        imageSource: true,
      },
      take: limit,
    })

    const results: Array<{
      id: string
      slug: string
      status: 'already_valid' | 'fixed' | 'failed'
      oldUrl: string | null
      newUrl: string | null
      error?: string
    }> = []

    let fixedCount = 0
    let validCount = 0
    let failedCount = 0

    for (const infographic of infographics) {
      // Check if current image URL is valid
      // GOLDEN RULE: Pollinations URLs ARE valid
      if (isValidImageUrl(infographic.imageUrl)) {
        results.push({
          id: infographic.id,
          slug: infographic.slug,
          status: 'already_valid',
          oldUrl: infographic.imageUrl,
          newUrl: infographic.imageUrl,
        })
        validCount++
        continue
      }

      // Image is missing/invalid — fix it
      const prompt = infographic.imagePrompt ||
        `Financial infographic about: ${infographic.titleAr}. Professional dark theme, data visualization, charts, emerald green and gold accents on dark background`

      try {
        const fixResult = await fixImageUrl(infographic.imageUrl, prompt)

        if (fixResult.success && fixResult.imageUrl) {
          // Update the database
          await db.infographic.update({
            where: { id: infographic.id },
            data: {
              imageUrl: fixResult.imageUrl,
              imageSource: fixResult.imageSource,
            },
          })

          results.push({
            id: infographic.id,
            slug: infographic.slug,
            status: 'fixed',
            oldUrl: infographic.imageUrl,
            newUrl: fixResult.imageUrl,
          })
          fixedCount++
        } else {
          results.push({
            id: infographic.id,
            slug: infographic.slug,
            status: 'failed',
            oldUrl: infographic.imageUrl,
            newUrl: null,
            error: fixResult.error,
          })
          failedCount++
        }
      } catch (error: any) {
        results.push({
          id: infographic.id,
          slug: infographic.slug,
          status: 'failed',
          oldUrl: infographic.imageUrl,
          newUrl: null,
          error: error.message,
        })
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: infographics.length,
        alreadyValid: validCount,
        fixed: fixedCount,
        failed: failedCount,
      },
      results,
    })
  } catch (error: any) {
    console.error('[infographics/auto-fix-images] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في إصلاح الصور', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/infographics/auto-fix-images
 *
 * Check which infographics need image fixes (dry-run).
 * PUBLIC endpoint — no admin auth required.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    const infographics = await db.infographic.findMany({
      where: { status: 'PUBLISHED' },
      select: {
        id: true,
        slug: true,
        titleAr: true,
        imageUrl: true,
        imageSource: true,
      },
    })

    const needsFix = infographics.filter(ig => !isValidImageUrl(ig.imageUrl))
    const valid = infographics.filter(ig => isValidImageUrl(ig.imageUrl))
    const pollinationsCount = infographics.filter(ig => isPollinationsUrl(ig.imageUrl)).length

    return NextResponse.json({
      success: true,
      summary: {
        total: infographics.length,
        valid: valid.length,
        needsFix: needsFix.length,
        pollinationsCount,
      },
      needsFix: needsFix.map(ig => ({
        id: ig.id,
        slug: ig.slug,
        titleAr: ig.titleAr,
        imageUrl: ig.imageUrl,
        imageSource: ig.imageSource,
      })),
    })
  } catch (error: any) {
    console.error('[infographics/auto-fix-images GET] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في فحص الصور' },
      { status: 500 }
    )
  }
}
