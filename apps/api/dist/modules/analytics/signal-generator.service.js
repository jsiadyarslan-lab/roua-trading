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
var SignalGeneratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalGeneratorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const analytical_ai_service_1 = require("./analytical-ai.service");
const aggregator_service_1 = require("./aggregator.service");
const indicators_service_1 = require("./indicators.service");
const audit_service_1 = require("../../audit/audit.service");
const analytics_types_1 = require("./analytics.types");
let SignalGeneratorService = SignalGeneratorService_1 = class SignalGeneratorService {
    constructor(prisma, analyticalAI, aggregator, indicators, auditService) {
        this.prisma = prisma;
        this.analyticalAI = analyticalAI;
        this.aggregator = aggregator;
        this.indicators = indicators;
        this.auditService = auditService;
        this.logger = new common_1.Logger(SignalGeneratorService_1.name);
        this.MIN_RISK_REWARD = 1.5;
        this.DEFAULT_SL_PERCENT = 0.03;
        this.MIN_SL_DISTANCE = 0.01;
        this.SIGNAL_EXPIRY_MS = 24 * 60 * 60 * 1000;
        this.logger.log('📡 Signal Generator Service initialized — mandatory stop-loss enforced');
    }
    async generateSignal(userId, symbol, preComputedAnalysis) {
        this.logger.log(`📡 Generating signal for ${symbol} (user: ${userId})`);
        const analysisCard = preComputedAnalysis || await this.analyticalAI.analyzeAsset(symbol);
        const action = this._determineAction(analysisCard.technical, analysisCard.confidence);
        const entryPrice = analysisCard.quote?.price || null;
        if (!entryPrice || entryPrice === 0) {
            this.logger.warn(`No price data for ${symbol} — generating WAIT signal`);
            return this._createWaitSignal(symbol, 'لا تتوفر بيانات سعرية كافية');
        }
        const stopLoss = this._calculateStopLoss(action, entryPrice, analysisCard.technical);
        const takeProfit = this._calculateTakeProfit(action, entryPrice, stopLoss, analysisCard.technical);
        const riskRewardRatio = this._calculateRiskReward(entryPrice, stopLoss, takeProfit, action);
        const supportingIndicators = this._getSupportingIndicators(analysisCard.technical, action);
        const reason = this._buildSignalReason(action, analysisCard);
        const confidence = Math.round(this._calculateSignalConfidence(analysisCard, action));
        const expiresAt = new Date(Date.now() + this.SIGNAL_EXPIRY_MS);
        const signal = await this.prisma.signal.create({
            data: {
                userId,
                pair: symbol,
                action,
                confidence,
                reason,
                entryPrice,
                stopLoss,
                takeProfit,
                status: 'ACTIVE',
                expiresAt,
            },
        });
        await this.auditService.log({
            userId,
            action: 'SIGNAL_GENERATED',
            resource: 'signal',
            details: JSON.stringify({
                symbol,
                action,
                confidence,
                entryPrice,
                stopLoss,
                takeProfit,
                riskRewardRatio,
                signalId: signal.id,
                technicalScore: analysisCard.technical?.technicalScore,
            }),
        });
        this.logger.log(`📡 Signal generated: ${action} ${symbol} @ ${entryPrice} (SL: ${stopLoss}, TP: ${takeProfit}, R:R ${riskRewardRatio})`);
        return {
            symbol,
            action,
            confidence,
            stopLoss,
            takeProfit,
            entryPrice,
            reason,
            supportingIndicators,
            riskRewardRatio,
            expiresAt,
            id: signal.id,
        };
    }
    async getSignalsForSymbol(userId, symbol, limit = 10) {
        await this.prisma.signal.updateMany({
            where: {
                userId,
                pair: symbol,
                status: 'ACTIVE',
                expiresAt: { lt: new Date() },
            },
            data: { status: 'EXPIRED' },
        });
        const signals = await this.prisma.signal.findMany({
            where: { userId, pair: symbol },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        return signals.map((s) => ({
            symbol: s.pair,
            action: s.action,
            confidence: s.confidence,
            stopLoss: Number(s.stopLoss ?? 0),
            takeProfit: s.takeProfit != null ? Number(s.takeProfit) : null,
            entryPrice: s.entryPrice != null ? Number(s.entryPrice) : null,
            reason: s.reason,
            supportingIndicators: [],
            riskRewardRatio: s.stopLoss && s.takeProfit && s.entryPrice
                ? this._calculateRiskReward(Number(s.entryPrice), Number(s.stopLoss), Number(s.takeProfit), s.action)
                : null,
            expiresAt: s.expiresAt,
            id: s.id,
        }));
    }
    _determineAction(technical, confidence) {
        if (confidence < 30)
            return analytics_types_1.SignalAction.WAIT;
        if (!technical)
            return analytics_types_1.SignalAction.WAIT;
        const score = technical.technicalScore;
        if (score > 40)
            return analytics_types_1.SignalAction.BUY;
        if (score < -40)
            return analytics_types_1.SignalAction.SELL;
        if (score > 20) {
            if (technical.rsi?.interpretation === 'OVERBOUGHT') {
                return analytics_types_1.SignalAction.WAIT;
            }
            return analytics_types_1.SignalAction.BUY;
        }
        if (score < -20) {
            if (technical.rsi?.interpretation === 'OVERSOLD') {
                return analytics_types_1.SignalAction.WAIT;
            }
            return analytics_types_1.SignalAction.SELL;
        }
        return analytics_types_1.SignalAction.WAIT;
    }
    _calculateStopLoss(action, entryPrice, technical) {
        if (action === analytics_types_1.SignalAction.WAIT) {
            return entryPrice;
        }
        let stopLoss;
        if (technical?.atr && technical.atr.values.length > 0) {
            const latestAtr = technical.atr.values[technical.atr.values.length - 1];
            if (latestAtr > 0) {
                const atrDistance = 2 * latestAtr;
                if (action === analytics_types_1.SignalAction.BUY) {
                    stopLoss = entryPrice - atrDistance;
                }
                else {
                    stopLoss = entryPrice + atrDistance;
                }
                const slDistance = Math.abs(entryPrice - stopLoss) / entryPrice;
                if (slDistance < this.MIN_SL_DISTANCE) {
                    this.logger.debug(`ATR SL too close (${(slDistance * 100).toFixed(2)}%) — applying minimum distance`);
                    stopLoss = action === analytics_types_1.SignalAction.BUY
                        ? entryPrice * (1 - this.MIN_SL_DISTANCE)
                        : entryPrice * (1 + this.MIN_SL_DISTANCE);
                }
                this.logger.debug(`ATR-based SL for ${action}: ${stopLoss} (ATR=${latestAtr.toFixed(2)})`);
                return stopLoss;
            }
        }
        if (action === analytics_types_1.SignalAction.BUY) {
            stopLoss = entryPrice * (1 - this.DEFAULT_SL_PERCENT);
        }
        else {
            stopLoss = entryPrice * (1 + this.DEFAULT_SL_PERCENT);
        }
        this.logger.debug(`Percentage-based SL for ${action}: ${stopLoss} (${(this.DEFAULT_SL_PERCENT * 100)}%)`);
        return stopLoss;
    }
    _calculateTakeProfit(action, entryPrice, stopLoss, technical) {
        if (action === analytics_types_1.SignalAction.WAIT)
            return null;
        const risk = Math.abs(entryPrice - stopLoss);
        if (risk === 0)
            return null;
        const reward = risk * 2;
        let takeProfit;
        if (action === analytics_types_1.SignalAction.BUY) {
            takeProfit = entryPrice + reward;
        }
        else {
            takeProfit = entryPrice - reward;
        }
        if (technical?.bollingerBands) {
            const bb = technical.bollingerBands;
            const latestUpper = bb.upper[bb.upper.length - 1];
            const latestLower = bb.lower[bb.lower.length - 1];
            if (action === analytics_types_1.SignalAction.BUY && latestUpper && latestUpper < takeProfit) {
                takeProfit = latestUpper;
            }
            else if (action === analytics_types_1.SignalAction.SELL && latestLower && latestLower > takeProfit) {
                takeProfit = latestLower;
            }
        }
        return takeProfit;
    }
    _calculateRiskReward(entry, stopLoss, takeProfit, action) {
        if (!takeProfit || action === analytics_types_1.SignalAction.WAIT)
            return null;
        const risk = Math.abs(entry - stopLoss);
        const reward = Math.abs(takeProfit - entry);
        if (risk === 0)
            return null;
        return Math.round((reward / risk) * 100) / 100;
    }
    _getSupportingIndicators(technical, action) {
        if (!technical)
            return [];
        const supporting = [];
        const sma20Val = technical.sma.find((s) => s.period === 20)?.values.slice(-1)[0];
        const sma50Val = technical.sma.find((s) => s.period === 50)?.values.slice(-1)[0];
        if (sma20Val && sma50Val) {
            if (action === analytics_types_1.SignalAction.BUY && sma20Val > sma50Val) {
                supporting.push('SMA20 > SMA50 (Golden Cross)');
            }
            else if (action === analytics_types_1.SignalAction.SELL && sma20Val < sma50Val) {
                supporting.push('SMA20 < SMA50 (Death Cross)');
            }
        }
        if (technical.rsi) {
            const rsiLatest = technical.rsi.values.slice(-1)[0];
            if (action === analytics_types_1.SignalAction.BUY && technical.rsi.interpretation === 'OVERSOLD') {
                supporting.push(`RSI(${technical.rsi.period}) = ${rsiLatest.toFixed(1)} Oversold`);
            }
            else if (action === analytics_types_1.SignalAction.SELL && technical.rsi.interpretation === 'OVERBOUGHT') {
                supporting.push(`RSI(${technical.rsi.period}) = ${rsiLatest.toFixed(1)} Overbought`);
            }
        }
        if (technical.macd) {
            if (action === analytics_types_1.SignalAction.BUY && technical.macd.crossover === 'BULLISH_CROSSOVER') {
                supporting.push('MACD Bullish Crossover');
            }
            else if (action === analytics_types_1.SignalAction.SELL && technical.macd.crossover === 'BEARISH_CROSSOVER') {
                supporting.push('MACD Bearish Crossover');
            }
        }
        if (technical.bollingerBands) {
            if (action === analytics_types_1.SignalAction.BUY && technical.bollingerBands.position === 'BELOW_LOWER') {
                supporting.push('Price below Bollinger Lower Band');
            }
            else if (action === analytics_types_1.SignalAction.SELL && technical.bollingerBands.position === 'ABOVE_UPPER') {
                supporting.push('Price above Bollinger Upper Band');
            }
        }
        return supporting;
    }
    _buildSignalReason(action, analysisCard) {
        const parts = [];
        if (action === analytics_types_1.SignalAction.BUY) {
            parts.push('إشارة شراء');
        }
        else if (action === analytics_types_1.SignalAction.SELL) {
            parts.push('إشارة بيع');
        }
        else {
            parts.push('إشارة انتظار');
        }
        if (analysisCard.technical) {
            const score = analysisCard.technical.technicalScore;
            parts.push(`النتيجة الفنية: ${score > 0 ? '+' : ''}${score}`);
            if (analysisCard.technical.rsi) {
                parts.push(`RSI: ${analysisCard.technical.rsi.interpretation}`);
            }
            if (analysisCard.technical.macd?.crossover !== 'NONE') {
                parts.push(`MACD: ${analysisCard.technical.macd.crossover}`);
            }
        }
        if (analysisCard.aiAnalysis && analysisCard.aiAnalysis.length > 0) {
            const aiSummary = analysisCard.aiAnalysis.slice(0, 300);
            parts.push(`التحليل: ${aiSummary}`);
        }
        return parts.join(' | ');
    }
    _calculateSignalConfidence(analysisCard, action) {
        let confidence = analysisCard.confidence || 50;
        if (action === analytics_types_1.SignalAction.WAIT) {
            confidence = Math.min(confidence, 40);
        }
        if (analysisCard.technical) {
            const supportingIndicators = this._getSupportingIndicators(analysisCard.technical, action);
            confidence += supportingIndicators.length * 5;
        }
        return Math.min(100, Math.max(0, confidence));
    }
    _createWaitSignal(symbol, reason) {
        return {
            symbol,
            action: analytics_types_1.SignalAction.WAIT,
            confidence: 0,
            stopLoss: 0,
            takeProfit: null,
            entryPrice: null,
            reason,
            supportingIndicators: [],
            riskRewardRatio: null,
            expiresAt: new Date(Date.now() + this.SIGNAL_EXPIRY_MS),
            id: `wait-${symbol}-${Date.now()}`,
        };
    }
};
exports.SignalGeneratorService = SignalGeneratorService;
exports.SignalGeneratorService = SignalGeneratorService = SignalGeneratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        analytical_ai_service_1.AnalyticalAIService,
        aggregator_service_1.MarketDataAggregatorService,
        indicators_service_1.TechnicalIndicatorService,
        audit_service_1.AuditService])
], SignalGeneratorService);
//# sourceMappingURL=signal-generator.service.js.map