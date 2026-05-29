import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PWA Icon & Asset Server Route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WHY: The next-intl middleware redirects /icon-192.png → /ar/icon-192.png
// which returns 404 and breaks PWA installation on ALL browsers.
// API routes (/api/...) bypass the middleware, so this route
// reliably serves PWA assets without locale redirects.
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ASSET_MAP: Record<string, { path: string; contentType: string; cacheMaxAge: number }> = {
  'icon-192.png': { path: 'icon-192.png', contentType: 'image/png', cacheMaxAge: 86400 },
  'icon-512.png': { path: 'icon-512.png', contentType: 'image/png', cacheMaxAge: 86400 },
  'logo-192.png': { path: 'logo-192.png', contentType: 'image/png', cacheMaxAge: 86400 },
  'logo-512.png': { path: 'logo-512.png', contentType: 'image/png', cacheMaxAge: 86400 },
  'favicon.ico': { path: 'favicon.ico', contentType: 'image/x-icon', cacheMaxAge: 86400 },
  'favicon.svg': { path: 'favicon.svg', contentType: 'image/svg+xml', cacheMaxAge: 86400 },
  'manifest.json': { path: 'manifest.json', contentType: 'application/json', cacheMaxAge: 0 },
  'offline.html': { path: 'offline.html', contentType: 'text/html', cacheMaxAge: 0 },
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const file = searchParams.get('file') || '';

  const asset = ASSET_MAP[file];
  if (!asset) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const filePath = join(process.cwd(), 'public', asset.path);
    const data = await readFile(filePath);

    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': asset.contentType,
        'Cache-Control': `public, max-age=${asset.cacheMaxAge}`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
