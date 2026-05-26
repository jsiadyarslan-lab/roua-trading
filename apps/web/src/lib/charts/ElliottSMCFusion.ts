// ═══════════════════════════════════════════════════════════
// Elliott + SMC Consensus Detection
// Fusion indicator: Elliott Wave with SMC confirmation
// EWO integration, confluence scoring, multi-timeframe alignment
// Inspired by TradingView "SMC + Elliott Wave Fusion" indicator
// ═══════════════════════════════════════════════════════════

import type { CandleData } from './types';
import { calcATR } from './ATRAdapter';
import type { ElliottPattern } from './ElliottWave';
import type { OrderBlock, FairValueGap, StructureBreak } from './SMCDetector';
import type { WyckoffResult } from './WyckoffAnalysis';
import type { VolumeProfileResult } from './VolumeProfile';

// ── Elliott Wave Oscillator (EWO) ────────────────────────
export function calcEWO(candles: CandleData[]): number {
  if (candles.length < 50) return 0;
  const closes = candles.map(c => c.close);

  // EWO = SMA(5) - SMA(35)
  const sma5 = closes.slice(-5).reduce((s, c) => s + c, 0) / 5;
  const sma35 = closes.slice(-35).reduce((s, c) => s + c, 0) / Math.min(35, closes.length);

  return sma5 - sma35;
}

// ── Fusion result ────────────────────────────────────────
export interface ElliottSMCFusion {
  direction: 'bullish' | 'bearish' | 'neutral';
  confidence: number;         // 0-1
  confluenceScore: number;    // 0-100

  // Elliott Wave info
  wave: ElliottPattern | null;
  waveLabel: string;
  waveLabelAr: string;

  // SMC confirmations
  smcConfirmation: {
    orderBlockConfirms: boolean;
    bosConfirms: boolean;
    fvgConfirms: boolean;
    details: string[];
  };

  // EWO
  ewo: number;
  ewoSignal: 'bullish' | 'bearish' | 'neutral';

  // Wyckoff alignment
  wyckoffAligns: boolean;
  wyckoffPhase?: string;

  // Volume profile alignment
  volumeAligns: boolean;
  volumeHint?: string;

  // Overall interpretation
  interpretation: string;
  interpretationAr: string;

  // Confluence breakdown
  confluenceBreakdown: {
    factor: string;
    factorAr: string;
    score: number;  // 0-25 per factor
  }[];
}

// ── Fusion Engine ────────────────────────────────────────
export function detectElliottSMCFusion(params: {
  candles: CandleData[];
  elliott: ElliottPattern | null;
  orderBlocks: OrderBlock[];
  fvgs: FairValueGap[];
  structureBreaks: StructureBreak[];
  wyckoff?: WyckoffResult | null;
  volumeProfile?: VolumeProfileResult | null;
  currentPrice?: number;
}): ElliottSMCFusion {
  const {
    candles, elliott, orderBlocks, fvgs, structureBreaks,
    wyckoff, volumeProfile, currentPrice,
  } = params;

  const price = currentPrice || candles[candles.length - 1]?.close || 0;
  const ewo = calcEWO(candles);
  const ewoSignal: 'bullish' | 'bearish' | 'neutral' = ewo > 0 ? 'bullish' : ewo < 0 ? 'bearish' : 'neutral';

  const confluenceBreakdown: ElliottSMCFusion['confluenceBreakdown'] = [];
  let totalScore = 0;

  // ── Factor 1: Elliott Wave (0-25) ──
  let elliottScore = 0;
  let waveLabel = 'No Pattern';
  let waveLabelAr = 'لا يوجد نمط';

  if (elliott) {
    const isImpulse = elliott.type === '5-wave';
    const waveBonus = isImpulse ? 15 : 8;
    elliottScore = waveBonus + Math.round(elliott.confidence * 10);
    waveLabel = `${elliott.type} Wave ${elliott.currentWave} (${elliott.direction})`;
    waveLabelAr = `موجة ${elliott.type === '5-wave' ? 'دافعة' : 'تصحيحية'} ${elliott.currentWave} (${elliott.direction === 'bullish' ? 'صعودي' : 'هبوطي'})`;
  }
  elliottScore = Math.min(25, elliottScore);
  totalScore += elliottScore;
  confluenceBreakdown.push({
    factor: 'Elliott Wave',
    factorAr: 'موجة إليوت',
    score: elliottScore,
  });

  // ── Factor 2: SMC Confirmation (0-25) ──
  let smcScore = 0;
  const smcDetails: string[] = [];
  const smcConfirmation = {
    orderBlockConfirms: false,
    bosConfirms: false,
    fvgConfirms: false,
    details: smcDetails,
  };

  const elliottDir = elliott?.direction || 'neutral';

  // Check order blocks
  const confirmingOBs = orderBlocks.filter(ob =>
    ob.type === (elliottDir === 'bullish' ? 'bullish' : 'bearish') && !ob.broken
  );
  if (confirmingOBs.length > 0) {
    smcConfirmation.orderBlockConfirms = true;
    smcScore += 8;
    smcDetails.push(`${confirmingOBs.length} confirming OB`);
  }

  // Check BOS/CHoCH
  const confirmingBreaks = structureBreaks.filter(brk =>
    brk.direction === elliottDir
  );
  if (confirmingBreaks.length > 0) {
    smcConfirmation.bosConfirms = true;
    smcScore += 9;
    smcDetails.push(`BOS/CHoCH ${elliottDir}`);
  }

  // Check FVGs
  const confirmingFVGs = fvgs.filter(fvg =>
    fvg.type === (elliottDir === 'bullish' ? 'bullish' : 'bearish') && !fvg.filled
  );
  if (confirmingFVGs.length > 0) {
    smcConfirmation.fvgConfirms = true;
    smcScore += 8;
    smcDetails.push(`${confirmingFVGs.length} confirming FVG`);
  }

  smcScore = Math.min(25, smcScore);
  totalScore += smcScore;
  confluenceBreakdown.push({
    factor: 'SMC Confirmation',
    factorAr: 'تأكيد SMC',
    score: smcScore,
  });

  // ── Factor 3: EWO Alignment (0-25) ──
  let ewoScore = 0;
  if (elliott && ewoSignal === elliott.direction) {
    ewoScore = 18 + Math.min(7, Math.round(Math.abs(ewo) / price * 500));
  } else if (ewoSignal !== 'neutral' && !elliott) {
    ewoScore = 8;
  }
  ewoScore = Math.min(25, ewoScore);
  totalScore += ewoScore;
  confluenceBreakdown.push({
    factor: 'EWO Alignment',
    factorAr: 'توافق EWO',
    score: ewoScore,
  });

  // ── Factor 4: Higher Timeframe Confluence (0-25) ──
  let htfScore = 0;
  let wyckoffAligns = false;
  let volumeAligns = false;

  if (wyckoff && wyckoff.phase !== 'Unknown') {
    const wyckoffDir = wyckoff.bias === 'bullish' ? 'bullish' : wyckoff.bias === 'bearish' ? 'bearish' : 'neutral';
    if (wyckoffDir === elliottDir || (wyckoffDir !== 'neutral' && !elliott)) {
      wyckoffAligns = true;
      htfScore += 12;
    }
  }

  if (volumeProfile && volumeProfile.poc > 0) {
    // If price is above POC, it supports bullish; below POC supports bearish
    const volDir = price > volumeProfile.poc ? 'bullish' : price < volumeProfile.poc ? 'bearish' : 'neutral';
    if (volDir === elliottDir || (volDir !== 'neutral' && !elliott)) {
      volumeAligns = true;
      htfScore += 10;
    }
  }

  htfScore = Math.min(25, htfScore);
  totalScore += htfScore;
  confluenceBreakdown.push({
    factor: 'HTF Confluence',
    factorAr: 'توافق الإطار الأعلى',
    score: htfScore,
  });

  // ── Final determination ──
  let direction: 'bullish' | 'bearish' | 'neutral';
  if (elliott) {
    direction = elliott.direction;
  } else if (smcConfirmation.bosConfirms) {
    direction = structureBreaks[0]?.direction === 'bullish' ? 'bullish' : 'bearish';
  } else if (ewoSignal !== 'neutral') {
    direction = ewoSignal;
  } else {
    direction = 'neutral';
  }

  const confidence = totalScore / 100;

  // Interpretation
  let interpretation: string;
  let interpretationAr: string;

  if (totalScore >= 75) {
    interpretation = `Strong ${direction} confluence: Elliott + SMC + EWO + HTF all aligned`;
    interpretationAr = `توافق ${direction === 'bullish' ? 'صعودي' : 'هبوطي'} قوي: إليوت + SMC + EWO + الإطار الأعلى متوافقون`;
  } else if (totalScore >= 50) {
    interpretation = `Moderate ${direction} bias with partial confirmation`;
    interpretationAr = `انحياز ${direction === 'bullish' ? 'صعودي' : 'هبوطي'} متوسط مع تأكيد جزئي`;
  } else if (totalScore >= 25) {
    interpretation = `Weak ${direction} signal, insufficient confirmation`;
    interpretationAr = `إشارة ${direction === 'bullish' ? 'صعودية' : 'هبوطية'} ضعيفة، تأكيد غير كافٍ`;
  } else {
    interpretation = 'No clear directional confluence';
    interpretationAr = 'لا يوجد توافق اتجاهي واضح';
    direction = 'neutral';
  }

  return {
    direction,
    confidence: Math.min(0.95, confidence),
    confluenceScore: totalScore,
    wave: elliott,
    waveLabel,
    waveLabelAr,
    smcConfirmation,
    ewo,
    ewoSignal,
    wyckoffAligns,
    wyckoffPhase: wyckoff?.phase,
    volumeAligns,
    volumeHint: volumeProfile ? `POC ${volumeProfile.poc > price ? 'above' : 'below'}` : undefined,
    interpretation,
    interpretationAr,
    confluenceBreakdown,
  };
}
