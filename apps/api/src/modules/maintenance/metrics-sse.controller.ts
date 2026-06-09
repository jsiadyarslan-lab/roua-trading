// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Metrics SSE Controller
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// #21: Real-time system metrics via Server-Sent Events (SSE).
// Clients connect to GET /api/metrics/stream and receive
// system health updates every 5 seconds.
// One-shot snapshot available at GET /api/metrics.

import { Controller, Sse, Get, UseGuards, Req } from '@nestjs/common';
import { Observable, interval } from 'rxjs';
import { map } from 'rxjs/operators';
import { AuthGuard } from '../../common/guards/auth.guard';
import { SystemMetricsService } from '../../common/middleware/system-metrics.service';

/**
 * Metrics SSE Controller — Real-time system metrics via Server-Sent Events
 *
 * #21 FIX: Provides a real-time metrics stream for the frontend dashboard.
 * Clients connect to GET /api/metrics/stream and receive updates every 5 seconds.
 *
 * Endpoints:
 * - GET /api/metrics/stream — SSE endpoint, pushes metrics every 5s
 * - GET /api/metrics        — One-shot metrics snapshot
 *
 * Both endpoints require authentication via AuthGuard.
 */
@Controller('metrics')
@UseGuards(AuthGuard)
export class MetricsSseController {
  constructor(private readonly metricsService: SystemMetricsService) {}

  /**
   * GET /api/metrics/stream — SSE endpoint for real-time metrics
   *
   * Sends system metrics (CPU, memory, API latency percentiles,
   * event loop lag) every 5 seconds to connected clients.
   *
   * Usage from frontend:
   *   const es = new EventSource('/api/metrics/stream', { withCredentials: true });
   *   es.onmessage = (e) => { const metrics = JSON.parse(e.data); ... };
   */
  @Sse('stream')
  streamMetrics(@Req() _req: any): Observable<MessageEvent> {
    return interval(5000).pipe(
      map(() => ({
        data: JSON.stringify(this.metricsService.getMetrics()),
      } as MessageEvent)),
    );
  }

  /**
   * GET /api/metrics — One-shot metrics snapshot
   *
   * Returns current system metrics without SSE connection.
   * Useful for initial page load before establishing SSE stream,
   * or for monitoring scripts that poll periodically.
   */
  @Get()
  getMetrics() {
    return this.metricsService.getMetrics();
  }
}
