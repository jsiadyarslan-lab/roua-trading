
// Types + color tokens + role definitions for the AI Council dashboard

export type Direction = "BUY" | "SELL" | "HOLD";
export type Recommendation = "BUY" | "SELL" | "HOLD";
export type ReviewStatus = "ACTIVE" | "MODIFIED" | "CANCELLED" | "EXECUTED";
export type Timeframe = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1" | "W1";
export type CouncilRole =
  | "macro-strategist" | "risk-sentinel" | "liquidity-analyst" | "sentiment-reader"
  | "technical-analyst" | "momentum-hunter" | "pattern-architect" | "volatility-tactician";

export interface StrictRules {
  maxEntryPrice?: number;
  minEntryPrice?: number;
  maxSlippage: number;
}

export interface TradingBrief {
  id: string;
  pair: string;
  direction: Direction;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  timeframe: Timeframe;
  issuedAt: string;
  expiresAt: string;
  isActive: boolean;
  strictRules: StrictRules;
  lastReviewedAt: string;
  reviewStatus: ReviewStatus;
  analysisSummary?: string;
  // V292: Outcome data — populated from TradeJournal (linked by briefId).
  outcomePips?: number;       // Signed P&L in dollars
  outcomePct?: number;        // Signed P&L as % of entry price
  closedAt?: string;          // When the executed position was closed
  durationMs?: number;        // How long the position was held
  result?: 'WIN' | 'LOSS' | 'BREAKEVEN';  // Classified result
}

export interface CouncilAnalysis {
  role: CouncilRole;
  model: string;
  vote: Direction;
  confidence: number;
  reason: string;
}

export interface CouncilResult {
  symbol?: string;
  consensusScore: number;
  recommendation: Recommendation;
  /**
   * Overall council confidence. NOTE: The /api/ai/consensus endpoint does NOT
   * return this field — it only returns `consensusScore`. Display logic should
   * use `consensusScore` directly. This field is kept optional for any future
   * endpoint that may produce a separate confidence metric.
   */
  confidence?: number;
  analyses: CouncilAnalysis[];
  masterStrategy: string;
  source?: string;
  isFallback?: boolean;
  generatedAt?: string;
}

export interface CouncilSession {
  timestamp: string;
  pairsAnalyzed: number;
  briefsIssued: number;
  briefsModified: number;
  briefsCancelled: number;
  briefsExecuted: number;
  durationMs: number;
}

export const COLORS = {
  bg: '#0B0E14',
  bgElevated: "#0F131C",
  surface: "rgba(255, 255, 255, 0.03)",
  surfaceHover: "rgba(255, 255, 255, 0.05)",
  border: "rgba(255, 255, 255, 0.08)",
  borderStrong: "rgba(255, 255, 255, 0.14)",
  textPrimary: "#F1F5F9",
  textSecondary: "#CBD5E1",
  textMuted: '#9CA3B5',
  textDim: '#9CA3B5',
  buy: '#10b981',
  buySoft: "rgba(16, 185, 129, 0.12)",
  sell: '#ef4444',
  sellSoft: "rgba(239, 68, 68, 0.12)",
  hold: '#FFB800',
  holdSoft: "rgba(245, 158, 11, 0.12)",
  council: '#B388FF',
  councilSoft: "rgba(168, 85, 247, 0.12)",
  info: "#06B6D4",
  infoSoft: "rgba(6, 182, 212, 0.12)",
  gradient: "linear-gradient(135deg, #A855F7 0%, #6366F1 50%, #06B6D4 100%)",
  gradientCouncil: "linear-gradient(135deg, #A855F7 0%, #06B6D4 100%)",
  gradientBuy: "linear-gradient(135deg, #10B981 0%, #06B6D4 100%)",
  gradientSell: "linear-gradient(135deg, #EF4444 0%, #F59E0B 100%)",
} as const;

export const COUNCIL_ROLES: Array<{
  id: CouncilRole;
  model: string;
  icon: string;
  accent: string;
}> = [
  { id: "macro-strategist", model: "GPT-4o", icon: "Globe", accent: '#B388FF' },
  { id: "risk-sentinel", model: "Claude 3.5 Sonnet", icon: "ShieldAlert", accent: '#ef4444' },
  { id: "liquidity-analyst", model: "Gemini 1.5 Pro", icon: "Droplets", accent: "#06B6D4" },
  { id: "sentiment-reader", model: "DeepSeek V3", icon: "HeartPulse", accent: "#F472B6" },
  { id: "technical-analyst", model: "GPT-4o-mini", icon: "LineChart", accent: '#10b981' },
  { id: "momentum-hunter", model: "Llama 3.1 70B", icon: "Zap", accent: '#FFB800' },
  { id: "pattern-architect", model: "Claude 3 Opus", icon: "Hexagon", accent: '#B388FF' },
  { id: "volatility-tactician", model: "Mistral Large", icon: "Activity", accent: '#00D4FF' },
];

export const SYMBOLS = ["BTC", "ETH", "SOL", "BNB", "XRP", "ADA", "DOGE"] as const;

export function directionColor(dir: Direction): string {
  if (dir === "BUY") return COLORS.buy;
  if (dir === "SELL") return COLORS.sell;
  return COLORS.hold;
}

export function directionSoft(dir: Direction): string {
  if (dir === "BUY") return COLORS.buySoft;
  if (dir === "SELL") return COLORS.sellSoft;
  return COLORS.holdSoft;
}

export function statusColor(status: ReviewStatus): string {
  switch (status) {
    case "EXECUTED": return COLORS.info;
    case "CANCELLED": return COLORS.sell;
    case "MODIFIED": return COLORS.hold;
    case "ACTIVE":
    default: return COLORS.buy;
  }
}
