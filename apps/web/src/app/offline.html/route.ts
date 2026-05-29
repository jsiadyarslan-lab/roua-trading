import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// PWA Offline Page Route Handler — serves /offline.html directly
// This bypasses next-intl middleware locale redirect

export async function GET() {
  try {
    const filePath = join(process.cwd(), 'public', 'offline.html');
    const data = await readFile(filePath);
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=0',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
