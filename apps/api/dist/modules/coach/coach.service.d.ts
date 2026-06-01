import { PrismaService } from '../../common/prisma/prisma.service';
import { AIOrchestratorService } from '../ai/services/ai-orchestrator.service';
export interface TradeStats {
    totalTrades: number;
    winningTrades: number;
    losingTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    totalPnl: number;
    maxDrawdown: number;
    sharpeRatio: number | null;
    mostTradedSymbol: string;
    avgTradeDuration: string;
    riskCompliance: string;
    biggestWin: number;
    biggestLoss: number;
    consecutiveWins: number;
    consecutiveLosses: number;
    longWinRate: number;
    shortWinRate: number;
}
export declare class CoachService {
    private readonly prisma;
    private readonly orchestrator;
    private readonly logger;
    constructor(prisma: PrismaService, orchestrator: AIOrchestratorService);
    getPerformanceAdvice(userId: string): Promise<{
        success: boolean;
        data: {
            id: string;
            rating: string;
            statistics: TradeStats;
            adviceText: string;
            adviceItems: {
                type: string;
                icon: string;
                text: string;
            }[];
            createdAt: Date;
        };
    }>;
    askCoach(userId: string, question: string, contextAdviceId?: string): Promise<{
        success: boolean;
        data: {
            question: string;
            answer: string;
            model: string;
        };
    }>;
    getAdviceHistory(userId: string): Promise<{
        success: boolean;
        data: {
            id: string;
            rating: string;
            adviceText: string;
            adviceItems: any;
            statistics: any;
            isRead: boolean;
            createdAt: Date;
        }[];
    }>;
    private calculateStats;
    private calculateRating;
    private buildContextSummary;
    private parseAdviceItems;
    private generateRuleBasedAdvice;
    private generateFallbackAnswer;
    private calculatePaperPnl;
}
