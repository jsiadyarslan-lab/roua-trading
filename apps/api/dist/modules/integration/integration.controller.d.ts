import { ExchangeService } from '../exchange/exchange.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ContentAgentService } from '../../agents/content/content-agent.service';
export declare class IntegrationController {
    private readonly exchangeService;
    private readonly prisma;
    private readonly configService;
    private readonly contentAgent;
    private readonly logger;
    constructor(exchangeService: ExchangeService, prisma: PrismaService, configService: ConfigService, contentAgent: ContentAgentService);
    healthCheck(): Promise<{
        status: string;
        service: string;
        version: string;
        timestamp: string;
        checks: Record<string, {
            [key: string]: any;
            status: string;
            latencyMs?: number;
            error?: string;
        }>;
    }>;
    getChartData(symbol: string, interval?: string, limit?: string): Promise<{
        error: string;
        status: number;
        symbol?: undefined;
        interval?: undefined;
        candles?: undefined;
        count?: undefined;
        timestamp?: undefined;
    } | {
        symbol: string;
        interval: string;
        candles: import("../exchange/exchange.types").UnifiedCandleDto[];
        count: number;
        timestamp: string;
        error?: undefined;
        status?: undefined;
    } | {
        symbol: string;
        error: any;
        timestamp: string;
        status?: undefined;
        interval?: undefined;
        candles?: undefined;
        count?: undefined;
    }>;
    getQuote(symbol: string): Promise<{
        error: string;
        status: number;
        symbol?: undefined;
        quote?: undefined;
        timestamp?: undefined;
    } | {
        symbol: string;
        quote: import("../exchange/exchange.types").UnifiedQuoteDto;
        timestamp: string;
        error?: undefined;
        status?: undefined;
    } | {
        symbol: string;
        error: any;
        timestamp: string;
        status?: undefined;
        quote?: undefined;
    }>;
    getActiveSignals(symbol?: string, limit?: string): Promise<{
        signals: {
            id: string;
            action: import(".prisma/client").$Enums.SignalAction;
            createdAt: Date;
            updatedAt: Date;
            userId: string;
            expiresAt: Date;
            confidence: number;
            status: import(".prisma/client").$Enums.SignalStatus;
            reason: string;
            entryPrice: import("@prisma/client/runtime/library").Decimal | null;
            stopLoss: import("@prisma/client/runtime/library").Decimal | null;
            takeProfit: import("@prisma/client/runtime/library").Decimal | null;
            pair: string;
        }[];
        count: number;
        timestamp: string;
        error?: undefined;
    } | {
        error: any;
        timestamp: string;
        signals?: undefined;
        count?: undefined;
    }>;
    getSignalHistory(limit?: string): Promise<{
        signals: {
            id: string;
            action: import(".prisma/client").$Enums.SignalAction;
            createdAt: Date;
            expiresAt: Date;
            confidence: number;
            status: import(".prisma/client").$Enums.SignalStatus;
            reason: string;
            entryPrice: import("@prisma/client/runtime/library").Decimal | null;
            stopLoss: import("@prisma/client/runtime/library").Decimal | null;
            takeProfit: import("@prisma/client/runtime/library").Decimal | null;
            pair: string;
        }[];
        count: number;
        timestamp: string;
        error?: undefined;
    } | {
        error: any;
        timestamp: string;
        signals?: undefined;
        count?: undefined;
    }>;
    getSignalStats(): Promise<{
        total: number;
        active: number;
        expired: number;
        executed: number;
        cancelled: number;
        recentSignals: number;
        timestamp: string;
        error?: undefined;
    } | {
        error: any;
        timestamp: string;
        total?: undefined;
        active?: undefined;
        expired?: undefined;
        executed?: undefined;
        cancelled?: undefined;
        recentSignals?: undefined;
    }>;
    getContentFeed(limit?: string, category?: string, type?: string, symbol?: string): Promise<{
        success: boolean;
        articles: any;
        count: any;
        timestamp: string;
        error?: undefined;
    } | {
        success: boolean;
        articles: never[];
        count: number;
        error: any;
        timestamp: string;
    }>;
    getNewsFromNewsSite(limit?: string, category?: string, symbol?: string): Promise<any>;
}
