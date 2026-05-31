import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const results: Record<string, any> = {};
  
  // Test 1: Check env vars
  results.apiInternalUrl = process.env.API_INTERNAL_URL || 'NOT SET';
  results.port = process.env.PORT || 'NOT SET';
  results.apiPort = process.env.API_PORT || 'NOT SET';
  results.nodeEnv = process.env.NODE_ENV || 'NOT SET';
  
  // Test 2: Try connecting to NestJS at different addresses
  const targets = [
    'http://127.0.0.1:3001',
    'http://localhost:3001',
    'http://0.0.0.0:3001',
  ];
  
  for (const target of targets) {
    try {
      const start = Date.now();
      const response = await fetch(`${target}/api/health`, {
        signal: AbortSignal.timeout(10000), // 10s timeout
      });
      const data = await response.text();
      results[`test_${target.replace(/[:/]/g, '_')}`] = {
        status: response.status,
        latencyMs: Date.now() - start,
        body: data.substring(0, 500),
      };
    } catch (error: any) {
      results[`test_${target.replace(/[:/]/g, '_')}`] = {
        error: error.message?.substring(0, 200) || String(error),
        cause: error.cause?.message || undefined,
      };
    }
  }
  
  return NextResponse.json(results, { status: 200 });
}
