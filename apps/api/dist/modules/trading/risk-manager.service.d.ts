import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
export declare class RiskManagerService {
    private readonly prisma;
    private readonly configService;
    private readonly logger;
    private maxPositionSizePercent;
    private maxOpenPositions;
    private maxDailyLossPercent;
    private defaultStopLossPercent;
    private defaultTakeProfitPercent;
    private minOrderSize;
    private lastSettingsSync;
    private readonly SETTINGS_SYNC_INTERVAL;
    constructor(prisma: PrismaService, configService: ConfigService);
    private syncSettingsFromDB;
    checkOrderRisk(userId: string, symbol: string, side: string, quantity: number, price: number, exchangeName?: string, exchangeCredentialId?: string): Promise<{
        allowed: boolean;
        reason?: string;
        riskScore?: number;
    }>;
    calculatePositionSize(portfolioValue: number, entryPrice: number, stopLossPrice: number, riskPercent?: number, symbol?: string): {
        quantity: number;
        riskAmount: number;
        lots?: number;
        margin?: number;
        notional?: number;
    };
    getDefaultLevels(entryPrice: number, side: 'BUY' | 'SELL'): {
        stopLoss: number;
        takeProfit: number;
    };
    getRiskParameters(): {
        maxPositionSizePercent: number;
        maxOpenPositions: number;
        maxDailyLossPercent: number;
        defaultStopLossPercent: number;
        defaultTakeProfitPercent: number;
        minOrderSize: number;
    };
    private _estimatePortfolioValue;
    private _isTestExchange;
    private _calculateDailyLoss;
    private _calculateRiskScore;
}
