// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Analytics Engine E2E Tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AnalyticsController } from '../../src/modules/analytics/analytics.controller';
import { SignalGeneratorService } from '../../src/modules/analytics/signal-generator.service';
import { AnalyticalAIService } from '../../src/modules/analytics/analytical-ai.service';
import { MarketDataAggregatorService } from '../../src/modules/analytics/aggregator.service';
import { TechnicalIndicatorService } from '../../src/modules/analytics/indicators.service';
import { FinnhubAdapter } from '../../src/modules/analytics/finnhub.adapter';
import { AuthGuard } from '../../src/common/guards/auth.guard';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AuditService } from '../../src/audit/audit.service';
import { ExchangeService } from '../../src/modules/exchange/exchange.service';
import { AiService } from '../../src/modules/ai/ai.service';
import { GeneratedSignalDto, SignalAction, AggregatedQuoteDto, TechnicalAnalysisDto } from '../../src/modules/analytics/analytics.types';

/**
 * Analytics Engine E2E Tests
 *
 * Tests the analytics pipeline end-to-end:
 * ┌───────────────────────────────────────────────────────────────┐
 * │ 1. Signal generation for AAPL                                 │
 * │ 2. Response structure validation (action, confidence, SL/TP) │
 * │ 3. Arabic language validation for reason field               │
 * │ 4. Mandatory stop-loss enforcement in signals                │
 * └───────────────────────────────────────────────────────────────┘
 *
 * All external dependencies (Redis, AI, exchanges) are mocked
 * to ensure tests run without network access.
 */
describe('Analytics Engine (e2e)', () => {
  let app: INestApplication;
  let signalGeneratorService: SignalGeneratorService;
  let analyticalAIService: AnalyticalAIService;
  let aggregatorService: MarketDataAggregatorService;

  // ── Mock Data ──

  const MOCK_USER = {
    id: 'test-user-analytics-001',
    email: 'analytics-test@roua.dev',
    tier: 'PREMIUM',
  };

  const MOCK_AGGREGATED_QUOTE: AggregatedQuoteDto = {
    symbol: 'AAPL',
    name: 'Apple Inc.',
    currency: 'USD',
    price: 185.50,
    change: 2.30,
    changePercent: 1.25,
    open: 183.50,
    high: 186.00,
    low: 182.80,
    close: 185.50,
    volume: 54200000,
    marketCap: 2850000000000,
    fiftyTwoWeekHigh: 199.62,
    fiftyTwoWeekLow: 143.90,
    sources: ['twelvedata', 'finnhub'],
    primarySource: 'twelvedata',
    timestamp: new Date(),
  };

  const MOCK_TECHNICAL_ANALYSIS: TechnicalAnalysisDto = {
    sma: [
      { period: 20, values: [183, 184, 185] },
      { period: 50, values: [180, 181, 182] },
    ],
    ema: [
      { period: 12, values: [184, 185, 186] },
      { period: 26, values: [182, 183, 184] },
    ],
    rsi: {
      period: 14,
      values: [45, 48, 55],
      interpretation: 'NEUTRAL',
    },
    macd: {
      macdLine: [1.2, 1.5, 1.8],
      signalLine: [0.8, 1.0, 1.3],
      histogram: [0.4, 0.5, 0.5],
      crossover: 'BULLISH_CROSSOVER',
    },
    bollingerBands: {
      upper: [190, 191, 192],
      middle: [183, 184, 185],
      lower: [176, 177, 178],
      position: 'MIDDLE',
    },
    atr: {
      period: 14,
      values: [3.2, 3.5, 3.8],
    },
    technicalScore: 45,
    trend: 'BULLISH',
  };

  const MOCK_AI_ANALYSIS = 'مؤشر RSI يشير إلى زخم إيجابي مع حجم تداول متزايد. سعر AAPL يتداول فوق المتوسط المتحرك 20 يوم. مؤشر MACD يعطي إشارة شراء قوية. حجم التداول يدعم الاتجاه الصاعد.';

  // ── Mock Services ──

  const mockPrismaService = {
    signal: {
      create: jest.fn().mockResolvedValue({
        id: 'signal-test-001',
        userId: MOCK_USER.id,
        pair: 'AAPL',
        action: 'BUY',
        confidence: 75,
        reason: 'إشارة شراء | النتيجة الفنية: +45 | RSI: NEUTRAL | MACD: BULLISH_CROSSOVER | التحليل: مؤشر RSI يشير إلى زخم إيجابي',
        entryPrice: 185.50,
        stopLoss: 177.90,
        takeProfit: 200.70,
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86400000),
      }),
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    session: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'session-test-001',
        userId: MOCK_USER.id,
        token: 'test-session-token',
        expiresAt: new Date(Date.now() + 86400000),
        user: MOCK_USER,
      }),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    user: { findUnique: jest.fn() },
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue(undefined),
  };

  const mockExchangeService = {
    getQuote: jest.fn().mockResolvedValue({
      symbol: 'AAPL',
      price: 185.50,
      change: 2.30,
      changePercent: 1.25,
      source: 'twelvedata',
    }),
    getHistoricalData: jest.fn().mockResolvedValue([]),
  };

  const mockFinnhubAdapter = {
    isAvailable: jest.fn().mockReturnValue(true),
    fetchQuote: jest.fn().mockResolvedValue({
      symbol: 'AAPL',
      price: 185.50,
      change: 2.30,
      changePercent: 1.25,
      source: 'finnhub',
    }),
    fetchHistoricalData: jest.fn().mockResolvedValue([]),
  };

  const mockAiService = {
    chat: jest.fn().mockResolvedValue(MOCK_AI_ANALYSIS),
    generateText: jest.fn().mockResolvedValue(MOCK_AI_ANALYSIS),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        SignalGeneratorService,
        AnalyticalAIService,
        MarketDataAggregatorService,
        TechnicalIndicatorService,
        {
          provide: FinnhubAdapter,
          useValue: mockFinnhubAdapter,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
        {
          provide: ExchangeService,
          useValue: mockExchangeService,
        },
        {
          provide: AiService,
          useValue: mockAiService,
        },
        {
          provide: 'ExchangeModule',
          useValue: {},
        },
        {
          provide: 'AiModule',
          useValue: {},
        },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate: jest.fn().mockResolvedValue(true),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // Apply same configuration as main.ts
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.init();

    signalGeneratorService = moduleFixture.get<SignalGeneratorService>(SignalGeneratorService);
    analyticalAIService = moduleFixture.get<AnalyticalAIService>(AnalyticalAIService);
    aggregatorService = moduleFixture.get<MarketDataAggregatorService>(MarketDataAggregatorService);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 1: Signal Generation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Signal Generation (POST /api/analytics/signals/generate)', () => {
    it('should generate a signal with action, confidence, entryPrice, and stopLoss', async () => {
      // Arrange: Mock the analysis pipeline
      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: MOCK_AGGREGATED_QUOTE,
        technical: MOCK_TECHNICAL_ANALYSIS,
        aiAnalysis: MOCK_AI_ANALYSIS,
        confidence: 75,
        sentiment: 'POSITIVE',
        riskLevel: 'MODERATE',
      });

      // Act: Generate signal
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'AAPL');

      // Assert: Signal structure
      expect(signal).toBeDefined();
      expect(signal.action).toBeDefined();
      expect(['BUY', 'SELL', 'WAIT']).toContain(signal.action);
      expect(signal.confidence).toBeDefined();
      expect(typeof signal.confidence).toBe('number');
      expect(signal.confidence).toBeGreaterThanOrEqual(0);
      expect(signal.confidence).toBeLessThanOrEqual(100);

      // Assert: Entry price present
      expect(signal.entryPrice).toBeDefined();
      expect(signal.entryPrice).toBeGreaterThan(0);

      // Assert: Stop-loss is MANDATORY and non-zero for non-WAIT signals
      if (signal.action !== 'WAIT') {
        expect(signal.stopLoss).toBeDefined();
        expect(signal.stopLoss).toBeGreaterThan(0);
        expect(signal.stopLoss).not.toBe(signal.entryPrice);
      }
    });

    it('should ensure BUY signal has stopLoss below entryPrice', async () => {
      // Arrange: Mock bullish analysis
      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: MOCK_AGGREGATED_QUOTE,
        technical: MOCK_TECHNICAL_ANALYSIS,
        aiAnalysis: MOCK_AI_ANALYSIS,
        confidence: 80,
        sentiment: 'POSITIVE',
        riskLevel: 'MODERATE',
      });

      // Act
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'AAPL');

      // Assert: BUY stop-loss must be below entry
      if (signal.action === 'BUY') {
        expect(signal.stopLoss).toBeLessThan(signal.entryPrice!);
      }
    });

    it('should ensure SELL signal has stopLoss above entryPrice', async () => {
      // Arrange: Mock bearish analysis
      const bearishTechnical = {
        ...MOCK_TECHNICAL_ANALYSIS,
        technicalScore: -50,
        trend: 'BEARISH',
        rsi: {
          period: 14,
          values: [65, 60, 75],
          interpretation: 'OVERBOUGHT',
        },
        macd: {
          ...MOCK_TECHNICAL_ANALYSIS.macd,
          crossover: 'BEARISH_CROSSOVER',
        },
      };

      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: MOCK_AGGREGATED_QUOTE,
        technical: bearishTechnical,
        aiAnalysis: 'مؤشرات فنية سلبية تشير لاحتمال هبوط السعر',
        confidence: 70,
        sentiment: 'NEGATIVE',
        riskLevel: 'HIGH',
      });

      // Act
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'AAPL');

      // Assert: SELL stop-loss must be above entry
      if (signal.action === 'SELL') {
        expect(signal.stopLoss).toBeGreaterThan(signal.entryPrice!);
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 2: Arabic Language Validation
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Arabic Language Validation', () => {
    it('should return reason in Arabic with financial terminology', async () => {
      // Arrange
      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: MOCK_AGGREGATED_QUOTE,
        technical: MOCK_TECHNICAL_ANALYSIS,
        aiAnalysis: MOCK_AI_ANALYSIS,
        confidence: 75,
        sentiment: 'POSITIVE',
        riskLevel: 'MODERATE',
      });

      // Act
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'AAPL');

      // Assert: Reason exists
      expect(signal.reason).toBeDefined();
      expect(signal.reason.length).toBeGreaterThan(0);

      // Assert: Contains Arabic financial keywords
      const arabicFinancialKeywords = ['مؤشر', 'حجم', 'سعر', 'شراء', 'بيع', 'انتظار', 'فني', 'تحليل'];
      const hasArabicFinanceTerm = arabicFinancialKeywords.some(
        (keyword) => signal.reason.includes(keyword),
      );
      expect(hasArabicFinanceTerm).toBe(true);
    });

    it('should include BUY/SELL Arabic terms in non-WAIT signals', async () => {
      // Arrange
      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: MOCK_AGGREGATED_QUOTE,
        technical: MOCK_TECHNICAL_ANALYSIS,
        aiAnalysis: MOCK_AI_ANALYSIS,
        confidence: 80,
        sentiment: 'POSITIVE',
        riskLevel: 'MODERATE',
      });

      // Act
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'AAPL');

      // Assert: Non-WAIT signals should have Arabic action terms
      if (signal.action === 'BUY') {
        expect(signal.reason).toContain('شراء');
      } else if (signal.action === 'SELL') {
        expect(signal.reason).toContain('بيع');
      } else {
        expect(signal.reason).toContain('انتظار');
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 3: WAIT Signal (No Market Data)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('WAIT Signal (Insufficient Data)', () => {
    it('should return WAIT signal when no price data available', async () => {
      // Arrange: Mock with no price
      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: { ...MOCK_AGGREGATED_QUOTE, price: 0 },
        technical: MOCK_TECHNICAL_ANALYSIS,
        aiAnalysis: '',
        confidence: 0,
        sentiment: 'NEUTRAL',
        riskLevel: 'UNKNOWN',
      });

      // Act
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'UNKNOWN');

      // Assert
      expect(signal.action).toBe('WAIT');
      expect(signal.confidence).toBe(0);
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Test Suite 4: Risk/Reward Ratio
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  describe('Risk/Reward Ratio', () => {
    it('should calculate risk/reward ratio for non-WAIT signals', async () => {
      // Arrange
      jest.spyOn(analyticalAIService, 'analyzeAsset').mockResolvedValue({
        quote: MOCK_AGGREGATED_QUOTE,
        technical: MOCK_TECHNICAL_ANALYSIS,
        aiAnalysis: MOCK_AI_ANALYSIS,
        confidence: 75,
        sentiment: 'POSITIVE',
        riskLevel: 'MODERATE',
      });

      // Act
      const signal = await signalGeneratorService.generateSignal(MOCK_USER.id, 'AAPL');

      // Assert: Non-WAIT signals should have risk/reward
      if (signal.action !== 'WAIT' && signal.takeProfit) {
        expect(signal.riskRewardRatio).toBeDefined();
        expect(signal.riskRewardRatio).toBeGreaterThanOrEqual(1.0);
      }
    });
  });
});
