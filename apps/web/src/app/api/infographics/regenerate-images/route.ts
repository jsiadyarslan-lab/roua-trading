import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbReady } from '@/lib/db'
import { generateInfographicImage, isValidImageUrl, isPollinationsUrl } from '@/lib/image-gen'

export const dynamic = 'force-dynamic'

/**
 * POST /api/infographics/regenerate-images
 *
 * Regenerate images for infographics.
 * V5 FIX: Pollinations URLs are accepted as valid. When regenerating,
 * if R2 is not available, we use Pollinations direct URLs.
 *
 * Body:
 *   - ids?: string[] — Specific infographic IDs to regenerate (optional)
 *   - all?: boolean — Regenerate ALL published infographics (default: false)
 *   - force?: boolean — Force regeneration even if image is valid (default: false)
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDbReady()

    const body = await request.json().catch(() => ({}))
    const { ids, all = false, force = false } = body

    // Build where clause
    let where: any = { status: 'PUBLISHED' }
    if (ids && Array.isArray(ids) && ids.length > 0) {
      where = { id: { in: ids } }
    } else if (!all && !force) {
      // Default: only regenerate infographics with missing/invalid images
      where = {
        status: 'PUBLISHED',
        OR: [
          { imageUrl: null },
          { imageUrl: '' },
          { imageSource: 'none' },
        ],
      }
    }

    if (force) {
      // Force regeneration of ALL published infographics
      where = { status: 'PUBLISHED' }
    }

    const infographics = await db.infographic.findMany({
      where,
      select: {
        id: true,
        slug: true,
        titleAr: true,
        imageUrl: true,
        imagePrompt: true,
        imageSource: true,
      },
      take: 100,
    })

    const results: Array<{
      id: string
      slug: string
      status: 'skipped_valid' | 'regenerated' | 'failed'
      oldUrl: string | null
      newUrl: string | null
      error?: string
    }> = []

    let regeneratedCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const infographic of infographics) {
      // Skip if image is valid and not forced
      if (!force && isValidImageUrl(infographic.imageUrl)) {
        results.push({
          id: infographic.id,
          slug: infographic.slug,
          status: 'skipped_valid',
          oldUrl: infographic.imageUrl,
          newUrl: infographic.imageUrl,
        })
        skippedCount++
        continue
      }

      // Regenerate image
      const prompt = infographic.imagePrompt ||
        `Financial infographic about: ${infographic.titleAr}. Professional dark theme, data visualization, charts, emerald green and gold accents on dark background`

      try {
        const imageResult = await generateInfographicImage({ prompt })

        if (imageResult.success && imageResult.imageUrl) {
          // Update the database
          await db.infographic.update({
            where: { id: infographic.id },
            data: {
              imageUrl: imageResult.imageUrl,
              imageSource: imageResult.imageSource,
            },
          })

          results.push({
            id: infographic.id,
            slug: infographic.slug,
            status: 'regenerated',
            oldUrl: infographic.imageUrl,
            newUrl: imageResult.imageUrl,
          })
          regeneratedCount++
        } else {
          results.push({
            id: infographic.id,
            slug: infographic.slug,
            status: 'failed',
            oldUrl: infographic.imageUrl,
            newUrl: null,
            error: imageResult.error,
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

      // Rate limit: small delay between generations
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    return NextResponse.json({
      success: true,
      summary: {
        total: infographics.length,
        regenerated: regeneratedCount,
        skippedValid: skippedCount,
        failed: failedCount,
      },
      results,
    })
  } catch (error: any) {
    console.error('[infographics/regenerate-images] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في إعادة توليد الصور', details: error.message },
      { status: 500 }
    )
  }
}
