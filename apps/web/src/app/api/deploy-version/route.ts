import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * GET /api/deploy-version
 *
 * Deployment verification endpoint — lets us confirm which code version
 * is actually running on Railway. This is CRITICAL for debugging when
 * code changes don't seem to take effect.
 *
 * Returns:
 * - buildId: Next.js BUILD_ID (changes with every `next build`)
 * - deployCommit: Git commit SHA embedded by Dockerfile
 * - buildCache: Docker build cache version from Dockerfile
 * - nodeEnv: NODE_ENV
 * - uptime: Process uptime in seconds
 * - timestamp: Current server time
 */
let _buildId: string | null = null;
try {
  const fs = await import('fs');
  const path = await import('path');
  _buildId = fs.readFileSync(path.join(process.cwd(), '.next/BUILD_ID'), 'utf-8').trim();
} catch { _buildId = 'unknown'; }

export async function GET() {
  return NextResponse.json({
    buildId: _buildId,
    deployCommit: process.env.DEPLOY_COMMIT || 'unknown',
    buildCache: process.env.BUILD_CACHE || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'unknown',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    // Include a unique marker that changes with each deployment
    // so we can verify the code is actually updated
    deployMarker: 'ROUA-V157-ARG-FIX-MOBILE-V3-FLEXBOX',
  });
}
