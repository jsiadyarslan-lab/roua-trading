import { Injectable, Logger, OnModuleInit, OnModuleDestroy, ForwardRef, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma/prisma.service';
import * as crypto from 'crypto';

/**
 * V196: MT5 Streaming Service
 *
 * Maintains PERSISTENT WebSocket connections to MetaAPI Cloud for all
 * registered MT5 accounts. Uses the SDK's streaming connection mode
 * (NOT the one-shot RPC mode) to receive real-time:
 *   - Balance/equity/margin updates
 *   - Position open/close/modify events
 *   - Price ticks for subscribed symbols
 *
 * ARCHITECTURE:
 *   MetaAPI Cloud ←WebSocket→ MT5StreamingService → MT5Gateway ←Socket.IO→ Frontend
 *
 * FALLBACK: If streaming fails or is not connected, the existing
 * _fetchMT5Balance() RPC/REST approach still works independently.
 * This service is ADDITIVE — it does not replace anything.
 *
 * LIFECYCLE:
 *   1. On module init: load MT5 credentials from DB
 *   2. For each MT5 credential: create streaming connection
 *   3. Register SynchronizationListener for events
 *   4. Subscribe to market data for open position symbols
 *   5. On module destroy: close all connections gracefully
 */

// ─── Event types emitted by this service ──────────────────────
export interface MT5BalanceUpdate {
  credentialId: string;
  userId: string;
  accountId: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
  currency: string;
  leverage: number;
  timestamp: number;
}

export interface MT5PositionUpdate {
  credentialId: string;
  userId: string;
  action: 'updated' | 'removed' | 'added';
  position: {
    id: string;
    symbol: string;
    type: string;
    volume: number;
    openPrice: number;
    currentPrice: number;
    profit: number;
    swap: number;
    stopLoss?: number;
    takeProfit?: number;
    magic: number;
    comment?: string;
    brokerTime: string;
  };
  timestamp: number;
}

export interface MT5PriceUpdate {
  credentialId: string;
  userId: string;
  symbol: string;
  bid: number;
  ask: number;
  equity: number;
  margin: number;
  freeMargin: number;
  timestamp: number;
}

export interface MT5ConnectionStatus {
  credentialId: string;
  accountId: string;
  connected: boolean;
  connectedToBroker: boolean;
  synchronized: boolean;
  healthy: boolean;
  message?: string;
}

// ─── Per-account connection state ────────────────────────────
interface MT5AccountConnection {
  credentialId: string;
  userId: string;
  accountId: string;        // MT5 login number
  metaApiAccountId: string; // MetaAPI Cloud UUID
  connection: any;          // StreamingConnection instance
  listener: any;            // SynchronizationListener instance
  account: any;             // MetaAPI account object
  lastBalanceUpdate?: MT5BalanceUpdate;
  connectedSince?: number;
  reconnectAttempts: number;
}

@Injectable()
export class MT5StreamingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MT5StreamingService.name);

  /** Active connections: credentialId → MT5AccountConnection */
  private readonly connections = new Map<string, MT5AccountConnection>();

  /** SDK instance (singleton) */
  private metaApi: any = null;

  /** Shutdown flag */
  private shuttingDown = false;

  /** Reconnect timer refs */
  private readonly reconnectTimers = new Map<string, NodeJS.Timeout>();

  /** Gateway reference (set lazily to avoid circular dependency) */
  private gateway: any = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /** Set the gateway reference (called by MT5Gateway after initialization) */
  setGateway(gateway: any) {
    this.gateway = gateway;
  }

  // ═══════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════

  async onModuleInit() {
    const token = this.configService.get<string>('METAAPI_TOKEN');
    if (!token) {
      this.logger.warn('📊 MT5 Streaming: METAAPI_TOKEN not set — streaming disabled. RPC/REST fallback still works.');
      return;
    }

    this.logger.log('📊 MT5 Streaming: Initializing...');
    await this._initSDK();

    // Load MT5 credentials and connect
    try {
      await this._connectAllAccounts();
    } catch (err: any) {
      this.logger.error(`📊 MT5 Streaming: Initial connection failed: ${err.message}`);
      // Non-fatal — existing RPC/REST fallback still works
    }
  }

  async onModuleDestroy() {
    this.shuttingDown = true;
    this.logger.log('📊 MT5 Streaming: Shutting down...');

    // Clear reconnect timers
    for (const timer of this.reconnectTimers.values()) {
      clearTimeout(timer);
    }
    this.reconnectTimers.clear();

    // Close all connections gracefully
    const closePromises: Promise<void>[] = [];
    for (const [credId, conn] of this.connections.entries()) {
      closePromises.push(this._closeConnection(credId, conn));
    }
    await Promise.allSettled(closePromises);

    this.connections.clear();
    this.logger.log('📊 MT5 Streaming: All connections closed.');
  }

  // ═══════════════════════════════════════════════════════════
  // SDK INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  private async _initSDK() {
    const token = this.configService.get<string>('METAAPI_TOKEN')!;
    try {
      const metaApiModule: any = await import('metaapi.cloud-sdk');
      const MetaApiClass = metaApiModule.default || metaApiModule;
      this.metaApi = new MetaApiClass(token);
      this.logger.log('📊 MT5 Streaming: MetaAPI SDK initialized.');
    } catch (err: any) {
      this.logger.error(`📊 MT5 Streaming: SDK init failed: ${err.message}`);
      this.metaApi = null;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ACCOUNT CONNECTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  private async _connectAllAccounts() {
    if (!this.metaApi) return;

    // Find all MT5 credentials (valid only)
    const mt5Credentials = await this.prisma.exchangeCredential.findMany({
      where: {
        exchange: { in: ['mt5', 'mt5_demo', 'metatrader5', 'metatrader'] },
        isValid: true,
      },
    });

    this.logger.log(`📊 MT5 Streaming: Found ${mt5Credentials.length} MT5 credential(s).`);

    // Connect each one (non-blocking — don't let one failure block others)
    for (const cred of mt5Credentials) {
      this._connectAccount(cred).catch((err) => {
        this.logger.warn(`📊 MT5 Streaming: Failed to connect credential ${cred.id.slice(0, 8)}...: ${err.message?.substring(0, 80)}`);
      });
    }
  }

  /**
   * Connect a single MT5 credential to MetaAPI streaming.
   * This is the core method — creates persistent WebSocket connection.
   */
  async _connectAccount(cred: {
    id: string;
    userId: string;
    exchange: string;
  }): Promise<boolean> {
    if (!this.metaApi || this.shuttingDown) return false;

    // Skip if already connected
    if (this.connections.has(cred.id)) {
      const existing = this.connections.get(cred.id)!;
      if (existing.connection) {
        this.logger.log(`📊 MT5 Streaming: Already connected for ${cred.id.slice(0, 8)}...`);
        return true;
      }
    }

    try {
      // 1. Decrypt credentials
      // We need to use CredentialsService for decryption — but we can't inject it
      // due to circular dependency. Instead, read encrypted fields and decrypt manually.
      const fullCred = await this.prisma.exchangeCredential.findUnique({
        where: { id: cred.id },
      });
      if (!fullCred) return false;

      // Use the same decryption approach as CredentialsService
      const encryptionKey = this._deriveEncryptionKey();
      const accountId = this._decrypt({ encrypted: fullCred.encryptedApiKey, iv: fullCred.iv, authTag: fullCred.authTag }, encryptionKey);
      const password = this._decrypt({ encrypted: fullCred.encryptedSecret, iv: fullCred.secretIv ?? fullCred.iv, authTag: fullCred.secretAuthTag ?? fullCred.authTag }, encryptionKey);
      let server = '';
      if (fullCred.encryptedPassphrase && fullCred.passphraseIv) {
        try {
          server = this._decrypt({ encrypted: fullCred.encryptedPassphrase, iv: fullCred.passphraseIv, authTag: fullCred.passphraseAuthTag! }, encryptionKey);
        } catch { /* legacy — may not have passphrase */ }
      }

      if (!accountId || !password || !server) {
        this.logger.warn(`📊 MT5 Streaming: Incomplete credentials for ${cred.id.slice(0, 8)}...`);
        return false;
      }

      // 2. Find or create MetaAPI account
      const accountApi = this.metaApi.metatraderAccountApi;
      const allAccounts = await accountApi.getAccountsWithInfiniteScrollPagination();
      let account = allAccounts.find((a: any) => String(a.login) === String(accountId));

      if (!account) {
        this.logger.log(`📊 MT5 Streaming: Account ${accountId} not found in MetaAPI — creating...`);
        account = await accountApi.createAccount({
          login: accountId,
          password,
          server,
          type: 'cloud-g2',
          name: `Roua-Stream-${cred.userId.slice(0, 8)}`,
          platform: 'mt5',
          magic: 123456,
          quoteStreamingIntervalInSeconds: 2.5,
          reliability: 'high',
        });
        await account.deploy();
        // Wait for deployment (with timeout)
        await Promise.race([
          account.waitDeployed(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('deploy timeout (60s)')), 60_000)),
        ]);
      }

      // Get full account object
      const metaApiAccount = await accountApi.getAccount(account.id);
      const metaApiAccountId = account.id;

      // 3. Ensure account is deployed and connected
      if (metaApiAccount.state !== 'DEPLOYED') {
        this.logger.log(`📊 MT5 Streaming: Deploying account ${accountId} (state=${metaApiAccount.state})...`);
        await metaApiAccount.deploy();
        await Promise.race([
          metaApiAccount.waitDeployed(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('deploy timeout')), 60_000)),
        ]);
      }

      // 4. Create STREAMING connection (not RPC!)
      const connection = metaApiAccount.getStreamingConnection();

      // 5. Create and register listener BEFORE connecting
      const listener = this._createListener(cred.id, cred.userId, accountId);
      connection.addSynchronizationListener(listener);

      // 6. Connect and synchronize
      await connection.connect();
      this.logger.log(`📊 MT5 Streaming: Connecting to ${accountId}...`);

      // Wait for sync (can take a while for large history)
      await Promise.race([
        connection.waitSynchronized(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('sync timeout (30s)')), 30_000)),
      ]);

      // 7. Subscribe to market data for symbols of open positions
      try {
        const positions = connection.terminalState?.positions || [];
        const symbols = [...new Set(positions.map((p: any) => p.symbol))];
        for (const symbol of symbols) {
          await this._subscribeToSymbol(connection, symbol);
        }
        this.logger.log(`📊 MT5 Streaming: Subscribed to ${symbols.length} symbol(s) for ${accountId}`);
      } catch (subErr: any) {
        this.logger.warn(`📊 MT5 Streaming: Market data subscription partial failure for ${accountId}: ${subErr.message?.substring(0, 80)}`);
      }

      // 8. Store connection state
      const connState: MT5AccountConnection = {
        credentialId: cred.id,
        userId: cred.userId,
        accountId,
        metaApiAccountId,
        connection,
        listener,
        account: metaApiAccount,
        reconnectAttempts: 0,
        connectedSince: Date.now(),
      };
      this.connections.set(cred.id, connState);

      // 9. Emit initial connection status
      this._emitConnectionStatus(cred.id, {
        credentialId: cred.id,
        accountId,
        connected: true,
        connectedToBroker: true,
        synchronized: true,
        healthy: true,
      });

      // 10. Emit initial balance from terminal state
      try {
        const accountInfo = connection.terminalState?.accountInformation;
        if (accountInfo) {
          this._emitBalanceUpdate(cred.id, cred.userId, accountId, accountInfo);
        }
      } catch { /* non-critical */ }

      this.logger.log(`📊 MT5 Streaming: ✅ Connected to ${accountId} (MetaAPI ID: ${metaApiAccountId})`);
      return true;
    } catch (err: any) {
      this.logger.error(`📊 MT5 Streaming: Failed to connect ${cred.id.slice(0, 8)}...: ${err.message?.substring(0, 120)}`);

      // Schedule reconnect (with exponential backoff)
      this._scheduleReconnect(cred);

      // Emit connection failure status
      this._emitConnectionStatus(cred.id, {
        credentialId: cred.id,
        accountId: 'unknown',
        connected: false,
        connectedToBroker: false,
        synchronized: false,
        healthy: false,
        message: err.message?.substring(0, 100),
      });

      return false;
    }
  }

  private async _closeConnection(credId: string, conn: MT5AccountConnection): Promise<void> {
    try {
      if (conn.connection) {
        await conn.connection.close();
      }
      this.logger.log(`📊 MT5 Streaming: Closed connection for ${conn.accountId}`);
    } catch (err: any) {
      this.logger.warn(`📊 MT5 Streaming: Error closing connection for ${conn.accountId}: ${err.message}`);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SYNCHRONIZATION LISTENER (real-time events from MetaAPI)
  // ═══════════════════════════════════════════════════════════

  private _createListener(credentialId: string, userId: string, accountId: string): any {
    const self = this;

    return {
      /** Fired when account balance/equity/margin changes */
      async onAccountInformationUpdated(instanceIndex: string, accountInfo: any) {
        self._emitBalanceUpdate(credentialId, userId, accountId, accountInfo);
      },

      /** Fired when a position is modified */
      async onPositionUpdated(instanceIndex: string, position: any) {
        self._emitPositionUpdate(credentialId, userId, 'updated', position);
      },

      /** Fired when a position is closed */
      async onPositionRemoved(instanceIndex: string, positionId: string) {
        self._emitPositionUpdate(credentialId, userId, 'removed', { id: positionId } as any);
      },

      /** Fired when initial positions are synchronized */
      async onPositionsReplaced(instanceIndex: string, positions: any[]) {
        for (const pos of positions) {
          self._emitPositionUpdate(credentialId, userId, 'updated', pos);
        }
      },

      /** Fired when prices update WITH account metrics — KEY EVENT */
      async onSymbolPricesUpdated(
        instanceIndex: string,
        prices: any[],
        equity: number,
        margin: number,
        freeMargin: number,
        marginLevel: number,
        accountCurrencyExchangeRate: number,
      ) {
        for (const price of prices) {
          self._emitPriceUpdate(credentialId, userId, price, equity, margin, freeMargin);
        }

        // Also emit a balance-like update since equity/margin changed
        const conn = self.connections.get(credentialId);
        if (conn?.lastBalanceUpdate) {
          const updated: MT5BalanceUpdate = {
            ...conn.lastBalanceUpdate,
            equity,
            margin,
            freeMargin,
            marginLevel: marginLevel || conn.lastBalanceUpdate.marginLevel,
            timestamp: Date.now(),
          };
          conn.lastBalanceUpdate = updated;
          if (self.gateway) self.gateway.handleBalanceUpdate(updated);
        }
      },

      /** Fired when a single symbol price updates */
      async onSymbolPriceUpdated(instanceIndex: string, price: any) {
        // Less detailed than onSymbolPricesUpdated — use as fallback
        const conn = self.connections.get(credentialId);
        if (conn?.lastBalanceUpdate) {
          self._emitPriceUpdate(
            credentialId, userId, price,
            conn.lastBalanceUpdate.equity,
            conn.lastBalanceUpdate.margin,
            conn.lastBalanceUpdate.freeMargin,
          );
        }
      },

      /** Fired when connected to broker */
      async onConnected(instanceIndex: string, replicas: number) {
        self.logger.log(`📊 MT5 Streaming: ${accountId} connected to broker (${replicas} replicas)`);
        const conn = self.connections.get(credentialId);
        if (conn) conn.reconnectAttempts = 0;

        self._emitConnectionStatus(credentialId, {
          credentialId,
          accountId,
          connected: true,
          connectedToBroker: true,
          synchronized: true,
          healthy: true,
        });
      },

      /** Fired when disconnected from broker */
      async onDisconnected(instanceIndex: string) {
        self.logger.warn(`📊 MT5 Streaming: ${accountId} disconnected from broker`);

        self._emitConnectionStatus(credentialId, {
          credentialId,
          accountId,
          connected: false,
          connectedToBroker: false,
          synchronized: false,
          healthy: false,
          message: 'Disconnected from broker',
        });
      },

      /** Fired when broker connection status changes */
      async onBrokerConnectionStatusChanged(instanceIndex: string, connected: boolean) {
        self.logger.log(`📊 MT5 Streaming: ${accountId} broker connection: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`);

        if (!connected) {
          self._emitConnectionStatus(credentialId, {
            credentialId,
            accountId,
            connected: true, // Still connected to MetaAPI
            connectedToBroker: false,
            synchronized: false,
            healthy: false,
            message: 'Broker disconnected — reconnecting...',
          });
        }
      },
    };
  }

  // ═══════════════════════════════════════════════════════════
  // EVENT EMISSION (via NestJS EventEmitter2)
  // ═══════════════════════════════════════════════════════════

  private _emitBalanceUpdate(credentialId: string, userId: string, accountId: string, info: any) {
    const update: MT5BalanceUpdate = {
      credentialId,
      userId,
      accountId,
      balance: info.balance || 0,
      equity: info.equity || 0,
      margin: info.margin || 0,
      freeMargin: info.freeMargin || 0,
      marginLevel: info.marginLevel || 0,
      currency: info.currency || 'USD',
      leverage: info.leverage || 100,
      timestamp: Date.now(),
    };

    // Cache last update
    const conn = this.connections.get(credentialId);
    if (conn) conn.lastBalanceUpdate = update;

    // Forward to gateway for frontend push
    if (this.gateway) {
      this.gateway.handleBalanceUpdate(update);
    }
  }

  private _emitPositionUpdate(credentialId: string, userId: string, action: 'updated' | 'removed' | 'added', position: any) {
    const update: MT5PositionUpdate = {
      credentialId,
      userId,
      action,
      position: {
        id: String(position.id || position.positionId || ''),
        symbol: position.symbol || '',
        type: position.type || '',
        volume: position.volume || 0,
        openPrice: position.openPrice || 0,
        currentPrice: position.currentPrice || 0,
        profit: position.profit || position.unrealizedProfit || 0,
        swap: position.swap || 0,
        stopLoss: position.stopLoss,
        takeProfit: position.takeProfit,
        magic: position.magic || 0,
        comment: position.comment,
        brokerTime: position.brokerTime || '',
      },
      timestamp: Date.now(),
    };

    // Forward to gateway for frontend push
    if (this.gateway) {
      this.gateway.handlePositionUpdate(update);
    }

    // Also subscribe to market data for new position symbols
    if (action === 'updated' || action === 'added') {
      const conn = this.connections.get(credentialId);
      if (conn?.connection && update.position.symbol) {
        this._subscribeToSymbol(conn.connection, update.position.symbol).catch(() => {});
      }
    }
  }

  private _emitPriceUpdate(credentialId: string, userId: string, price: any, equity: number, margin: number, freeMargin: number) {
    const update: MT5PriceUpdate = {
      credentialId,
      userId,
      symbol: price.symbol || '',
      bid: price.bid || 0,
      ask: price.ask || 0,
      equity,
      margin,
      freeMargin,
      timestamp: Date.now(),
    };

    // Forward to gateway for frontend push
    if (this.gateway) {
      this.gateway.handlePriceUpdate(update);
    }
  }

  private _emitConnectionStatus(credentialId: string, status: MT5ConnectionStatus) {
    // Forward to gateway for frontend push
    if (this.gateway) {
      this.gateway.handleConnectionStatus(status);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MARKET DATA SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════

  private readonly subscribedSymbols = new Map<string, Set<string>>(); // credentialId → symbols

  private async _subscribeToSymbol(connection: any, symbol: string): Promise<void> {
    try {
      // Track what we've already subscribed to
      const credId = [...this.connections.entries()].find(([, c]) => c.connection === connection)?.[0];
      if (credId) {
        if (!this.subscribedSymbols.has(credId)) {
          this.subscribedSymbols.set(credId, new Set());
        }
        const subs = this.subscribedSymbols.get(credId)!;
        if (subs.has(symbol)) return; // Already subscribed
        subs.add(symbol);
      }

      await connection.subscribeToMarketData(symbol, [
        { type: 'quotes', intervalInMilliseconds: 5000 },
      ]);
    } catch (err: any) {
      // Non-critical — price updates may still come via onSymbolPricesUpdated
      this.logger.warn(`📊 MT5 Streaming: Subscribe failed for ${symbol}: ${err.message?.substring(0, 60)}`);
    }
  }

  /**
   * Subscribe to market data for a specific symbol on a specific MT5 credential.
   * Called by the gateway when the frontend requests live prices.
   */
  async subscribeToSymbol(credentialId: string, symbol: string): Promise<boolean> {
    const conn = this.connections.get(credentialId);
    if (!conn?.connection) return false;
    await this._subscribeToSymbol(conn.connection, symbol);
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // RECONNECTION
  // ═══════════════════════════════════════════════════════════

  private _scheduleReconnect(cred: { id: string; userId: string; exchange: string }) {
    if (this.shuttingDown) return;

    // Clear existing timer
    if (this.reconnectTimers.has(cred.id)) {
      clearTimeout(this.reconnectTimers.get(cred.id)!);
    }

    const conn = this.connections.get(cred.id);
    const attempts = conn?.reconnectAttempts || 0;
    const baseDelay = 10_000; // 10 seconds
    const maxDelay = 5 * 60_000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(1.5, attempts), maxDelay);

    this.logger.log(`📊 MT5 Streaming: Reconnecting ${cred.id.slice(0, 8)}... in ${Math.round(delay / 1000)}s (attempt ${attempts + 1})`);

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(cred.id);
      try {
        const success = await this._connectAccount(cred);
        if (success) {
          this.logger.log(`📊 MT5 Streaming: Reconnected ${cred.id.slice(0, 8)}... successfully`);
        }
      } catch {
        // Will schedule another reconnect in _connectAccount's catch block
      }
    }, delay);

    this.reconnectTimers.set(cred.id, timer);
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API (used by CredentialsService, Gateway, etc.)
  // ═══════════════════════════════════════════════════════════

  /**
   * Get the current account information from the streaming terminal state.
   * Returns null if not connected (caller should fall back to RPC/REST).
   */
  getAccountInfo(credentialId: string): MT5BalanceUpdate | null {
    const conn = this.connections.get(credentialId);
    if (!conn?.connection) return null;

    try {
      const info = conn.connection.terminalState?.accountInformation;
      if (!info) return conn.lastBalanceUpdate || null;

      const update: MT5BalanceUpdate = {
        credentialId,
        userId: conn.userId,
        accountId: conn.accountId,
        balance: info.balance || 0,
        equity: info.equity || 0,
        margin: info.margin || 0,
        freeMargin: info.freeMargin || 0,
        marginLevel: info.marginLevel || 0,
        currency: info.currency || 'USD',
        leverage: info.leverage || 100,
        timestamp: Date.now(),
      };
      conn.lastBalanceUpdate = update;
      return update;
    } catch {
      return conn.lastBalanceUpdate || null;
    }
  }

  /**
   * Get current positions from the streaming terminal state.
   * Returns null if not connected (caller should fall back to DB).
   */
  getPositions(credentialId: string): any[] | null {
    const conn = this.connections.get(credentialId);
    if (!conn?.connection) return null;

    try {
      return conn.connection.terminalState?.positions || null;
    } catch {
      return null;
    }
  }

  /**
   * Get current price for a symbol from the streaming terminal state.
   */
  getPrice(credentialId: string, symbol: string): { bid: number; ask: number } | null {
    const conn = this.connections.get(credentialId);
    if (!conn?.connection) return null;

    try {
      const price = conn.connection.terminalState?.price(symbol);
      if (!price) return null;
      return { bid: price.bid, ask: price.ask };
    } catch {
      return null;
    }
  }

  /**
   * Check if streaming connection is active for a credential.
   */
  isConnected(credentialId: string): boolean {
    const conn = this.connections.get(credentialId);
    if (!conn?.connection) return false;
    try {
      return conn.connection.healthMonitor?.healthStatus?.healthy || false;
    } catch {
      return false;
    }
  }

  /**
   * Get connection health status for a credential.
   */
  getConnectionStatus(credentialId: string): MT5ConnectionStatus | null {
    const conn = this.connections.get(credentialId);
    if (!conn) return null;

    try {
      const health = conn.connection?.healthMonitor?.healthStatus;
      return {
        credentialId,
        accountId: conn.accountId,
        connected: health?.connected || false,
        connectedToBroker: health?.connectedToBroker || false,
        synchronized: health?.synchronized || false,
        healthy: health?.healthy || false,
        message: health?.message,
      };
    } catch {
      return {
        credentialId,
        accountId: conn.accountId,
        connected: false,
        connectedToBroker: false,
        synchronized: false,
        healthy: false,
        message: 'Error reading health status',
      };
    }
  }

  /**
   * Connect a newly added MT5 credential (called when user adds a new MT5 account).
   */
  async connectNewCredential(credentialId: string): Promise<boolean> {
    if (!this.metaApi) return false;

    const cred = await this.prisma.exchangeCredential.findUnique({
      where: { id: credentialId },
    });
    if (!cred || !['mt5', 'mt5_demo', 'metatrader5', 'metatrader'].includes(cred.exchange)) {
      return false;
    }

    return this._connectAccount(cred);
  }

  /**
   * Disconnect a credential (called when user deletes an MT5 account).
   */
  async disconnectCredential(credentialId: string): Promise<void> {
    const conn = this.connections.get(credentialId);
    if (!conn) return;

    await this._closeConnection(credentialId, conn);
    this.connections.delete(credentialId);
    this.subscribedSymbols.delete(credentialId);

    if (this.reconnectTimers.has(credentialId)) {
      clearTimeout(this.reconnectTimers.get(credentialId)!);
      this.reconnectTimers.delete(credentialId);
    }

    this.logger.log(`📊 MT5 Streaming: Disconnected credential ${credentialId.slice(0, 8)}...`);
  }

  /**
   * Get all active MT5 streaming connections (for admin diagnostics).
   */
  getActiveConnections(): Array<{ credentialId: string; accountId: string; healthy: boolean; connectedSince?: number }> {
    return [...this.connections.entries()].map(([credId, conn]) => ({
      credentialId: credId,
      accountId: conn.accountId,
      healthy: this.isConnected(credId),
      connectedSince: conn.connectedSince,
    }));
  }

  // ═══════════════════════════════════════════════════════════
  // ENCRYPTION HELPERS (same logic as CredentialsService)
  // ═══════════════════════════════════════════════════════════

  private _deriveEncryptionKey(): Buffer {
    const key = this.configService.get<string>('ENCRYPTION_KEY');
    if (key) {
      const keyBuffer = Buffer.from(key, 'hex');
      if (keyBuffer.length === 32) return keyBuffer;
      const salt = crypto.createHash('sha256').update(`encryption-key-fix:${key}`).digest().slice(0, 16);
      return crypto.scryptSync(key, salt, 32);
    }
    const fallback = this.configService.get<string>('NEXTAUTH_SECRET');
    if (fallback) {
      const deploymentId = `${fallback}:${this.configService.get('NODE_ENV', 'development')}`;
      const salt = crypto.createHash('sha256').update(deploymentId).digest().slice(0, 16);
      return crypto.scryptSync(fallback, salt, 32);
    }
    return crypto.randomBytes(32);
  }

  private _decrypt(data: { encrypted: string; iv: string; authTag: string }, key?: Buffer): string {
    const encryptionKey = key || this._deriveEncryptionKey();
    const iv = Buffer.from(data.iv, 'hex');
    const authTag = Buffer.from(data.authTag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(data.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
