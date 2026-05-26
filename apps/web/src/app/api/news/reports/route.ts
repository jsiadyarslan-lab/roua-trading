import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/news/reports
 * Fetch published reports from Roua News site
 * Supports French pipeline via lang=fr parameter
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || '';
    const limit = searchParams.get('limit') || '20';
    const lang = searchParams.get('lang') || 'ar';

    const newsSiteUrl = process.env.NEWS_SITE_URL || 'https://rouatradingnews-production.up.railway.app';
    const integrationKey = process.env.INTEGRATION_API_KEY;

    // ── French pipeline: use dedicated /api/fr/reports endpoint ──
    if (lang === 'fr') {
      try {
        const frParams = new URLSearchParams({ limit });
        if (type) frParams.set('type', type);

        const frUrl = `${newsSiteUrl}/api/fr/reports?${frParams.toString()}`;
        console.log('[news/reports] Fetching French pipeline:', frUrl);

        const frRes = await fetch(frUrl, {
          headers: {},
          signal: AbortSignal.timeout(15000),
        });

        console.log('[news/reports] French pipeline response status:', frRes.status);

        if (frRes.ok) {
          const frData = await frRes.json();
          const rawReports = frData.reports || frData.news || [];
          console.log('[news/reports] French pipeline reports count:', rawReports.length);

          if (rawReports.length > 0) {
            const reports = rawReports.map((report: any) => {
              let resolvedImageUrl: string | null = null;
              if (report.imageUrl && !report.imageUrl.startsWith('/')) {
                resolvedImageUrl = report.imageUrl;
              } else if (report.id) {
                resolvedImageUrl = `${newsSiteUrl}/api/article-image/${report.id}`;
              } else if (report.imageUrl) {
                resolvedImageUrl = `${newsSiteUrl}${report.imageUrl}`;
              }

              return {
                ...report,
                imageUrl: resolvedImageUrl,
                siteUrl: report.slug ? `${newsSiteUrl}/fr/reports/${report.slug}` : null,
                lang: 'fr',
              };
            });

            return NextResponse.json({
              success: true,
              data: reports,
              count: reports.length,
              source: 'roua-news-fr',
              lang: 'fr',
            });
          }
        }
        console.warn('[news/reports] French pipeline returned no data, trying fallback');
      } catch (frErr: any) {
        console.error('[news/reports] French pipeline error:', frErr?.message || frErr);
      }
    }

    // ── Standard pipeline (Arabic/English) ──
    if (!integrationKey) {
      return NextResponse.json(
        { success: false, error: 'Integration key not configured', data: [], count: 0 },
        { status: 500 },
      );
    }

    try {
      const params = new URLSearchParams({ limit });
      if (type) params.set('type', type);

      const res = await fetch(`${newsSiteUrl}/api/integration/reports?${params.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-Integration-Key': integrationKey,
        },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return NextResponse.json(
          { success: false, error: 'Failed to fetch reports from news site', data: [], count: 0 },
          { status: 502 },
        );
      }

      const data = await res.json();
      const rawReports = data.reports || [];

      const reports = rawReports.map((report: any) => {
        let resolvedImageUrl: string | null = null;
        if (report.id) {
          resolvedImageUrl = `${newsSiteUrl}/api/article-image/${report.id}`;
        } else if (report.imageUrl) {
          resolvedImageUrl = report.imageUrl.startsWith('/') ? `${newsSiteUrl}${report.imageUrl}` : report.imageUrl;
        }

        return {
          ...report,
          imageUrl: resolvedImageUrl,
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
      console.error('[news/reports] Standard pipeline error:', error?.message || error);
      return NextResponse.json(
        { success: false, error: `خطأ في جلب التقارير: ${error.message}`, data: [], count: 0 },
        { status: 502 },
      );
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: `خطأ في جلب التقارير: ${error.message}`, data: [], count: 0 },
      { status: 502 },
    );
  }
}
