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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var MarketAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const exchange_service_1 = require("../../../modules/exchange/exchange.service");
const redis_service_1 = require("../../../common/redis/redis.service");
const agent_types_1 = require("../types/agent.types");
let MarketAnalyzerService = MarketAnalyzerService_1 = class MarketAnalyzerService {
    constructor(exchangeService, redis) {
        this.exchangeService = exchangeService;
        this.redis = redis;
        this.logger = new common_1.Logger(MarketAnalyzerService_1.name);
        this.CACHE_TTL = 30000;
        this.logger.log(`🔍 Market Analyzer initialized (redis=${!!this.redis})`);
    }
    async analyze(symbol) {
        try {
            const cacheKey = `agent:market:${symbol}`;
            if (this.redis) {
                try {
                    const cached = await this.redis.get(cacheKey);
                    if (cached) {
                        return JSON.parse(cached);
                    }
                }
                catch (redisErr) {
                    this.logger.warn(`Redis cache read failed for ${symbol}: ${redisErr.message} — proceeding without cache`);
                }
            }
            const quote = await this.exchangeService.getQuote(symbol);
            if (!quote || !quote.price) {
                this.logger.warn(`No quote data for ${symbol}`);
                return null;
            }
            const endDate = new Date();
            const startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
            const candles = await this.exchangeService.getHistoricalData(symbol, '1h', startDate, endDate);
            if (!candles || candles.length < 50) {
                this.logger.warn(`Insufficient historical data for ${symbol} (${candles?.length ?? 0} candles)`);
                return this._buildMinimalAnalysis(symbol, quote);
            }
            const closes = candles.map((c) => c.close || 0);
            const highs = candles.map((c) => c.high || 0);
            const lows = candles.map((c) => c.low || 0);
            const volumes = candles.map((c) => c.volume || 0);
            const rsi = this._calculateRSI(closes);
            const macd = this._calculateMACD(closes);
            const bollingerBands = this._calculateBollingerBands(closes);
            const ema = this._calculateEMA(closes);
            const atr = this._calculateATR(highs, lows, closes);
            const volatility = this._assessVolatility(atr, quote.price, bollingerBands);
            const trend = this._detectTrend(ema, closes);
            const trendStrength = this._calculateTrendStrength(ema, closes);
            const aiConfidence = this._estimateAIConfidence(rsi, macd, trend, volatility);
            const aiSignal = this._estimateAISignal(rsi, macd, trend);
            const aiReasoning = this._generateAIReasoning(rsi, macd, trend, volatility);
            const analysis = {
                symbol,
                timestamp: new Date(),
                price: quote.price,
                change24h: quote.change || 0,
                changePercent24h: quote.changePercent || 0,
                volume24h: quote.volume || volumes[volumes.length - 1] || 0,
                high24h: highs[highs.length - 1] || quote.price,
                low24h: lows[lows.length - 1] || quote.price,
                rsi,
                macd,
                bollingerBands,
                ema,
                atr,
                volatility,
                trend,
                trendStrength,
                aiConfidence,
                aiSignal,
                aiReasoning,
            };
            if (this.redis) {
                try {
                    await this.redis.set(cacheKey, JSON.stringify(analysis), this.CACHE_TTL);
                }
                catch (redisErr) {
                    this.logger.warn(`Redis cache write failed for ${symbol}: ${redisErr.message} — analysis will not be cached`);
                }
            }
            return analysis;
        }
        catch (error) {
            this.logger.error(`Market analysis failed for ${symbol}: ${error.message}`);
            return null;
        }
    }
    async analyzeMultiple(symbols) {
        const results = new Map();
        const promises = symbols.map(async (symbol) => {
            const analysis = await this.analyze(symbol);
            if (analysis) {
                results.set(symbol, analysis);
            }
        });
        await Promise.allSettled(promises);
        return results;
    }
    _calculateRSI(closes, period = 14) {
        if (closes.length < period + 1)
            return 50;
        let gains = 0;
        let losses = 0;
        for (let i = 1; i <= period; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0)
                gains += change;
            else
                losses += Math.abs(change);
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        for (let i = period + 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            }
            else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
            }
        }
        if (avgLoss === 0)
            return 100;
        const rs = avgGain / avgLoss;
        return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
    }
    _calculateMACD(closes) {
        const ema12 = this._calculateEMAValues(closes, 12);
        const ema26 = this._calculateEMAValues(closes, 26);
        if (ema12.length < 2 || ema26.length < 2) {
            return { macd: 0, signal: 0, histogram: 0, crossover: 'NONE' };
        }
        const macdLine = [];
        const minLength = Math.min(ema12.length, ema26.length);
        for (let i = 0; i < minLength; i++) {
            macdLine.push(ema12[ema12.length - minLength + i] - ema26[ema26.length - minLength + i]);
        }
        const signalLine = this._calculateEMAValues(macdLine, 9);
        const macdValue = macdLine[macdLine.length - 1] || 0;
        const signalValue = signalLine[signalLine.length - 1] || 0;
        const histogram = macdValue - signalValue;
        let crossover = 'NONE';
        if (macdLine.length >= 2 && signalLine.length >= 2) {
            const prevHist = (macdLine[macdLine.length - 2] || 0) - (signalLine[signalLine.length - 2] || 0);
            if (prevHist <= 0 && histogram > 0)
                crossover = 'BULLISH';
            else if (prevHist >= 0 && histogram < 0)
                crossover = 'BEARISH';
        }
        return {
            macd: parseFloat(macdValue.toFixed(6)),
            signal: parseFloat(signalValue.toFixed(6)),
            histogram: parseFloat(histogram.toFixed(6)),
            crossover,
        };
    }
    _calculateBollingerBands(closes, period = 20, stdDev = 2) {
        if (closes.length < period) {
            const price = closes[closes.length - 1] || 0;
            return { upper: price * 1.02, middle: price, lower: price * 0.98, bandwidth: 0.04, percentB: 0.5 };
        }
        const recent = closes.slice(-period);
        const middle = recent.reduce((sum, p) => sum + p, 0) / period;
        const variance = recent.reduce((sum, p) => sum + Math.pow(p - middle, 2), 0) / period;
        const sd = Math.sqrt(variance);
        const upper = middle + stdDev * sd;
        const lower = middle - stdDev * sd;
        const bandwidth = middle > 0 ? (upper - lower) / middle : 0;
        const currentPrice = closes[closes.length - 1];
        const percentB = (upper - lower) > 0
            ? (currentPrice - lower) / (upper - lower)
            : 0.5;
        return {
            upper: parseFloat(upper.toFixed(8)),
            middle: parseFloat(middle.toFixed(8)),
            lower: parseFloat(lower.toFixed(8)),
            bandwidth: parseFloat(bandwidth.toFixed(6)),
            percentB: parseFloat(Math.max(0, Math.min(1, percentB)).toFixed(4)),
        };
    }
    _calculateEMA(closes) {
        const ema9 = this._calculateEMAValues(closes, 9);
        const ema21 = this._calculateEMAValues(closes, 21);
        const ema50 = this._calculateEMAValues(closes, 50);
        const ema200 = closes.length >= 200 ? this._calculateEMAValues(closes, 200) : undefined;
        return {
            ema9: ema9[ema9.length - 1] || 0,
            ema21: ema21[ema21.length - 1] || 0,
            ema50: ema50[ema50.length - 1] || 0,
            ema200: ema200 ? ema200[ema200.length - 1] : undefined,
        };
    }
    _calculateATR(highs, lows, closes, period = 14) {
        if (highs.length < period + 1)
            return 0;
        const trueRanges = [];
        for (let i = 1; i < highs.length; i++) {
            const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
            trueRanges.push(tr);
        }
        if (trueRanges.length < period)
            return 0;
        const recent = trueRanges.slice(-period);
        return parseFloat((recent.reduce((sum, tr) => sum + tr, 0) / period).toFixed(8));
    }
    _calculateEMAValues(data, period) {
        if (data.length < period)
            return [];
        const multiplier = 2 / (period + 1);
        const ema = [];
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        ema.push(sum / period);
        for (let i = period; i < data.length; i++) {
            ema.push((data[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
        }
        return ema;
    }
    _assessVolatility(atr, price, bb) {
        if (atr <= 0 || price <= 0)
            return 'MEDIUM';
        const atrPercent = (atr / price) * 100;
        if (atrPercent > 5 || bb.bandwidth > 0.08)
            return 'EXTREME';
        if (atrPercent > 3 || bb.bandwidth > 0.06)
            return 'HIGH';
        if (atrPercent > 1.5 || bb.bandwidth > 0.03)
            return 'MEDIUM';
        return 'LOW';
    }
    _detectTrend(ema, closes) {
        const { ema9, ema21, ema50 } = ema;
        const currentPrice = closes[closes.length - 1] || 0;
        if (ema9 > ema21 && ema21 > ema50 && currentPrice > ema9) {
            return 'BULLISH';
        }
        if (ema9 < ema21 && ema21 < ema50 && currentPrice < ema9) {
            return 'BEARISH';
        }
        if (ema9 > ema21 && currentPrice > ema21)
            return 'BULLISH';
        if (ema9 < ema21 && currentPrice < ema21)
            return 'BEARISH';
        return 'SIDEWAYS';
    }
    _calculateTrendStrength(ema, closes) {
        const { ema9, ema21, ema50 } = ema;
        let strength = 0;
        if (ema9 > ema21 && ema21 > ema50)
            strength += 40;
        else if (ema9 < ema21 && ema21 < ema50)
            strength += 40;
        else if (ema9 > ema21)
            strength += 20;
        else if (ema9 < ema21)
            strength += 20;
        const price = closes[closes.length - 1] || 0;
        if (price > ema9 && price > ema21)
            strength += 20;
        else if (price < ema9 && price < ema21)
            strength += 20;
        if (closes.length >= 10) {
            const recentChange = (closes[closes.length - 1] - closes[closes.length - 10]) / closes[closes.length - 10] * 100;
            strength += Math.min(40, Math.abs(recentChange) * 8);
        }
        return Math.min(100, Math.round(strength));
    }
    _estimateAIConfidence(rsi, macd, trend, volatility) {
        let confidence = 40;
        if (rsi > 30 && rsi < 70)
            confidence += 15;
        else if (rsi > 20 && rsi < 80)
            confidence += 5;
        else
            confidence -= 10;
        if (macd.crossover !== 'NONE')
            confidence += 15;
        if (Math.abs(macd.histogram) > 0)
            confidence += 5;
        if (trend !== 'SIDEWAYS')
            confidence += 10;
        if (volatility === 'EXTREME')
            confidence -= 20;
        if (volatility === 'HIGH')
            confidence -= 10;
        return Math.max(0, Math.min(100, confidence));
    }
    _estimateAISignal(rsi, macd, trend) {
        let score = 0;
        if (rsi < 30)
            score += 2;
        else if (rsi < 40)
            score += 1;
        else if (rsi > 70)
            score -= 2;
        else if (rsi > 60)
            score -= 1;
        if (macd.crossover === 'BULLISH')
            score += 2;
        if (macd.crossover === 'BEARISH')
            score -= 2;
        if (macd.histogram > 0)
            score += 1;
        if (macd.histogram < 0)
            score -= 1;
        if (trend === 'BULLISH')
            score += 1;
        if (trend === 'BEARISH')
            score -= 1;
        if (score >= 3)
            return agent_types_1.StrategySignal.STRONG_BUY;
        if (score >= 1)
            return agent_types_1.StrategySignal.BUY;
        if (score <= -3)
            return agent_types_1.StrategySignal.STRONG_SELL;
        if (score <= -1)
            return agent_types_1.StrategySignal.SELL;
        return agent_types_1.StrategySignal.NEUTRAL;
    }
    _generateAIReasoning(rsi, macd, trend, volatility) {
        const parts = [];
        if (trend === 'BULLISH')
            parts.push('اتجاه صعودي');
        else if (trend === 'BEARISH')
            parts.push('اتجاه هبوطي');
        else
            parts.push('سوق جانبي');
        if (rsi < 30)
            parts.push('تشبع بيعي');
        else if (rsi > 70)
            parts.push('تشبع شرائي');
        if (macd.crossover === 'BULLISH')
            parts.push('إشارة MACD صعودية');
        else if (macd.crossover === 'BEARISH')
            parts.push('إشارة MACD هبوطية');
        if (volatility === 'EXTREME')
            parts.push('تحذير: تقلب شديد');
        else if (volatility === 'HIGH')
            parts.push('تقلب مرتفع');
        return parts.join(' — ');
    }
    _buildMinimalAnalysis(symbol, quote) {
        const isCrypto = symbol.includes('USDT') || symbol.includes('BTC') || symbol.includes('ETH');
        const estimatedAtr = isCrypto
            ? quote.price * 0.02
            : quote.price * 0.01;
        const changePercent = Math.abs(quote.changePercent || 0);
        const changeDir = (quote.changePercent || 0) > 0 ? 1 : (quote.changePercent || 0) < 0 ? -1 : 0;
        let estimatedRsi = 50;
        if (changeDir > 0) {
            estimatedRsi = Math.min(70, 50 + Math.abs(quote.changePercent || 0) * 5);
        }
        else if (changeDir < 0) {
            estimatedRsi = Math.max(30, 50 - Math.abs(quote.changePercent || 0) * 5);
        }
        let estimatedPercentB = 0.5;
        if (changeDir > 0) {
            estimatedPercentB = Math.min(0.85, 0.5 + Math.abs(quote.changePercent || 0) * 0.08);
        }
        else if (changeDir < 0) {
            estimatedPercentB = Math.max(0.15, 0.5 - Math.abs(quote.changePercent || 0) * 0.08);
        }
        const histogramDirection = changeDir;
        return {
            symbol,
            timestamp: new Date(),
            price: quote.price,
            change24h: quote.change || 0,
            changePercent24h: quote.changePercent || 0,
            volume24h: quote.volume || 0,
            high24h: quote.high || quote.price * 1.01,
            low24h: quote.low || quote.price * 0.99,
            rsi: estimatedRsi,
            macd: {
                macd: histogramDirection * quote.price * 0.001,
                signal: 0,
                histogram: histogramDirection * quote.price * 0.0005,
                crossover: histogramDirection > 0 ? 'BULLISH' : histogramDirection < 0 ? 'BEARISH' : 'NONE',
            },
            bollingerBands: {
                upper: quote.price * 1.02,
                middle: quote.price,
                lower: quote.price * 0.98,
                bandwidth: 0.04,
                percentB: estimatedPercentB,
            },
            ema: {
                ema9: quote.price * (1 + (quote.changePercent || 0) * 0.002),
                ema21: quote.price,
                ema50: quote.price,
            },
            atr: estimatedAtr,
            volatility: changePercent > 3 ? 'HIGH' : changePercent > 1 ? 'MEDIUM' : 'LOW',
            trend: (quote.changePercent || 0) > 1 ? 'BULLISH' : (quote.changePercent || 0) < -1 ? 'BEARISH' : 'SIDEWAYS',
            trendStrength: Math.min(60, Math.abs(quote.changePercent || 0) * 15),
            aiConfidence: 50,
            aiSignal: (quote.changePercent || 0) > 1.5 ? agent_types_1.StrategySignal.BUY
                : (quote.changePercent || 0) < -1.5 ? agent_types_1.StrategySignal.SELL
                    : agent_types_1.StrategySignal.NEUTRAL,
            aiReasoning: 'تحليل مبسط — بيانات غير كافية للتحليل الكامل',
        };
    }
};
exports.MarketAnalyzerService = MarketAnalyzerService;
exports.MarketAnalyzerService = MarketAnalyzerService = MarketAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [exchange_service_1.ExchangeService,
        redis_service_1.RedisService])
], MarketAnalyzerService);
//# sourceMappingURL=market-analyzer.service.js.map