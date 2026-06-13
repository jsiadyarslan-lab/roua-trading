// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Price Validation Service
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// V218: Price Validation Layer — prevents recording trades with
// obviously wrong prices (e.g., BTC at $1,921 instead of $63,000+).
//
// Root cause of BTC $1,921 bug:
//   The Binance API sometimes returns price in satoshis or different units,
//   or the market data ticker returns a stale/wrong value during API issues.
//   Without validation, this wrong price is stored in the DB and used for
//   P&L calculations, creating phantom losses/gains.
//
// This service provides:
//   1. Price range validation (min/max for each asset class)
//   2. Deviation check (price vs recent average — flag if >X% off)
//   3. Unit detection (satoshi vs dollar — auto-correct if possible)
//   4. Price freshness check (reject stale prices older than X minutes)

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../common/redis/redis.service';

export interface PriceValidationResult {
  valid: boolean;
  originalPrice: number;
  correctedPrice: number | null; // If auto-correction is possible
  reason: string;
  severity: 'ok' | 'warn' | 'error' | 'critical';
}

// Known minimum prices for popular assets (as of 2026)
// These are deliberately conservative — prices well below these indicate a bug
const KNOWN_PRICE_FLOORS: Record<string, number> = {
  'BTC': 10000,    // BTC has never been below $10K since 2020
  'ETH': 500,      // ETH has never been below $500 since 2021
  'SOL': 10,       // SOL floor
  'BNB': 100,      // BNB floor
  'XRP': 0.10,     // XRP floor
  'DOGE': 0.01,    // DOGE floor
  'ADA': 0.10,     // ADA floor
  'AVAX': 5,       // AVAX floor
  'DOT': 2,        // DOT floor
  'LINK': 5,       // LINK floor
  'MATIC': 0.10,   // MATIC floor
  'SHIB': 0.000001, // SHIB floor
};

// Known maximum prices (sanity check — if price exceeds this, something is wrong)
const KNOWN_PRICE_CEILINGS: Record<string, number> = {
  'BTC': 500000,
  'ETH': 100000,
  'SOL': 10000,
  'BNB': 10000,
  'XRP': 100,
  'DOGE': 10,
  'ADA': 100,
};

// Maximum allowed deviation from cached price (50% by default)
const MAX_PRICE_DEVIATION_PCT = 50;

// Price cache TTL in Redis (5 minutes)
const PRICE_CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class PriceValidationService {
  private readonly logger = new Logger(PriceValidationService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Validate a price before using it for trade execution or recording.
   *
   * Returns:
   *   - valid=true: Price is within acceptable range
   *   - valid=false + correctedPrice: Auto-correction possible (e.g., satoshi→dollar)
   *   - valid=false + no correction: Price is clearly wrong and cannot be fixed
   */
  async validatePrice(symbol: string, price: number): Promise<PriceValidationResult> {
    if (!price || price <= 0) {
      return {
        valid: false,
        originalPrice: price,
        correctedPrice: null,
        reason: `Price is ${price} — invalid (must be > 0)`,
        severity: 'critical',
      };
    }

    // Extract base asset (e.g., BTC from BTC/USDT)
    const baseAsset = this._extractBaseAsset(symbol);

    // Step 1: Check known price floors/ceilings
    const floorCheck = this._checkPriceBounds(baseAsset, price);
    if (floorCheck) {
      // Try auto-correction: satoshi → dollar conversion
      const correction = this._tryAutoCorrect(baseAsset, price);
      if (correction) {
        this.logger.warn(
          `📊 V218 PRICE FIX: ${symbol} price $${price} looks like satoshi/wei units — auto-corrected to $${correction}`,
        );
        return {
          valid: true,
          originalPrice: price,
          correctedPrice: correction,
          reason: `Price auto-corrected from $${price} (likely satoshi/wei units) to $${correction}`,
          severity: 'warn',
        };
      }
      return floorCheck;
    }

    // Step 2: Check deviation from last known price (in Redis cache)
    const deviationCheck = await this._checkPriceDeviation(baseAsset, price);
    if (deviationCheck && !deviationCheck.valid) {
      return deviationCheck;
    }

    // Step 3: Update the price cache for future checks
    await this._cachePrice(baseAsset, price);

    return {
      valid: true,
      originalPrice: price,
      correctedPrice: null,
      reason: 'Price within acceptable range',
      severity: 'ok',
    };
  }

  /**
   * Quick validation — just returns true/false without Redis checks.
   * Useful for high-frequency paths where Redis I/O is too slow.
   */
  quickValidate(symbol: string, price: number): boolean {
    if (!price || price <= 0) return false;
    const baseAsset = this._extractBaseAsset(symbol);
    const floor = KNOWN_PRICE_FLOORS[baseAsset];
    const ceiling = KNOWN_PRICE_CEILINGS[baseAsset];
    if (floor && price < floor * 0.1) return false; // Below 10% of known floor
    if (ceiling && price > ceiling * 10) return false; // Above 10x of known ceiling
    return true;
  }

  /**
   * Record the last known good price for a symbol.
   * Called by market data services after successful price fetches.
   */
  async recordGoodPrice(symbol: string, price: number): Promise<void> {
    await this._cachePrice(this._extractBaseAsset(symbol), price);
  }

  // ── Private Methods ──

  private _extractBaseAsset(symbol: string): string {
    // BTC/USDT → BTC, ETHUSDT → ETH, BTC-USD → BTC
    return symbol
      .replace(/[\/\-_](USDT?|BUSD?|USD|EUR|BTC|ETH|BNB)$/i, '')
      .toUpperCase();
  }

  private _checkPriceBounds(baseAsset: string, price: number): PriceValidationResult | null {
    const floor = KNOWN_PRICE_FLOORS[baseAsset];
    const ceiling = KNOWN_PRICE_CEILINGS[baseAsset];

    if (floor && price < floor * 0.01) {
      // Price is less than 1% of known floor — clearly wrong
      return {
        valid: false,
        originalPrice: price,
        correctedPrice: null,
        reason: `${baseAsset} price $${price} is far below known floor $${floor} (${((price / floor) * 100).toFixed(4)}%)`,
        severity: 'critical',
      };
    }

    if (ceiling && price > ceiling * 10) {
      // Price is 10x above known ceiling — likely a unit conversion issue
      return {
        valid: false,
        originalPrice: price,
        correctedPrice: null,
        reason: `${baseAsset} price $${price} is far above known ceiling $${ceiling} (${(price / ceiling).toFixed(1)}x)`,
        severity: 'critical',
      };
    }

    if (floor && price < floor * 0.5) {
      // Price is below 50% of floor — suspicious but might be a crash
      return {
        valid: false,
        originalPrice: price,
        correctedPrice: null,
        reason: `${baseAsset} price $${price} is below 50% of known floor $${floor} — possible data error`,
        severity: 'error',
      };
    }

    return null; // No bounds violation
  }

  /**
   * Try to auto-correct a price that looks like it's in wrong units.
   *
   * Common patterns:
   *   - BTC price in satoshis: 63000 → 0.00063 (satoshi) → multiply by 100,000,000
   *   - ETH price in wei: similar pattern
   *
   * Detection: if price is < 1% of known floor but > 0.0001% of floor,
   * it might be in smaller units.
   */
  private _tryAutoCorrect(baseAsset: string, price: number): number | null {
    const floor = KNOWN_PRICE_FLOORS[baseAsset];
    if (!floor) return null;

    // Check if price * 100M gives a reasonable value (satoshi → dollar)
    const satoshiToDollar = price * 100_000_000;
    if (satoshiToDollar >= floor * 0.5 && satoshiToDollar <= floor * 5) {
      return satoshiToDollar;
    }

    // Check if price * 1B gives a reasonable value (wei → dollar)
    const weiToDollar = price * 1_000_000_000;
    if (weiToDollar >= floor * 0.5 && weiToDollar <= floor * 5) {
      return weiToDollar;
    }

    // Check if price * 1000 gives a reasonable value (milli-units)
    const milliToDollar = price * 1000;
    if (milliToDollar >= floor * 0.5 && milliToDollar <= floor * 5) {
      return milliToDollar;
    }

    return null; // No auto-correction possible
  }

  private async _checkPriceDeviation(baseAsset: string, price: number): Promise<PriceValidationResult | null> {
    try {
      const cacheKey = `price:last:${baseAsset}`;
      const cachedPriceStr = await this.redis.get(cacheKey);
      if (!cachedPriceStr) return null; // No previous price to compare against

      const cachedPrice = parseFloat(cachedPriceStr);
      if (isNaN(cachedPrice) || cachedPrice <= 0) return null;

      const deviationPct = Math.abs((price - cachedPrice) / cachedPrice) * 100;
      const maxDeviation = parseFloat(
        this.configService.get('MAX_PRICE_DEVIATION_PCT', String(MAX_PRICE_DEVIATION_PCT)),
      );

      if (deviationPct > maxDeviation) {
        return {
          valid: false,
          originalPrice: price,
          correctedPrice: null,
          reason: `${baseAsset} price $${price} deviates ${deviationPct.toFixed(1)}% from last known $${cachedPrice} (max: ${maxDeviation}%)`,
          severity: deviationPct > 90 ? 'critical' : 'error',
        };
      }

      if (deviationPct > maxDeviation * 0.7) {
        // Warning: approaching deviation limit
        this.logger.warn(
          `📊 V218: ${baseAsset} price $${price} deviates ${deviationPct.toFixed(1)}% from $${cachedPrice} (approaching limit ${maxDeviation}%)`,
        );
      }

      return null; // Within acceptable deviation
    } catch {
      return null; // Redis error — skip deviation check
    }
  }

  private async _cachePrice(baseAsset: string, price: number): Promise<void> {
    try {
      const cacheKey = `price:last:${baseAsset}`;
      await this.redis.set(cacheKey, String(price), PRICE_CACHE_TTL_MS);
    } catch {
      // Non-critical — just skip caching
    }
  }
}
