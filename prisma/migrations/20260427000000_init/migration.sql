-- CreateTable
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "avatar" TEXT,
    "passkeyId" TEXT,
    "passkeyPub" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'FREE',
    "maxPositionSize" DECIMAL(19,4),
    "maxDailyLoss" DECIMAL(19,4),
    "riskTolerance" TEXT DEFAULT 'moderate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastValidated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Portfolio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "totalValue" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PortfolioAsset" (
    "id" TEXT NOT NULL,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "avgPrice" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "currentPrice" DECIMAL(18,8),
    "exchange" TEXT,
    "assetType" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortfolioAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Signal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pair" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "entryPrice" DECIMAL(19,4),
    "stopLoss" DECIMAL(19,4),
    "takeProfit" DECIMAL(19,4),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Signal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SignalUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "confidence" DECIMAL NOT NULL DEFAULT 0,
    "analysis" TEXT NOT NULL,
    "signedHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignalUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "details" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "NewsArticle" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "translatedTitle" TEXT,
    "content" TEXT NOT NULL,
    "translatedContent" TEXT,
    "summary" TEXT,
    "url" TEXT,
    "sentiment" DECIMAL(5,4),
    "sentimentLabel" TEXT,
    "impactLevel" TEXT,
    "affectedAssets" TEXT,
    "entities" TEXT,
    "aiAnalysis" TEXT,
    "category" TEXT,
    "categoryAr" TEXT,
    "embedding" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExchangeCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExchangeCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "permissions" TEXT NOT NULL DEFAULT 'read',
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "lastValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Order" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "exchangeCredentialId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "timeInForce" TEXT,
    "quantity" DECIMAL(19,8) NOT NULL,
    "price" DECIMAL(19,4),
    "stopLoss" DECIMAL(19,4),
    "takeProfit" DECIMAL(19,4),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filledQuantity" DECIMAL(19,8) NOT NULL DEFAULT 0,
    "averagePrice" DECIMAL(19,4),
    "fee" DECIMAL(19,4),
    "feeCurrency" TEXT,
    "exchangeOrderId" TEXT,
    "rejectReason" TEXT,
    "signalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "clientOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Position" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "quantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "entryPrice" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "currentPrice" DECIMAL(18,8),
    "unrealizedPnl" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "realizedPnl" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "stopLoss" DECIMAL(18,8),
    "takeProfit" DECIMAL(18,8),
    "highestPrice" DECIMAL(18,8),
    "lowestPrice" DECIMAL(18,8),
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Trade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "positionId" TEXT,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "price" DECIMAL(18,8) NOT NULL DEFAULT 0,
    "fee" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "feeCurrency" TEXT,
    "pnl" DECIMAL(18,4),
    "exchangeTradeId" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "PaperOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(19,8) NOT NULL,
    "price" DECIMAL(19,4),
    "stopLoss" DECIMAL(19,4),
    "takeProfit" DECIMAL(19,4),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "filledQuantity" DECIMAL(19,8) NOT NULL DEFAULT 0,
    "averagePrice" DECIMAL(19,4),
    "fee" DECIMAL(19,4),
    "feeCurrency" TEXT,
    "slippage" DECIMAL(19,4),
    "idempotencyKey" TEXT NOT NULL,
    "clientOrderId" TEXT,
    "exchangeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaperOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Challenge" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "StrategyReport" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "price" DECIMAL(19,4) NOT NULL,
    "change" DECIMAL(10,4) NOT NULL,
    "isUp" BOOLEAN NOT NULL,
    "tag" TEXT,
    "decision" TEXT NOT NULL,
    "matrix" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "flow" TEXT NOT NULL,
    "consensus" TEXT NOT NULL,
    "hiddenSignature" TEXT NOT NULL,
    "deepAnalysis" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "TradingBot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'HFT-Alpha',
    "strategy" TEXT NOT NULL DEFAULT 'Scalp AI',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "winRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "totalTrades" INTEGER NOT NULL DEFAULT 0,
    "dailyPnl" DECIMAL(19,4) NOT NULL DEFAULT 0,
    "statusMessage" TEXT NOT NULL DEFAULT 'SYSTEM_IDLE',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradingBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CoachAdvice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" TEXT NOT NULL DEFAULT 'needs_improvement',
    "statisticsSnapshot" TEXT NOT NULL DEFAULT '{}',
    "adviceText" TEXT NOT NULL,
    "adviceItems" TEXT NOT NULL DEFAULT '[]',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachAdvice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChartPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "settings" TEXT NOT NULL DEFAULT '{}',
    "drawings" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChartPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PortfolioAsset_portfolioId_symbol_key" ON "PortfolioAsset"("portfolioId", "symbol");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "PortfolioAsset_portfolioId_idx" ON "PortfolioAsset"("portfolioId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Signal_userId_idx" ON "Signal"("userId");
CREATE INDEX IF NOT EXISTS "Signal_pair_idx" ON "Signal"("pair");
CREATE INDEX IF NOT EXISTS "Signal_status_idx" ON "Signal"("status");
CREATE INDEX IF NOT EXISTS "Signal_expiresAt_idx" ON "Signal"("expiresAt");
CREATE INDEX IF NOT EXISTS "Signal_userId_status_expiresAt_idx" ON "Signal"("userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SignalUsage_userId_idx" ON "SignalUsage"("userId");
CREATE INDEX IF NOT EXISTS "SignalUsage_createdAt_idx" ON "SignalUsage"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NewsArticle_url_key" ON "NewsArticle"("url");
CREATE INDEX IF NOT EXISTS "NewsArticle_source_idx" ON "NewsArticle"("source");
CREATE INDEX IF NOT EXISTS "NewsArticle_publishedAt_idx" ON "NewsArticle"("publishedAt");
CREATE INDEX IF NOT EXISTS "NewsArticle_sentimentLabel_idx" ON "NewsArticle"("sentimentLabel");
CREATE INDEX IF NOT EXISTS "NewsArticle_category_idx" ON "NewsArticle"("category");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExchangeCredential_userId_idx" ON "ExchangeCredential"("userId");
CREATE INDEX IF NOT EXISTS "ExchangeCredential_exchange_idx" ON "ExchangeCredential"("exchange");
CREATE INDEX IF NOT EXISTS "ExchangeCredential_userId_isValid_idx" ON "ExchangeCredential"("userId", "isValid");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Order_idempotencyKey_key" ON "Order"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "Order_userId_idx" ON "Order"("userId");
CREATE INDEX IF NOT EXISTS "Order_symbol_idx" ON "Order"("symbol");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_exchange_idx" ON "Order"("exchange");
CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX IF NOT EXISTS "Order_userId_status_createdAt_idx" ON "Order"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");
CREATE INDEX IF NOT EXISTS "OrderEvent_eventType_idx" ON "OrderEvent"("eventType");
CREATE INDEX IF NOT EXISTS "OrderEvent_timestamp_idx" ON "OrderEvent"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Position_userId_symbol_side_status_key" ON "Position"("userId", "symbol", "side", "status");
CREATE INDEX IF NOT EXISTS "Position_userId_idx" ON "Position"("userId");
CREATE INDEX IF NOT EXISTS "Position_symbol_idx" ON "Position"("symbol");
CREATE INDEX IF NOT EXISTS "Position_status_idx" ON "Position"("status");
CREATE INDEX IF NOT EXISTS "Position_exchange_idx" ON "Position"("exchange");
CREATE INDEX IF NOT EXISTS "Position_userId_status_idx" ON "Position"("userId", "status");
CREATE INDEX IF NOT EXISTS "Position_userId_symbol_status_idx" ON "Position"("userId", "symbol", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Trade_userId_idx" ON "Trade"("userId");
CREATE INDEX IF NOT EXISTS "Trade_symbol_idx" ON "Trade"("symbol");
CREATE INDEX IF NOT EXISTS "Trade_positionId_idx" ON "Trade"("positionId");
CREATE INDEX IF NOT EXISTS "Trade_executedAt_idx" ON "Trade"("executedAt");
CREATE INDEX IF NOT EXISTS "Trade_userId_type_executedAt_idx" ON "Trade"("userId", "type", "executedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PaperOrder_idempotencyKey_key" ON "PaperOrder"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "PaperOrder_userId_idx" ON "PaperOrder"("userId");
CREATE INDEX IF NOT EXISTS "PaperOrder_symbol_idx" ON "PaperOrder"("symbol");
CREATE INDEX IF NOT EXISTS "PaperOrder_status_idx" ON "PaperOrder"("status");
CREATE INDEX IF NOT EXISTS "PaperOrder_createdAt_idx" ON "PaperOrder"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Challenge_key_key" ON "Challenge"("key");
CREATE INDEX IF NOT EXISTS "Challenge_key_idx" ON "Challenge"("key");
CREATE INDEX IF NOT EXISTS "Challenge_expiresAt_idx" ON "Challenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE INDEX IF NOT EXISTS "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StrategyReport_symbol_idx" ON "StrategyReport"("symbol");
CREATE INDEX IF NOT EXISTS "StrategyReport_type_idx" ON "StrategyReport"("type");
CREATE INDEX IF NOT EXISTS "StrategyReport_publishedAt_idx" ON "StrategyReport"("publishedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TradingBot_userId_idx" ON "TradingBot"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CoachAdvice_userId_idx" ON "CoachAdvice"("userId");
CREATE INDEX IF NOT EXISTS "CoachAdvice_createdAt_idx" ON "CoachAdvice"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ChartPreference_userId_symbol_key" ON "ChartPreference"("userId", "symbol");
CREATE INDEX IF NOT EXISTS "ChartPreference_userId_idx" ON "ChartPreference"("userId");
CREATE INDEX IF NOT EXISTS "ChartPreference_symbol_idx" ON "ChartPreference"("symbol");

-- AddForeignKey
ALTER TABLE IF EXISTS "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Portfolio" ADD CONSTRAINT "Portfolio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "PortfolioAsset" ADD CONSTRAINT "PortfolioAsset_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Signal" ADD CONSTRAINT "Signal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "SignalUsage" ADD CONSTRAINT "SignalUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "ExchangeCredential" ADD CONSTRAINT "ExchangeCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Order" ADD CONSTRAINT "Order_exchangeCredentialId_fkey" FOREIGN KEY ("exchangeCredentialId") REFERENCES "ExchangeCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Order" ADD CONSTRAINT "Order_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "Signal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Position" ADD CONSTRAINT "Position_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Position" ADD CONSTRAINT "Position_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "ExchangeCredential"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Trade" ADD CONSTRAINT "Trade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Trade" ADD CONSTRAINT "Trade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Trade" ADD CONSTRAINT "Trade_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "PaperOrder" ADD CONSTRAINT "PaperOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "TradingBot" ADD CONSTRAINT "TradingBot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "CoachAdvice" ADD CONSTRAINT "CoachAdvice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE IF EXISTS "ChartPreference" ADD CONSTRAINT "ChartPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
