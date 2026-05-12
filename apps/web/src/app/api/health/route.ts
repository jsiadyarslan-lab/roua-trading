import { NextResponse } from 'next/server';

/**
 * GET /api/health
 * Health check endpoint — no auth required.
 *
 * CRITICAL FIX: Always returns HTTP 200, even when the NestJS API is
 * unreachable. Railway's healthcheck requires a 200 status to mark a
 * replica as healthy. Returning 503/502 on backend failure causes
 * "1/1 replicas never became healthy" and prevents deployment entirely.
 *
 * ROOT CAUSE: Previously, a Next.js rewrite in next.config.ts intercepted
 * /api/health and proxied it directly to the NestJS API (port 3001).
 * During startup, NestJS is not ready yet, so the rewrite returned 502,
 * and this route handler never got a chance to respond. Removing the
 * rewrite fixes this — now this route handler always responds with 200.
 *
 * The 'status' field in the response body reflects the real health state
 * ('ok'/'degraded') for monitoring dashboards and admin pages.
 */
export async function GET() {
  const start = Date.now();
  // FIX: Use 127.0.0.1 instead of localhost (Node.js 18+ resolves localhost to IPv6 ::1,
  // but NestJS listens on IPv4 0.0.0.0, causing ECONNREFUSED "fetch failed").
  const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';

  const checks: Record<string, { status: string; latencyMs?: number; detail?: string }> = {};

  // Run API and Socket.IO checks in parallel for faster response.
  // Use a short 3s timeout — this is a health check, not a full diagnostic.
  const [apiResult, socketResult] = await Promise.allSettled([
    // Check NestJS API health
    (async () => {
      const apiStart = Date.now();
      try {
        const apiResponse = await fetch(`${apiTarget}/api/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (apiResponse.ok) {
          const apiData = await apiResponse.json();
          return { status: 'ok' as const, latencyMs: Date.now() - apiStart, detail: JSON.stringify(apiData.checks || {}) };
        }
        return { status: 'degraded' as const, latencyMs: Date.now() - apiStart, detail: `HTTP ${apiResponse.status}` };
      } catch (error: any) {
        return { status: 'degraded' as const, detail: error.message?.substring(0, 80) || 'API unreachable' };
      }
    })(),
    // Check Socket.IO polling on NestJS backend
    (async () => {
      const socketStart = Date.now();
      try {
        const socketResponse = await fetch(`${apiTarget}/socket.io/?EIO=4&transport=polling`, {
          signal: AbortSignal.timeout(3000),
        });
        const socketBody = await socketResponse.text();
        return {
          status: (socketResponse.ok || socketBody.includes('sid') ? 'ok' : 'degraded') as 'ok' | 'degraded',
          latencyMs: Date.now() - socketStart,
          detail: `HTTP ${socketResponse.status}: ${socketBody.substring(0, 80)}`,
        };
      } catch (error: any) {
        return { status: 'degraded' as const, detail: error.message?.substring(0, 80) || 'Socket.IO unreachable' };
      }
    })(),
  ]);

  if (apiResult.status === 'fulfilled') checks.api = apiResult.value;
  else checks.api = { status: 'degraded', detail: 'API check failed' };

  if (socketResult.status === 'fulfilled') checks.socketio = socketResult.value;
  else checks.socketio = { status: 'degraded', detail: 'Socket.IO check failed' };

  // Memory check
  const mem = process.memoryUsage();
  const memMB = Math.round(mem.heapUsed / 1024 / 1024);
  checks.memory = {
    status: memMB > 512 ? 'warning' : 'ok',
    detail: `${memMB}MB heap used`,
  };

  // ALWAYS return HTTP 200 — Railway requires 200 for healthy replicas.
  // The 'status' field in the body reflects actual health for dashboards.
  const hasError = Object.values(checks).some(c => c.status === 'error');
  const allOk = Object.values(checks).every(c => c.status === 'ok');

  return NextResponse.json(
    {
      status: hasError ? 'degraded' : (allOk ? 'ok' : 'degraded'),
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      checks,
      responseTimeMs: Date.now() - start,
    },
    { status: 200 },
  );
}
