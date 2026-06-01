"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var StrategicCouncilService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategicCouncilService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const ai_orchestrator_service_1 = require("../services/ai-orchestrator.service");
const audit_service_1 = require("../../../audit/audit.service");
const exchange_service_1 = require("../../exchange/exchange.service");
const news_service_1 = require("../../news/news.service");
const news_integration_service_1 = require("../../news/news-integration.service");
const rag_service_1 = require("../services/rag.service");
const strategic_council_types_1 = require("./strategic-council.types");
let StrategicCouncilService = StrategicCouncilService_1 = class StrategicCouncilService {
    constructor(prisma, redis, orchestrator, audit, exchangeService, configService, newsService, newsIntegration, ragService) {
        this.prisma = prisma;
        this.redis = redis;
        this.orchestrator = orchestrator;
        this.audit = audit;
        this.exchangeService = exchangeService;
        this.configService = configService;
        this.newsService = newsService;
        this.newsIntegration = newsIntegration;
        this.ragService = ragService;
        this.logger = new common_1.Logger(StrategicCouncilService_1.name);
        this.isExecutorInSession = false;
        this.isAgentInSession = false;
        this.DAILY_COST_CAP_USD = 50.00;
        this.REDIS_DAILY_COST_KEY = 'strategic-council:daily_cost';
        this.REDIS_DAILY_COST_DATE_KEY = 'strategic-council:daily_cost_date';
        this.REFERENCE_PRICES = {
            'EUR/USD': 1.1350, 'GBP/USD': 1.3250, 'USD/JPY': 143.50,
            'AAPL': 210.0, 'MSFT': 440.0, 'GOOGL': 168.0, 'TSLA': 280.0,
            'XAU/USD': 3250.0,
            'BTC/USDT': 81000.0, 'ETH/USDT': 2340.0, 'SOL/USDT': 95.0,
            'BNB/USDT': 652.0, 'XRP/USDT': 2.4, 'ADA/USDT': 0.75,
            'DOGE/USDT': 0.22, 'DOT/USDT': 7.0, 'AVAX/USDT': 35.0,
            'MATIC/USDT': 0.50, 'LINK/USDT': 15.0, 'UNI/USDT': 8.0,
        };
        this.PRICE_SANITY = {
            'BTC/USDT': { min: 20000, max: 200000 },
            'ETH/USDT': { min: 500, max: 10000 },
            'SOL/USDT': { min: 5, max: 500 },
            'BNB/USDT': { min: 100, max: 2000 },
            'XRP/USDT': { min: 0.1, max: 10 },
            'EUR/USD': { min: 0.8, max: 1.5 },
            'GBP/USD': { min: 1.0, max: 1.8 },
            'USD/JPY': { min: 100, max: 200 },
            'XAU/USD': { min: 1000, max: 5000 },
            'AAPL': { min: 100, max: 400 },
        };
        this.logger.log('🏛️ Strategic Council initialized — THE ONLY consensus engine (with news integration)');
        this._checkAIHealth();
    }
    _triggerStartupSession() {
        const MAX_WAIT_MS = 3 * 60 * 1000;
        const POLL_INTERVAL_MS = 10 * 1000;
        const startTime = Date.now();
        const checkAndTrigger = async () => {
            const elapsed = Date.now() - startTime;
            if (elapsed > MAX_WAIT_MS) {
                this.logger.warn('🏛️ Startup session: max wait reached (3 min) — triggering session even with limited AI models');
                try {
                    const result = await this.runHourlySession();
                    this.logger.log(`🏛️ Startup session (forced) complete: ${result.pairsAnalyzed} pairs, ` +
                        `${result.briefsIssued} new briefs, ${result.briefsModified} modified`);
                }
                catch (error) {
                    this.logger.error(`🏛️ Startup session (forced) failed: ${error.message}`);
                }
                return;
            }
            try {
                const models = await this.orchestrator.getModelsStatus();
                const working = models.filter((m) => m.available || m.keyAvailable).length;
                if (working >= 2) {
                    this.logger.log(`🏛️ ${working} AI models ready — triggering startup council session`);
                    const result = await this.runHourlySession();
                    this.logger.log(`🏛️ Startup session complete: ${result.pairsAnalyzed} pairs, ` +
                        `${result.briefsIssued} new briefs, ${result.briefsModified} modified`);
                }
                else {
                    this.logger.log(`🏛️ Only ${working}/2 AI models ready — waiting ${POLL_INTERVAL_MS / 1000}s before retry...`);
                    setTimeout(checkAndTrigger, POLL_INTERVAL_MS);
                }
            }
            catch (error) {
                this.logger.warn(`🏛️ AI health check failed: ${error.message} — retrying in ${POLL_INTERVAL_MS / 1000}s`);
                setTimeout(checkAndTrigger, POLL_INTERVAL_MS);
            }
        };
        setTimeout(checkAndTrigger, 30000);
    }
    _checkAIHealth() {
        setTimeout(async () => {
            try {
                const models = await this.orchestrator.getModelsStatus();
                const working = models.filter((m) => m.available || m.keyAvailable).length;
                if (working === 0) {
                    this.logger.error('🏛️ ⚠️ CRITICAL: Zero AI models available! The Strategic Council will produce NO Briefs. ' +
                        'Set at least one API key: GROQ_API_KEY, GEMINI_API_KEY, GLM_API_KEY, OPENROUTER_API_KEY, or DEEPSEEK_API_KEY');
                }
                else {
                    this.logger.log(`🏛️ AI Health: ${working}/${models.length} models available — Council can produce Briefs`);
                }
            }
            catch (error) {
                this.logger.warn(`🏛️ AI health check failed: ${error.message}`);
            }
        }, 5000);
    }
    async runAgentSession() {
        if (!this.prisma.isAvailable?.()) {
            return;
        }
        try {
            const s = await this.prisma.$queryRaw `SELECT value FROM "Setting" WHERE key = 'AUTO_TRADING_ENABLED' LIMIT 1`.catch(() => []);
            if (s?.[0] && String(s[0].value) !== 'true')
                return;
        }
        catch { }
        if (this.isAgentInSession)
            return;
        this.isAgentInSession = true;
        try {
            this.logger.log('🏛️ Agent Council: generating M30/H1/H4/D1/W1 briefs...');
            const agentPairs = strategic_council_types_1.BINANCE_SUPPORTED_PAIRS;
            this.logger.log(`🏛️ Agent Council: analyzing ${agentPairs.length} crypto pairs: ${agentPairs.join(', ')}`);
            const agentResults = await this._parallelProcess(agentPairs, async (pair) => {
                const pairResult = { pairs: 0, briefs: 0, errors: 0 };
                try {
                    const marketData = await this.orchestrator.fetchQuickMarketData(pair);
                    if (!marketData?.price)
                        return pairResult;
                    for (const tf of strategic_council_types_1.AGENT_TIMEFRAMES) {
                        if (strategic_council_types_1.AGENT_SLOW_TIMEFRAMES.includes(tf) && agentPairs.indexOf(pair) >= 3)
                            continue;
                        await this._analyzePairTimeframe(pair, tf, marketData.price, { pairs: 0, briefs: 0, errors: 0, sessionId: 'agent-session', durationMs: 0 });
                        pairResult.briefs++;
                    }
                    pairResult.pairs = 1;
                }
                catch (e) {
                    this.logger.warn(`Agent session: ${pair} failed — ${e.message}`);
                    pairResult.errors++;
                }
                return pairResult;
            }, 3);
            const agentTotal = agentResults.reduce((acc, r) => ({
                pairs: acc.pairs + r.pairs,
                briefs: acc.briefs + r.briefs,
                errors: acc.errors + r.errors,
            }), { pairs: 0, briefs: 0, errors: 0 });
            this.logger.log(`🏛️ Agent Council complete: ${agentTotal.pairs} pairs, ${agentTotal.briefs} briefs, ${agentTotal.errors} errors`);
        }
        catch (e) {
            this.logger.warn(`Agent session error: ${e.message}`);
        }
        finally {
            this.isAgentInSession = false;
        }
    }
    async runHourlySession() {
        if (!this.prisma.isAvailable?.()) {
            return {
                timestamp: new Date().toISOString(),
                pairsAnalyzed: 0,
                briefsIssued: 0,
                briefsModified: 0,
                briefsCancelled: 0,
                briefsExecuted: 0,
                durationMs: 0,
            };
        }
        try {
            const haltUntil = await this.redis?.get('council:sanctuary:halt');
            if (haltUntil && new Date(haltUntil) > new Date()) {
                this.logger.warn(`🏛️ Council HALTED by Sanctuary until ${haltUntil}`);
                return { timestamp: new Date().toISOString(), pairsAnalyzed: 0, briefsIssued: 0, briefsModified: 0, briefsCancelled: 0, briefsExecuted: 0, durationMs: 0 };
            }
        }
        catch { }
        try {
            let autoTradingEnabled = false;
            try {
                const dbSetting = await this.prisma.setting.findUnique({
                    where: { key: 'AUTO_TRADING_ENABLED' },
                });
                if (dbSetting) {
                    autoTradingEnabled = JSON.parse(dbSetting.value);
                }
            }
            catch {
            }
            if (!autoTradingEnabled) {
                this.logger.debug('🏛️ AUTO_TRADING_ENABLED=false in DB — skipping council session');
                return {
                    timestamp: new Date().toISOString(),
                    pairsAnalyzed: 0,
                    briefsIssued: 0,
                    briefsModified: 0,
                    briefsCancelled: 0,
                    briefsExecuted: 0,
                    durationMs: 0,
                };
            }
        }
        catch {
        }
        if (this.isExecutorInSession) {
            this.logger.warn('🏛️ Previous executor council session still running — skipping');
            return {
                timestamp: new Date().toISOString(),
                pairsAnalyzed: 0,
                briefsIssued: 0,
                briefsModified: 0,
                briefsCancelled: 0,
                briefsExecuted: 0,
                durationMs: 0,
            };
        }
        this.isExecutorInSession = true;
        const startTime = Date.now();
        const result = {
            timestamp: new Date().toISOString(),
            pairsAnalyzed: 0,
            briefsIssued: 0,
            briefsModified: 0,
            briefsCancelled: 0,
            briefsExecuted: 0,
            durationMs: 0,
            diagnostics: [],
        };
        try {
            this.logger.log('🏛️ Strategic Council convening hourly session...');
            const todayCost = await this._getTodayCost();
            if (todayCost >= this.DAILY_COST_CAP_USD) {
                this.logger.warn(`💰 Daily cost cap reached ($${todayCost.toFixed(2)}/$${this.DAILY_COST_CAP_USD}) — skipping session`);
                return result;
            }
            const executorPairs = strategic_council_types_1.BINANCE_SUPPORTED_PAIRS;
            this.logger.log(`🏛️ Executor Council: analyzing ${executorPairs.length} crypto pairs: ${executorPairs.join(', ')}`);
            const pairResults = await this._parallelProcess(executorPairs, async (pair) => {
                const cost = await this._getTodayCost();
                if (cost >= this.DAILY_COST_CAP_USD) {
                    this.logger.warn('💰 Daily cost cap reached — stopping session early');
                    return { analyzed: false, error: 'cost_cap' };
                }
                try {
                    await this._analyzePair(pair, result);
                    return { analyzed: true };
                }
                catch (error) {
                    if (error.message?.includes('Too many database connections') || error.message?.includes('connection pool')) {
                        this.logger.error(`🏛️ DB connection exhaustion detected during ${pair} analysis — breaking`);
                        return { analyzed: false, error: 'db_exhaustion' };
                    }
                    this.logger.error(`🏛️ Council failed for ${pair}: ${error.message}`);
                    return { analyzed: false, error: error.message };
                }
            }, 3);
            result.pairsAnalyzed = pairResults.filter(r => r.analyzed).length;
            if (pairResults.some(r => r.error === 'db_exhaustion')) {
                this.logger.error('🏛️ Stopping session early due to DB connection exhaustion');
            }
            await this._expireOutdatedBriefs();
            await this._markExecutedBriefs();
            result.durationMs = Date.now() - startTime;
            this.logger.log(`🏛️ Strategic Council session complete: ${result.pairsAnalyzed} pairs, ` +
                `${result.briefsIssued} new briefs, ${result.briefsModified} modified, ` +
                `${result.briefsCancelled} cancelled, ${result.briefsExecuted} executed (${result.durationMs}ms)`);
            await this.redis.set('strategic-council:last_session', JSON.stringify(result), 3600000);
            try {
                await this.redis.publish('council:session_complete', JSON.stringify({
                    timestamp: result.timestamp,
                    briefsIssued: result.briefsIssued,
                    briefsModified: result.briefsModified,
                    activeBriefs: await this.getActiveBriefsCount(),
                }));
            }
            catch (pubError) {
                this.logger.debug(`Failed to publish council event: ${pubError.message}`);
            }
            await this.audit.log({
                userId: 'system',
                action: 'STRATEGIC_COUNCIL_SESSION',
                resource: 'strategic-council',
                details: JSON.stringify(result),
            });
        }
        catch (error) {
            this.logger.error(`🏛️ Strategic Council session failed: ${error.message}`);
        }
        finally {
            this.isExecutorInSession = false;
        }
        return result;
    }
    isInSessionNow() {
        return this.isExecutorInSession || this.isAgentInSession;
    }
    async forceSessionAsync(sessionId, pairs, userId) {
        if (this.isExecutorInSession) {
            this.logger.warn('🏛️ Cannot start manual session — previous executor session still running');
            return {
                timestamp: new Date().toISOString(),
                pairsAnalyzed: 0,
                briefsIssued: 0,
                briefsModified: 0,
                briefsCancelled: 0,
                briefsExecuted: 0,
                durationMs: 0,
            };
        }
        this.isExecutorInSession = true;
        this.logger.log(`🏛️ Manual strategic council session [${sessionId}] started by ${userId} for: ${pairs.join(', ')}`);
        const result = {
            timestamp: new Date().toISOString(),
            pairsAnalyzed: 0,
            briefsIssued: 0,
            briefsModified: 0,
            briefsCancelled: 0,
            briefsExecuted: 0,
            durationMs: 0,
            diagnostics: [],
        };
        const startTime = Date.now();
        try {
            for (const pair of pairs) {
                try {
                    await this._analyzePair(pair, result);
                    result.pairsAnalyzed++;
                }
                catch (error) {
                    this.logger.error(`🏛️ Manual council [${sessionId}] failed for ${pair}: ${error.message}`);
                }
            }
            await this._expireOutdatedBriefs();
            await this._markExecutedBriefs();
            result.durationMs = Date.now() - startTime;
            this.logger.log(`🏛️ Manual session [${sessionId}] complete: ${result.pairsAnalyzed} pairs, ` +
                `${result.briefsIssued} new briefs, ${result.briefsModified} modified (${result.durationMs}ms)`);
            await this.redis.set('strategic-council:last_session', JSON.stringify(result), 3600000);
            try {
                await this.redis.publish('council:session_complete', JSON.stringify({
                    sessionId,
                    timestamp: result.timestamp,
                    briefsIssued: result.briefsIssued,
                    briefsModified: result.briefsModified,
                    activeBriefs: await this.getActiveBriefsCount(),
                }));
            }
            catch (pubError) {
                this.logger.debug(`Failed to publish council event: ${pubError.message}`);
            }
            await this.audit.log({
                userId,
                action: 'STRATEGIC_COUNCIL_MANUAL',
                resource: 'strategic-council',
                details: JSON.stringify({ sessionId, pairs, result }),
            });
        }
        catch (error) {
            this.logger.error(`🏛️ Manual session [${sessionId}] failed: ${error.message}`);
        }
        finally {
            this.isExecutorInSession = false;
        }
        return result;
    }
    async forceSession(pairs, userId) {
        return this.forceSessionAsync(`sync-${Date.now()}`, pairs, userId);
    }
    async getActiveBriefs(userId) {
        try {
            const where = { isActive: true, reviewStatus: { in: ['ACTIVE', 'MODIFIED'] } };
            if (userId)
                where.userId = userId;
            const briefs = await this.prisma.tradingBrief.findMany({
                where,
                orderBy: { issuedAt: 'desc' },
            });
            return briefs.map((b) => this._toDTO(b));
        }
        catch (error) {
            this.logger.error(`🏛️ getActiveBriefs failed: ${error.message}`);
            return [];
        }
    }
    async getConsolidatedBriefs(userId) {
        const allBriefs = await this.getActiveBriefs(userId);
        if (allBriefs.length === 0)
            return [];
        const executorBriefs = allBriefs.filter(b => strategic_council_types_1.EXECUTOR_TIMEFRAMES.includes(b.timeframe));
        const agentBriefs = allBriefs.filter(b => strategic_council_types_1.AGENT_TIMEFRAMES.includes(b.timeframe));
        const consolidated = [];
        const executorConsolidated = await this._consolidateBriefsByPair(executorBriefs, 'EXECUTOR');
        consolidated.push(...executorConsolidated);
        const agentConsolidated = await this._consolidateBriefsByPair(agentBriefs, 'AGENT');
        consolidated.push(...agentConsolidated);
        this.logger.log(`🏛️ V143 Consolidation: ${allBriefs.length} raw briefs → ${consolidated.length} consolidated ` +
            `(executor: ${executorConsolidated.length}, agent: ${agentConsolidated.length}) ` +
            `(pairs: ${consolidated.map(b => b.pair + ':' + b.direction + ':' + b.timeframe).join(', ')})`);
        return consolidated;
    }
    async _consolidateBriefsByPair(briefs, group) {
        if (briefs.length === 0)
            return [];
        const byPair = new Map();
        for (const brief of briefs) {
            const existing = byPair.get(brief.pair) || [];
            existing.push(brief);
            byPair.set(brief.pair, existing);
        }
        const consolidated = [];
        for (const [pair, pairBriefs] of byPair) {
            if (pairBriefs.length === 0)
                continue;
            if (pairBriefs.length === 1) {
                consolidated.push(pairBriefs[0]);
                continue;
            }
            const buyBriefs = pairBriefs.filter(b => b.direction === 'BUY');
            const sellBriefs = pairBriefs.filter(b => b.direction === 'SELL');
            if (sellBriefs.length === 0) {
                const best = buyBriefs.sort((a, b) => b.confidence - a.confidence)[0];
                consolidated.push(best);
            }
            else if (buyBriefs.length === 0) {
                const best = sellBriefs.sort((a, b) => b.confidence - a.confidence)[0];
                consolidated.push(best);
            }
            else {
                const TF_WEIGHT = {
                    M1: 2.0, M5: 1.5, M15: 1.2,
                    M30: 2.0, H1: 1.5, H4: 1.2,
                    D1: 0.8, W1: 0.5,
                };
                const buyScore = buyBriefs.reduce((sum, b) => sum + b.confidence * (TF_WEIGHT[b.timeframe] || 1.0), 0);
                const sellScore = sellBriefs.reduce((sum, b) => sum + b.confidence * (TF_WEIGHT[b.timeframe] || 1.0), 0);
                const winningBriefs = buyScore >= sellScore ? buyBriefs : sellBriefs;
                const losingBriefs = buyScore >= sellScore ? sellBriefs : buyBriefs;
                const winningDirection = buyScore >= sellScore ? 'BUY' : 'SELL';
                const best = winningBriefs.sort((a, b) => b.confidence - a.confidence)[0];
                this.logger.log(`🏛️ V143 CONSOLIDATION [${group}]: ${pair} has conflicting directions ` +
                    `(BUY=${buyBriefs.length} score=${buyScore.toFixed(0)}, ` +
                    `SELL=${sellBriefs.length} score=${sellScore.toFixed(0)}) ` +
                    `→ Winner: ${winningDirection} (best confidence=${best.confidence}%, ` +
                    `timeframe=${best.timeframe})`);
                consolidated.push(best);
                for (const losing of losingBriefs) {
                    try {
                        await this.prisma.tradingBrief.update({
                            where: { id: losing.id },
                            data: {
                                isActive: false,
                                reviewStatus: 'CANCELLED',
                                analysisSummary: `V143: Cancelled by ${group} consolidation — ${pair} has ${winningDirection} consensus within ${group} timeframes`,
                            },
                        });
                    }
                    catch { }
                }
            }
        }
        return consolidated;
    }
    async getActiveBriefsCount() {
        try {
            return await this.prisma.tradingBrief.count({
                where: { isActive: true, reviewStatus: { in: ['ACTIVE', 'MODIFIED'] } },
            });
        }
        catch {
            return 0;
        }
    }
    async getBriefHistory(userId, limit = 100) {
        try {
            const where = {};
            if (userId)
                where.userId = userId;
            const briefs = await this.prisma.tradingBrief.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                take: limit,
            });
            return briefs.map((b) => this._toDTO(b));
        }
        catch (error) {
            this.logger.error(`🏛️ getBriefHistory failed: ${error.message}`);
            return [];
        }
    }
    async getBriefById(briefId) {
        const brief = await this.prisma.tradingBrief.findUnique({
            where: { id: briefId },
        });
        return brief ? this._toDTO(brief) : null;
    }
    async getLastSession() {
        const cached = await this.redis.get('strategic-council:last_session');
        return cached ? JSON.parse(cached) : null;
    }
    async getBriefsForPair(pair) {
        try {
            const briefs = await this.prisma.tradingBrief.findMany({
                where: { pair, isActive: true, reviewStatus: 'ACTIVE' },
                orderBy: { issuedAt: 'desc' },
            });
            return briefs.map((b) => this._toDTO(b));
        }
        catch (error) {
            this.logger.error(`🏛️ getBriefsForPair failed: ${error.message}`);
            return [];
        }
    }
    async markBriefExecuted(briefId, orderId) {
        try {
            await this.prisma.tradingBrief.update({
                where: { id: briefId },
                data: {
                    isActive: false,
                    reviewStatus: 'EXECUTED',
                    analysisSummary: `Executed → Order: ${orderId}`,
                },
            });
            this.logger.log(`🏛️ Brief ${briefId} marked as EXECUTED (order: ${orderId})`);
        }
        catch (error) {
            this.logger.error(`Failed to mark brief ${briefId} as executed: ${error.message}`);
        }
    }
    async _fetchNewsContextForPair(pair) {
        try {
            const baseSymbol = pair.split('/')[0];
            const ragContext = await this.ragService.retrieveRelevantContext(`${baseSymbol} cryptocurrency market news sentiment`, 5);
            if (ragContext) {
                this.logger.debug(`🏛️ V143: RAG context found for ${pair}: ${ragContext.length} chars`);
            }
            const latestNews = await this.newsService.getLatestNews({
                symbol: baseSymbol,
                limit: 5,
            });
            let newsContext = '';
            if (latestNews && latestNews.length > 0) {
                const newsItems = latestNews.slice(0, 5).map((article, i) => {
                    const sentiment = article.sentimentLabel || 'neutral';
                    const impact = article.impactLevel || 'medium';
                    const score = typeof article.sentiment === 'number' ? article.sentiment.toFixed(2) : '0';
                    const title = article.translatedTitle || article.title || '';
                    const summary = article.summary || '';
                    const assets = article.affectedAssets || '';
                    const hoursAgo = article.publishedAt
                        ? Math.round((Date.now() - new Date(article.publishedAt).getTime()) / (60 * 60 * 1000))
                        : '?';
                    return `[${i + 1}] (${sentiment}, تأثير=${impact}, نقاط=${score}, منذ ${hoursAgo}ساعة) ${title}${summary ? ' — ' + summary : ''}${assets ? ' | أصول متأثرة: ' + assets : ''}`;
                }).join('\n');
                const sentimentScores = latestNews
                    .map((a) => typeof a.sentiment === 'number' ? a.sentiment : 0)
                    .filter((s) => s !== 0);
                const avgSentiment = sentimentScores.length > 0
                    ? sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length
                    : 0;
                const highImpactCount = latestNews.filter((a) => a.impactLevel === 'high' || a.impactLevel === 'HIGH').length;
                const sentimentDirection = avgSentiment > 0.2 ? 'إيجابي 🟢' : avgSentiment < -0.2 ? 'سلبي 🔴' : 'محايد ⚪';
                const riskLevel = highImpactCount > 0 ? 'عالي ⚠️' : 'مقبول ✅';
                newsContext = `\n\n📰 سياق الأخبار المحللة لـ ${pair} (${latestNews.length} خبر حديث):\n` +
                    `الملخص: اتجاه المشاعر ${sentimentDirection} (المعدل=${avgSentiment.toFixed(2)})، مستوى المخاطرة: ${riskLevel} (${highImpactCount} خبر عالي التأثير)\n` +
                    `الأخبار:\n${newsItems}`;
            }
            const parts = [];
            if (ragContext)
                parts.push(`📚 سياق RAG ذي الصلة:\n${ragContext}`);
            if (newsContext)
                parts.push(newsContext);
            try {
                const marketSentiment = await this.newsIntegration.getSentimentForAI();
                if (marketSentiment)
                    parts.push(marketSentiment);
            }
            catch { }
            const combined = parts.join('\n\n---\n\n');
            if (combined) {
                this.logger.log(`🏛️ V143: News context injected for ${pair} (${combined.length} chars, ${latestNews?.length || 0} articles, RAG=${ragContext ? 'yes' : 'no'})`);
            }
            else {
                this.logger.debug(`🏛️ V143: No news context for ${pair} — proceeding without news`);
            }
            return combined;
        }
        catch (error) {
            this.logger.warn(`🏛️ V143: News context fetch failed for ${pair}: ${error.message} — proceeding without news`);
            return '';
        }
    }
    async getNewsRiskScore(pair) {
        const defaultResult = {
            score: 0,
            riskLevel: 'low',
            opposingNews: false,
            sentimentLabel: 'لا أخبار متاحة',
            highImpactCount: 0,
            recentArticleCount: 0,
        };
        try {
            const baseSymbol = pair.split('/')[0];
            const latestNews = await this.newsService.getLatestNews({
                symbol: baseSymbol,
                limit: 10,
            });
            if (!latestNews || latestNews.length === 0)
                return defaultResult;
            const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
            const recentNews = latestNews.filter((a) => a.publishedAt && new Date(a.publishedAt) >= sixHoursAgo);
            if (recentNews.length === 0)
                return defaultResult;
            let weightedScore = 0;
            let totalWeight = 0;
            let highImpactCount = 0;
            for (const article of recentNews) {
                const sentiment = typeof article.sentiment === 'number' ? article.sentiment : 0;
                const impact = article.impactLevel?.toLowerCase();
                const hoursAgo = article.publishedAt
                    ? (Date.now() - new Date(article.publishedAt).getTime()) / (60 * 60 * 1000)
                    : 24;
                const impactWeight = impact === 'high' ? 3 : impact === 'medium' ? 2 : 1;
                const timeDecay = Math.max(0.2, 1 - (hoursAgo / 6));
                const weight = impactWeight * timeDecay;
                weightedScore += sentiment * weight;
                totalWeight += weight;
                if (impact === 'high')
                    highImpactCount++;
            }
            const score = totalWeight > 0 ? Math.max(-1, Math.min(1, weightedScore / totalWeight)) : 0;
            let riskLevel;
            if (highImpactCount >= 3 && Math.abs(score) > 0.5)
                riskLevel = 'critical';
            else if (highImpactCount >= 2 && Math.abs(score) > 0.3)
                riskLevel = 'high';
            else if (highImpactCount >= 1 || Math.abs(score) > 0.3)
                riskLevel = 'medium';
            else
                riskLevel = 'low';
            const sentimentLabel = score > 0.3 ? 'إيجابي قوي' : score > 0.1 ? 'إيجابي خفيف'
                : score < -0.3 ? 'سلبي قوي' : score < -0.1 ? 'سلبي خفيف' : 'محايد';
            return {
                score,
                riskLevel,
                opposingNews: false,
                sentimentLabel,
                highImpactCount,
                recentArticleCount: recentNews.length,
            };
        }
        catch (error) {
            this.logger.warn(`🏛️ V143: News risk score failed for ${pair}: ${error.message}`);
            return defaultResult;
        }
    }
    async _analyzePair(pair, result) {
        let currentPrice = 0;
        let priceSource = 'none';
        try {
            const marketData = await this.orchestrator.fetchQuickMarketData(pair);
            currentPrice = marketData.price;
            priceSource = 'orchestrator';
        }
        catch (e) {
            this.logger.warn(`🏛️ Orchestrator market data failed for ${pair}: ${e.message} — trying ExchangeService`);
            result.diagnostics?.push(`${pair}: orchestrator price failed: ${e.message}`);
        }
        if (currentPrice <= 0) {
            try {
                const quote = await this.exchangeService.getQuote(pair);
                currentPrice = quote.price;
                priceSource = 'exchange';
            }
            catch (e) {
                this.logger.warn(`🏛️ ExchangeService also failed for ${pair}: ${e.message}`);
                result.diagnostics?.push(`${pair}: exchange price also failed: ${e.message}`);
            }
        }
        if (currentPrice <= 0) {
            const refPrice = this.REFERENCE_PRICES[pair];
            if (refPrice && refPrice > 0) {
                currentPrice = refPrice;
                priceSource = 'reference-table';
                this.logger.warn(`🏛️ Using reference price for ${pair}: ${refPrice} (live sources unavailable)`);
                result.diagnostics?.push(`${pair}: using REFERENCE price=${refPrice} (live sources unavailable)`);
            }
            else {
                this.logger.warn(`🏛️ Could not fetch price for ${pair} from any source and no reference price — skipping`);
                result.diagnostics?.push(`${pair}: NO PRICE from any source — skipped`);
                return;
            }
        }
        result.diagnostics?.push(`${pair}: price=${currentPrice} from ${priceSource}`);
        const sanity = this.PRICE_SANITY[pair];
        if (sanity && (currentPrice < sanity.min || currentPrice > sanity.max)) {
            this.logger.error(`🏛️ PRICE SANITY FAILED for ${pair}: $${currentPrice} outside range [$${sanity.min}, $${sanity.max}] ` +
                `— source: ${priceSource}. Using reference price as fallback.`);
            const refPrice = this.REFERENCE_PRICES[pair];
            if (refPrice && refPrice >= sanity.min && refPrice <= sanity.max) {
                currentPrice = refPrice;
                priceSource = 'reference-table (sanity-fallback)';
                result.diagnostics?.push(`${pair}: SANITY CHECK FAILED — using reference price $${refPrice}`);
            }
            else {
                this.logger.error(`🏛️ No valid reference price for ${pair} — skipping`);
                result.diagnostics?.push(`${pair}: SANITY CHECK FAILED and no valid reference — SKIPPED`);
                return;
            }
        }
        for (const timeframe of strategic_council_types_1.EXECUTOR_TIMEFRAMES) {
            try {
                await this._analyzePairTimeframe(pair, timeframe, currentPrice, result);
            }
            catch (error) {
                this.logger.error(`🏛️ Analysis failed for ${pair} ${timeframe}: ${error.message}`);
                result.diagnostics?.push(`${pair} ${timeframe}: ANALYSIS ERROR: ${error.message}`);
            }
        }
    }
    async _analyzePairTimeframe(pair, timeframe, currentPrice, result) {
        const existingBrief = await this.prisma.tradingBrief.findFirst({
            where: {
                pair,
                timeframe: timeframe,
                isActive: true,
                reviewStatus: { in: ['ACTIVE', 'MODIFIED'] },
            },
        });
        let performancePenalty = 0;
        try {
            const recentBriefs = await this.prisma.tradingBrief.findMany({
                where: { pair, outcome: { not: null } },
                orderBy: { outcomeAt: 'desc' },
                take: 10,
                select: { outcome: true, actualPnl: true },
            });
            if (recentBriefs.length >= 5) {
                const wins = recentBriefs.filter(b => b.outcome === 'WIN').length;
                const winRate = wins / recentBriefs.length;
                if (winRate < 0.20) {
                    performancePenalty = 25;
                    this.logger.warn(`📉 ${pair}: Win Rate ${(winRate * 100).toFixed(0)}% في آخر ${recentBriefs.length} صفقات → penalty -${performancePenalty}`);
                }
                else if (winRate < 0.30) {
                    performancePenalty = 15;
                    this.logger.log(`📉 ${pair}: Win Rate ${(winRate * 100).toFixed(0)}% → penalty -${performancePenalty}`);
                }
            }
        }
        catch { }
        const newsContext = await this._fetchNewsContextForPair(pair);
        const newsRisk = await this.getNewsRiskScore(pair);
        const consensus = await this.orchestrator.getConsensusAnalysis(pair, {
            forceFresh: true,
            newsContext: newsContext || undefined,
        });
        let newsAdjustedConfidence = consensus.consensusScore;
        const newsDirection = consensus.recommendation === 'BUY' ? 'BUY' : 'SELL';
        const newsSupportsDirection = (newsDirection === 'BUY' && newsRisk.score > 0.1) ||
            (newsDirection === 'SELL' && newsRisk.score < -0.1);
        const newsOpposesDirection = (newsDirection === 'BUY' && newsRisk.score < -0.3) ||
            (newsDirection === 'SELL' && newsRisk.score > 0.3);
        if (newsOpposesDirection && newsRisk.riskLevel === 'critical') {
            newsAdjustedConfidence = Math.max(0, consensus.consensusScore - 15);
            this.logger.warn(`🏛️ V143: News OPPOSES ${newsDirection} for ${pair} (news score=${newsRisk.score.toFixed(2)}, risk=${newsRisk.riskLevel}) — confidence reduced ${consensus.consensusScore}% → ${newsAdjustedConfidence}%`);
        }
        else if (newsOpposesDirection) {
            newsAdjustedConfidence = Math.max(0, consensus.consensusScore - 8);
            this.logger.log(`🏛️ V143: News slightly opposes ${newsDirection} for ${pair} (news score=${newsRisk.score.toFixed(2)}) — confidence adjusted ${consensus.consensusScore}% → ${newsAdjustedConfidence}%`);
        }
        else if (newsSupportsDirection) {
            newsAdjustedConfidence = Math.min(95, consensus.consensusScore + 5);
            this.logger.log(`🏛️ V143: News supports ${newsDirection} for ${pair} (news score=${newsRisk.score.toFixed(2)}) — confidence boosted ${consensus.consensusScore}% → ${newsAdjustedConfidence}%`);
        }
        consensus.consensusScore = Math.max(0, newsAdjustedConfidence - performancePenalty);
        if (performancePenalty > 0) {
            consensus.masterStrategy = (consensus.masterStrategy || '') +
                `\n\n⚠️ Performance penalty: -${performancePenalty} نقطة (أداء ضعيف مؤخراً على ${pair})`;
        }
        if (newsContext) {
            consensus.masterStrategy = (consensus.masterStrategy || '') +
                `\n\n📰 سياق الأخبار: مشاعر=${newsRisk.sentimentLabel}, مخاطر=${newsRisk.riskLevel}, نقاط=${newsRisk.score.toFixed(2)} (${newsRisk.recentArticleCount} خبر حديث)`;
        }
        const isAIFallback = consensus.isFallback === true || consensus.consensusScore === 0;
        this.logger.log(`🏛️ Decision point for ${pair} ${timeframe}: ` +
            `recommendation=${consensus.recommendation}, score=${consensus.consensusScore}%, ` +
            `isFallback=${isAIFallback}, analyses=${consensus.analyses?.length || 0}, ` +
            `newsRisk=${newsRisk.riskLevel}(${newsRisk.score.toFixed(2)}), ` +
            `existingBrief=${existingBrief ? existingBrief.id : 'none'}`);
        result.diagnostics?.push(`${pair} ${timeframe}: rec=${consensus.recommendation} score=${consensus.consensusScore}% fallback=${isAIFallback} models=${consensus.analyses?.length || 0} newsRisk=${newsRisk.riskLevel}(${newsRisk.score.toFixed(2)})`);
        if (!isAIFallback && consensus.recommendation === 'HOLD') {
            const technicalOverride = await this._generateTechnicalFallbackBrief(pair, timeframe, currentPrice);
            if (technicalOverride && technicalOverride.recommendation !== 'HOLD') {
                this.logger.log(`🏛️ Technical override: AI said HOLD for ${pair} ${timeframe}, but momentum shows ${technicalOverride.recommendation}`);
                const direction = technicalOverride.recommendation === 'BUY' ? 'BUY' : 'SELL';
                let { entryPrice, stopLoss, takeProfit, strictRules } = this._calculateLevels(currentPrice, direction, timeframe);
                ({ stopLoss, takeProfit } = this._validateAndFixLevels(direction, entryPrice, stopLoss, takeProfit, timeframe));
                if (existingBrief) {
                    const sameDirection = existingBrief.direction === direction;
                    const priceDiff = Math.abs(Number(existingBrief.entryPrice) - entryPrice) / entryPrice;
                    if (sameDirection && priceDiff < 0.005) {
                        await this.prisma.tradingBrief.update({
                            where: { id: existingBrief.id },
                            data: { lastReviewedAt: new Date(), confidence: technicalOverride.consensusScore, analysisSummary: technicalOverride.masterStrategy },
                        });
                    }
                    else {
                        await this.prisma.tradingBrief.update({
                            where: { id: existingBrief.id },
                            data: {
                                direction, entryPrice, stopLoss, takeProfit,
                                confidence: technicalOverride.consensusScore,
                                strictRules: JSON.stringify(strictRules),
                                lastReviewedAt: new Date(), reviewStatus: 'MODIFIED',
                                expiresAt: new Date(Date.now() + strategic_council_types_1.TIMEFRAME_EXPIRY_MS[timeframe]),
                                analysisSummary: technicalOverride.masterStrategy,
                            },
                        });
                        result.briefsModified++;
                        this.logger.log(`🏛️ Technical override modified brief for ${pair} ${timeframe}: ${direction}`);
                    }
                }
                else {
                    try {
                        await this.prisma.tradingBrief.create({
                            data: {
                                pair, direction, entryPrice, stopLoss, takeProfit,
                                confidence: technicalOverride.consensusScore, timeframe: timeframe,
                                issuedAt: new Date(),
                                expiresAt: new Date(Date.now() + strategic_council_types_1.TIMEFRAME_EXPIRY_MS[timeframe]),
                                isActive: true, strictRules: JSON.stringify(strictRules),
                                lastReviewedAt: new Date(), reviewStatus: 'ACTIVE',
                                analysisSummary: technicalOverride.masterStrategy || `تحليل تقني: ${direction} بثقة ${technicalOverride.consensusScore}%`,
                            },
                        });
                        result.briefsIssued++;
                        this.logger.log(`🏛️ Technical override new brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice}`);
                    }
                    catch (dbError) {
                        this.logger.error(`🏛️ FAILED technical override brief for ${pair} ${timeframe}: ${dbError.message}`);
                    }
                }
                await this._addCost(technicalOverride.analyses?.length || 1);
                return;
            }
            result.diagnostics?.push(`${pair} ${timeframe}: Pure HOLD — no directional signal`);
            if (existingBrief) {
                await this.prisma.tradingBrief.update({
                    where: { id: existingBrief.id },
                    data: { lastReviewedAt: new Date() },
                });
                this.logger.debug(`🏛️ Pure HOLD (no directional signal) — keeping existing brief for ${pair} ${timeframe}`);
            }
            return;
        }
        if (!isAIFallback && consensus.recommendation !== 'HOLD' && consensus.consensusScore < strategic_council_types_1.MIN_CONSENSUS_SCORE) {
            this.logger.debug(`🏛️ Consensus too low (${consensus.consensusScore}%) for ${pair} ${timeframe} — skipping (news-adjusted from original AI score)`);
            result.diagnostics?.push(`${pair} ${timeframe}: SKIPPED — consensus too low (${consensus.consensusScore}% < ${strategic_council_types_1.MIN_CONSENSUS_SCORE}%) [news-adjusted]`);
            if (existingBrief) {
                await this.prisma.tradingBrief.update({
                    where: { id: existingBrief.id },
                    data: { lastReviewedAt: new Date() },
                });
            }
            return;
        }
        let effectiveConsensus = consensus;
        if (isAIFallback) {
            const technicalBrief = await this._generateTechnicalFallbackBrief(pair, timeframe, currentPrice);
            if (technicalBrief) {
                effectiveConsensus = technicalBrief;
                this.logger.log(`🏛️ Using technical-analysis fallback for ${pair} ${timeframe} (AI unavailable)`);
            }
            else {
                if (existingBrief) {
                    await this.prisma.tradingBrief.update({
                        where: { id: existingBrief.id },
                        data: { lastReviewedAt: new Date() },
                    });
                    this.logger.debug(`🏛️ AI and technical analysis unavailable — keeping existing brief for ${pair} ${timeframe}`);
                }
                return;
            }
        }
        const direction = effectiveConsensus.recommendation === 'BUY' ? 'BUY' : 'SELL';
        const { entryPrice, stopLoss, takeProfit, strictRules } = this._calculateLevels(currentPrice, direction, timeframe);
        if (existingBrief) {
            const sameDirection = existingBrief.direction === direction;
            const priceDiff = Math.abs(Number(existingBrief.entryPrice) - entryPrice) / entryPrice;
            if (sameDirection && priceDiff < 0.005) {
                await this.prisma.tradingBrief.update({
                    where: { id: existingBrief.id },
                    data: {
                        lastReviewedAt: new Date(),
                        confidence: effectiveConsensus.consensusScore,
                        analysisSummary: effectiveConsensus.masterStrategy,
                    },
                });
                this.logger.debug(`🏛️ Brief for ${pair} ${timeframe} reviewed — no change needed`);
            }
            else {
                await this.prisma.tradingBrief.update({
                    where: { id: existingBrief.id },
                    data: {
                        direction,
                        entryPrice,
                        stopLoss,
                        takeProfit,
                        confidence: effectiveConsensus.consensusScore,
                        strictRules: JSON.stringify(strictRules),
                        lastReviewedAt: new Date(),
                        reviewStatus: 'MODIFIED',
                        expiresAt: new Date(Date.now() + strategic_council_types_1.TIMEFRAME_EXPIRY_MS[timeframe]),
                        analysisSummary: effectiveConsensus.masterStrategy,
                    },
                });
                result.briefsModified++;
                this.logger.log(`🏛️ Modified brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice}`);
            }
        }
        else {
            try {
                await this.prisma.tradingBrief.create({
                    data: {
                        pair,
                        direction,
                        entryPrice,
                        stopLoss,
                        takeProfit,
                        confidence: effectiveConsensus.consensusScore,
                        timeframe: timeframe,
                        issuedAt: new Date(),
                        expiresAt: new Date(Date.now() + strategic_council_types_1.TIMEFRAME_EXPIRY_MS[timeframe]),
                        isActive: true,
                        strictRules: JSON.stringify(strictRules),
                        lastReviewedAt: new Date(),
                        reviewStatus: 'ACTIVE',
                        analysisSummary: effectiveConsensus.masterStrategy || `إجماع المجلس: ${direction} بثقة ${effectiveConsensus.consensusScore}%`,
                    },
                });
                result.briefsIssued++;
                this.logger.log(`🏛️ New brief for ${pair} ${timeframe}: ${direction} @ ${entryPrice} (confidence: ${effectiveConsensus.consensusScore}%)`);
                result.diagnostics?.push(`${pair} ${timeframe}: BRIEF CREATED ${direction} @ ${entryPrice} conf=${effectiveConsensus.consensusScore}%`);
            }
            catch (dbError) {
                this.logger.error(`🏛️ FAILED to create brief for ${pair} ${timeframe}: ${dbError.message} | data: direction=${direction} entryPrice=${entryPrice} stopLoss=${stopLoss} takeProfit=${takeProfit} confidence=${effectiveConsensus.consensusScore} timeframe=${timeframe}`);
                result.diagnostics?.push(`${pair} ${timeframe}: DB CREATE FAILED: ${dbError.message}`);
            }
        }
        await this._addCost(effectiveConsensus.analyses?.length || 0);
    }
    async _generateTechnicalFallbackBrief(pair, timeframe, currentPrice) {
        try {
            let momentum = 0;
            let confidence = 55;
            let rsi = 50;
            let change24h = 0;
            let usedOrchestratorData = false;
            try {
                const marketData = await this.orchestrator.fetchQuickMarketData(pair);
                if (marketData.price > 0) {
                    rsi = marketData.rsi;
                    change24h = marketData.change24h || 0;
                    usedOrchestratorData = true;
                    if (change24h !== 0) {
                        momentum = change24h / 100;
                        this.logger.debug(`🏛️ Technical fallback using 24h change: ${change24h.toFixed(2)}%, RSI=${rsi}`);
                    }
                }
            }
            catch (err) {
                this.logger.debug(`🏛️ Orchestrator market data unavailable: ${err.message}`);
            }
            if (!usedOrchestratorData || change24h === 0) {
                try {
                    const candles = await this.exchangeService.getHistoricalData(pair, '1h');
                    if (candles && candles.length >= 10) {
                        const closes = candles.map((c) => Number(c.close ?? c[4] ?? 0)).filter((v) => v > 0);
                        if (closes.length >= 10) {
                            const recentAvg = closes.slice(-6).reduce((a, b) => a + b, 0) / 6;
                            const olderAvg = closes.slice(-12, -6).length > 0
                                ? closes.slice(-12, -6).reduce((a, b) => a + b, 0) / closes.slice(-12, -6).length
                                : recentAvg;
                            momentum = (recentAvg - olderAvg) / olderAvg;
                            let gains = 0, losses = 0;
                            for (let i = 1; i < closes.length; i++) {
                                const change = closes[i] - closes[i - 1];
                                if (change > 0)
                                    gains += change;
                                else
                                    losses += Math.abs(change);
                            }
                            const rs = losses === 0 ? 100 : gains / losses;
                            rsi = 100 - (100 / (1 + rs));
                            this.logger.debug(`🏛️ Technical fallback using historical data: momentum=${(momentum * 100).toFixed(3)}%, RSI=${rsi.toFixed(0)}`);
                        }
                    }
                }
                catch (err) {
                    this.logger.debug(`🏛️ Historical data also unavailable: ${err.message}`);
                }
            }
            if (change24h > 0.001 && rsi < 75) {
                confidence = Math.min(70, 55 + Math.min(Math.abs(change24h) * 3, 15));
                return {
                    recommendation: 'BUY',
                    consensusScore: Math.round(confidence),
                    masterStrategy: `تحليل تقني — اتجاه صاعد 24h (${change24h.toFixed(2)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
                    analyses: [
                        { role: 'محلل تقني', model: 'Technical/24h-Change', vote: 'BUY', confidence: Math.round(confidence), reason: `ارتفاع ${change24h.toFixed(2)}% خلال 24 ساعة مع RSI ${rsi.toFixed(0)}` },
                        { role: 'محلل اتجاه', model: 'Technical/Trend', vote: 'BUY', confidence: Math.round(confidence - 5), reason: `زخم إيجابي في السوق` },
                    ],
                };
            }
            else if (change24h < -0.001 && rsi > 25) {
                confidence = Math.min(70, 55 + Math.min(Math.abs(change24h) * 3, 15));
                return {
                    recommendation: 'SELL',
                    consensusScore: Math.round(confidence),
                    masterStrategy: `تحليل تقني — اتجاه هابط 24h (${change24h.toFixed(2)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
                    analyses: [
                        { role: 'محلل تقني', model: 'Technical/24h-Change', vote: 'SELL', confidence: Math.round(confidence), reason: `انخفاض ${change24h.toFixed(2)}% خلال 24 ساعة مع RSI ${rsi.toFixed(0)}` },
                        { role: 'محلل اتجاه', model: 'Technical/Trend', vote: 'SELL', confidence: Math.round(confidence - 5), reason: `زخم سلبي في السوق` },
                    ],
                };
            }
            if (momentum > 0.0003 && rsi < 70) {
                confidence = Math.min(70, 55 + Math.abs(momentum) * 2000);
                return {
                    recommendation: 'BUY',
                    consensusScore: Math.round(confidence),
                    masterStrategy: `تحليل تقني — زخم إيجابي (${(momentum * 100).toFixed(3)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
                    analyses: [
                        { role: 'محلل تقني', model: 'Technical/Momentum', vote: 'BUY', confidence: Math.round(confidence), reason: `زخم إيجابي ${(momentum * 100).toFixed(3)}% مع RSI ${rsi.toFixed(0)}` },
                    ],
                };
            }
            else if (momentum < -0.0003 && rsi > 30) {
                confidence = Math.min(70, 55 + Math.abs(momentum) * 2000);
                return {
                    recommendation: 'SELL',
                    consensusScore: Math.round(confidence),
                    masterStrategy: `تحليل تقني — زخم سلبي (${(momentum * 100).toFixed(3)}%)، RSI=${rsi.toFixed(0)}. وقف خسارة وتقييد ربح محددان.`,
                    analyses: [
                        { role: 'محلل تقني', model: 'Technical/Momentum', vote: 'SELL', confidence: Math.round(confidence), reason: `زخم سلبي ${(momentum * 100).toFixed(3)}% مع RSI ${rsi.toFixed(0)}` },
                    ],
                };
            }
            if (rsi < 50) {
                confidence = 48;
                return {
                    recommendation: 'SELL',
                    consensusScore: confidence,
                    masterStrategy: `تحليل تقني — RSI منخفض (${rsi.toFixed(0)}) يشير لضغط بيع. وقف خسارة قريب مطلوب.`,
                    analyses: [
                        { role: 'محلل تقني', model: 'Technical/RSI', vote: 'SELL', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} دون 50 — ضغط بيعي` },
                    ],
                };
            }
            else {
                confidence = 48;
                return {
                    recommendation: 'BUY',
                    consensusScore: confidence,
                    masterStrategy: `تحليل تقني — RSI مرتفع (${rsi.toFixed(0)}) يشير لزخم شرائي. وقف خسارة قريب مطلوب.`,
                    analyses: [
                        { role: 'محلل تقني', model: 'Technical/RSI', vote: 'BUY', confidence: confidence, reason: `RSI ${rsi.toFixed(0)} فوق 50 — زخم إيجابي` },
                    ],
                };
            }
            let fallbackDir;
            if (change24h !== 0) {
                fallbackDir = change24h > 0 ? 'BUY' : 'SELL';
            }
            else {
                const priceMod = Math.floor(currentPrice) % 2;
                fallbackDir = priceMod === 0 ? 'BUY' : 'SELL';
            }
            confidence = 45;
            this.logger.log(`🏛️ Technical fallback: using price-based direction for ${pair}: ${fallbackDir} (price=${currentPrice}, RSI=${rsi}, 24h=${change24h?.toFixed(2) || 'N/A'}%)`);
            return {
                recommendation: fallbackDir,
                consensusScore: confidence,
                masterStrategy: `تحليل تقني — إشارة ضعيفة بناءً على حركة السعر. وقف خسارة قريب جداً مطلوب.`,
                analyses: [
                    { role: 'محلل تقني', model: 'Technical/Price-Action', vote: fallbackDir, confidence: confidence, reason: `إشارة اتجاهية ضعيفة بناءً على حركة السعر الحالية` },
                ],
            };
        }
        catch (err) {
            this.logger.warn(`🏛️ Technical fallback error for ${pair}: ${err.message} — using deterministic fallback`);
            const hash = this._deterministicHash(pair + new Date().getUTCHours().toString());
            const fallbackDir = hash % 2 === 0 ? 'BUY' : 'SELL';
            const fallbackConfidence = 58;
            return {
                recommendation: fallbackDir,
                consensusScore: fallbackConfidence,
                masterStrategy: `تحليل تقني — إشارة احتياطية بناءً على نمط السوق لـ ${pair}. وقف خسارة قريب جداً مطلوب.`,
                analyses: [
                    { role: 'محلل تقني', model: 'Technical/Deterministic-Fallback', vote: fallbackDir, confidence: fallbackConfidence, reason: `إشارة احتياطية حتمية لـ ${pair} — بيانات السوق غير متاحة` },
                ],
            };
        }
    }
    _deterministicHash(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i++) {
            const char = input.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
    _calculateLevels(currentPrice, direction, timeframe) {
        const { sl, tp, maxSlippage } = strategic_council_types_1.TIMEFRAME_RR[timeframe];
        let entryPrice;
        let stopLoss;
        let takeProfit;
        if (direction === 'BUY') {
            entryPrice = currentPrice;
            stopLoss = currentPrice * (1 - sl);
            takeProfit = currentPrice * (1 + tp);
        }
        else {
            entryPrice = currentPrice;
            stopLoss = currentPrice * (1 + sl);
            takeProfit = currentPrice * (1 - tp);
        }
        const strictRules = {
            maxEntryPrice: direction === 'BUY' ? currentPrice * (1 + maxSlippage) : undefined,
            minEntryPrice: direction === 'SELL' ? currentPrice * (1 - maxSlippage) : undefined,
            maxSlippage,
        };
        return { entryPrice, stopLoss, takeProfit, strictRules };
    }
    _validateAndFixLevels(direction, entryPrice, stopLoss, takeProfit, timeframe) {
        const { sl, tp } = strategic_council_types_1.TIMEFRAME_RR[timeframe];
        const valid = direction === 'BUY'
            ? stopLoss < entryPrice && takeProfit > entryPrice
            : stopLoss > entryPrice && takeProfit < entryPrice;
        if (!valid) {
            this.logger.warn(`🏛️ SL/TP invalid for ${direction} @ ${entryPrice}: SL=${stopLoss} TP=${takeProfit} — recalculating`);
            return direction === 'BUY'
                ? { stopLoss: entryPrice * (1 - sl), takeProfit: entryPrice * (1 + tp) }
                : { stopLoss: entryPrice * (1 + sl), takeProfit: entryPrice * (1 - tp) };
        }
        return { stopLoss, takeProfit };
    }
    async _expireOutdatedBriefs() {
        try {
            const expired = await this.prisma.tradingBrief.updateMany({
                where: {
                    isActive: true,
                    reviewStatus: { in: ['ACTIVE', 'MODIFIED'] },
                    expiresAt: { lt: new Date() },
                },
                data: {
                    isActive: false,
                    reviewStatus: 'CANCELLED',
                },
            });
            if (expired.count > 0) {
                this.logger.log(`🏛️ Expired ${expired.count} outdated briefs`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to expire briefs: ${error.message}`);
        }
    }
    async _markExecutedBriefs() {
        try {
            const now = new Date();
            const expiredAndExecuted = await this.prisma.tradingBrief.findMany({
                where: {
                    reviewStatus: 'EXECUTED',
                    isActive: true,
                    expiresAt: { lt: now },
                },
            });
            if (expiredAndExecuted.length > 0) {
                await this.prisma.tradingBrief.updateMany({
                    where: {
                        reviewStatus: 'EXECUTED',
                        isActive: true,
                        expiresAt: { lt: now },
                    },
                    data: {
                        isActive: false,
                    },
                });
                this.logger.log(`🏛️ Deactivated ${expiredAndExecuted.length} EXPIRED+EXECUTED brief(s) (keeping non-expired active briefs for Smart Executor)`);
            }
        }
        catch (error) {
            this.logger.error(`Failed to mark executed briefs: ${error.message}`);
        }
    }
    _toDTO(brief) {
        return {
            id: brief.id,
            userId: brief.userId,
            pair: brief.pair,
            direction: brief.direction,
            entryPrice: Number(brief.entryPrice),
            stopLoss: Number(brief.stopLoss),
            takeProfit: Number(brief.takeProfit),
            confidence: brief.confidence,
            timeframe: brief.timeframe,
            issuedAt: brief.issuedAt,
            expiresAt: brief.expiresAt,
            isActive: brief.isActive,
            strictRules: JSON.parse(brief.strictRules || '{}'),
            lastReviewedAt: brief.lastReviewedAt,
            reviewStatus: brief.reviewStatus,
            analysisSummary: brief.analysisSummary,
        };
    }
    async _parallelProcess(items, handler, concurrency = 3) {
        const results = new Array(items.length);
        let nextIndex = 0;
        const worker = async () => {
            while (nextIndex < items.length) {
                const index = nextIndex++;
                if (index >= items.length)
                    break;
                results[index] = await handler(items[index]);
            }
        };
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
        await Promise.all(workers);
        return results;
    }
    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    async _getTodayCost() {
        try {
            const today = new Date().toISOString().slice(0, 10);
            const storedDate = await this.redis.get(this.REDIS_DAILY_COST_DATE_KEY);
            if (storedDate !== today) {
                await this.redis.set(this.REDIS_DAILY_COST_KEY, '0', 86400000);
                await this.redis.set(this.REDIS_DAILY_COST_DATE_KEY, today, 86400000);
                return 0;
            }
            const cost = await this.redis.get(this.REDIS_DAILY_COST_KEY);
            return cost ? parseFloat(cost) : 0;
        }
        catch {
            return 0;
        }
    }
    async _addCost(analysesCount) {
        try {
            const estimatedCost = analysesCount * 0.005;
            const currentCost = await this._getTodayCost();
            await this.redis.set(this.REDIS_DAILY_COST_KEY, (currentCost + estimatedCost).toString(), 86400000);
        }
        catch {
        }
    }
};
exports.StrategicCouncilService = StrategicCouncilService;
__decorate([
    (0, schedule_1.Cron)('7,37 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilService.prototype, "runAgentSession", null);
__decorate([
    (0, schedule_1.Cron)('*/15 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], StrategicCouncilService.prototype, "runHourlySession", null);
exports.StrategicCouncilService = StrategicCouncilService = StrategicCouncilService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService,
        ai_orchestrator_service_1.AIOrchestratorService,
        audit_service_1.AuditService,
        exchange_service_1.ExchangeService,
        config_1.ConfigService,
        news_service_1.NewsService,
        news_integration_service_1.NewsIntegrationService,
        rag_service_1.RagService])
], StrategicCouncilService);
//# sourceMappingURL=strategic-council.service.js.map