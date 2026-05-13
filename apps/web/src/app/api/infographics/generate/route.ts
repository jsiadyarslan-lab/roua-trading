import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureDbReady } from '@/lib/db'
import { generateInfographicImage, isValidImageUrl } from '@/lib/image-gen'

export const dynamic = 'force-dynamic'

/**
 * POST /api/infographics/generate
 *
 * Generate a new infographic with AI content and image.
 * The image is generated via Pollinations (or R2 if available).
 * Pollinations URLs are accepted as valid image sources.
 */
export async function POST(request: NextRequest) {
  try {
    await ensureDbReady()

    const body = await request.json()
    const { titleAr, titleEn, contentAr, contentEn, category, categoryAr, tags, relatedSymbols, imagePrompt, aiModel, confidence } = body

    if (!titleAr || !contentAr) {
      return NextResponse.json(
        { error: 'العنوان والمحتوى بالعربية مطلوبان' },
        { status: 400 }
      )
    }

    // Generate slug from Arabic title
    const slug = titleAr
      .replace(/[^\u0600-\u06FFa-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 80) + '-' + Date.now().toString(36)

    // Generate image via Pollinations/R2
    const prompt = imagePrompt || `Financial infographic about: ${titleAr}. Professional dark theme, data visualization, charts and graphs, modern design, emerald green and gold accents on dark background`
    const imageResult = await generateInfographicImage({ prompt })

    // Create infographic record
    const infographic = await db.infographic.create({
      data: {
        slug,
        titleAr,
        titleEn: titleEn || null,
        contentAr,
        contentEn: contentEn || null,
        category: category || 'general',
        categoryAr: categoryAr || null,
        tags: tags ? JSON.stringify(tags) : '[]',
        relatedSymbols: relatedSymbols ? JSON.stringify(relatedSymbols) : '[]',
        imageUrl: imageResult.imageUrl,
        imagePrompt: prompt,
        imageSource: imageResult.imageSource,
        aiModel: aiModel || null,
        confidence: confidence || 0,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    })

    return NextResponse.json({
      success: true,
      infographic: {
        id: infographic.id,
        slug: infographic.slug,
        titleAr: infographic.titleAr,
        imageUrl: infographic.imageUrl,
        imageSource: infographic.imageSource,
        status: infographic.status,
      },
    })
  } catch (error: any) {
    console.error('[infographics/generate] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في إنشاء الإنفوغرافيك', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/infographics/generate
 *
 * List all published infographics.
 */
export async function GET(request: NextRequest) {
  try {
    await ensureDbReady()

    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category')
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')

    const where: any = { status: 'PUBLISHED' }
    if (category) where.category = category

    const [infographics, total] = await Promise.all([
      db.infographic.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true,
          slug: true,
          titleAr: true,
          titleEn: true,
          summaryAr: true,
          summaryEn: true,
          category: true,
          categoryAr: true,
          imageUrl: true,
          imageSource: true,
          confidence: true,
          views: true,
          likes: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      db.infographic.count({ where }),
    ])

    return NextResponse.json({
      success: true,
      data: infographics,
      total,
      limit,
      offset,
    })
  } catch (error: any) {
    console.error('[infographics/generate GET] Error:', error.message)
    return NextResponse.json(
      { error: 'فشل في جلب الإنفوغرافيك' },
      { status: 500 }
    )
  }
}
