import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/integrity?html=1
 *
 * Data sync diagnostic — checks iOS ↔ Backend data layer integrity.
 * No auth required — only checks endpoint existence and response shapes.
 *
 * ?html=1  → Returns a styled HTML page you can open in any browser
 * (default) → Returns JSON
 */
export async function GET(request: NextRequest) {
  const apiTarget = process.env.API_INTERNAL_URL || 'http://127.0.0.1:3001';
  const wantHtml = request.nextUrl.searchParams.get('html') === '1';

  // ── Endpoints to check ──────────────────────────────────────
  const endpoints = [
    { name: 'Portfolio Summary', iosOld: '/trading/v2/portfolio', actual: '/trading/portfolio', model: 'PortfolioSummary', critical: true },
    { name: 'Agent Positions', iosOld: '/trading/v2/positions', actual: '/trading/positions', model: 'PositionSummary', critical: true },
    { name: 'Position Summary V1', path: '/trading/positions/summary', model: 'PositionSummary', critical: false },
    { name: 'Portfolio Credentials', path: '/portfolio/credentials', critical: false },
    { name: 'Portfolio Balances', path: '/portfolio/credentials/balances', model: 'Balances', critical: true },
    { name: 'Sanctuary Risk', path: '/portfolio/sanctuary', model: 'RiskReport', critical: false },
    { name: 'Trading Account', path: '/trading/account', critical: false },
    { name: 'Auth Me', path: '/auth/me', critical: true },
    { name: 'Agent Status', path: '/agent/trader/status', critical: false },
    { name: 'Agent Performance', path: '/agent/trader/performance', model: 'PerformanceMetrics', critical: false },
  ];

  // ── iOS CodingKey reference ─────────────────────────────────
  const iosModels: Record<string, Record<string, { codingKey: string; note?: string }>> = {
    PortfolioSummary: {
      totalBalance: { codingKey: 'totalBalance' },
      dailyPnL: { codingKey: 'dailyPnL' },
      dailyPnLPercent: { codingKey: 'dailyPnLPercent' },
      totalExposure: { codingKey: 'totalExposure' },
      marginUsed: { codingKey: 'usedMargin', note: 'Swift name ≠ CodingKey' },
      openPositionsCount: { codingKey: 'openPositionsCount' },
      maxDrawdownPercent: { codingKey: 'maxDrawdownPercent' },
      unrealizedPnl: { codingKey: 'unrealizedPnL', note: 'Capital L' },
      positions: { codingKey: 'positions' },
      availableBalance: { codingKey: 'availableBalance' },
      totalPnl: { codingKey: 'totalPnl' },
      totalPnlPct: { codingKey: 'totalPnlPct' },
      marginAvailable: { codingKey: 'marginAvailable' },
    },
    Position: {
      id: { codingKey: 'id' }, symbol: { codingKey: 'symbol' },
      side: { codingKey: 'side' }, entryPrice: { codingKey: 'entryPrice' },
      currentPrice: { codingKey: 'currentPrice' }, quantity: { codingKey: 'quantity' },
      unrealizedPnl: { codingKey: 'unrealizedPnL', note: 'Capital L' },
      stopLoss: { codingKey: 'stopLoss' }, takeProfit: { codingKey: 'takeProfit' },
      leverage: { codingKey: 'leverage' }, margin: { codingKey: 'margin' },
      openedAt: { codingKey: 'openedAt' }, closedAt: { codingKey: 'closedAt' },
      status: { codingKey: 'status', note: 'Defaults .open' },
    },
    PositionSummary: {
      totalUnrealizedPnl: { codingKey: 'totalUnrealizedPnl', note: 'lowercase L' },
      totalPositionValue: { codingKey: 'totalValue', note: 'Swift name ≠ CodingKey' },
      positionCount: { codingKey: 'totalPositions', note: 'Swift name ≠ CodingKey' },
      positions: { codingKey: 'positions' },
    },
    RiskReport: {
      summary: { codingKey: 'summary' },
      overallRisk: { codingKey: 'riskScore', note: 'Swift name ≠ CodingKey' },
      positionConcentration: { codingKey: 'concentrationRisk', note: 'Swift name ≠ CodingKey' },
      leverageExposure: { codingKey: 'largestPositionWeight', note: 'Swift name ≠ CodingKey' },
      liquidityRisk: { codingKey: 'varEstimate', note: 'Swift name ≠ CodingKey' },
    },
    PerformanceMetrics: {
      totalPnl: { codingKey: 'totalPnL', note: 'Capital L' },
      avgWin: { codingKey: 'averageWin', note: 'Swift name ≠ CodingKey' },
      avgLoss: { codingKey: 'averageLoss', note: 'Swift name ≠ CodingKey' },
    },
  };

  // ── Test each endpoint ──────────────────────────────────────
  const results: any[] = [];

  for (const ep of endpoints) {
    const path = ep.path || ep.actual!;
    const oldPath = ep.iosOld;
    const routeFixed = !!oldPath && oldPath !== ep.actual;

    let status = 0;
    let latency = 0;
    let responseData: any = null;
    let responseFields: string[] = [];
    let fieldMismatches: { swift: string; expected: string; note?: string }[] = [];

    const start = Date.now();
    try {
      const res = await fetch(`${apiTarget}/api${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      status = res.status;
      latency = Date.now() - start;

      if (res.ok) {
        const json = await res.json();
        responseData = json;

        // Unwrap envelope { success, data } or { data }
        let dataObj = json;
        if (json && typeof json === 'object') {
          if (json.success && json.data !== undefined) dataObj = json.data;
          else if (json.data !== undefined && !json.success) dataObj = json.data;
        }

        if (dataObj && typeof dataObj === 'object' && !Array.isArray(dataObj)) {
          responseFields = Object.keys(dataObj);

          // Check CodingKey mismatches for the model
          const modelDef = iosModels[ep.model || ''];
          if (modelDef) {
            for (const [swiftProp, info] of Object.entries(modelDef)) {
              if (!(info.codingKey in dataObj)) {
                fieldMismatches.push({ swift: swiftProp, expected: info.codingKey, note: info.note });
              }
            }
          }
        }
      }
    } catch (e: any) {
      status = 0;
      latency = Date.now() - start;
    }

    // Also test old iOS path if it existed (to confirm 404)
    let oldStatus: number | null = null;
    if (oldPath) {
      try {
        const oldRes = await fetch(`${apiTarget}/api${oldPath}`, {
          signal: AbortSignal.timeout(3000),
        });
        oldStatus = oldRes.status;
      } catch { oldStatus = 0; }
    }

    results.push({
      name: ep.name,
      path,
      oldPath,
      oldStatus,
      routeFixed,
      status,
      latency,
      critical: ep.critical,
      model: ep.model,
      fieldMismatches,
      responseFields,
      responseData,
    });
  }

  const okCount = results.filter(r => r.status >= 200 && r.status < 300).length;
  const errorCount = results.filter(r => r.status >= 400 || r.status === 0).length;
  const routeFixes = results.filter(r => r.routeFixed).length;
  const allMismatches = results.flatMap(r => r.fieldMismatches.map(m => ({ endpoint: r.name, ...m })));

  // ── HTML output ─────────────────────────────────────────────
  if (wantHtml) {
    const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Roua Data Integrity</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0B0E14;color:#F1F5F9;padding:24px;max-width:1100px;margin:0 auto}
h1{color:#10B981;margin-bottom:4px;font-size:1.5rem}
.sub{color:#94A3B8;margin-bottom:24px;font-size:.85rem}
.stats{display:flex;gap:20px;margin-bottom:24px;flex-wrap:wrap}
.stat{background:#1A1D29;border:1px solid #2D3348;border-radius:10px;padding:16px 24px;text-align:center;min-width:100px}
.stat .n{font-size:2rem;font-weight:700}
.stat .l{color:#94A3B8;font-size:.75rem;margin-top:4px}
.ok{color:#10B981}.err{color:#EF4444}.warn{color:#F59E0B}.fix{color:#3B82F6}
.tbl{width:100%;border-collapse:collapse;background:#1A1D29;border-radius:10px;overflow:hidden;margin-bottom:24px}
.tbl th{background:#242838;padding:10px 14px;text-align:left;color:#94A3B8;font-size:.8rem;text-transform:uppercase;letter-spacing:.5px}
.tbl td{padding:10px 14px;border-top:1px solid #2D3348;font-size:.85rem}
.tbl tr:hover{background:rgba(255,255,255,.02)}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;font-size:.72rem;font-weight:600}
.b-ok{background:rgba(16,185,129,.15);color:#10B981}.b-err{background:rgba(239,68,68,.15);color:#EF4444}
.b-warn{background:rgba(245,158,11,.15);color:#F59E0B}.b-fix{background:rgba(59,130,246,.15);color:#3B82F6}
.crit{color:#EF4444;font-weight:600}
.mismatch{background:rgba(239,68,68,.08);border-left:3px solid #EF4444;padding:8px 14px;margin:4px 0;border-radius:4px;font-size:.82rem}
.mismatch code{color:#F87171;font-family:monospace}
.mismatch .expected{color:#F59E0B;font-family:monospace}
.code{font-family:'SF Mono',monospace;font-size:.82rem;color:#60A5FA}
.detail-box{background:#0B0E14;border:1px solid #2D3348;border-radius:8px;padding:12px;margin-top:8px;max-height:200px;overflow:auto;font-family:monospace;font-size:.75rem;color:#94A3B8;white-space:pre-wrap;word-break:break-all}
</style></head><body>
<h1>Roua Data Integrity Check</h1>
<p class="sub">iOS ↔ Backend data sync diagnostic | ${new Date().toISOString()}</p>

<div class="stats">
  <div class="stat"><div class="n ${okCount > 0 ? 'ok' : 'err'}">${okCount}/${results.length}</div><div class="l">Endpoints OK</div></div>
  <div class="stat"><div class="n err">${errorCount}</div><div class="l">Errors</div></div>
  <div class="stat"><div class="n fix">${routeFixes}</div><div class="l">Route Fixes Applied</div></div>
  <div class="stat"><div class="n warn">${allMismatches.length}</div><div class="l">Field Mismatches</div></div>
</div>

<table class="tbl">
<tr><th>Endpoint</th><th>Path</th><th>Status</th><th>Latency</th><th>Model</th><th>Fields</th><th>Issues</th></tr>
${results.map(r => {
  const statusClass = r.status >= 200 && r.status < 300 ? 'b-ok' : r.status >= 400 ? 'b-err' : 'b-warn';
  const statusText = r.status === 0 ? 'DOWN' : r.status;
  const critMark = r.critical ? '⚡' : '';
  const fixMark = r.routeFixed ? ' <span class="badge b-fix">FIXED</span>' : '';
  const oldInfo = r.oldPath ? `<br><span style="color:#64748B;font-size:.72rem">was: ${r.oldPath} → ${r.oldStatus || 'N/A'}</span>` : '';
  const mismatchHtml = r.fieldMismatches.length > 0
    ? r.fieldMismatches.map((m: any) => `<div class="mismatch">❌ iOS <code>${m.swift}</code> expects <code class="expected">${m.expected}</code> — missing in response${m.note ? ` (${m.note})` : ''}</div>`).join('')
    : '';
  const fieldCount = r.responseFields.length > 0 ? `${r.responseFields.length} fields` : '—';
  return `<tr>
    <td>${critMark} ${r.name}${fixMark}</td>
    <td><span class="code">${r.path}</span>${oldInfo}</td>
    <td><span class="badge ${statusClass}">${statusText}</span></td>
    <td>${r.latency}ms</td>
    <td>${r.model || '—'}</td>
    <td>${fieldCount}</td>
    <td>${mismatchHtml || '<span class="ok">✓</span>'}</td>
  </tr>`;
}).join('')}
</table>

${allMismatches.length > 0 ? `
<h2 style="color:#F59E0B;font-size:1.1rem;margin-bottom:12px">Field Mismatches Detail</h2>
${allMismatches.map(m => `<div class="mismatch"><strong>${m.endpoint}</strong>: iOS <code>${m.swift}</code> → expects JSON key <code class="expected">${m.expected}</code>${m.note ? ` <span style="color:#94A3B8">(${m.note})</span>` : ''}</div>`).join('')}
` : ''}

${results.filter(r => r.responseData && r.status >= 200 && r.status < 300).map(r => `
<details style="margin-bottom:8px">
  <summary style="color:#60A5FA;cursor:pointer;font-size:.85rem">${r.name} — Response</summary>
  <div class="detail-box">${JSON.stringify(r.responseData, null, 2)}</div>
</details>
`).join('')}

</body></html>`;
    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // ── JSON output ─────────────────────────────────────────────
  return NextResponse.json({
    timestamp: new Date().toISOString(),
    summary: { total: results.length, ok: okCount, errors: errorCount, routeFixes, fieldMismatches: allMismatches.length },
    fixes: [
      { what: 'iOS /trading/v2/portfolio → /trading/portfolio', status: 'APPLIED', reason: 'Backend @Controller("trading") has @Get("portfolio"), not @Get("v2/portfolio")' },
      { what: 'iOS /trading/v2/positions → /trading/positions', status: 'APPLIED', reason: 'Backend @Controller("trading") has @Get("positions"), not @Get("v2/positions")' },
    ],
    endpoints: results,
    mismatches: allMismatches,
  });
}
