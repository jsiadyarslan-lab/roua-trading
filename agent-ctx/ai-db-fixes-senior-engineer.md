# AI Integration & Database Schema Fixes

## Task Summary
Fixed AI integration issues and database schema problems in the roua-trading project.

## Files Modified

### 1. `apps/api/src/modules/ai/services/ai-orchestrator.service.ts`
**All 3 AI fixes applied:**

#### Fix 1: getModelsStatus() now checks actual key availability
- Added `ConfigService` injection to the orchestrator
- Added `MODEL_KEY_MAP` mapping model IDs to their required env vars
- Added `_isModelKeyAvailable()` method that checks if required env vars are set and non-empty
- Special handling for Ollama (available if key set OR non-default base URL configured)
- Bedrock requires both `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
- `getModelsStatus()` now calls `_isModelKeyAvailable()` instead of hardcoding `true`
- Added startup log showing which models have API keys available

#### Fix 2: Improved vote parsing in AI Council consensus
- Added `DECISION:` line instruction to all 6 consensus role prompts
- Implemented `_parseVote()` method with:
  - **Step 1**: Parse structured `DECISION: BUY/SELL/HOLD` line (highest priority)
  - **Step 2**: Fallback keyword search with:
    - Arabic negation patterns (لا، ليس، ليست، لن، غير، لا أنصح، لا ننصح، لا يوصى)
    - English negation patterns (don't, not, no, never, avoid, against, refrain)
    - Last occurrence wins (later statements override earlier)
    - Negation detection checks 30 chars before each keyword
    - Additional keywords: شرائية، بيعية، LONG, SHORT
- Replaced the old fragile parsing in `getConsensusAnalysis()`

#### Fix 3: Added in-memory caching for AI responses
- Added `responseCache` Map with TTL-based expiration
- Configured per-type TTL: sentiment=5min, market_analysis=15min, etc.
- Cache key is SHA-256 hash of type+symbol+language+prompt
- `_getCacheKey()`, `_getCachedResult()`, `_setCachedResult()` methods
- Periodic cleanup every 100 inserts via `_cleanExpiredCache()`
- Public `clearCache()` method for invalidation when new data arrives
- Cache check in `analyze()` before model routing
- Cache store after successful model response

### 2. `prisma/schema.prisma`
**All 4 schema fixes applied:**

#### Fix 4: Float → Decimal for financial fields
- **PortfolioAsset**: quantity→Decimal(19,8), avgPrice→Decimal(19,4), currentPrice→Decimal(19,4)
- **Position**: All financial fields converted from Float to Decimal with proper precision
  - quantity→Decimal(19,8), entryPrice/currentPrice/unrealizedPnl/realizedPnl/stopLoss/takeProfit/highestPrice/lowestPrice→Decimal(19,4)
  - New fields: leverage→Decimal(5,2), liquidationPrice→Decimal(19,4)
- **Signal**: entryPrice/stopLoss/takeProfit→Decimal(19,4), confidence kept as Int
- **Trade**: quantity→Decimal(19,8), price/fee/pnl→Decimal(19,4)
- **PaperOrder**: Added precision annotations quantity→Decimal(19,8), price/stopLoss/takeProfit/averagePrice/fee/slippage→Decimal(19,4), filledQuantity→Decimal(19,8)
- **Order**: Added precision annotations quantity/filledQuantity→Decimal(19,8), price/stopLoss/takeProfit/averagePrice/fee→Decimal(19,4)
- **StrategyReport**: price→Decimal(19,4), change→Decimal(10,4)
- **TradingBot**: winRate→Decimal(5,4), dailyPnl→Decimal(19,4)
- **Portfolio**: totalValue→Decimal(19,4)
- **NewsArticle**: sentiment→Decimal(5,4)
- **SignalUsage**: confidence→Decimal(5,4)

#### Fix 5: Added missing indexes
- `PortfolioAsset`: `@@index([portfolioId])`, `@@unique([portfolioId, symbol])`
- `NewsArticle`: `@@unique([url])`
- `Order`: `@@index([exchangeCredentialId])`
- `Position`: `@@index([credentialId])`
- `StrategyReport`: `@@index([publishedAt])`
- `SignalUsage`: `@@index([createdAt])`
- `Trade`: `@@index([orderId])`

#### Fix 6: Added missing Prisma relations
- **Trade → Order**: `order Order? @relation(fields: [orderId], references: [id], onDelete: SetNull)`
- **Trade → Position**: `position Position? @relation(fields: [positionId], references: [id], onDelete: SetNull)`
- **Position → ExchangeCredential**: `credential ExchangeCredential @relation(fields: [credentialId], references: [id], onDelete: Cascade)`
- **Order → ExchangeCredential**: `exchangeCredential ExchangeCredential @relation(fields: [exchangeCredentialId], references: [id], onDelete: Cascade)`
- **PaperOrder → User**: `user User @relation(fields: [userId], references: [id], onDelete: Cascade)`
- **CoachAdvice → User**: `user User @relation(fields: [userId], references: [id], onDelete: Cascade)` (userId already existed)
- **Order → Signal**: `signal Signal? @relation(fields: [signalId], references: [id], onDelete: SetNull)` (signalId already existed as optional field)
- Back-relations added:
  - `ExchangeCredential.orders: Order[]`
  - `ExchangeCredential.positions: Position[]`
  - `Position.trades: Trade[]`
  - `Order.trades: Trade[]`
  - `Signal.orders: Order[]`
  - `User.paperOrders: PaperOrder[]`
  - `User.coachAdvices: CoachAdvice[]`

#### Fix 7: Added missing fields for trading platform
- **Order**: `timeInForce String?` (GTC, IOC, FOK)
- **Position**: `leverage Decimal? @db.Decimal(5,2)`, `liquidationPrice Decimal? @db.Decimal(19,4)`
- **User**: `maxPositionSize Decimal? @db.Decimal(19,4)`, `maxDailyLoss Decimal? @db.Decimal(19,4)`, `riskTolerance String? @default("moderate")`

## No Breaking Changes
- All new fields are optional (nullable) or have defaults
- Existing code using Float fields will need to handle Decimal values (Prisma returns Decimal as Prisma.Decimal objects)
- No security-related code was touched
- No landing page or login/registration pages were touched
