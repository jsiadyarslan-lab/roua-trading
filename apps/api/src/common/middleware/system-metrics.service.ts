// V178: System Metrics Service — API latency tracking, system health monitoring, event loop lag
import { Injectable } from '@nestjs/common';

// V178: Rolling window size — keep last 1000 request durations per endpoint
const ROLLING_WINDOW_SIZE = 1000;

// V178: Event loop lag sampling interval in milliseconds
const EVENT_LOOP_SAMPLE_INTERVAL_MS = 10_000;

// V178: Percentile keys we calculate from the rolling window
type PercentileKey = 'p50' | 'p95' | 'p99';

// V178: Shape of percentile results for a single endpoint
interface EndpointPercentiles {
  p50: number;
  p95: number;
  p99: number;
  count: number;
}

// V178: Shape of the full metrics object returned by getMetrics()
interface SystemMetricsResult {
  system: {
    cpuUsage: NodeJS.CpuUsage;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
      external: number;
    };
    uptime: number;
    activeHandles: number;
  };
  api: {
    endpoints: Record<string, EndpointPercentiles>;
  };
  eventLoopLag: number;
}

@Injectable()
export class SystemMetricsService {
  // V178: In-memory map of endpoint -> array of recorded durations (rolling window)
  private readonly latencyMap = new Map<string, number[]>();

  // V178: Current measured event loop lag in milliseconds
  private eventLoopLagMs = 0;

  // V178: Timer reference for the periodic event loop lag sampler
  private lagSamplerTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // V178: Start the event loop lag sampler on service instantiation
    this.startEventLoopLagSampler();
  }

  // V178: Record a request duration for the given endpoint, maintaining the rolling window
  recordRequest(endpoint: string, durationMs: number): void {
    let window = this.latencyMap.get(endpoint);

    if (!window) {
      window = [];
      this.latencyMap.set(endpoint, window);
    }

    window.push(durationMs);

    // V178: Trim to rolling window size — drop the oldest entries
    if (window.length > ROLLING_WINDOW_SIZE) {
      window.splice(0, window.length - ROLLING_WINDOW_SIZE);
    }
  }

  // V178: Return all collected metrics — system, api, and event loop lag
  getMetrics(): SystemMetricsResult {
    // V178: Gather current system-level metrics via Node.js process APIs
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptime = process.uptime();
    const activeHandles = (process as any)._getActiveHandles?.()?.length ?? 0;

    // V178: Build per-endpoint percentile summaries from the rolling windows
    const endpoints: Record<string, EndpointPercentiles> = {};
    for (const [endpoint, durations] of this.latencyMap.entries()) {
      endpoints[endpoint] = this.calculatePercentiles(durations);
    }

    return {
      system: {
        cpuUsage,
        memoryUsage: {
          heapUsed: mem.heapUsed,
          heapTotal: mem.heapTotal,
          rss: mem.rss,
          external: mem.external,
        },
        uptime,
        activeHandles,
      },
      api: {
        endpoints,
      },
      eventLoopLag: this.eventLoopLagMs,
    };
  }

  // V178: Clean up the lag sampler interval — call when the service is destroyed
  onModuleDestroy(): void {
    if (this.lagSamplerTimer) {
      clearInterval(this.lagSamplerTimer);
      this.lagSamplerTimer = null;
    }
  }

  // V178: Start periodic event loop lag measurement using setTimeout diff
  private startEventLoopLagSampler(): void {
    const sample = (): void => {
      const start = Date.now();

      // V178: setTimeout(0) will execute after the current event loop flush.
      // The difference between the scheduled time and actual execution time
      // reveals how much the event loop is lagging behind.
      setTimeout(() => {
        this.eventLoopLagMs = Date.now() - start;
      }, 0);
    };

    // V178: Take an initial sample immediately
    sample();

    // V178: Then sample every 10 seconds
    this.lagSamplerTimer = setInterval(sample, EVENT_LOOP_SAMPLE_INTERVAL_MS);
  }

  // V178: Calculate p50, p95, p99 from a durations array using nearest-rank method
  private calculatePercentiles(durations: number[]): EndpointPercentiles {
    if (durations.length === 0) {
      return { p50: 0, p95: 0, p99: 0, count: 0 };
    }

    // V178: Sort a copy to avoid mutating the original rolling window
    const sorted = [...durations].sort((a, b) => a - b);
    const count = sorted.length;

    return {
      p50: this.nearestRank(sorted, 50),
      p95: this.nearestRank(sorted, 95),
      p99: this.nearestRank(sorted, 99),
      count,
    };
  }

  // V178: Nearest-rank percentile — returns the value at the given percentile
  private nearestRank(sorted: number[], percentile: number): number {
    // V178: Nearest-rank formula: ceil(P/100 * N), clamped to array bounds
    const rank = Math.ceil((percentile / 100) * sorted.length);
    const index = Math.min(rank, sorted.length) - 1;
    return sorted[Math.max(index, 0)];
  }
}
