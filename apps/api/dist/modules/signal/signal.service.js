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
var SignalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SignalService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const exchange_service_1 = require("../exchange/exchange.service");
const ai_orchestrator_service_1 = require("../ai/services/ai-orchestrator.service");
const rag_service_1 = require("../ai/services/rag.service");
const audit_service_1 = require("../../audit/audit.service");
const prediction_market_service_1 = require("../prediction-market/prediction-market.service");
const trading_service_1 = require("../trading/trading.service");
const notification_service_1 = require("../notification/notification.service");
const trading_types_1 = require("../trading/trading.types");
let SignalService = SignalService_1 = class SignalService {
    constructor(prisma, exchangeService, orchestrator, ragService, auditService, predictionMarketService, tradingService, notificationService) {
        this.prisma = prisma;
        this.exchangeService = exchangeService;
        this.orchestrator = orchestrator;
        this.ragService = ragService;
        this.auditService = auditService;
        this.predictionMarketService = predictionMarketService;
        this.tradingService = tradingService;
        this.notificationService = notificationService;
        this.logger = new common_1.Logger(SignalService_1.name);
        this.logger.log('📡 Signal Service initialized — Roua signal generation ready' + (this.predictionMarketService ? ' (with prediction market boost)' : '') + (this.tradingService ? ' (with trading bridge)' : '') + (this.notificationService ? ' (with real-time notifications)' : ''));
    }
    async generateSignal(userId, pair) {
        this.logger.log(`📡 Generating signal for ${pair} (user: ${userId})`);
        let marketData = null;
        try {
            const quote = await this.exchangeService.getQuote(pair);
            marketData = {
                price: quote.price,
                change: quote.change,
                changePercent: quote.changePercent,
                open: quote.open,
                high: quote.high,
                low: quote.low,
                close: quote.close,
                volume: quote.volume,
                source: quote.source,
            };
        }
        catch (error) {
            this.logger.warn(`Failed to fetch market data for ${pair}: ${error.message}`);
        }
        let newsContext = '';
        try {
            newsContext = await this.ragService.retrieveRelevantContext(`${pair} trading analysis`, 3);
        }
        catch (error) {
            this.logger.warn(`RAG retrieval failed for ${pair}: ${error.message}`);
        }
        let sentiment = '';
        try {
            const sentimentResult = await this.orchestrator.analyze({
                prompt: `حلل مشاعر السوق تجاه ${pair} بناءً على البيانات التالية:
السعر الحالي: ${marketData?.price || 'غير متاح'}
التغير: ${marketData?.changePercent || 'غير متاح'}%
الحجم: ${marketData?.volume || 'غير متاح'}
${newsContext ? `آخر الأخبار:\n${newsContext}` : ''}

أجب بشكل مختصر: هل المشاعر إيجابية أم سلبية؟ ولماذا؟`,
                type: 'sentiment',
                symbol: pair,
                language: 'ar',
            });
            if (sentimentResult.confidence > 0) {
                sentiment = sentimentResult.content;
            }
        }
        catch (error) {
            this.logger.warn(`Sentiment analysis failed for ${pair}: ${error.message}`);
        }
        const signalPrompt = `أنت محلل مالي خبير في منصة "رؤى لربط الحسابات". بناءً على البيانات التالية، قدم توصية تداول لـ ${pair}.

📊 بيانات السوق الحالية:
- السعر: ${marketData?.price || 'غير متاح'} ${marketData?.currency || 'USD'}
- التغير: ${marketData?.changePercent || 0}%
- أعلى سعر: ${marketData?.high || 'غير متاح'}
- أدنى سعر: ${marketData?.low || 'غير متاح'}
- الحجم: ${marketData?.volume || 'غير متاح'}

📈 تحليل المشاعر: ${sentiment || 'غير متاح'}

${newsContext ? `📰 أخبار ذات صلة:\n${newsContext}` : ''}

أجب بالصيغة التالية بالضبط (استخدم الأرقام فقط بدون رموز):
الإجراء: [شراء/بيع/انتظار]
نسبة الثقة: [0-100]
سعر الدخول: [رقم]
وقف الخسارة: [رقم]
جني الأرباح: [رقم]
السبب: [شرح مفصل بالعربية عن سبب التوصية]`;
        let aiResponse = null;
        try {
            aiResponse = await this.orchestrator.analyze({
                prompt: signalPrompt,
                type: 'signal_generation',
                symbol: pair,
                language: 'ar',
            });
        }
        catch (error) {
            this.logger.error(`AI signal generation failed: ${error.message}`);
        }
        const parsed = this._parseSignalResponse(aiResponse?.content || '', marketData);
        let signalBoost = 0;
        let predictionContext = '';
        if (this.predictionMarketService) {
            try {
                const baseSymbol = pair.split('/')[0].toUpperCase();
                const gaps = await this.predictionMarketService.getGapsForSymbol(baseSymbol);
                if (gaps.length > 0) {
                    const totalBoost = gaps.reduce((sum, g) => sum + g.signalBoost, 0);
                    signalBoost = totalBoost / gaps.length;
                    signalBoost = Math.max(-0.10, Math.min(0.10, signalBoost));
                    parsed.confidence = Math.round(Math.max(0, Math.min(100, parsed.confidence + signalBoost * 100)));
                    const alignedCount = gaps.filter(g => g.gapDirection === 'aligned').length;
                    const divergentCount = gaps.filter(g => g.gapDirection !== 'aligned').length;
                    if (signalBoost > 0) {
                        predictionContext = ` \n🔮 توافق السوق التنبؤي: ${alignedCount} أحداث متوافقة تعزز هذه الإشارة (+${Math.round(signalBoost * 100)}% ثقة)`;
                    }
                    else if (signalBoost < 0) {
                        predictionContext = ` \n⚠️ تباين السوق التنبؤي: ${divergentCount} أحداث متباينة تضعف هذه الإشارة (${Math.round(signalBoost * 100)}% ثقة)`;
                    }
                    else {
                        predictionContext = ` \n🔮 السوق التنبؤي: إشارات محايدة (${gaps.length} أحداث)`;
                    }
                    this.logger.log(`🔮 signalBoost applied for ${pair}: ${Math.round(signalBoost * 100)}% (${gaps.length} events, ${alignedCount} aligned, ${divergentCount} divergent)`);
                }
            }
            catch (error) {
                this.logger.warn(`Prediction market signalBoost failed for ${pair}: ${error.message} — falling back to unboosted signal`);
            }
        }
        if (predictionContext) {
            parsed.reason += predictionContext;
        }
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const signal = await this.prisma.signal.create({
            data: {
                userId,
                pair,
                action: parsed.action,
                confidence: parsed.confidence,
                reason: parsed.reason,
                entryPrice: parsed.entryPrice,
                stopLoss: parsed.stopLoss,
                takeProfit: parsed.takeProfit,
                status: 'ACTIVE',
                expiresAt,
            },
        });
        await this.auditService.log({
            userId,
            action: 'SIGNAL_GENERATED',
            resource: 'signal',
            details: JSON.stringify({
                pair,
                action: parsed.action,
                confidence: parsed.confidence,
                signalBoost: Math.round(signalBoost * 100) / 100,
                signalId: signal.id,
            }),
        });
        this.logger.log(`📡 Signal generated: ${parsed.action} ${pair} (confidence: ${parsed.confidence}%)`);
        if (this.notificationService) {
            this.notificationService.sendNotification({
                userId,
                type: 'SIGNAL_GENERATED',
                priority: parsed.confidence >= 80 ? 'HIGH' : parsed.confidence >= 60 ? 'MEDIUM' : 'LOW',
                title: `إشارة ${parsed.action === 'BUY' ? 'شراء' : parsed.action === 'SELL' ? 'بيع' : 'انتظار'} ${pair}`,
                body: `ثقة: ${parsed.confidence}% — ${parsed.reason.substring(0, 100)}`,
                data: {
                    signalId: signal.id,
                    pair,
                    action: parsed.action,
                    confidence: parsed.confidence,
                    entryPrice: parsed.entryPrice,
                    stopLoss: parsed.stopLoss,
                    takeProfit: parsed.takeProfit,
                    signalBoost: Math.round(signalBoost * 100) / 100,
                },
                source: parsed.action === 'WAIT' ? 'ai' : 'scanner',
                action: parsed.action === 'BUY' ? 'BUY' : parsed.action === 'SELL' ? 'SELL' : 'INFO',
                pair,
            }).catch((e) => this.logger.warn(`Signal notification push failed: ${e.message}`));
        }
        return signal;
    }
    async getActiveSignals(userId) {
        await this.prisma.signal.updateMany({
            where: {
                userId,
                status: 'ACTIVE',
                expiresAt: { lt: new Date() },
            },
            data: { status: 'EXPIRED' },
        });
        return this.prisma.signal.findMany({
            where: {
                userId,
                status: 'ACTIVE',
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    async getSignalHistory(userId, limit = 20) {
        return this.prisma.signal.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
    async cancelSignal(userId, signalId) {
        const signal = await this.prisma.signal.findFirst({
            where: { id: signalId, userId },
        });
        if (!signal) {
            throw new Error('الإشارة غير موجودة');
        }
        return this.prisma.signal.update({
            where: { id: signalId },
            data: { status: 'CANCELLED' },
        });
    }
    async executeSignal(userId, signalId, credentialId, quantity) {
        const signal = await this.prisma.signal.findFirst({
            where: { id: signalId, userId },
        });
        if (!signal) {
            throw new common_1.NotFoundException('الإشارة غير موجودة');
        }
        if (signal.status !== 'ACTIVE') {
            throw new common_1.BadRequestException(`لا يمكن تنفيذ إشارة بحالة "${signal.status}" — يجب أن تكون نشطة`);
        }
        if (signal.action === 'WAIT') {
            throw new common_1.BadRequestException('لا يمكن تنفيذ إشارة انتظار — ليست توصية شراء أو بيع');
        }
        if (!signal.entryPrice || Number(signal.entryPrice) <= 0) {
            throw new common_1.BadRequestException('الإشارة لا تحتوي على سعر دخول صالح');
        }
        if (!signal.stopLoss || Number(signal.stopLoss) <= 0) {
            throw new common_1.BadRequestException('الإشارة لا تحتوي على وقف خسارة — لا يمكن التنفيذ بدون وقف خسارة');
        }
        const entryPrice = Number(signal.entryPrice);
        const stopLoss = Number(signal.stopLoss);
        const takeProfit = signal.takeProfit ? Number(signal.takeProfit) : undefined;
        const riskPerTrade = 100;
        const riskPerUnit = Math.abs(entryPrice - stopLoss);
        const calculatedQty = riskPerUnit > 0 ? riskPerTrade / riskPerUnit : 0.01;
        const orderQuantity = quantity || Math.max(0.01, Math.round(calculatedQty * 100) / 100);
        if (!this.tradingService) {
            throw new common_1.BadRequestException('خدمة التداول غير متاحة — لا يمكن تنفيذ الإشارة تلقائياً');
        }
        const order = await this.tradingService.placeOrder(userId, {
            credentialId,
            symbol: signal.pair,
            side: signal.action === 'BUY' ? trading_types_1.OrderSide.BUY : trading_types_1.OrderSide.SELL,
            type: trading_types_1.OrderType.MARKET,
            quantity: orderQuantity,
            stopLoss,
            takeProfit,
            signalId: signal.id,
        });
        await this.prisma.signal.update({
            where: { id: signalId },
            data: { status: 'EXECUTED' },
        });
        await this.auditService.log({
            userId,
            action: 'SIGNAL_EXECUTED',
            resource: 'signal',
            details: JSON.stringify({
                signalId,
                pair: signal.pair,
                action: signal.action,
                orderId: order.id,
                quantity: orderQuantity,
                entryPrice,
                stopLoss,
                takeProfit,
            }),
        });
        this.logger.log(`📡 Signal ${signalId} executed: ${signal.action} ${signal.pair} → Order ${order.id}`);
        return {
            signal,
            order,
            executionDetails: {
                quantity: orderQuantity,
                entryPrice,
                stopLoss,
                takeProfit,
                riskRewardRatio: takeProfit ? Math.abs(takeProfit - entryPrice) / riskPerUnit : null,
            },
        };
    }
    _parseSignalResponse(content, marketData) {
        const result = {
            action: 'WAIT',
            confidence: 50,
            reason: content || 'لم يتم الحصول على تحليل من الذكاء الاصطناعي.',
            entryPrice: marketData?.price || null,
            stopLoss: null,
            takeProfit: null,
        };
        if (!content)
            return result;
        const actionPatterns = [
            { pattern: /(?:الإجراء|action|توصية)[:\s]*(شراء|buy)/i, action: 'BUY' },
            { pattern: /(?:الإجراء|action|توصية)[:\s]*(بيع|sell)/i, action: 'SELL' },
            { pattern: /(?:الإجراء|action|توصية)[:\s]*(انتظار|wait|hold)/i, action: 'WAIT' },
            { pattern: /\b(شراء|BUY)\b/i, action: 'BUY' },
            { pattern: /\b(بيع|SELL)\b/i, action: 'SELL' },
        ];
        for (const { pattern, action } of actionPatterns) {
            if (pattern.test(content)) {
                result.action = action;
                break;
            }
        }
        const confidenceMatch = content.match(/(?:نسبة الثقة|confidence)[:\s]*(\d+)/i);
        if (confidenceMatch) {
            const val = parseInt(confidenceMatch[1], 10);
            result.confidence = Math.min(100, Math.max(0, val));
        }
        const entryMatch = content.match(/(?:سعر الدخول|entry)[:\s]*([\d.,]+)/i);
        if (entryMatch) {
            result.entryPrice = parseFloat(entryMatch[1].replace(/,/g, '')) || result.entryPrice;
        }
        const slMatch = content.match(/(?:وقف الخسارة|stop[\s-]?loss)[:\s]*([\d.,]+)/i);
        if (slMatch) {
            result.stopLoss = parseFloat(slMatch[1].replace(/,/g, ''));
        }
        else if (result.entryPrice && marketData) {
            result.stopLoss = result.action === 'BUY'
                ? result.entryPrice * 0.97
                : result.action === 'SELL'
                    ? result.entryPrice * 1.03
                    : null;
        }
        const tpMatch = content.match(/(?:جني الأرباح|take[\s-]?profit|target)[:\s]*([\d.,]+)/i);
        if (tpMatch) {
            result.takeProfit = parseFloat(tpMatch[1].replace(/,/g, ''));
        }
        else if (result.entryPrice && marketData) {
            result.takeProfit = result.action === 'BUY'
                ? result.entryPrice * 1.05
                : result.action === 'SELL'
                    ? result.entryPrice * 0.95
                    : null;
        }
        const reasonMatch = content.match(/(?:السبب|reason)[:\s]*(.+)/is);
        if (reasonMatch) {
            result.reason = reasonMatch[1].trim();
        }
        return result;
    }
};
exports.SignalService = SignalService;
exports.SignalService = SignalService = SignalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Optional)()),
    __param(6, (0, common_1.Optional)()),
    __param(7, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        exchange_service_1.ExchangeService,
        ai_orchestrator_service_1.AIOrchestratorService,
        rag_service_1.RagService,
        audit_service_1.AuditService,
        prediction_market_service_1.PredictionMarketService,
        trading_service_1.TradingService,
        notification_service_1.NotificationService])
], SignalService);
//# sourceMappingURL=signal.service.js.map