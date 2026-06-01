import { OrderSide, OrderType } from '../../trading.types';
export declare class PlaceOrderDto {
    exchangeCredentialId: string;
    symbol: string;
    side: OrderSide;
    type: OrderType;
    quantity: number;
    price?: number;
    stopLoss: number;
    takeProfit?: number;
    idempotencyKey: string;
    clientOrderId?: string;
}
