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
  Matches,
} from 'class-validator';
import { OrderSide, OrderType } from '../../trading.types';
import { t } from '../../../../i18n/i18n.helper';

// Re-export Prisma enums for DTO use — single source of truth

export class PlaceOrderDto {
  // V239: Accept BOTH credentialId (V1/frontend) and exchangeCredentialId (V2).
  // The frontend (chart + widget) sends `credentialId`, while the V2
  // OrderController expects `exchangeCredentialId`. Both map to the same
  // ExchangeCredential FK. The controller reads body.credentialId first,
  // then falls back to body.exchangeCredentialId.
  @IsOptional()
  @IsString()
  credentialId?: string;

  @IsOptional()
  @IsString()
  exchangeCredentialId?: string;

  @IsString()
  @MaxLength(30)
  // SECURITY: Only allow alphanumeric + / . - _ (no SQL/shell special chars)
  @Matches(/^[A-Za-z0-9\/\.\-_]+$/, { message: t('place_order_dto.trading_not_valid') })
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

  @IsNumber()
  @Min(0.00001)
  stopLoss!: number;

  @IsOptional()
  @IsNumber()
  @Min(0.00001)
  takeProfit?: number;

  // V239: Made optional — frontend (chart/widget) doesn't send this.
  // The controller generates one if not provided.
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientOrderId?: string;
}
