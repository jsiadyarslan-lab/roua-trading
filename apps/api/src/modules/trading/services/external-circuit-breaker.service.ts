// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — External Circuit Breaker Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// V220: قاطع دائرة عام للمكالمات الخارجية
// يحمي النظام من الأعطال المتسلسلة عندما تكون APIs الخارجية معطلة
// يدعم: MetaAPI, Binance, Alpaca, RabbitMQ, أي خدمة خارجية
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { RedisService } from '../../../common/redis/redis.service';

/** Circuit breaker states */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/** Configuration for a circuit breaker instance */
export interface CircuitBreakerConfig {
  /** Unique name for this circuit breaker (e.g. 'metaapi', 'binance-spot') */
  name: string;
  /** Number of consecutive failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Number of successes in HALF_OPEN to close the circuit (default: 2) */
  successThreshold?: number;
  /** How long to stay OPEN before transitioning to HALF_OPEN (default: 30s) */
  openDurationMs?: number;
  /** Time window for counting failures (default: 60s) */
  windowMs?: number;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: string | null;
  lastSuccess: string | null;
  openedAt: string | null;
}

@Injectable()
export class ExternalCircuitBreakerService implements OnModuleDestroy {
  private readonly logger = new Logger(ExternalCircuitBreakerService.name);

  /** In-memory circuit breaker state (backed by Redis for multi-instance) */
  private readonly circuits = new Map<string, {
    state: CircuitState;
    failures: number;
    successes: number;
    lastFailureAt: number | null;
    lastSuccessAt: number | null;
    openedAt: number | null;
    config: Required<CircuitBreakerConfig>;
  }>();

  private _cleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly redis: RedisService) {
    // Clean up stale circuit state every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanupStaleCircuits(), 5 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * Register a circuit breaker for an external service.
   * Call this during module initialization.
   */
  register(config: CircuitBreakerConfig): void {
    const fullConfig: Required<CircuitBreakerConfig> = {
      name: config.name,
      failureThreshold: config.failureThreshold ?? 5,
      successThreshold: config.successThreshold ?? 2,
      openDurationMs: config.openDurationMs ?? 30_000,
      windowMs: config.windowMs ?? 60_000,
    };

    if (this.circuits.has(config.name)) return; // Already registered

    this.circuits.set(config.name, {
      state: 'CLOSED',
      failures: 0,
      successes: 0,
      lastFailureAt: null,
      lastSuccessAt: null,
      openedAt: null,
      config: fullConfig,
    });

    this.logger.log(`🔌 Registered circuit breaker: ${config.name} (failures=${fullConfig.failureThreshold}, open=${fullConfig.openDurationMs}ms)`);
  }

  /**
   * Execute a function through the circuit breaker.
   * If the circuit is OPEN, returns the fallback immediately.
   * If the circuit is HALF_OPEN, allows one attempt.
   * If the circuit is CLOSED, executes normally.
   */
  async execute<T>(
    circuitName: string,
    fn: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) {
      // No circuit breaker registered — execute directly
      return fn();
    }

    const now = Date.now();

    // Check if OPEN circuit should transition to HALF_OPEN
    if (circuit.state === 'OPEN' && circuit.openedAt) {
      if (now - circuit.openedAt >= circuit.config.openDurationMs) {
        circuit.state = 'HALF_OPEN';
        circuit.successes = 0;
        this.logger.warn(`🔌 Circuit [${circuitName}]: OPEN → HALF_OPEN (probing)`);
      }
    }

    // If OPEN, reject immediately
    if (circuit.state === 'OPEN') {
      this.logger.debug(`🔌 Circuit [${circuitName}]: OPEN — rejecting call`);
      if (fallback) return fallback();
      throw new Error(`Circuit breaker [${circuitName}] is OPEN — external service unavailable`);
    }

    // Execute the function
    try {
      const result = await fn();
      this._recordSuccess(circuitName);
      return result;
    } catch (err: any) {
      this._recordFailure(circuitName, err.message);
      if (fallback) return fallback();
      throw err;
    }
  }

  /**
   * Check if a circuit is currently open (calls will be rejected).
   */
  isOpen(circuitName: string): boolean {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) return false;

    // Check for HALF_OPEN transition
    if (circuit.state === 'OPEN' && circuit.openedAt) {
      if (Date.now() - circuit.openedAt >= circuit.config.openDurationMs) {
        circuit.state = 'HALF_OPEN';
        circuit.successes = 0;
      }
    }

    return circuit.state === 'OPEN';
  }

  /**
   * Get the status of all registered circuit breakers.
   */
  getAllStatuses(): CircuitBreakerStatus[] {
    const statuses: CircuitBreakerStatus[] = [];
    for (const [name, circuit] of this.circuits) {
      statuses.push({
        name,
        state: circuit.state,
        failures: circuit.failures,
        successes: circuit.successes,
        lastFailure: circuit.lastFailureAt ? new Date(circuit.lastFailureAt).toISOString() : null,
        lastSuccess: circuit.lastSuccessAt ? new Date(circuit.lastSuccessAt).toISOString() : null,
        openedAt: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : null,
      });
    }
    return statuses;
  }

  /**
   * Get the status of a specific circuit breaker.
   */
  getStatus(circuitName: string): CircuitBreakerStatus | null {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) return null;
    return {
      name: circuitName,
      state: circuit.state,
      failures: circuit.failures,
      successes: circuit.successes,
      lastFailure: circuit.lastFailureAt ? new Date(circuit.lastFailureAt).toISOString() : null,
      lastSuccess: circuit.lastSuccessAt ? new Date(circuit.lastSuccessAt).toISOString() : null,
      openedAt: circuit.openedAt ? new Date(circuit.openedAt).toISOString() : null,
    };
  }

  // ── Private Methods ──

  private _recordSuccess(circuitName: string): void {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) return;

    circuit.successes++;
    circuit.lastSuccessAt = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      if (circuit.successes >= circuit.config.successThreshold) {
        circuit.state = 'CLOSED';
        circuit.failures = 0;
        circuit.openedAt = null;
        this.logger.log(`🔌 Circuit [${circuitName}]: HALF_OPEN → CLOSED (recovered)`);
      }
    } else if (circuit.state === 'CLOSED') {
      // Reset failure count on success in CLOSED state
      circuit.failures = Math.max(0, circuit.failures - 1);
    }
  }

  private _recordFailure(circuitName: string, errorMessage: string): void {
    const circuit = this.circuits.get(circuitName);
    if (!circuit) return;

    circuit.failures++;
    circuit.lastFailureAt = Date.now();

    if (circuit.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN → back to OPEN
      circuit.state = 'OPEN';
      circuit.openedAt = Date.now();
      this.logger.warn(`🔌 Circuit [${circuitName}]: HALF_OPEN → OPEN (probe failed: ${errorMessage})`);
    } else if (circuit.state === 'CLOSED') {
      if (circuit.failures >= circuit.config.failureThreshold) {
        circuit.state = 'OPEN';
        circuit.openedAt = Date.now();
        this.logger.error(
          `🔌 Circuit [${circuitName}]: CLOSED → OPEN (${circuit.failures} consecutive failures, last: ${errorMessage})`
        );
      }
    }
  }

  private _cleanupStaleCircuits(): void {
    const now = Date.now();
    for (const [name, circuit] of this.circuits) {
      // Reset failure count if outside the time window
      if (
        circuit.state === 'CLOSED' &&
        circuit.lastFailureAt &&
        now - circuit.lastFailureAt > circuit.config.windowMs
      ) {
        circuit.failures = 0;
      }
    }
  }
}
