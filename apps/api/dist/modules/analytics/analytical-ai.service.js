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
var AnalyticalAIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticalAIService = void 0;
const common_1 = require("@nestjs/common");
const ai_orchestrator_service_1 = require("../ai/services/ai-orchestrator.service");
const rag_service_1 = require("../ai/services/rag.service");
const aggregator_service_1 = require("./aggregator.service");
const indicators_service_1 = require("./indicators.service");
const redis_service_1 = require("../../common/redis/redis.service");
let AnalyticalAIService = AnalyticalAIService_1 = class AnalyticalAIService {
    constructor(aggregator, indicators, orchestrator, ragService, redis) {
        this.aggregator = aggregator;
        this.indicators = indicators;
        this.orchestrator = orchestrator;
        this.ragService = ragService;
        this.redis = redis;
        this.logger = new common_1.Logger(AnalyticalAIService_1.name);
        this.SCANNER_ANALYSIS_TTL_MS = 3 * 60 * 1000;
        this.logger.log('🧠 Analytical AI Service initialized — analysis pipeline ready' + (this.redis ? ' (with Redis cache)' : ''));
    }
    async analyzeAsset(symbol) {
        this.logger.log(`🧠 Starting full analysis for ${symbol}`);
        const startTime = Date.now();
        const cacheKey = `scanner:analysis:${symbol}`;
        try {
            const cached = await this.redis?.get(cacheKey);
            if (cached) {
                this.logger.debug(`🧠 Redis cache hit for scanner analysis: ${symbol}`);
                return JSON.parse(cached);
            }
        }
        catch { }
        let quote = null;
        try {
            quote = await this.aggregator.getAggregatedQuote(symbol);
            this.logger.debug(`📊 Quote fetched for ${symbol}: price=${quote.price}, sources=${quote.sources.join(',')}`);
        }
        catch (error) {
            this.logger.warn(`Failed to fetch quote for ${symbol}: ${error.message}`);
        }
        let technical = null;
        try {
            const candles = await this.aggregator.getAggregatedCandles(symbol);
            if (candles.length >= 30) {
                technical = await this.indicators.analyze(candles, symbol);
                this.logger.debug(`📈 Technical analysis complete for ${symbol}: score=${technical.technicalScore}`);
            }
            else {
                this.logger.warn(`Not enough candles for ${symbol} (${candles.length} < 30)`);
            }
        }
        catch (error) {
            this.logger.warn(`Technical analysis failed for ${symbol}: ${error.message}`);
        }
        let ragContext = '';
        try {
            ragContext = await this.ragService.retrieveRelevantContext(`${symbol} تحليل سوق تداول`, 5);
        }
        catch (error) {
            this.logger.warn(`RAG retrieval failed for ${symbol}: ${error.message}`);
        }
        const aiResult = await this._generateAiAnalysis(symbol, quote, technical, ragContext);
        const sentiment = this._determineSentiment(quote, technical, aiResult.content);
        const confidence = this._calculateConfidence(quote, technical, aiResult);
        const riskLevel = this._assessRiskLevel(quote, technical, aiResult.content);
        const keyFactors = this._extractKeyFactors(aiResult.content);
        const elapsed = Date.now() - startTime;
        this.logger.log(`🧠 Analysis complete for ${symbol}: sentiment=${sentiment}, confidence=${confidence}, risk=${riskLevel} (${elapsed}ms)`);
        const result = {
            symbol,
            timestamp: new Date(),
            quote,
            technical,
            aiAnalysis: aiResult.content,
            aiModel: aiResult.model,
            sentiment,
            confidence,
            keyFactors,
            riskLevel,
        };
        try {
            await this.redis?.set(cacheKey, JSON.stringify(result), this.SCANNER_ANALYSIS_TTL_MS);
        }
        catch { }
        return result;
    }
    async _generateAiAnalysis(symbol, quote, technical, ragContext) {
        const prompt = this._buildAnalysisPrompt(symbol, quote, technical, ragContext);
        try {
            const result = await this.orchestrator.analyze({
                prompt,
                type: 'market_analysis',
                symbol,
                language: 'ar',
            });
            return {
                content: result.content,
                model: result.model,
                confidence: result.confidence,
            };
        }
        catch (error) {
            this.logger.error(`AI analysis failed for ${symbol}: ${error.message}`);
            return {
                content: 'غير قادر على إنشاء تحليل في الوقت الحالي. يرجى المحاولة لاحقاً.',
                model: 'fallback',
                confidence: 0,
            };
        }
    }
    _buildAnalysisPrompt(symbol, quote, technical, ragContext) {
        const sections = [];
        sections.push(`أنت محلل مالي خبير في منصة "رؤى لربط الحسابات". قم بتحليل الأصل ${symbol} بشكل شامل ومفصل.`);
        if (quote && quote.price > 0) {
            sections.push(`
📊 البيانات السوقية الحالية:
- السعر: ${quote.price} ${quote.currency}
- التغير: ${quote.changePercent}%
- أعلى سعر: ${quote.high}
- أدنى سعر: ${quote.low}
- الحجم: ${quote.volume}
- مصادر البيانات: ${quote.sources.join(', ')}
${quote.fiftyTwoWeekHigh ? `- أعلى سعر في 52 أسبوع: ${quote.fiftyTwoWeekHigh}` : ''}
${quote.fiftyTwoWeekLow ? `- أدنى سعر في 52 أسبوع: ${quote.fiftyTwoWeekLow}` : ''}`);
        }
        if (technical) {
            const rsiLatest = technical.rsi?.values?.slice(-1)[0]?.toFixed(1) || 'غير متاح';
            const macdSignal = technical.macd?.crossover || 'لا يوجد';
            const bbPosition = technical.bollingerBands?.position || 'ضمن النطاق';
            const atrLevel = technical.atr?.volatilityLevel || 'عادي';
            sections.push(`
📈 التحليل الفني:
- النتيجة الفنية: ${technical.technicalScore > 0 ? '+' : ''}${technical.technicalScore}
- عدد الشموع: ${technical.candleCount}
- RSI (14): ${rsiLatest} — ${technical.rsi?.interpretation || 'محايد'}
- MACD: ${macdSignal}
- بولنجر: ${bbPosition}
- ATR مستوى التقلب: ${atrLevel}
- ملخص: ${technical.summary}`);
        }
        if (ragContext) {
            sections.push(`
📰 سياق الأخبار والمستندات:
${ragContext}`);
        }
        sections.push(`
أجب بالصيغة التالية:
1. نظرة عامة على ${symbol} والوضع الحالي
2. التحليل الفني — ماذا تقول المؤشرات
3. تحليل المشاعر والأخبار
4. مستوى المخاطرة
5. العوامل الرئيسية المؤثرة (اذكر 3-5 عوامل)
6. التوصية النهائية`);
        return sections.join('\n\n');
    }
    _determineSentiment(quote, technical, aiContent) {
        const signals = [];
        if (quote && quote.changePercent !== 0) {
            if (quote.changePercent > 1)
                signals.push(1);
            else if (quote.changePercent > 0)
                signals.push(0.5);
            else if (quote.changePercent < -1)
                signals.push(-1);
            else if (quote.changePercent < 0)
                signals.push(-0.5);
        }
        if (technical) {
            const normalizedScore = technical.technicalScore / 100;
            signals.push(normalizedScore);
        }
        const positiveWords = ['صعود', 'ارتفاع', 'إيجابي', 'شراء', 'فرصة', 'نمو', 'اختراق'];
        const negativeWords = ['هبوط', 'انخفاض', 'سلبي', 'بيع', 'مخاطرة', 'تراجع', 'خسارة'];
        let aiScore = 0;
        for (const word of positiveWords) {
            if (aiContent.includes(word))
                aiScore += 0.2;
        }
        for (const word of negativeWords) {
            if (aiContent.includes(word))
                aiScore -= 0.2;
        }
        signals.push(Math.max(-1, Math.min(1, aiScore)));
        if (signals.length === 0)
            return 'NEUTRAL';
        const avg = signals.reduce((a, b) => a + b, 0) / signals.length;
        const hasPositive = signals.some((s) => s > 0.3);
        const hasNegative = signals.some((s) => s < -0.3);
        if (hasPositive && hasNegative)
            return 'MIXED';
        if (avg > 0.3)
            return 'POSITIVE';
        if (avg < -0.3)
            return 'NEGATIVE';
        return 'NEUTRAL';
    }
    _calculateConfidence(quote, technical, aiResult) {
        let confidence = 0;
        let maxConfidence = 0;
        maxConfidence += 30;
        if (quote && quote.price > 0) {
            confidence += 15;
            if (quote.sources.length > 1)
                confidence += 10;
            if (quote.volume > 0)
                confidence += 5;
        }
        maxConfidence += 30;
        if (technical) {
            confidence += 10;
            if (technical.candleCount >= 50)
                confidence += 10;
            if (technical.rsi)
                confidence += 5;
            if (technical.macd)
                confidence += 5;
        }
        maxConfidence += 40;
        if (aiResult.confidence > 0) {
            confidence += Math.min(30, aiResult.confidence * 0.3);
            if (aiResult.model !== 'fallback')
                confidence += 10;
        }
        return Math.round(Math.min(100, (confidence / maxConfidence) * 100));
    }
    _assessRiskLevel(quote, technical, aiContent) {
        let riskScore = 0;
        if (quote) {
            const absChange = Math.abs(quote.changePercent);
            if (absChange > 5)
                riskScore += 3;
            else if (absChange > 3)
                riskScore += 2;
            else if (absChange > 1)
                riskScore += 1;
        }
        if (technical?.atr) {
            if (technical.atr.volatilityLevel === 'HIGH')
                riskScore += 3;
            else if (technical.atr.volatilityLevel === 'LOW')
                riskScore -= 1;
        }
        if (technical?.bollingerBands) {
            if (technical.bollingerBands.position === 'ABOVE_UPPER')
                riskScore += 2;
            if (technical.bollingerBands.position === 'BELOW_LOWER')
                riskScore += 2;
        }
        if (technical?.rsi) {
            const latestRsi = technical.rsi.values.slice(-1)[0];
            if (latestRsi > 80 || latestRsi < 20)
                riskScore += 2;
        }
        const riskKeywords = ['مخاطرة عالية', 'متقلب جداً', 'حذر', 'غير مستقر'];
        for (const kw of riskKeywords) {
            if (aiContent.includes(kw))
                riskScore += 1;
        }
        if (riskScore >= 7)
            return 'EXTREME';
        if (riskScore >= 5)
            return 'HIGH';
        if (riskScore >= 2)
            return 'MEDIUM';
        return 'LOW';
    }
    _extractKeyFactors(aiContent) {
        const factors = [];
        const patterns = [
            /(?:^|\n)\s*\d+[\.\)]\s*(.+)/g,
            /(?:^|\n)\s*[-•]\s*(.+)/g,
        ];
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(aiContent)) !== null) {
                const factor = match[1].trim();
                if (factor.length > 10 && factor.length < 200) {
                    factors.push(factor);
                }
            }
        }
        if (factors.length === 0) {
            const keyTerms = ['مؤشر', 'سعر', 'حجم', 'اتجاه', 'مخاطرة', 'فرصة', 'دعم', 'مقاومة', 'تشبع', 'تقلب'];
            const sentences = aiContent.split(/[.。！!؟?]/).filter((s) => s.trim().length > 15);
            for (const term of keyTerms) {
                const matching = sentences.find((s) => s.includes(term) && !factors.includes(s.trim()));
                if (matching && factors.length < 5) {
                    factors.push(matching.trim());
                }
            }
        }
        return factors.slice(0, 5);
    }
};
exports.AnalyticalAIService = AnalyticalAIService;
exports.AnalyticalAIService = AnalyticalAIService = AnalyticalAIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [aggregator_service_1.MarketDataAggregatorService,
        indicators_service_1.TechnicalIndicatorService,
        ai_orchestrator_service_1.AIOrchestratorService,
        rag_service_1.RagService,
        redis_service_1.RedisService])
], AnalyticalAIService);
//# sourceMappingURL=analytical-ai.service.js.map