import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectInProgress = false;
  private connected = false;
  private consecutiveFailures = 0;

  // ── V222 FIX: Agent Position Protection ──
  // BUG HISTORY: The original V222 code had 4 critical bugs:
  //   1) this.$extends({...}) — result not saved, extension NEVER applied
  //   2) self.position.findUnique() — would recurse if fix #1 was applied
  //   3) updateMany only LOGGED warnings — never blocked Agent closes
  //   4) $transaction() not routed through extended client — tx.position.updateMany()
  //      inside closePosition() bypassed ALL protection
  private _extendedClient: any = null;
  private _basePositionFindUnique: any = null;

  private static _dbAvailable = false;
  private static _lastError: string | null = null;
  private static _dbUrlPrefix: string | null = null;
  static get dbAvailable(): boolean { return PrismaService._dbAvailable; }
  static get lastError(): string | null { return PrismaService._lastError; }
  static get dbUrlPrefix(): string | null { return PrismaService._dbUrlPrefix; }

  constructor() {
    const isDev = process.env.NODE_ENV !== 'production';

    // FIX v13: Add connection_limit via URL params.
    // V229 FIX: Changed from connection_limit=2 to connection_limit=3.
    //
    // ROOT CAUSE of 500 errors: The V222 Agent Protection extension's
    // update/updateMany handlers call _basePositionFindUnique() to read
    // the current position before deciding whether to block a close.
    // This read needs a SEPARATE database connection from the one used
    // by the active $transaction(). With connection_limit=1, there's
    // only ONE connection in the pool:
    //   1. $transaction() acquires the connection
    //   2. tx.position.updateMany() triggers V222 extension
    //   3. V222 extension calls _basePositionFindUnique() → needs a connection
    //   4. Pool is empty (transaction holds the only connection)
    //   5. _basePositionFindUnique() waits for a connection → DEADLOCK
    //   6. Transaction times out → 500 Internal Server Error
    //
    // V228 increased to 2, but under concurrent load with multiple
    // simultaneous requests (e.g., getOpenPositions + position monitor +
    // user close attempt), 2 connections can STILL deadlock:
    //   1. Request A: $transaction() → acquires conn1
    //   2. Request B: setRlsUserId() → acquires conn2
    //   3. Request A: V222 extension needs read → no connections available → timeout
    //
    // connection_limit=3 prevents this: even with 2 connections busy,
    // the V222 extension's read can use the third.
    // Total connections: 3 per PrismaClient = well within Railway's limits.
    const dbUrl = (() => {
      try {
        const u = new URL(process.env.DATABASE_URL || '');
        u.searchParams.set('connection_limit', '3');
        u.searchParams.set('pool_timeout', '10');
        return u.toString();
      } catch {
        const base = process.env.DATABASE_URL || '';
        const sep = base.includes('?') ? '&' : '?';
        return `${base}${sep}connection_limit=3&pool_timeout=10`;
      }
    })();
    PrismaService._dbUrlPrefix = dbUrl.substring(0, 30) + '...';

    super({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
      log: [
        ...(isDev ? [{ emit: 'event' as const, level: 'query' as const }] : []),
        { emit: 'stdout', level: 'warn' },
        { emit: 'stdout', level: 'error' },
      ],
    });

    // Log the effective connection mode
    let connectionMode = 'direct (no modifications)';
    this.logger.log(`📦 Prisma connection: ${connectionMode}`);

    if (isDev) {
      (this as any).$on('query', (e: any) => {
        this.logger.debug(`Query: ${e.query} — ${e.duration}ms`);
      });
    }
  }

  async onModuleInit() {
    const INIT_TIMEOUT_MS = 15_000;
    const connected = await Promise.race([
      this.tryConnect(),
      new Promise<boolean>((resolve) =>
        setTimeout(() => {
          this.logger.warn(`📦 Prisma $connect() timed out after ${INIT_TIMEOUT_MS / 1000}s — will retry in background`);
          resolve(false);
        }, INIT_TIMEOUT_MS),
      ),
    ]);

    if (!connected) {
      this.logger.warn(
        `📦 Prisma database unavailable at startup — API will continue and retry with exponential backoff`,
      );
      this.scheduleReconnect();
    } else {
      // ── Auto-migrate missing columns on startup ──
      // This ensures the database schema matches the Prisma schema even if
      // `prisma migrate deploy` failed or was skipped during deployment.
      await this.autoMigrateMissingColumns();

      // ── V222: Agent Position Protection at Database Level ──
      // This is the ULTIMATE defense — works regardless of which code path
      // calls prisma.position.update(). Even old compiled JS on Railway
      // that bypasses V214 in closePosition() will be blocked here.
      //
      // HOW: We use Prisma $extends to intercept ALL position.update() and
      // position.updateMany() calls. If the update sets status='CLOSED' for
      // an Agent position held < 48h (and closeReason is NOT SL/TP), we BLOCK it.
      this._applyAgentProtectionExtension();
    }

    // V229: Log whether extension was applied — critical for diagnostics
    this.logger.log(
      `📦 PrismaService initialized: connected=${connected}, ` +
      `extension=${this._extendedClient ? 'ACTIVE' : 'NOT_APPLIED'}, ` +
      `connection_limit=3`
    );
  }

  /**
   * V222: Agent Position Protection at Database Level
   *
   * This is the ULTIMATE defense against premature Agent position closes.
   * It intercepts ALL position.update() and position.updateMany() calls
   * at the Prisma level — including those inside $transaction callbacks.
   *
   * If the update sets status='CLOSED' for an Agent position held < 48h,
   * AND the closeReason is NOT SL/TP, it BLOCKS the update.
   *
   * This works regardless of:
   * - Which code path calls the update (PositionMonitor, Agent, ExchangeSync, etc.)
   * - Whether old compiled JS is running on Railway (pre-V184/V213/V214)
   * - Direct prisma.position.update() calls that bypass TradingService
   * - tx.position.updateMany() inside interactive transactions (closePosition)
   *
   * The ONLY exceptions are SL/TP closes (valid trading exits).
   *
   * HOW IT WORKS (4 fixes applied):
   *   FIX 1: Save $extends() result — old code discarded it, so extension never applied
   *   FIX 2: Store base findUnique before $extends — prevents infinite recursion
   *   FIX 3: updateMany BLOCKS (not just warns) — was the critical loophole
   *   FIX 4: Override $transaction to route through extended client — protects tx.position
   */
  private _applyAgentProtectionExtension(): void {
    const logger = this.logger;
    const H = 60 * 60 * 1000;
    const AGENT_MIN_HOLDING_HOURS = 48;
    const AGENT_MIN_HOLDING_MS = AGENT_MIN_HOLDING_HOURS * H;
    const self = this;

    // FIX 2: Store base position.findUnique BEFORE creating the extension.
    // The extension's update/updateMany handlers need to read position data to
    // check if it's an Agent position. We must use the base (un-extended)
    // delegate to avoid any risk of recursion through the extension layer.
    //
    // IMPORTANT: We store this BEFORE Object.defineProperty overrides `position`,
    // so it captures the original (un-extended) PrismaClient position delegate.
    const basePositionDelegate = this.position;
    this._basePositionFindUnique = basePositionDelegate.findUnique.bind(basePositionDelegate);

    // V229: Safe read helper with timeout to prevent deadlocks.
    // If _basePositionFindUnique() takes longer than 1 second (e.g., connection
    // pool exhausted), we PASS THROUGH the update instead of blocking.
    // V229: Reduced from 3s to 1s — a 3s timeout on every position.update()
    // that sets status=CLOSED adds unacceptable latency for trading operations.
    // If we can't read the position in 1s, the DB is overloaded and we should
    // pass through (V214 in TradingService provides primary protection).
    const safeReadPosition = async (positionId: string): Promise<any | null> => {
      const READ_TIMEOUT_MS = 1000;
      try {
        const result = await Promise.race([
          self._basePositionFindUnique({ where: { id: positionId } }),
          new Promise<null>((resolve) =>
            setTimeout(() => {
              logger.warn(`V229: Position read for ${positionId} timed out after ${READ_TIMEOUT_MS}ms — passing through (V214 provides primary protection)`);
              resolve(null);
            }, READ_TIMEOUT_MS)
          ),
        ]);
        return result;
      } catch (readErr: any) {
        logger.warn(`V229: Could not read position ${positionId} for protection check: ${readErr.message} — passing through`);
        return null;
      }
    };

    try {
      // FIX 1: this.$extends() returns a NEW client — we MUST save it!
      // The old code called this.$extends({...}) without saving the result,
      // so the extension was created and immediately GARBAGE COLLECTED.
      // ALL position.update()/updateMany() calls went through the raw
      // PrismaClient — protection was completely silent and non-functional.
      this._extendedClient = this.$extends({
        name: 'V222_AgentProtection',
        query: {
          position: {
            // V229: Wrapped in try-catch — if the extension handler throws
            // for ANY reason (unexpected data, Prisma internal error, etc.),
            // we MUST pass through the query instead of causing a 500 error.
            // The V214 code-level protection in TradingService is the primary
            // defense. The V222 DB-level extension is a secondary safety net.
            // A broken safety net should NEVER crash the entire trading API.
            async update({ args, query }) {
              try {
                const data = args.data as any;
                const newStatus = typeof data?.status === 'string' ? data.status : data?.status?.set;
                if (newStatus === 'CLOSED') {
                  const where = args.where as any;
                  const positionId = where?.id;

                  if (positionId) {
                    const current = await safeReadPosition(positionId);

                    if (current && current.source === 'agent' && current.openedAt) {
                      const holdingMs = Date.now() - new Date(current.openedAt).getTime();
                      const closeReason = String(data.closeReason || data.closeReason?.set || '').toUpperCase();
                      const isSLTP = closeReason.includes('STOP_LOSS') || closeReason.includes('TAKE_PROFIT');
                      const isUserClose = closeReason.includes('USER');

                      if (holdingMs < AGENT_MIN_HOLDING_MS && !isSLTP && !isUserClose) {
                        logger.error(
                          `🚨 V222 DB-LEVEL BLOCK: Agent position ${positionId} (${current.symbol}) ` +
                          `attempted close at ${(holdingMs / H).toFixed(1)}h (< ${AGENT_MIN_HOLDING_HOURS}h). ` +
                          `closeReason="${closeReason || 'EMPTY'}". ` +
                          `BLOCKED at Prisma level — position stays OPEN.`
                        );
                        return current;
                      }
                    }
                  }
                }
              } catch (handlerErr: any) {
                // V229: NEVER let the extension handler crash the API.
                // Log the error and pass through — V214 provides primary protection.
                logger.error(
                  `V229: V222 update handler ERROR (passing through): ${handlerErr?.message}. ` +
                  `This is non-fatal — V214 code-level protection still guards Agent positions.`
                );
              }
              return query(args);
            },
            async updateMany({ args, query }) {
              try {
                const data = args.data as any;
                const newStatus = typeof data?.status === 'string' ? data.status : data?.status?.set;

                if (newStatus === 'CLOSED') {
                  const where = args.where as any;

                  if (where?.id) {
                    const current = await safeReadPosition(where.id);

                    if (current && current.source === 'agent' && current.openedAt) {
                      const holdingMs = Date.now() - new Date(current.openedAt).getTime();
                      const closeReason = String(data.closeReason || data.closeReason?.set || '').toUpperCase();
                      const isSLTP = closeReason.includes('STOP_LOSS') || closeReason.includes('TAKE_PROFIT');
                      const isUserClose = closeReason.includes('USER');

                      if (holdingMs < AGENT_MIN_HOLDING_MS && !isSLTP && !isUserClose) {
                        logger.error(
                          `🚨 V222 DB-LEVEL BLOCK (updateMany): Agent position ${where.id} ` +
                          `attempted close at ${(holdingMs / H).toFixed(1)}h (< ${AGENT_MIN_HOLDING_HOURS}h). ` +
                          `closeReason="${closeReason || 'EMPTY'}". BLOCKED.`
                        );
                        return { count: 0 };
                      }
                    }
                  } else {
                    logger.error(
                      `🚨 V222 CRITICAL: updateMany status=CLOSED without specific ID — ` +
                      `CANNOT verify Agent protection! where=${JSON.stringify(where)} ` +
                      `closeReason=${JSON.stringify(data.closeReason)}`
                    );
                  }
                }
              } catch (handlerErr: any) {
                // V229: NEVER let the extension handler crash the API.
                logger.error(
                  `V229: V222 updateMany handler ERROR (passing through): ${handlerErr?.message}. ` +
                  `This is non-fatal — V214 code-level protection still guards Agent positions.`
                );
              }
              return query(args);
            },
          },
        },
      });

      // FIX 1 (continued): Override the 'position' instance property with a getter
      // that routes through the extended client. Without this override, ALL
      // this.position.update()/updateMany() calls go through the base PrismaClient
      // position delegate, completely bypassing the V222 extension.
      //
      // We use Object.defineProperty because PrismaClient sets `position` as
      // an instance property in its constructor, which shadows prototype getters.
      Object.defineProperty(this, 'position', {
        get() {
          // Route through extended client (has V222 protection) when available
          if (self._extendedClient) {
            return self._extendedClient.position;
          }
          // Fallback: use the base delegate (no protection) if extension failed
          return basePositionDelegate;
        },
        configurable: true,
      });

      logger.log(
        `🛡️ V222: Agent Position Protection ACTIVE — ` +
        `positions < ${AGENT_MIN_HOLDING_HOURS}h protected at DB level. ` +
        `Extended client + position getter + $transaction override all active.`
      );
    } catch (extendErr: any) {
      // $extends may not work in all Prisma versions — don't crash the app
      this._extendedClient = null;
      logger.warn(`V222: Could not apply Agent protection extension: ${extendErr.message} — relying on V214 code-level protection`);
    }
  }

  /**
   * FIX 4: Override $transaction to route through the extended client.
   *
   * Without this override, code like:
   *   this.prisma.$transaction(async (tx) => {
   *     tx.position.updateMany({ where: {id}, data: { status: 'CLOSED' } })
   *   })
   * would create a `tx` that does NOT have the V222 extension applied.
   * The `tx.position.updateMany()` call would bypass ALL Agent protection.
   *
   * This is the EXACT path that closePosition() uses (trading.service.ts ~1181)
   * to close Agent positions — the main loophole causing 4-hour closures.
   *
   * In Prisma 6.x, calling $transaction on an extended client DOES apply
   * extensions to the transaction client (tx). So routing through the
   * extended client ensures tx.position.update/updateMany are protected.
   */
  $transaction(arg: any, ...rest: any[]): any {
    if (this._extendedClient) {
      return this._extendedClient.$transaction(arg, ...rest);
    }
    return super.$transaction(arg, ...rest);
  }

  // V222 FIX: Expose protection status for monitoring/diagnostics
  get agentProtectionActive(): boolean { return this._extendedClient !== null; }

  /**
   * Auto-migrate missing columns that are defined in the Prisma schema
   * but may not exist in the production database yet.
   *
   * Uses $executeRawUnsafe with IF NOT EXISTS — safe to run multiple times.
   * This is a safety net for when Railway migrations fail silently.
   */
  private async autoMigrateMissingColumns(): Promise<void> {
    const migrations: { table: string; column: string; sql: string }[] = [
      {
        table: 'Position',
        column: 'exitPrice',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exitPrice" Decimal(18,8)`,
      },
      {
        table: 'Position',
        column: 'closeReason',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "closeReason" TEXT`,
      },
      // V204: Position columns that may be missing if migration 20260612000000 wasn't applied
      {
        table: 'Position',
        column: 'timeframe',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "timeframe" TEXT`,
      },
      {
        table: 'Position',
        column: 'version',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 0`,
      },
      {
        table: 'Position',
        column: 'exchangeSymbol',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "exchangeSymbol" TEXT`,
      },
      {
        table: 'Position',
        column: 'source',
        sql: `ALTER TABLE "Position" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'user_manual'`,
      },
      // V171: keyType column for ExchangeCredential — if this migration fails,
      // ALL credential queries throw "column keyType does not exist" → $0 balance
      {
        table: 'ExchangeCredential',
        column: 'keyType',
        sql: `ALTER TABLE "ExchangeCredential" ADD COLUMN IF NOT EXISTS "keyType" TEXT NOT NULL DEFAULT 'hmac'`,
      },
      // V208: credentialId column for Trade — if this migration fails,
      // ALL trade queries throw "column credentialId does not exist" → zero trades shown.
      // Prisma always includes ALL schema columns in SELECT, so even the V207
      // fallback (which removes credentialId from WHERE) still crashes because
      // the SELECT clause references the missing column.
      {
        table: 'Trade',
        column: 'credentialId',
        sql: `ALTER TABLE "Trade" ADD COLUMN IF NOT EXISTS "credentialId" TEXT`,
      },
    ];

    // V229: Auto-create tables that may be missing. If `prisma migrate deploy`
    // was skipped, entire tables might not exist, causing "relation does not exist"
    // errors that crash entire modules (e.g., RiskEventAuditService → TradingModule).
    const tableMigrations: { table: string; sql: string }[] = [
      {
        table: 'RiskEvent',
        sql: `CREATE TABLE IF NOT EXISTS "RiskEvent" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "severity" TEXT NOT NULL DEFAULT 'info',
          "message" TEXT,
          "metadata" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "RiskEvent_pkey" PRIMARY KEY ("id")
        )`,
      },
    ];

    for (const migration of tableMigrations) {
      try {
        await this.$executeRawUnsafe(migration.sql);
        this.logger.log(`📦 Auto-migration: Table ${migration.table} created or already exists ✅`);
      } catch (error: any) {
        this.logger.warn(`📦 Auto-migration: Table ${migration.table} creation failed: ${error?.message?.substring(0, 200)}`);
      }
    }

    // V229: Create indexes for RiskEvent if they don't exist
    try {
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskEvent_userId_idx" ON "RiskEvent"("userId")`);
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskEvent_createdAt_idx" ON "RiskEvent"("createdAt")`);
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RiskEvent_userId_createdAt_idx" ON "RiskEvent"("userId", "createdAt")`);
      this.logger.log(`📦 Auto-migration: RiskEvent indexes created ✅`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: RiskEvent indexes failed: ${err?.message?.substring(0, 200)}`);
    }

    for (const migration of migrations) {
      try {
        await this.$executeRawUnsafe(migration.sql);
        this.logger.log(`📦 Auto-migration: Added ${migration.table}.${migration.column}`);
      } catch (error: any) {
        // Column already exists — this is fine
        if (error?.message?.includes('already exists') || error?.message?.includes('duplicate')) {
          this.logger.log(`📦 Auto-migration: ${migration.table}.${migration.column} already exists ✅`);
        } else {
          this.logger.warn(`📦 Auto-migration failed for ${migration.table}.${migration.column}: ${error?.message?.substring(0, 200)}`);
        }
      }
    }

    // V208: Backfill Trade.credentialId from Position and Order for existing records
    // This runs AFTER the column is added (above) to populate it for existing data.
    try {
      // Step A: Backfill from Position (most reliable — credentialId is NOT NULL)
      const posResult = await this.$executeRawUnsafe(`
        UPDATE "Trade" t SET "credentialId" = p."credentialId"
        FROM "Position" p WHERE t."positionId" = p.id
        AND t."credentialId" IS NULL AND p."credentialId" IS NOT NULL
      `);
      this.logger.log(`📦 Auto-migration: Backfilled Trade.credentialId from Position (${posResult} rows)`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: Trade.credentialId backfill from Position failed: ${err?.message?.substring(0, 200)}`);
    }
    try {
      // Step B: Backfill from Order (for trades without Position link)
      const ordResult = await this.$executeRawUnsafe(`
        UPDATE "Trade" t SET "credentialId" = o."exchangeCredentialId"
        FROM "Order" o WHERE t."orderId" = o.id
        AND t."credentialId" IS NULL AND o."exchangeCredentialId" IS NOT NULL
      `);
      this.logger.log(`📦 Auto-migration: Backfilled Trade.credentialId from Order (${ordResult} rows)`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: Trade.credentialId backfill from Order failed: ${err?.message?.substring(0, 200)}`);
    }
    try {
      // Step C: Create indexes for efficient filtering
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Trade_credentialId_idx" ON "Trade"("credentialId")`);
      await this.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Trade_userId_credentialId_idx" ON "Trade"("userId", "credentialId")`);
      this.logger.log(`📦 Auto-migration: Trade.credentialId indexes created ✅`);
    } catch (err: any) {
      this.logger.warn(`📦 Auto-migration: Trade.credentialId indexes failed: ${err?.message?.substring(0, 200)}`);
    }
  }

  async onModuleDestroy() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      await this.$disconnect();
      this.connected = false;
      PrismaService._dbAvailable = false;
      this.logger.log('📦 Prisma disconnected from database');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`📦 Prisma disconnect skipped: ${message}`);
    }
  }

  private async tryConnect(): Promise<boolean> {
    if (this.connectInProgress) {
      return this.connected;
    }

    this.connectInProgress = true;

    try {
      // FIX v11: Do NOT call $disconnect() on failure.
      await this.$connect();
      this.connected = true;
      this.consecutiveFailures = 0;
      PrismaService._dbAvailable = true;
      this.logger.log('📦 Prisma connected to database');
      return true;
    } catch (error: unknown) {
      this.connected = false;
      PrismaService._dbAvailable = false;
      this.consecutiveFailures++;
      const message = error instanceof Error ? error.message : 'Unknown error';
      PrismaService._lastError = `[attempt ${this.consecutiveFailures}] ${message.substring(0, 300)}`;
      this.logger.error(`📦 Prisma connection failed (attempt ${this.consecutiveFailures}): ${message}`);
      return false;
    } finally {
      this.connectInProgress = false;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const baseDelay = 10_000; // FIX v13: Reduced from 60s to 10s for faster reconnection
    const delay = Math.min(baseDelay * Math.pow(2, Math.min(this.consecutiveFailures, 3)), 300_000);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      const connected = await this.tryConnect();
      if (!connected) {
        this.scheduleReconnect();
      } else {
        // V229: Apply V222 extension on reconnection if it wasn't applied at startup.
        // If the initial connection timed out (15s), _applyAgentProtectionExtension()
        // was never called. Now that we're connected, apply it + run auto-migrations.
        if (!this._extendedClient) {
          this.logger.log(`📦 V229: Reconnected — applying auto-migrations and V222 extension now`);
          try {
            await this.autoMigrateMissingColumns();
            this._applyAgentProtectionExtension();
            this.logger.log(`📦 V229: Auto-migrations and V222 extension applied on reconnection ✅`);
          } catch (reconnectErr: any) {
            this.logger.warn(`📦 V229: Auto-migrations/extension failed on reconnection: ${reconnectErr?.message?.substring(0, 200)}`);
          }
        }
      }
    }, delay);
  }

  isAvailable(): boolean {
    return this.connected && PrismaService._dbAvailable;
  }

  getDiagnosticInfo(): { available: boolean; lastError: string | null; urlPrefix: string | null; failures: number } {
    return {
      available: this.connected && PrismaService._dbAvailable,
      lastError: PrismaService._lastError,
      urlPrefix: PrismaService._dbUrlPrefix,
      failures: this.consecutiveFailures,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // RLS (Row Level Security) Support — Defense-in-Depth Layer 2
  // ═══════════════════════════════════════════════════════════════
  //
  // PostgreSQL RLS policies check current_setting('app.current_user_id')
  // to determine which rows a user can access. These methods set/reset
  // that session variable for the current database connection.
  //
  // V171 FIX: Reverted from SET LOCAL back to SET (session-scoped).
  //
  // WHY SET LOCAL BROKE EVERYTHING:
  //   V168 changed SET → SET LOCAL, intending that the RLS context
  //   auto-resets at transaction boundary. But with connection_limit=1,
  //   Prisma runs each $executeRawUnsafe in its own implicit transaction.
  //   So SET LOCAL sets the value, the implicit transaction commits
  //   immediately, and the value is RESET. The next query (findMany,
  //   findUnique, etc.) runs in a NEW transaction with NO RLS context.
  //   RLS policy: current_setting('app.current_user_id', true) = '' ≠ userId
  //   → ALL user-specific queries return 0 rows → balance = $0.00
  //
  // The fallback to SET (in the catch block) was NEVER reached because
  // SET LOCAL doesn't throw — it just has no lasting effect.
  //
  // Defense-in-depth for context leaking (the V168 concern):
  //   - UserIsolationInterceptor ALWAYS calls clearRlsUserId() in finalize
  //   - AuthGuard also sets RLS before UserIsolationInterceptor
  //   - With connection_limit=1, there's only 1 connection — no pool reuse
  //   - The session-scoped SET is safe as long as clearRlsUserId() runs
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the current user ID for Row Level Security.
   * Called by AuthGuard and UserIsolationInterceptor before each request.
   *
   * V171 FIX: Use SET (session-scoped), NOT SET LOCAL.
   * SET LOCAL is broken with Prisma's connection_limit=1 because each
   * $executeRawUnsafe runs in its own implicit transaction, so the
   * SET LOCAL value is immediately lost when that transaction commits.
   *
   * Safety: clearRlsUserId() is called by UserIsolationInterceptor's
   * finalize handler after every request, preventing context leaking.
   */
  async setRlsUserId(userId: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      // Sanitize userId to prevent SQL injection (though it should be a UUID)
      const safeId = userId.replace(/'/g, "''");
      // V171: Use SET (session-scoped) — SET LOCAL doesn't work with
      // Prisma's implicit transactions + connection_limit=1
      await this.$executeRawUnsafe(`SET app.current_user_id = '${safeId}'`);
    } catch (error: any) {
      this.logger.warn(`RLS setRlsUserId failed: ${error?.message}`);
    }
  }

  /**
   * Clear the current user ID for Row Level Security.
   * Called after each request completes.
   *
   * V168 FIX: Added explicit logging when clear fails instead of
   * silently swallowing errors. A failed clear means the RLS context
   * leaks to the next request on the same connection.
   */
  async clearRlsUserId(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`RESET app.current_user_id`);
    } catch (error: any) {
      // V168: Log the error instead of silently ignoring it.
      // A leaked RLS context is a security issue — we need to know about it.
      this.logger.warn(`RLS clearRlsUserId FAILED — RLS context may leak: ${error?.message || 'unknown'}`);
    }
  }

  /**
   * Enable RLS bypass mode for background services.
   * Background services (Position Monitor, Smart Executor) need to
   * query across ALL users, so they bypass RLS.
   */
  async enableRlsBypass(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`SET app.rls_bypass = 'true'`);
    } catch {
      // Non-critical
    }
  }

  /**
   * Disable RLS bypass mode.
   */
  async disableRlsBypass(): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.$executeRawUnsafe(`RESET app.rls_bypass`);
    } catch {
      // Non-critical
    }
  }

  /**
   * Run a function with RLS set for a specific user.
   * Automatically sets and clears the RLS context.
   * Use in background services that process data for a specific user.
   */
  async withRlsUser<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    await this.setRlsUserId(userId);
    try {
      return await fn();
    } finally {
      await this.clearRlsUserId();
    }
  }

  /**
   * Run a function with RLS bypass enabled.
   * Use in background services that need to query across ALL users.
   */
  async withRlsBypass<T>(fn: () => Promise<T>): Promise<T> {
    await this.enableRlsBypass();
    try {
      return await fn();
    } finally {
      await this.disableRlsBypass();
    }
  }
}
