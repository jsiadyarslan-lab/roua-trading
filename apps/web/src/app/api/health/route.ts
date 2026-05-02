import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint — no auth required.
 * Proxies to the NestJS backend health check.
 */
export async function GET() {
  const start = Date.now();
  const apiTarget = process.env.API_INTERNAL_URL || 'http://localhost:3001';

  const checks: Record<string, { status: string; latencyMs?: number; detail?: string }> = {};

  // Check NestJS API health
  try {
    const apiStart = Date.now();
    const apiResponse = await fetch(`${apiTarget}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (apiResponse.ok) {
      const apiData = await apiResponse.json();
      checks.api = { status: 'ok', latencyMs: Date.now() - apiStart, detail: JSON.stringify(apiData.checks || {}) };
    } else {
      checks.api = { status: 'error', latencyMs: Date.now() - apiStart, detail: `HTTP ${apiResponse.status}` };
    }
  } catch (error: any) {
    checks.api = { status: 'error', detail: error.message?.substring(0, 100) || 'API unreachable' };
  }

  // Memory check
  const mem = process.memoryUsage();
  const memMB = Math.round(mem.heapUsed / 1024 / 1024);
  checks.memory = {
    status: memMB > 512 ? 'warning' : 'ok',
    detail: `${memMB}MB heap used`,
  };

  const allOk = Object.values(checks).every(c => c.status === 'ok');
  const statusCode = allOk ? 200 : 503;

  return NextResponse.json(
    {
      status: allOk ? 'ok' : 'degraded',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      checks,
      responseTimeMs: Date.now() - start,
    },
    { status: statusCode },
  );
}
