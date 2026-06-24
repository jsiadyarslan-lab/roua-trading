// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading — Assistant Context Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// "قبل أن يردّ المساعد، يجب أن يعرف كل شيء"
// الـ Context Engine يجمع 6 طبقات من السياق:
//   1. صفقات المستخدم المفتوحة + المغلقة
//   2. تصويتات المجلس الاستراتيجي + مبرراتها
//   3. حلقة التعلم (TradeJournal + VoteAccuracy + SystemMemory)
//   4. السياق السوقي اللحظي (أسعار + تقلبات)
//   5. الأخبار + تحليل المشاعر
//   6. صحة النظام + المخاطر + حالة التبريد
//
// Phase 1 — Foundation Layer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── 1. User Trading Context ──────────────────────────────────
export interface OpenPositionDTO {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  openedAt: Date;
  durationMs: number;
  assetClass: 'FOREX' | 'COMMODITY' | 'CRYPTO' | 'INDEX' | 'UNKNOWN';
  source?: string | null;
  briefId?: string | null;
}

export interface ClosedTradeDTO {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice?: number;
  pnl: number;
  pnlPercent: number;
  result: 'WIN' | 'LOSS' | 'BREAKEVEN';
  openedAt: Date;
  closedAt: Date;
  durationMs: number;
  closeReason?: string | null;
}

export interface UserTradingContext {
  userId: string;
  openPositions: OpenPositionDTO[];
  positionSummary: {
    count: number;
    totalValue: number;
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
    usedMargin: number;
    paperBalance: number;
    displayedBalance: number;
    riskExposurePercent: number;
  };
  recentClosedTrades: ClosedTradeDTO[];
  todayStats: {
    tradesOpened: number;
    tradesClosed: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    netPnl: number;
  };
}

// ─── 2. Council Context ───────────────────────────────────────
export interface CouncilBriefDTO {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;
  consensusScore: number;
  timeframe: string;
  createdAt: Date;
  status: string;
  expectedRr?: number;
  strictRules?: Record<string, any>;
  aiReasoning?: Record<string, string>;
  councilVotes?: Record<string, any>;
  rejectionReasons?: string[];
  summary?: string;
}

export interface CouncilContext {
  activeBriefs: CouncilBriefDTO[];
  recentBriefs: CouncilBriefDTO[];
  consensusStats: {
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    avgConfidence: number;
    avgConsensus: number;
  };
}

// ─── 3. Learning Context (حلقة التعلم) ────────────────────────
export interface JournalEntryDTO {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  exitPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  result?: 'WIN' | 'LOSS' | 'BREAKEVEN';
  councilVotes: Record<string, any>;
  consensusScore: number;
  regimeAtEntry?: string;
  aiReasoning?: Record<string, string>;
  source?: string;
  createdAt: Date;
}

export interface VoteAccuracyDTO {
  roleId: string;
  totalVotes: number;
  correctVotes: number;
  accuracyPercent: number;
  weight: number;
}

export interface MemoryDTO {
  id: string;
  type: string;
  content: string;
  symbol?: string | null;
  confidence: number;
  createdAt: Date;
  validUntil?: Date | null;
}

export interface LearningContext {
  recentJournalEntries: JournalEntryDTO[];
  tradeStats: {
    totalTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    bestPair?: string;
    worstPair?: string;
  };
  voteAccuracy: VoteAccuracyDTO[];
  activeMemories: MemoryDTO[];
  memorySummary: string;
}

// ─── 4. Market Context ────────────────────────────────────────
export interface MarketPriceDTO {
  symbol: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  bid?: number;
  ask?: number;
  assetClass: 'FOREX' | 'COMMODITY' | 'CRYPTO' | 'INDEX' | 'UNKNOWN';
  fetchedAt: Date;
}

export interface MarketContext {
  topSymbols: MarketPriceDTO[];
  userSymbols: MarketPriceDTO[];
  marketSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'VOLATILE' | 'CALM';
  volatilityIndex?: number;
  fetchedAt: Date;
}

// ─── 5. News Context ──────────────────────────────────────────
export interface NewsItemDTO {
  id: string;
  title: string;
  summary?: string;
  source: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  sentimentScore?: number;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  publishedAt: Date;
  symbols?: string[];
  url?: string;
}

export interface NewsContext {
  recentNews: NewsItemDTO[];
  marketNews: NewsItemDTO[];
  sentimentSummary: {
    positive: number;
    negative: number;
    neutral: number;
    dominantSentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  };
}

// ─── 6. System Health Context ─────────────────────────────────
export interface SystemHealthContext {
  systemStatus: 'OPERATIONAL' | 'DEGRADED' | 'COOLDOWN' | 'ERROR';
  lastTradeAt?: Date;
  lastErrorAt?: Date;
  lastError?: string;
  activeBriefsCount: number;
  pendingOrdersCount: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  cooldownActive: boolean;
  cooldownEndsAt?: Date;
  selfHealingEvents: Array<{
    type: string;
    message: string;
    timestamp: Date;
    severity: 'INFO' | 'WARN' | 'ERROR';
  }>;
}

// ─── Aggregated Full Context ──────────────────────────────────
export interface AssistantContext {
  userId: string;
  generatedAt: Date;
  cacheTtlMs: number;
  cacheKey: string;
  cacheHit: boolean;

  userTrading: UserTradingContext;
  council: CouncilContext;
  learning: LearningContext;
  market: MarketContext;
  news: NewsContext;
  systemHealth: SystemHealthContext;

  // ملخص نصي مُجهّز للـ LLM
  summary: AssistantContextSummary;
}

export interface AssistantContextSummary {
  // ملخص مختصر (200-400 حرف) مناسب كـ system prompt للـ LLM
  brief: string;
  // ملاحظات مهمة قد تؤثر على الرد
  notes: string[];
  // تحذيرات يجب على المساعد مراعاتها
  warnings: string[];
  // اللغة المفضلة للمستخدم
  preferredLanguage: string;
  // مستوى خبرة المستخدم (يُستنتج من سجل التداول)
  experienceLevel: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}

// ─── Request Types ────────────────────────────────────────────
export interface ContextRequest {
  userId: string;
  symbol?: string;
  language?: string;
  skipCache?: boolean;
}

// ─── Cache Keys ───────────────────────────────────────────────
export const CONTEXT_CACHE_PREFIX = 'assistant:context:';
export const CONTEXT_CACHE_TTL_MS = 30_000; // 30 ثانية
