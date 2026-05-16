import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/news/reports
 * Fetch published reports from Roua News site
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || '';
    const limit = searchParams.get('limit') || '20';

    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    if (!integrationKey) {
      return NextResponse.json(
        { success: false, error: 'Integration key not configured', data: [], count: 0 },
        { status: 500 },
      );
    }

    const params = new URLSearchParams({ limit });
    if (type) params.set('type', type);

    const res = await fetch(`${newsSiteUrl}/api/integration/reports?${params.toString()}`, {
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Key': integrationKey,
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch reports from news site', data: [], count: 0 },
        { status: 502 },
      );
    }

    const data = await res.json();
    const rawReports = data.reports || [];

    // Resolve image URLs and add site links
    const reports = rawReports.map((report: any) => {
      // Resolve image URL
      let resolvedImageUrl: string | null = null;
      if (report.imageUrl) {
        if (report.imageUrl.startsWith('http')) {
          resolvedImageUrl = report.imageUrl;
        } else if (report.imageUrl.startsWith('/')) {
          resolvedImageUrl = `${newsSiteUrl}${report.imageUrl}`;
        } else {
          resolvedImageUrl = report.imageUrl;
        }
      } else if (report.id) {
        // Fallback: use the article image endpoint
        resolvedImageUrl = `${newsSiteUrl}/api/article-image/${report.id}`;
      }

      return {
        ...report,
        imageUrl: resolvedImageUrl,
        // Link to the report on the news site
        siteUrl: report.slug ? `${newsSiteUrl}/reports/${report.slug}` : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: reports,
      count: reports.length,
      source: 'roua-news',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ في جلب التقارير: ${error.message}`, data: [], count: 0 },
      { status: 502 },
    );
  }
}
