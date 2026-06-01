import { PrismaService } from '../../common/prisma/prisma.service';
import { AutonomousTraderAgentService } from './agent.service';
import { MarketAnalyzerService } from './services/market-analyzer.service';
import { SignalEvaluatorService } from './services/signal-evaluator.service';
import { StartAgentDto, ChangeStrategyDto, UpdateRiskParamsDto, UpdateAgentSettingsDto, StrategyType } from './types/agent.types';
export declare class AutonomousTraderPublicController {
    private readonly agentService;
    private readonly prisma;
    constructor(agentService: AutonomousTraderAgentService, prisma: PrismaService);
    getHealth(): Promise<{
        success: boolean;
        data: {
            module: string;
            status: string;
            ready: boolean;
            reason: string | undefined;
            timestamp: string;
        };
    }>;
    getPublicStatus(): Promise<{
        success: boolean;
        data: {
            autoTradingEnabled: boolean;
            source: "database" | "env_var";
        };
    }>;
    fixDb(req: any): Promise<{
        success: boolean;
        message: string;
        logs: string[];
    }>;
}
export declare class AutonomousTraderAgentController {
    private readonly agentService;
    private readonly marketAnalyzer;
    private readonly signalEvaluator;
    private readonly logger;
    constructor(agentService: AutonomousTraderAgentService, marketAnalyzer: MarketAnalyzerService, signalEvaluator: SignalEvaluatorService);
    startAgent(req: any, dto: StartAgentDto): Promise<{
        success: boolean;
        data: import("./types/agent.types").AgentState;
        message: string;
    } | {
        success: boolean;
        message: any;
        data: null;
    }>;
    stopAgent(req: any, body: {
        emergency?: boolean;
    }): Promise<{
        success: boolean;
        data: import("./types/agent.types").AgentState;
        message: string;
    }>;
    getStatus(req: any): Promise<{
        success: boolean;
        data: import("./types/agent.types").AgentState | null;
    }>;
    getPerformance(req: any): Promise<{
        success: boolean;
        data: import("./types/agent.types").PerformanceMetrics;
    }>;
    getOpenPositions(req: any): Promise<{
        success: boolean;
        data: {
            symbol: string;
            exitPrice: import("@prisma/client/runtime/library").Decimal | null;
            closeReason: string | null;
            id: string;
            updatedAt: Date;
            userId: string;
            exchange: string;
            source: string | null;
            status: import(".prisma/client").$Enums.PositionStatus;
            quantity: import("@prisma/client/runtime/library").Decimal;
            currentPrice: import("@prisma/client/runtime/library").Decimal | null;
            credentialId: string;
            side: import(".prisma/client").$Enums.OrderSide;
            entryPrice: import("@prisma/client/runtime/library").Decimal;
            unrealizedPnl: import("@prisma/client/runtime/library").Decimal;
            realizedPnl: import("@prisma/client/runtime/library").Decimal;
            stopLoss: import("@prisma/client/runtime/library").Decimal | null;
            takeProfit: import("@prisma/client/runtime/library").Decimal | null;
            highestPrice: import("@prisma/client/runtime/library").Decimal | null;
            lowestPrice: import("@prisma/client/runtime/library").Decimal | null;
            openedAt: Date;
            closedAt: Date | null;
            version: number;
            exchangeSymbol: string | null;
        }[];
    }>;
    changeStrategy(req: any, dto: ChangeStrategyDto): Promise<{
        success: boolean;
        data: import("./types/agent.types").AgentState;
        message: string;
    }>;
    getRegimeInfo(req: any, symbol?: string): Promise<{
        success: boolean;
        data: {
            regime: import("./types/agent.types").MarketRegime;
            confidence: number;
            indicators: {
                trendStrength: number;
                volatilityLevel: string;
                emaAlignment: "BULLISH" | "BEARISH" | "MIXED";
                bbBandwidth: number;
                adxProxy: number;
                momentumDirection: "UP" | "DOWN" | "FLAT";
            };
            recommendedStrategies: StrategyType[];
            currentStrategy: StrategyType | null;
            strategyScores: {
                strategy: StrategyType;
                score: number;
                reason: string;
            }[];
        } | null;
        message?: undefined;
    } | {
        success: boolean;
        message: any;
        data: null;
    }>;
    updateRiskParams(req: any, dto: UpdateRiskParamsDto): Promise<{
        success: boolean;
        data: import("./types/agent.types").AgentState;
        message: string;
    }>;
    getSettings(req: any): Promise<{
        success: boolean;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            paperBalance: import("@prisma/client/runtime/library").Decimal;
            autoTradingEnabled: boolean;
            paperForexLeverage: number;
            paperGoldLeverage: number;
            paperCryptoLeverage: number;
            maxPositionSizePercent: import("@prisma/client/runtime/library").Decimal;
            maxDailyLossPercent: import("@prisma/client/runtime/library").Decimal;
            maxOpenPositions: number;
            riskPerTradePercent: import("@prisma/client/runtime/library").Decimal;
            defaultStrategy: string;
            scalpingTimeframe: string;
            scalpingTakeProfitPips: number;
            scalpingStopLossPips: number;
            scalpingMaxSpread: number;
            swingTimeframe: string;
            swingHoldingPeriodHours: number;
            swingTrendLookback: number;
            gridLevels: number;
            gridSpacingPercent: import("@prisma/client/runtime/library").Decimal;
            gridQuantityPerLevel: import("@prisma/client/runtime/library").Decimal | null;
            defaultSymbols: string;
        };
    }>;
    updateSettings(req: any, dto: UpdateAgentSettingsDto): Promise<{
        success: boolean;
        data: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            paperBalance: import("@prisma/client/runtime/library").Decimal;
            autoTradingEnabled: boolean;
            paperForexLeverage: number;
            paperGoldLeverage: number;
            paperCryptoLeverage: number;
            maxPositionSizePercent: import("@prisma/client/runtime/library").Decimal;
            maxDailyLossPercent: import("@prisma/client/runtime/library").Decimal;
            maxOpenPositions: number;
            riskPerTradePercent: import("@prisma/client/runtime/library").Decimal;
            defaultStrategy: string;
            scalpingTimeframe: string;
            scalpingTakeProfitPips: number;
            scalpingStopLossPips: number;
            scalpingMaxSpread: number;
            swingTimeframe: string;
            swingHoldingPeriodHours: number;
            swingTrendLookback: number;
            gridLevels: number;
            gridSpacingPercent: import("@prisma/client/runtime/library").Decimal;
            gridQuantityPerLevel: import("@prisma/client/runtime/library").Decimal | null;
            defaultSymbols: string;
        };
        message: string;
    }>;
    getSystemStatus(): Promise<{
        success: boolean;
        data: {
            autoTradingEnabled: boolean;
            globalAutoTradingEnabled: boolean;
            source: string;
            defaultPaperBalance: number;
            nodeEnv: any;
            message: string;
        };
    }>;
    updateSystemSettings(req: any, body: {
        autoTradingEnabled?: boolean;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
