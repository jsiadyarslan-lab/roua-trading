import { SignalService } from './signal.service';
export declare class SignalController {
    private readonly signalService;
    private readonly logger;
    constructor(signalService: SignalService);
    generateSignal(req: any, pair: string): Promise<{
        success: boolean;
        data: {
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
        };
    }>;
    getActiveSignals(req: any): Promise<{
        success: boolean;
        data: {
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
    }>;
    getSignalHistory(req: any): Promise<{
        success: boolean;
        data: {
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
    }>;
    executeSignal(req: any, signalId: string, body: {
        credentialId?: string;
        quantity?: number;
    }): Promise<{
        success: boolean;
        data: {
            signal: {
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
            };
            order: {
                symbol: string;
                type: import(".prisma/client").$Enums.OrderType;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                userId: string;
                exchange: string;
                price: import("@prisma/client/runtime/library").Decimal | null;
                status: import(".prisma/client").$Enums.OrderStatus;
                quantity: import("@prisma/client/runtime/library").Decimal;
                side: import(".prisma/client").$Enums.OrderSide;
                stopLoss: import("@prisma/client/runtime/library").Decimal | null;
                takeProfit: import("@prisma/client/runtime/library").Decimal | null;
                fee: import("@prisma/client/runtime/library").Decimal | null;
                feeCurrency: string | null;
                signalId: string | null;
                timeInForce: string | null;
                filledQuantity: import("@prisma/client/runtime/library").Decimal;
                averagePrice: import("@prisma/client/runtime/library").Decimal | null;
                exchangeOrderId: string | null;
                rejectReason: string | null;
                idempotencyKey: string;
                clientOrderId: string | null;
                exchangeCredentialId: string;
            };
            executionDetails: {
                quantity: number;
                entryPrice: number;
                stopLoss: number;
                takeProfit: number | undefined;
                riskRewardRatio: number | null;
            };
        };
    }>;
    cancelSignal(req: any, id: string): Promise<{
        success: boolean;
        data: {
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
        };
    }>;
}
