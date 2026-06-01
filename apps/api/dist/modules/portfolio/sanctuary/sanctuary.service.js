"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SanctuaryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SanctuaryService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../../common/redis/redis.service");
const prisma_service_1 = require("../../../common/prisma/prisma.service");
const credentials_service_1 = require("../credentials/credentials.service");
const exchange_service_1 = require("../../exchange/exchange.service");
const ai_orchestrator_service_1 = require("../../ai/services/ai-orchestrator.service");
const audit_service_1 = require("../../../audit/audit.service");
const ccxt = __importStar(require("ccxt"));
let SanctuaryService = SanctuaryService_1 = class SanctuaryService {
    constructor(prisma, credentialsService, exchangeService, orchestrator, auditService, redisService) {
        this.prisma = prisma;
        this.credentialsService = credentialsService;
        this.exchangeService = exchangeService;
        this.orchestrator = orchestrator;
        this.auditService = auditService;
        this.redisService = redisService;
        this.logger = new common_1.Logger(SanctuaryService_1.name);
        this.logger.log('🏛️ Sanctuary Service initialized — portfolio risk analysis ready');
    }
    async analyzePortfolio(userId) {
        this.logger.log(`🏛️ Analyzing portfolio for user ${userId}`);
        const credentials = await this.prisma.exchangeCredential.findMany({
            where: { userId, isValid: true },
        });
        const allPositions = [];
        let totalValue = 0;
        for (const cred of credentials) {
            try {
                const decrypted = await this.credentialsService.decryptCredential(cred.id, userId);
                const positions = await this._fetchExchangePositions(cred.exchange, decrypted.apiKey, decrypted.apiSecret);
                allPositions.push(...positions);
            }
            catch (error) {
                this.logger.warn(`Failed to fetch positions from ${cred.exchange}: ${error.message}`);
            }
        }
        const portfolios = await this.prisma.portfolio.findMany({
            where: { userId },
            include: { assets: true },
        });
        const manualAssets = [];
        for (const portfolio of portfolios) {
            for (const asset of portfolio.assets) {
                const existing = allPositions.find((p) => p.symbol === asset.symbol);
                if (!existing) {
                    manualAssets.push(asset);
                }
            }
        }
        if (manualAssets.length > 0) {
            const quotePromises = manualAssets.map((asset) => this.exchangeService.getQuote(asset.symbol).catch(() => null));
            const quotes = await Promise.allSettled(quotePromises);
            for (let i = 0; i < manualAssets.length; i++) {
                const asset = manualAssets[i];
                const quoteResult = quotes[i];
                let currentPrice = asset.currentPrice || asset.avgPrice;
                if (quoteResult.status === 'fulfilled' && quoteResult.value?.price) {
                    currentPrice = quoteResult.value.price;
                }
                const value = asset.quantity * currentPrice;
                totalValue += value;
                allPositions.push({
                    symbol: asset.symbol,
                    exchange: asset.exchange || 'manual',
                    quantity: asset.quantity,
                    currentPrice,
                    value,
                    weight: 0,
                    change24h: 0,
                    assetType: asset.assetType,
                });
            }
        }
        totalValue = allPositions.reduce((sum, p) => sum + p.value, 0);
        for (const pos of allPositions) {
            pos.weight = totalValue > 0 ? (pos.value / totalValue) * 100 : 0;
        }
        const metrics = this._calculateRiskMetrics(allPositions, totalValue);
        let aiAnalysis = '';
        try {
            aiAnalysis = await this._generateAIAnalysis(allPositions, metrics, totalValue);
        }
        catch (error) {
            this.logger.warn(`AI analysis failed: ${error.message}`);
            aiAnalysis = 'لم يتم الحصول على تحليل الذكاء الاصطناعي.';
        }
        const recommendations = this._generateRecommendations(allPositions, metrics);
        const riskScore = this._calculateOverallRiskScore(metrics);
        const summary = this._generateSummary(allPositions, metrics, totalValue, riskScore);
        await this.auditService.log({
            userId,
            action: 'PORTFOLIO_ANALYZED',
            resource: 'sanctuary',
            details: JSON.stringify({
                totalValue,
                positionCount: allPositions.length,
                riskScore,
            }),
        });
        return {
            summary,
            riskScore,
            totalValue,
            currency: 'USD',
            positions: allPositions,
            metrics,
            recommendations,
            aiAnalysis,
            analyzedAt: new Date(),
        };
    }
    async _fetchExchangePositions(exchange, apiKey, apiSecret) {
        const positions = [];
        try {
            const ExchangeClass = ccxt[exchange];
            if (!ExchangeClass)
                return positions;
            const instance = new ExchangeClass({
                apiKey,
                secret: apiSecret,
                enableRateLimit: true,
            });
            const balance = await instance.fetchBalance();
            const currencyEntries = [];
            for (const [currency, amount] of Object.entries(balance.total || {})) {
                if (!amount || amount <= 0)
                    continue;
                if (['free', 'used', 'total'].includes(currency))
                    continue;
                currencyEntries.push({ currency, amount: amount });
            }
            const usdtQuotePromises = currencyEntries.map(({ currency }) => {
                if (currency === 'USDT' || currency === 'USD')
                    return Promise.resolve(null);
                return this.exchangeService.getQuote(`${currency}/USDT`).catch(() => null);
            });
            const usdtQuotes = await Promise.allSettled(usdtQuotePromises);
            const usdRetryIndices = [];
            const usdRetryPromises = [];
            for (let i = 0; i < currencyEntries.length; i++) {
                const { currency } = currencyEntries[i];
                if (currency === 'USDT' || currency === 'USD')
                    continue;
                const quoteResult = usdtQuotes[i];
                if (quoteResult.status !== 'fulfilled' || !quoteResult.value?.price) {
                    usdRetryIndices.push(i);
                    usdRetryPromises.push(this.exchangeService.getQuote(`${currency}/USD`).catch(() => null));
                }
            }
            const usdQuotes = usdRetryPromises.length > 0
                ? await Promise.allSettled(usdRetryPromises)
                : [];
            let usdRetryCursor = 0;
            for (let i = 0; i < currencyEntries.length; i++) {
                const { currency, amount: numAmount } = currencyEntries[i];
                let currentPrice = 0;
                let change24h = 0;
                let symbol = currency;
                if (currency === 'USDT' || currency === 'USD') {
                    currentPrice = 1;
                }
                else {
                    const usdtResult = usdtQuotes[i];
                    if (usdtResult.status === 'fulfilled' && usdtResult.value?.price) {
                        currentPrice = usdtResult.value.price;
                        change24h = usdtResult.value.changePercent;
                        symbol = `${currency}/USDT`;
                    }
                    else {
                        const usdResult = usdQuotes[usdRetryCursor];
                        usdRetryCursor++;
                        if (usdResult?.status === 'fulfilled' && usdResult.value?.price) {
                            currentPrice = usdResult.value.price;
                            change24h = usdResult.value.changePercent;
                            symbol = `${currency}/USD`;
                        }
                    }
                }
                const value = numAmount * currentPrice;
                if (value > 1) {
                    positions.push({
                        symbol,
                        exchange,
                        quantity: numAmount,
                        currentPrice,
                        value,
                        weight: 0,
                        change24h,
                        assetType: currency === 'USDT' || currency === 'USD' ? 'FOREX' : 'CRYPTO',
                    });
                }
            }
        }
        catch (error) {
            this.logger.warn(`Failed to fetch ${exchange} positions: ${error.message}`);
        }
        return positions;
    }
    _calculateRiskMetrics(positions, totalValue) {
        if (positions.length === 0) {
            return {
                concentrationRisk: 0,
                diversificationScore: 100,
                largestPositionWeight: 0,
                positionCount: 0,
                varEstimate: 0,
                volatilityEstimate: 0,
            };
        }
        const weights = positions.map((p) => p.weight / 100);
        const hhi = weights.reduce((sum, w) => sum + w * w, 0);
        const concentrationRisk = Math.min(100, hhi * 100 * 4);
        const diversificationScore = Math.max(0, 100 - concentrationRisk);
        const largestPositionWeight = Math.max(...positions.map((p) => p.weight));
        const weightedVolatility = positions.reduce((sum, p) => {
            const vol = p.assetType === 'CRYPTO' ? 0.05 : p.assetType === 'STOCK' ? 0.015 : 0.01;
            return sum + (p.weight / 100) * vol;
        }, 0);
        const varEstimate = totalValue * weightedVolatility * 1.645;
        const volatilityEstimate = weightedVolatility * Math.sqrt(365) * 100;
        return {
            concentrationRisk: Math.round(concentrationRisk),
            diversificationScore: Math.round(diversificationScore),
            largestPositionWeight: Math.round(largestPositionWeight * 10) / 10,
            positionCount: positions.length,
            varEstimate: Math.round(varEstimate * 100) / 100,
            volatilityEstimate: Math.round(volatilityEstimate * 10) / 10,
        };
    }
    _calculateOverallRiskScore(metrics) {
        const concentrationWeight = 0.3;
        const diversificationWeight = 0.2;
        const volatilityWeight = 0.3;
        const positionCountWeight = 0.2;
        const positionFactor = metrics.positionCount <= 2 ? 80
            : metrics.positionCount <= 5 ? 50
                : metrics.positionCount <= 10 ? 30
                    : 10;
        const score = metrics.concentrationRisk * concentrationWeight +
            (100 - metrics.diversificationScore) * diversificationWeight +
            Math.min(100, metrics.volatilityEstimate * 2) * volatilityWeight +
            positionFactor * positionCountWeight;
        return Math.round(Math.min(100, Math.max(0, score)));
    }
    async _generateAIAnalysis(positions, metrics, totalValue) {
        const positionsSummary = positions
            .map((p) => `- ${p.symbol}: ${p.quantity} × $${p.currentPrice.toFixed(2)} = $${p.value.toFixed(2)} (${p.weight.toFixed(1)}%)`)
            .join('\n');
        const prompt = `أنت محلل مخاطر مالي في منصة "رؤى لربط الحسابات". حلل المحفظة التالية وقدم توصيات باللغة العربية.

📊 المحفظة (القيمة الإجمالية: $${totalValue.toFixed(2)}):
${positionsSummary || 'لا توجد أصول'}

📐 مقاييس المخاطر:
- مخاطر التركيز: ${metrics.concentrationRisk}/100
- درجة التنويع: ${metrics.diversificationScore}/100
- أكبر مركز: ${metrics.largestPositionWeight}%
- عدد المراكز: ${metrics.positionCount}
- القيمة المعرضة للمخاطر (VaR 95%): $${metrics.varEstimate.toFixed(2)}
- التقلب المقدر: ${metrics.volatilityEstimate}%

قدم:
1. تقييم شامل لمخاطر المحفظة
2. توصيات محددة لتقليل المخاطر
3. نصائح لتحسين التنويع
4. تحذيرات مهمة

أضف دائماً: "هذا التحليل لأغراض تعليمية فقط وليس نصيحة استثمارية."`;
        const response = await this.orchestrator.analyze({
            prompt,
            type: 'risk_analysis',
            language: 'ar',
        });
        return response.content;
    }
    _generateRecommendations(positions, metrics) {
        const recommendations = [];
        const portfolioValue = positions.reduce((sum, p) => sum + p.value, 0);
        const heavyPositions = positions.filter((p) => p.weight > 20);
        for (const pos of heavyPositions) {
            recommendations.push(`⚠️ ${pos.symbol} يشكل ${pos.weight.toFixed(1)}% من المحفظة. ننصح بتقليل التعرض لأقل من 20% لتحسين التنويع.`);
        }
        if (metrics.positionCount < 5) {
            recommendations.push('📊 المحفظة تحتوي على عدد قليل من الأصول. ننصح بإضافة أصول من فئات مختلفة لتقليل المخاطر.');
        }
        const allCrypto = positions.every((p) => p.assetType === 'CRYPTO');
        if (allCrypto && positions.length > 0) {
            recommendations.push('💰 جميع الأصول هي عملات مشفرة. ننصح بتنويع المحفظة بإضافة أسهم أو سلع أو سندات.');
        }
        if (metrics.volatilityEstimate > 60) {
            recommendations.push('📈 التقلب مرتفع جداً. ننصح بزيادة حصة الأصول المستقرة أو تحديد أوامر وقف الخسارة.');
        }
        if (metrics.varEstimate > portfolioValue * 0.05) {
            recommendations.push(`🛡️ القيمة المعرضة للمخاطر (VaR) تبلغ $${metrics.varEstimate.toFixed(2)} يومياً. ننصح بإعادة توازن المحفظة.`);
        }
        if (recommendations.length === 0) {
            recommendations.push('✅ المحفظة متوازنة بشكل جيد. استمر في مراقبة الأسواق وتعديل المراكز عند الحاجة.');
        }
        return recommendations;
    }
    _generateSummary(positions, metrics, totalValue, riskScore) {
        const riskLevel = riskScore < 30 ? 'منخفض' : riskScore < 60 ? 'متوسط' : 'مرتفع';
        return `تحليل ملاذ المحفظة: ${positions.length} مركز بقيمة إجمالية $${totalValue.toFixed(2)}. مستوى المخاطر: ${riskLevel} (${riskScore}/100). درجة التنويع: ${metrics.diversificationScore}/100.`;
    }
    async checkAndHaltCouncil(userId) {
        try {
            const recentPositions = await this.prisma.position.findMany({
                where: { userId, status: 'CLOSED', closedAt: { not: null } },
                orderBy: { closedAt: 'desc' },
                take: 10,
                select: { realizedPnl: true, closedAt: true },
            });
            if (recentPositions.length < 3)
                return;
            let consecutive = 0;
            for (const p of recentPositions) {
                if (Number(p.realizedPnl) < 0)
                    consecutive++;
                else
                    break;
            }
            if (consecutive >= 5) {
                const haltUntil = new Date(Date.now() + 60 * 60 * 1000);
                await this.redisService?.set('council:sanctuary:halt', haltUntil.toISOString(), 60 * 60 * 1000);
                this.logger.warn(`🛡️ Sanctuary HALTED council for 1h: ${consecutive} consecutive losses`);
            }
        }
        catch (err) {
            this.logger.debug(`Sanctuary check failed: ${err.message}`);
        }
    }
};
exports.SanctuaryService = SanctuaryService;
exports.SanctuaryService = SanctuaryService = SanctuaryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        credentials_service_1.CredentialsService,
        exchange_service_1.ExchangeService,
        ai_orchestrator_service_1.AIOrchestratorService,
        audit_service_1.AuditService,
        redis_service_1.RedisService])
], SanctuaryService);
//# sourceMappingURL=sanctuary.service.js.map