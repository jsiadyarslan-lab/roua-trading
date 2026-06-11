import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { CredentialsService } from '../../portfolio/credentials/credentials.service';
import { OrderStateManagerService } from './order-state-manager.service';

/**
 * Position Reconciliation Service — Background Job
 *
 * FIX: Processes failed position updates from the PositionReconciliation table.
 * When an order is executed on the exchange but the position update transaction
 * fails (e.g., due to serialization conflict or DB timeout), the order data
 * is stored in PositionReconciliation for retry.
 *
 * This service runs every 30 seconds and:
 * 1. Finds PENDING reconciliation records
 * 2. Retries the position update with the same SERIALIZABLE isolation
 * 3. Marks records as RESOLVED on success, or FAILED after 5 attempts
 * 4. Logs all reconciliation activity for audit trail
 *
 * Without this service, "lost positions" accumulate — the user has open
 * exchange exposure with no corresponding database record.
 */
@Injectable()
export class PositionReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PositionReconciliationService.name);
  private interval: NodeJS.Timeout | null = null;
  private readonly MAX_ATTEMPTS = 5;
  private readonly INTERVAL_MS = 30_000; // 30 seconds

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: CredentialsService,
    private readonly stateManager: OrderStateManagerService,
  ) {}

  async onModuleInit() {
    this.interval = setInterval(() => this._processPending(), this.INTERVAL_MS);
    this.logger.log('🔄 Position Reconciliation Service started — checking every 30s');
  }

  async onModuleDestroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Process all PENDING reconciliation records
   */
  private async _processPending(): Promise<void> {
    // FIX: Skip cycle when DB is unavailable to prevent connection pool exhaustion
    if (!this.prisma.isAvailable?.()) {
      return;
    }

    try {
      const pending = await this.prisma.positionReconciliation.findMany({
        where: {
          status: { in: ['PENDING', 'RETRYING'] },
          attempts: { lt: this.MAX_ATTEMPTS },
        },
        orderBy: { createdAt: 'asc' },
        take: 20, // Process max 20 per cycle
      });

      if (pending.length === 0) return;

      this.logger.log(`🔄 Processing ${pending.length} pending reconciliation records`);

      for (const record of pending) {
        await this._reconcileRecord(record);
      }
    } catch (error: any) {
      this.logger.error(`🔄 Reconciliation cycle failed: ${error.message}`);
    }
  }

  /**
   * Attempt to reconcile a single failed position update
   */
  private async _reconcileRecord(record: any): Promise<void> {
    // Mark as retrying
    await this.prisma.positionReconciliation.update({
      where: { id: record.id },
      data: {
        status: 'RETRYING',
        lastAttemptAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    try {
      const filledQuantity = Number(record.filledQuantity);
      const fillPrice = Number(record.fillPrice);

      if (filledQuantity <= 0) {
        await this.prisma.positionReconciliation.update({
          where: { id: record.id },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        });
        return;
      }

      // Retry the position update with the same SERIALIZABLE isolation
      await this.prisma.$transaction(async (tx) => {
        // Verify credential ownership
        const credential = await tx.exchangeCredential.findUnique({
          where: { id: record.exchangeCredentialId },
        });

        if (!credential) {
          throw new Error(`Credential ${record.exchangeCredentialId} not found`);
        }

        if (credential.userId !== record.userId) {
          throw new Error(`Credential ownership mismatch for user ${record.userId}`);
        }

        // Check for existing position
        const existingPosition = await tx.position.findFirst({
          where: {
            userId: record.userId,
            symbol: record.symbol,
            status: 'OPEN',
            side: record.side as any,
          },
        });

        if (existingPosition) {
          // Add to existing position
          const totalQuantity = Number(existingPosition.quantity) + filledQuantity;
          const avgPrice =
            (Number(existingPosition.entryPrice) * Number(existingPosition.quantity) +
              fillPrice * filledQuantity) /
            totalQuantity;

          await tx.position.update({
            where: { id: existingPosition.id },
            data: {
              quantity: totalQuantity,
              entryPrice: avgPrice,
              stopLoss: record.stopLoss ? Number(record.stopLoss) : undefined,
              takeProfit: record.takeProfit ? Number(record.takeProfit) : undefined,
            },
          });
        } else {
          // Create new position
          await tx.position.create({
            data: {
              userId: record.userId,
              credentialId: record.exchangeCredentialId,
              exchange: credential.exchange,
              symbol: record.symbol,
              side: record.side as any,
              status: 'OPEN',
              quantity: filledQuantity,
              entryPrice: fillPrice,
              currentPrice: fillPrice,
              highestPrice: fillPrice,
              lowestPrice: fillPrice,
              stopLoss: record.stopLoss ? Number(record.stopLoss) : undefined,
              takeProfit: record.takeProfit ? Number(record.takeProfit) : undefined,
              source: 'reconciliation',
            },
          });
        }

        // Record trade
        await tx.trade.create({
          data: {
            userId: record.userId,
            orderId: record.orderId,
            credentialId: record.exchangeCredentialId,
            exchange: credential.exchange,
            symbol: record.symbol,
            side: record.side as any,
            type: 'ENTRY',
            quantity: filledQuantity,
            price: fillPrice,
            source: 'reconciliation',
          },
        });
      }, {
        isolationLevel: 'Serializable' as any,
      });

      // Mark as resolved
      await this.prisma.positionReconciliation.update({
        where: { id: record.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
        },
      });

      this.logger.log(
        `🔄 Reconciliation RESOLVED for order ${record.orderId} (attempt ${record.attempts + 1})`,
      );
    } catch (error: any) {
      const newAttempts = record.attempts + 1;

      if (newAttempts >= this.MAX_ATTEMPTS) {
        // Max attempts reached — mark as permanently failed
        await this.prisma.positionReconciliation.update({
          where: { id: record.id },
          data: {
            status: 'FAILED',
            lastError: error.message?.substring(0, 500),
          },
        });
        this.logger.error(
          `🔄 Reconciliation FAILED permanently for order ${record.orderId} after ${newAttempts} attempts: ${error.message}`,
        );
      } else {
        // Reset to PENDING for next cycle
        await this.prisma.positionReconciliation.update({
          where: { id: record.id },
          data: {
            status: 'PENDING',
            lastError: error.message?.substring(0, 500),
          },
        });
        this.logger.warn(
          `🔄 Reconciliation retry ${newAttempts}/${this.MAX_ATTEMPTS} for order ${record.orderId}: ${error.message}`,
        );
      }
    }
  }
}
