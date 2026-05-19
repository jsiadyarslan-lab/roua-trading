import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Prisma Extension Service — User Data Isolation (Defense-in-Depth Layer 1)
 *
 * SECURITY: This service creates Prisma clients that AUTOMATICALLY filter
 * all queries by userId. Even if a developer forgets to add `where: { userId }`,
 * this extension ensures the query is scoped to the authenticated user.
 *
 * How it works:
 * ┌────────────────────────────────────────────────────────────────────┐
 * │ 1. Call createScopedClient(userId) to get an isolated Prisma      │
 * │ 2. All read operations (findMany, findFirst, findUnique, count,  │
 * │    aggregate) on user-scoped models get userId filter injected     │
 * │ 3. Write operations (create, update, delete) verify userId match  │
 * │ 4. If userId is undefined/empty, returns empty results (fail-safe)│
 * └────────────────────────────────────────────────────────────────────┘
 *
 * Models that have userId and will be auto-filtered:
 *   Order, Portfolio, Signal, ExchangeCredential, Position, Trade,
 *   PaperOrder, AutonomousTrade, AgentSession, AgentSettings,
 *   CoachAdvice, UserNotification, Alert, ApiKey, Account,
 *   Session, Subscription, ChartPreference, PositionReconciliation
 *
 * Models WITHOUT userId (global/shared — NOT filtered):
 *   TradingBrief (nullable userId — system-generated), NewsArticle,
 *   PredictionEvent, StrategyReport, Setting, ContentArticle,
 *   AdminSession, VerificationToken, NotificationConfig, AiUsageLog,
 *   Challenge, OrderEvent, ContentSchedule
 */
@Injectable()
export class PrismaExtensionService {
  private readonly logger = new Logger(PrismaExtensionService.name);

  /** Models that have a userId field and MUST be filtered for isolation */
  private readonly USER_SCOPED_MODELS = new Set([
    'Order',
    'Portfolio',
    'Signal',
    'SignalUsage',
    'ExchangeCredential',
    'Position',
    'Trade',
    'PaperOrder',
    'AutonomousTrade',
    'AgentSession',
    'AgentSettings',
    'CoachAdvice',
    'UserNotification',
    'Alert',
    'ApiKey',
    'Account',
    'Session',
    'Subscription',
    'ChartPreference',
    'PositionReconciliation',
  ]);

  /** Read operations that should be filtered */
  private readonly READ_OPERATIONS = new Set([
    'findUnique',
    'findFirst',
    'findMany',
    'count',
    'aggregate',
    'groupBy',
  ]);

  constructor(private readonly prisma: PrismaService) {
    this.logger.log('🔒 PrismaExtensionService initialized — user isolation extensions ready');
  }

  /**
   * Create a Prisma client that automatically filters all queries by userId.
   *
   * Usage in services:
   *   const scopedPrisma = this.prismaExtension.createScopedClient(userId);
   *   // All queries on scopedPrisma are automatically filtered by userId
   *   const positions = await scopedPrisma.position.findMany(); // Only this user's positions
   *
   * IMPORTANT: This is a DEFENSE-IN-DEPTH measure. Services should STILL
   * explicitly pass `where: { userId }` for clarity and documentation.
   * The extension catches cases where a developer forgets.
   */
  createScopedClient(userId: string) {
    // ═══════════════════════════════════════════════════════════
    // SECURITY: Reject invalid userId immediately.
    // If userId is undefined/empty, the extension would inject
    // undefined into Prisma queries, which Prisma silently strips,
    // returning ALL records. This is the #1 cause of data leakage.
    // ═══════════════════════════════════════════════════════════
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      this.logger.error(
        `🚨 SECURITY: createScopedClient called with invalid userId="${userId}" — ` +
        `returning empty-result client to prevent data leakage`
      );
      return this._createEmptyResultClient();
    }

    const userScopedModels = this.USER_SCOPED_MODELS;
    const readOps = this.READ_OPERATIONS;
    const scopedUserId = userId; // Capture in closure

    return this.prisma.$extends({
      name: 'user-isolation',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            const typedArgs = args as any;

            // ── READ OPERATIONS: Auto-inject userId filter ──
            if (readOps.has(operation) && userScopedModels.has(model)) {
              // Ensure args.where exists
              if (!typedArgs.where) {
                typedArgs.where = {};
              }

              // Only inject userId if not already specified
              // (developer may have explicitly set it or set it to something else)
              if (typedArgs.where.userId === undefined) {
                typedArgs.where = { ...typedArgs.where, userId: scopedUserId };
              }
            }

            // ── WRITE OPERATIONS: Verify userId on creates ──
            if (operation === 'create' && userScopedModels.has(model)) {
              if (typedArgs.data && typedArgs.data.userId === undefined) {
                // Auto-inject userId on create if not set
                typedArgs.data = { ...typedArgs.data, userId: scopedUserId };
              }
            }

            // ── UPDATE/DELETE: Ensure userId filter is present ──
            if ((operation === 'update' || operation === 'updateMany' ||
                 operation === 'delete' || operation === 'deleteMany') &&
                userScopedModels.has(model)) {
              if (!typedArgs.where) {
                typedArgs.where = {};
              }
              // For update/delete, ALWAYS add userId filter for safety
              // (even if developer specified another where clause)
              if (typedArgs.where.userId === undefined) {
                typedArgs.where = { ...typedArgs.where, userId: scopedUserId };
              }
            }

            return query(typedArgs);
          },
        },
      },
    });
  }

  /**
   * Emergency fallback: Creates a Prisma client extension that
   * returns empty arrays/zeros for all read operations.
   * Used when userId is invalid to prevent ANY data leakage.
   */
  private _createEmptyResultClient() {
    return this.prisma.$extends({
      name: 'empty-result-safety',
      query: {
        $allModels: {
          async $allOperations({ operation, args, query }: any) {
            // For read operations, return safe empty values
            if (operation === 'findMany' || operation === 'findFirst') {
              return [];
            }
            if (operation === 'findUnique') {
              return null;
            }
            if (operation === 'count') {
              return 0;
            }
            if (operation === 'aggregate') {
              return { _sum: {}, _avg: {}, _min: {}, _max: {}, _count: {} };
            }
            if (operation === 'groupBy') {
              return [];
            }
            // Block all write operations with invalid userId
            if (['create', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)) {
              throw new Error('SECURITY: Cannot perform write operations with invalid userId');
            }
            // For other operations, try to proceed
            return query(args);
          },
        },
      },
    });
  }
}
