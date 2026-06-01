import { Queue } from 'bullmq';
import { IdempotencyService } from '../services/idempotency.service';
import { RiskGatekeeperService } from '../services/risk-gatekeeper.service';
import { OrderStateManagerService } from '../services/order-state-manager.service';
import { PositionManagerService } from '../services/position-manager.service';
import { OrderProducerService } from '../services/order-producer.service';
import { PlaceOrderDto as V2PlaceOrderDto } from './dtos/place-order.dto';
export declare class OrderController {
    private readonly idempotencyService;
    private readonly riskGatekeeper;
    private readonly stateManager;
    private readonly positionManager;
    private readonly orderProducer;
    private readonly executionQueue;
    private readonly logger;
    constructor(idempotencyService: IdempotencyService, riskGatekeeper: RiskGatekeeperService, stateManager: OrderStateManagerService, positionManager: PositionManagerService, orderProducer: OrderProducerService, executionQueue: Queue | null);
    placeOrder(req: any, body: V2PlaceOrderDto): Promise<{
        success: boolean;
        data: {
            orderId: any;
            status: string;
            idempotencyKey: string;
            riskScore: number | undefined;
        };
    }>;
    getOrders(req: any, symbol?: string, status?: string, limitStr?: string): Promise<{
        success: boolean;
        data: any[];
    }>;
    getOrder(req: any, orderId: string): Promise<{
        success: boolean;
        data: any;
    }>;
    cancelOrder(req: any, orderId: string): Promise<{
        success: boolean;
        data: {
            orderId: string;
            status: string;
        };
    }>;
    getOpenPositions(req: any): Promise<{
        success: boolean;
        data: import("../events/order.events").PositionInfo[];
    }>;
    getPortfolioSummary(req: any): Promise<{
        success: boolean;
        data: import("../events/order.events").PortfolioSummary;
    }>;
    private _validateOrderBusinessLogic;
}
