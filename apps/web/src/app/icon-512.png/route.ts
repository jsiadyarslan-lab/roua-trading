import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// PWA Icon Route Handler — serves /icon-512.png directly
// This bypasses next-intl middleware locale redirect (307 → /ar/icon-512.png)
// Next.js route handlers take precedence over middleware redirects

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'icon-512.png');
    const data = await readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
