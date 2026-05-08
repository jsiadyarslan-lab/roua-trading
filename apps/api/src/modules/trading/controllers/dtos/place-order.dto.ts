// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Roua Trading (رؤى) — Place Order DTO (v2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Data Transfer Object for the v2 order placement endpoint.
// Uses class-validator decorators for automatic validation via
// NestJS ValidationPipe (configured globally in main.ts).
//
// SECURITY: Previously, the v2 order controller used @Body() body: any
// with manual validation only. This meant the global ValidationPipe
// couldn't strip unknown properties or enforce type constraints.
// Now, class-validator handles field types, required checks, and
// min/max values, while the controller handles business-logic rules.

import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  Min,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { OrderSide, OrderType } from '@prisma/client';

// Re-export Prisma enums for DTO use — single source of truth
export { OrderSide as V2OrderSide, OrderType as V2OrderType } from '@prisma/client';

export class PlaceOrderDto {
  @IsString()
  exchangeCredentialId!: string;

  @IsString()
  @MaxLength(30)
  symbol!: string;

  @IsEnum(OrderSide)
  side!: OrderSide;

  @IsEnum(OrderType)
  type!: OrderType;

  @IsNumber()
  @Min(0.00001)
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  stopLoss?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  takeProfit?: number;

  @IsString()
  @MaxLength(128)
  idempotencyKey!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientOrderId?: string;
}
