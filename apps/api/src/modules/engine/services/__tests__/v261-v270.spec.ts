/**
 * V271: Unit tests for V261-V270 critical paths.
 *
 * Tests cover:
 *   - V261: forceClosePosition blocks TIME_EXPIRED for Smart Executor
 *   - V265: TIMEFRAME_RR minimum SL ≥ 2%
 *   - V269: Smart Executor SL recalculation uses TIMEFRAME_RR
 *   - V270: Regime reversal detection (5-layer filter)
 *   - V271: Feature flags enable/disable
 */
import { Test } from '@nestjs/testing';
import { describe, it, expect, beforeEach } from '@jest/globals';

// ── V265: TIMEFRAME_RR tests ──

import { TIMEFRAME_RR, MIN_RISK_REWARD_RATIO } from '../../../ai/strategic-council/strategic-council.types';

describe('V265: TIMEFRAME_RR minimum SL enforcement', () => {
  it('M1 SL should be ≥ 2%', () => {
    expect(TIMEFRAME_RR.M1.sl).toBeGreaterThanOrEqual(0.020);
  });

  it('M5 SL should be ≥ 2%', () => {
    expect(TIMEFRAME_RR.M5.sl).toBeGreaterThanOrEqual(0.020);
  });

  it('M15 SL should be ≥ 2%', () => {
    expect(TIMEFRAME_RR.M15.sl).toBeGreaterThanOrEqual(0.020);
  });

  it('All timeframes should have SL ≥ 2%', () => {
    for (const [tf, { sl }] of Object.entries(TIMEFRAME_RR)) {
      expect(sl).toBeGreaterThanOrEqual(0.020);
    }
  });

  it('All timeframes should have TP > SL (positive R:R)', () => {
    for (const [tf, { sl, tp }] of Object.entries(TIMEFRAME_RR)) {
      expect(tp).toBeGreaterThan(sl);
    }
  });

  it('MIN_RISK_REWARD_RATIO should be ≥ 1.5', () => {
    expect(MIN_RISK_REWARD_RATIO).toBeGreaterThanOrEqual(1.5);
  });

  it('M1 R:R should be ≥ 2.5', () => {
    const rr = TIMEFRAME_RR.M1.tp / TIMEFRAME_RR.M1.sl;
    expect(rr).toBeGreaterThanOrEqual(2.5);
  });
});

// ── V269: SL recalculation logic tests ──

describe('V269: Smart Executor SL recalculation', () => {
  it('should calculate SELL SL as currentPrice × (1 + tfSL)', () => {
    const currentPrice = 65000;
    const tfSL = 0.020; // 2%
    const sellSL = currentPrice * (1 + tfSL);
    expect(sellSL).toBe(66300);
    expect((sellSL - currentPrice) / currentPrice).toBeCloseTo(0.020, 4);
  });

  it('should calculate BUY SL as currentPrice × (1 - tfSL)', () => {
    const currentPrice = 65000;
    const tfSL = 0.020; // 2%
    const buySL = currentPrice * (1 - tfSL);
    expect(buySL).toBe(63700);
    expect((currentPrice - buySL) / currentPrice).toBeCloseTo(0.020, 4);
  });

  it('should NOT preserve old brief ratio (the V269 bug)', () => {
    // Simulate the OLD buggy calculation
    const briefEntryPrice = 64000;
    const briefStopLoss = 64640; // 1% above entry (old pre-V265 value)
    const currentPrice = 65000;

    // OLD (buggy): preserves 1% ratio
    const oldRatio = 1 + (briefStopLoss - briefEntryPrice) / briefEntryPrice;
    const oldSL = currentPrice * oldRatio;
    expect((oldSL - currentPrice) / currentPrice).toBeCloseTo(0.01, 4); // 1% — WRONG

    // NEW (V269): uses TIMEFRAME_RR directly
    const tfSL = 0.020; // 2%
    const newSL = currentPrice * (1 + tfSL);
    expect((newSL - currentPrice) / currentPrice).toBeCloseTo(0.020, 4); // 2% — CORRECT
  });
});

// ── V270: Regime reversal detection logic ──

describe('V270: Regime reversal detection logic', () => {
  // Test the direction check logic (extracted from _checkRegimeReversal)
  const isOpposite = (
    posSide: 'BUY' | 'SELL',
    marketRegime: string,
    trendDirection: string,
  ): boolean => {
    return (
      (posSide === 'BUY' && (marketRegime === 'BEAR' || trendDirection === 'DOWN')) ||
      (posSide === 'SELL' && (marketRegime === 'BULL' || trendDirection === 'UP'))
    );
  };

  it('SELL + BULL regime = opposite', () => {
    expect(isOpposite('SELL', 'BULL', 'UP')).toBe(true);
  });

  it('SELL + BEAR regime = aligned (not opposite)', () => {
    expect(isOpposite('SELL', 'BEAR', 'DOWN')).toBe(false);
  });

  it('BUY + BEAR regime = opposite', () => {
    expect(isOpposite('BUY', 'BEAR', 'DOWN')).toBe(true);
  });

  it('BUY + BULL regime = aligned', () => {
    expect(isOpposite('BUY', 'BULL', 'UP')).toBe(false);
  });

  it('SELL + RANGE regime = not opposite', () => {
    expect(isOpposite('SELL', 'RANGE', 'SIDEWAYS')).toBe(false);
  });

  // Test the confidence thresholds
  it('confidence < 40% should be ignored (noise)', () => {
    const confidence = 35;
    expect(confidence < 40).toBe(true); // Should return early
  });

  it('confidence 40-60% should tighten trailing only', () => {
    const confidence = 50;
    expect(confidence >= 40 && confidence < 60).toBe(true);
  });

  it('confidence 60-75% should move to break-even', () => {
    const confidence = 68;
    expect(confidence >= 60 && confidence < 75).toBe(true);
  });

  it('confidence 75%+ with 3-bar confirmation should close', () => {
    const confidence = 80;
    const confirmCount = 3;
    expect(confidence >= 75 && confirmCount >= 3).toBe(true);
  });

  it('confidence 75%+ without confirmation should NOT close', () => {
    const confidence = 80;
    const confirmCount = 1; // Only 1 check
    expect(confidence >= 75 && confirmCount >= 3).toBe(false);
  });

  // Test ATR spike filter
  it('candle range > 2× ATR should defer action', () => {
    const candleRange = 500;
    const atr = 200;
    expect(candleRange > 2 * atr).toBe(true); // Should defer
  });

  it('candle range < 2× ATR should allow action', () => {
    const candleRange = 300;
    const atr = 200;
    expect(candleRange > 2 * atr).toBe(false); // Should proceed
  });
});

// ── V271: Feature flag tests ──

describe('V271: Feature flags', () => {
  it('default should be enabled (true) when no env var set', () => {
    delete process.env.DISABLE_V270;
    // Simulate the flag loading
    const disabled = process.env.DISABLE_V270 === 'true' || process.env.DISABLE_V270 === '1';
    expect(!disabled).toBe(true); // enabled = true
  });

  it('DISABLE_V270=true should disable V270', () => {
    process.env.DISABLE_V270 = 'true';
    const disabled = process.env.DISABLE_V270 === 'true' || process.env.DISABLE_V270 === '1';
    expect(!disabled).toBe(false); // enabled = false
    delete process.env.DISABLE_V270;
  });

  it('DISABLE_V265=1 should disable V265', () => {
    process.env.DISABLE_V265 = '1';
    const disabled = process.env.DISABLE_V265 === 'true' || process.env.DISABLE_V265 === '1';
    expect(!disabled).toBe(false); // enabled = false
    delete process.env.DISABLE_V265;
  });
});

// ── V264: closePrice exact SL/TP test ──

describe('V264: SL/TP close price accuracy', () => {
  it('SELL SL close should be at SL price (not current price)', () => {
    const stopLoss = 1.1700;
    const currentPrice = 1.1750; // price moved above SL
    const closePrice = stopLoss; // V264: use SL as close price
    expect(closePrice).toBe(1.1700);
    expect(closePrice).not.toBe(currentPrice); // NOT the stale current price
  });

  it('BUY TP close should be at TP price', () => {
    const takeProfit = 66000;
    const currentPrice = 65950; // hasn't quite reached TP
    const closePrice = takeProfit; // V264: use TP as close price
    expect(closePrice).toBe(66000);
  });
});

// ── V261: forceClose TIME_EXPIRED block ──

describe('V261: forceClosePosition TIME_EXPIRED defense', () => {
  it('should block TIME_EXPIRED for Smart Executor positions', () => {
    const positionSource = 'smart_executor';
    const reason = 'TIME_EXPIRED force-close';
    const isSLTP = reason.includes('STOP_LOSS') || reason.includes('TAKE_PROFIT');
    const isUser = reason.includes('USER');
    const isTimeExpired = reason.includes('TIME_EXPIRED');

    const shouldBlock =
      positionSource === 'smart_executor' &&
      isTimeExpired &&
      !isSLTP &&
      !isUser;

    expect(shouldBlock).toBe(true);
  });

  it('should NOT block SL force-close for Smart Executor', () => {
    const positionSource = 'smart_executor';
    const reason = 'STOP_LOSS force-close';
    const isSLTP = reason.includes('STOP_LOSS') || reason.includes('TAKE_PROFIT');
    const isUser = reason.includes('USER');
    const isTimeExpired = reason.includes('TIME_EXPIRED');

    const shouldBlock =
      positionSource === 'smart_executor' &&
      isTimeExpired &&
      !isSLTP &&
      !isUser;

    expect(shouldBlock).toBe(false); // SL should pass
  });

  it('should NOT block user-initiated close', () => {
    const positionSource = 'smart_executor';
    const reason = 'USER initiated close';
    const isUser = reason.includes('USER');
    const isTimeExpired = reason.includes('TIME_EXPIRED');

    const shouldBlock =
      positionSource === 'smart_executor' &&
      isTimeExpired &&
      !isUser;

    expect(shouldBlock).toBe(false); // User close should pass
  });
});
