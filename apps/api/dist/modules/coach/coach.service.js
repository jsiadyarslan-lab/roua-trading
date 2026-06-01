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
var CoachService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoachService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../common/prisma/prisma.service");
const ai_orchestrator_service_1 = require("../ai/services/ai-orchestrator.service");
let CoachService = CoachService_1 = class CoachService {
    constructor(prisma, orchestrator) {
        this.prisma = prisma;
        this.orchestrator = orchestrator;
        this.logger = new common_1.Logger(CoachService_1.name);
    }
    async getPerformanceAdvice(userId) {
        this.logger.log(`Generating performance advice for user ${userId}`);
        const trades = await this.prisma.trade.findMany({
            where: { userId },
            orderBy: { executedAt: 'desc' },
            take: 50,
        });
        const closedPositions = await this.prisma.position.findMany({
            where: { userId, status: 'CLOSED' },
            orderBy: { closedAt: 'desc' },
            take: 50,
        });
        const paperOrders = await this.prisma.paperOrder.findMany({
            where: { userId, status: 'FILLED' },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });
        const paperPnl = this.calculatePaperPnl(paperOrders);
        const stats = this.calculateStats(trades, closedPositions, paperPnl);
        const rating = this.calculateRating(stats);
        const contextSummary = this.buildContextSummary(stats, trades.slice(0, 20), closedPositions.slice(0, 20));
        const aiPrompt = `أنت مُدرّب ربط حسابات خبير في منصة "رؤى". حلل أداء المتداول بناءً على الإحصائيات التالية وسجل الصفقات. قدم 3-5 نصائح محددة وقابلة للتنفيذ لتحسين الأداء. ركز على إدارة المخاطر، الانضباط، حجم الصفقات، واختيار الأصول. اذكر نقاط القوة والضعف. اجعل النصائح بالعربية ومباشرة.

الإحصائيات:
${contextSummary}

أجب بالصيغة التالية:
تقييم_عام: [ممتاز/جيد/يحتاج_تحسين]
---
1. [نوع النصيحة: تحذير/فرصة/تعليم] نص النصيحة الأولى
2. [نوع النصيحة: تحذير/فرصة/تعليم] نص النصيحة الثانية
3. [نوع النصيحة: تحذير/فرصة/تعليم] نص النصيحة الثالثة
---
نقاط_القوة: [نقاط القوة]
نقاط_الضعف: [نقاط الضعف]
خطة_تحسين: [خطة التحسين الموصى بها]`;
        let adviceText = '';
        let adviceItems = [];
        try {
            const result = await this.orchestrator.analyze({
                prompt: aiPrompt,
                type: 'risk_analysis',
                language: 'ar',
            });
            adviceText = result.content;
            adviceItems = this.parseAdviceItems(result.content);
        }
        catch (error) {
            this.logger.warn(`AI analysis failed, using rule-based fallback: ${error.message}`);
            const fallback = this.generateRuleBasedAdvice(stats);
            adviceText = fallback.text;
            adviceItems = fallback.items;
        }
        const advice = await this.prisma.coachAdvice.create({
            data: {
                userId,
                rating,
                statisticsSnapshot: JSON.stringify(stats),
                adviceText,
                adviceItems: JSON.stringify(adviceItems),
            },
        });
        return {
            success: true,
            data: {
                id: advice.id,
                rating,
                statistics: stats,
                adviceText,
                adviceItems,
                createdAt: advice.createdAt,
            },
        };
    }
    async askCoach(userId, question, contextAdviceId) {
        this.logger.log(`Coach question from user ${userId}: ${question}`);
        const trades = await this.prisma.trade.findMany({
            where: { userId },
            orderBy: { executedAt: 'desc' },
            take: 30,
        });
        const closedPositions = await this.prisma.position.findMany({
            where: { userId, status: 'CLOSED' },
            orderBy: { closedAt: 'desc' },
            take: 30,
        });
        const paperOrders = await this.prisma.paperOrder.findMany({
            where: { userId, status: 'FILLED' },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });
        const paperPnl = this.calculatePaperPnl(paperOrders);
        const stats = this.calculateStats(trades, closedPositions, paperPnl);
        const contextSummary = this.buildContextSummary(stats, trades.slice(0, 10), closedPositions.slice(0, 10));
        let previousAdvice = '';
        if (contextAdviceId) {
            const prev = await this.prisma.coachAdvice.findFirst({
                where: { id: contextAdviceId, userId },
            });
            if (prev) {
                previousAdvice = `\n\nنصيحة سابقة من المُدرّب:\n${prev.adviceText}`;
            }
        }
        const aiPrompt = `أنت مُدرّب ربط حسابات خبير في منصة "رؤى". المتداول يسألك سؤالاً حول أدائه. أجب بالعربية بشكل مهني ومفيد ومباشر.

إحصائيات المتداول:
${contextSummary}
${previousAdvice}

سؤال المتداول: ${question}

أجب بشكل مبدد وعملي. قدم خطوات واضحة إن لزم الأمر.`;
        let answer = '';
        try {
            const result = await this.orchestrator.analyze({
                prompt: aiPrompt,
                type: 'general',
                language: 'ar',
            });
            answer = result.content;
        }
        catch (error) {
            this.logger.warn(`AI question answer failed: ${error.message}`);
            answer = this.generateFallbackAnswer(question, stats);
        }
        return {
            success: true,
            data: {
                question,
                answer,
                model: 'ai-coach',
            },
        };
    }
    async getAdviceHistory(userId) {
        const history = await this.prisma.coachAdvice.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 20,
        });
        await this.prisma.coachAdvice.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true },
        });
        return {
            success: true,
            data: history.map(h => ({
                id: h.id,
                rating: h.rating,
                adviceText: h.adviceText,
                adviceItems: JSON.parse(h.adviceItems || '[]'),
                statistics: JSON.parse(h.statisticsSnapshot || '{}'),
                isRead: h.isRead,
                createdAt: h.createdAt,
            })),
        };
    }
    calculateStats(trades, closedPositions, paperPnl = []) {
        const allPnl = [
            ...trades.map(t => Number(t.pnl) || 0),
            ...closedPositions.map(p => Number(p.realizedPnl) || 0),
            ...paperPnl,
        ];
        const winningTrades = allPnl.filter(p => p > 0);
        const losingTrades = allPnl.filter(p => p < 0);
        const totalTrades = allPnl.length;
        const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
        const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, v) => s + v, 0) / winningTrades.length : 0;
        const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, v) => s + v, 0) / losingTrades.length) : 0;
        const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
        const totalPnl = allPnl.reduce((s, v) => s + v, 0);
        const biggestWin = winningTrades.length > 0 ? Math.max(...winningTrades) : 0;
        const biggestLoss = losingTrades.length > 0 ? Math.min(...losingTrades) : 0;
        let peak = 0, maxDrawdown = 0, cumPnl = 0;
        const sortedByDate = [...allPnl].reverse();
        sortedByDate.forEach(pnl => {
            cumPnl += pnl;
            if (cumPnl > peak)
                peak = cumPnl;
            const dd = peak - cumPnl;
            if (dd > maxDrawdown)
                maxDrawdown = dd;
        });
        let consecutiveWins = 0, consecutiveLosses = 0, tempW = 0, tempL = 0;
        allPnl.forEach(pnl => {
            if (pnl > 0) {
                tempW++;
                tempL = 0;
                consecutiveWins = Math.max(consecutiveWins, tempW);
            }
            else if (pnl < 0) {
                tempL++;
                tempW = 0;
                consecutiveLosses = Math.max(consecutiveLosses, tempL);
            }
            else {
                tempW = 0;
                tempL = 0;
            }
        });
        const symbolCounts = {};
        trades.forEach(t => { symbolCounts[t.symbol] = (symbolCounts[t.symbol] || 0) + 1; });
        const mostTradedSymbol = Object.entries(symbolCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        const longTrades = trades.filter(t => t.side === 'BUY');
        const shortTrades = trades.filter(t => t.side === 'SELL');
        const longWinRate = longTrades.length > 0
            ? (longTrades.filter(t => (t.pnl || 0) > 0).length / longTrades.length) * 100 : 0;
        const shortWinRate = shortTrades.length > 0
            ? (shortTrades.filter(t => (t.pnl || 0) > 0).length / shortTrades.length) * 100 : 0;
        const positionsWithSL = closedPositions.filter(p => p.stopLoss != null);
        const riskCompliance = closedPositions.length > 0
            ? `${Math.round((positionsWithSL.length / closedPositions.length) * 100)}%`
            : 'غير محدد';
        let sharpeRatio = null;
        if (allPnl.length >= 2) {
            const mean = allPnl.reduce((s, r) => s + r, 0) / allPnl.length;
            const variance = allPnl.reduce((s, r) => s + (r - mean) ** 2, 0) / (allPnl.length - 1);
            const stdDev = Math.sqrt(variance);
            sharpeRatio = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : null;
        }
        return {
            totalTrades,
            winningTrades: winningTrades.length,
            losingTrades: losingTrades.length,
            winRate: Math.round(winRate * 10) / 10,
            avgWin: Math.round(avgWin * 100) / 100,
            avgLoss: Math.round(avgLoss * 100) / 100,
            profitFactor: profitFactor === Infinity ? -1 : Math.round(profitFactor * 100) / 100,
            totalPnl: Math.round(totalPnl * 100) / 100,
            maxDrawdown: Math.round(maxDrawdown * 100) / 100,
            sharpeRatio: sharpeRatio !== null ? Math.round(sharpeRatio * 100) / 100 : null,
            mostTradedSymbol,
            avgTradeDuration: 'غير محدد',
            riskCompliance,
            biggestWin: Math.round(biggestWin * 100) / 100,
            biggestLoss: Math.round(biggestLoss * 100) / 100,
            consecutiveWins,
            consecutiveLosses,
            longWinRate: Math.round(longWinRate * 10) / 10,
            shortWinRate: Math.round(shortWinRate * 10) / 10,
        };
    }
    calculateRating(stats) {
        if (stats.totalTrades < 10)
            return 'insufficient_data';
        let score = 0;
        if (stats.winRate >= 60)
            score += 3;
        else if (stats.winRate >= 45)
            score += 2;
        else
            score += 1;
        if (stats.profitFactor >= 2)
            score += 3;
        else if (stats.profitFactor >= 1.5)
            score += 2;
        else if (stats.profitFactor >= 1)
            score += 1;
        if (stats.maxDrawdown < 500)
            score += 2;
        else if (stats.maxDrawdown < 2000)
            score += 1;
        if (score >= 7)
            return 'excellent';
        if (score >= 4)
            return 'good';
        return 'needs_improvement';
    }
    buildContextSummary(stats, trades, closedPositions) {
        const tradeSummary = trades.slice(0, 10).map(t => `${t.symbol} ${t.side === 'BUY' ? 'شراء' : 'بيع'} @ ${t.price} | ربح/خسارة: ${t.pnl || 0}`).join('\n');
        return `إجمالي الصفقات: ${stats.totalTrades}
صفقات رابحة: ${stats.winningTrades} | صفقات خاسرة: ${stats.losingTrades}
نسبة الفوز: ${stats.winRate}%
متوسط الربح: $${stats.avgWin} | متوسط الخسارة: $${stats.avgLoss}
عامل الربح: ${stats.profitFactor === -1 ? '∞' : stats.profitFactor}
إجمالي الربح/الخسارة: $${stats.totalPnl}
أقصى تراجع: $${stats.maxDrawdown}
أكبر ربح: $${stats.biggestWin} | أكبر خسارة: $${stats.biggestLoss}
سلسلة أرباح متتالية: ${stats.consecutiveWins} | سلسلة خسائر متتالية: ${stats.consecutiveLosses}
نسبة فوز الشراء: ${stats.longWinRate}% | نسبة فوز البيع: ${stats.shortWinRate}%
الأكثر تداولاً: ${stats.mostTradedSymbol}
التزام إدارة المخاطر: ${stats.riskCompliance}
مؤشر شارب: ${stats.sharpeRatio ?? 'غير محدد'}

آخر 10 صفقات:
${tradeSummary}`;
    }
    parseAdviceItems(text) {
        const items = [];
        const lines = text.split('\n').filter(l => l.trim());
        for (const line of lines) {
            const match = line.match(/^\d+\.\s*\[?(تحذير|فرصة|تعليم|خطر)\]?\s*(.+)/);
            if (match) {
                const rawType = match[1];
                const content = match[2].trim();
                let type = 'education';
                let icon = 'book';
                if (rawType === 'تحذير' || rawType === 'خطر') {
                    type = 'warning';
                    icon = 'alert';
                }
                else if (rawType === 'فرصة') {
                    type = 'opportunity';
                    icon = 'trending-up';
                }
                else {
                    type = 'education';
                    icon = 'book';
                }
                items.push({ type, icon, text: content });
            }
        }
        if (items.length === 0) {
            const sentences = text.split(/[.؟!]/).filter(s => s.trim().length > 15);
            sentences.slice(0, 5).forEach(s => {
                items.push({ type: 'education', icon: 'book', text: s.trim() });
            });
        }
        return items;
    }
    generateRuleBasedAdvice(stats) {
        const items = [];
        if (stats.winRate < 40) {
            items.push({ type: 'warning', icon: 'alert', text: 'نسبة فوزك أقل من 40%. راجع استراتيجية الدخول وتأكد من استخدام التحليل المتعدد الأطر الزمنية قبل فتح أي صفقة.' });
        }
        if (stats.profitFactor < 1 && stats.profitFactor > 0) {
            items.push({ type: 'warning', icon: 'alert', text: 'عامل الربح أقل من 1.0 مما يعني أن خسائرك تتجاوز أرباحك. قلل حجم الصفقات وحدد وقف خسارة صارم لكل صفقة.' });
        }
        if (stats.consecutiveLosses >= 3) {
            items.push({ type: 'warning', icon: 'alert', text: `سلسلة خسائر متتالية (${stats.consecutiveLosses}). توقف عن التداول لفترة، راجع الصفقات الخاسرة، ولا تلاحق السوق بالتعويض.` });
        }
        if (stats.maxDrawdown > 1000) {
            items.push({ type: 'warning', icon: 'alert', text: `أقصى تراجع مرتفع ($${stats.maxDrawdown}). استخدم وقف خسارة لكل صفقة ولا تخاطر بأكثر من 2% من رأس المال في الصفقة الواحدة.` });
        }
        if (stats.longWinRate > stats.shortWinRate + 20) {
            items.push({ type: 'opportunity', icon: 'trending-up', text: `أداء الشراء أفضل بكثير من البيع (${stats.longWinRate}% مقابل ${stats.shortWinRate}%). ركز على صفقات الشراء حتى تحسن استراتيجية البيع.` });
        }
        if (stats.riskCompliance === 'غير محدد' || stats.riskCompliance === '0%') {
            items.push({ type: 'education', icon: 'book', text: 'لا تستخدم وقف الخسارة بشكل منتظم. وقف الخسارة ضروري لحماية رأس المال. حدد وقف خسارة قبل فتح أي صفقة.' });
        }
        if (stats.winRate >= 55 && stats.profitFactor >= 1.5) {
            items.push({ type: 'opportunity', icon: 'trending-up', text: 'أداؤك جيد! حافظ على الانضباط وزِد حجم الصفقات تدريجياً مع الحفاظ على إدارة المخاطر.' });
        }
        if (items.length === 0) {
            items.push({ type: 'education', icon: 'book', text: 'استمر في التداول مع الالتزام بخطة واضحة. سجل كل صفقة وراجع أداءك أسبوعياً لتحديد الأنماط.' });
        }
        const text = items.map((item, i) => `${i + 1}. [${item.type === 'warning' ? 'تحذير' : item.type === 'opportunity' ? 'فرصة' : 'تعليم'}] ${item.text}`).join('\n');
        return { text, items };
    }
    generateFallbackAnswer(question, stats) {
        if (question.includes('وقفة') || question.includes('وقف') || question.includes('stop loss')) {
            return 'وقف الخسارة أداة أساسية لحماية رأس المال. يجب تحديد مستوى وقف الخسارة قبل فتح الصفقة بناءً على مستويات الدعم والمقاومة، وليس بشكل عشوائي. القاعدة العامة: لا تخاطر بأكثر من 1-2% من رأس المال في الصفقة الواحدة.';
        }
        if (question.includes('حجم') || question.includes('position size')) {
            return `بناءً على أدائك الحالي (نسبة فوز ${stats.winRate}%)، أنصحك بحجم صفقات صغير ومتسق. استخدم قاعدة 1%: لا تخاطر بأكثر من 1% من رأس المال في أي صفقة. هذا يحميك من الخسائر الكبيرة ويسمح لك بالبقاء في السوق لفترة أطول.`;
        }
        return `بناءً على تحليل أدائك: نسبة الفوز ${stats.winRate}%، عامل الربح ${stats.profitFactor}، أقصى تراجع $${stats.maxDrawdown}. أنصحك بالتركيز على تحسين نقاط الدخول والخروج، واستخدام وقف الخسارة دائماً، وعدم المخاطرة بأكثر من 2% من رأس المال في الصفقة الواحدة. الرجاء كن أكثر تحديداً في سؤالك لأعطيك نصيحة أدق.`;
    }
    calculatePaperPnl(paperOrders) {
        const bySymbol = {};
        for (const order of paperOrders) {
            const sym = order.symbol;
            if (!bySymbol[sym])
                bySymbol[sym] = [];
            bySymbol[sym].push({
                side: order.side,
                price: Number(order.averagePrice) || 0,
                qty: Number(order.quantity) || 0,
                fee: Number(order.fee) || 0,
            });
        }
        const pnlResults = [];
        for (const [symbol, orders] of Object.entries(bySymbol)) {
            orders.reverse();
            const buyQueue = [];
            for (const order of orders) {
                if (order.side === 'BUY') {
                    buyQueue.push({ price: order.price, qty: order.qty, fee: order.fee });
                }
                else if (order.side === 'SELL' && buyQueue.length > 0) {
                    let remainingQty = order.qty;
                    let totalPnl = -order.fee;
                    while (remainingQty > 0 && buyQueue.length > 0) {
                        const buy = buyQueue[0];
                        const matchedQty = Math.min(remainingQty, buy.qty);
                        const pairPnl = (order.price - buy.price) * matchedQty;
                        totalPnl += pairPnl;
                        totalPnl -= buy.fee * (matchedQty / buy.qty);
                        buy.qty -= matchedQty;
                        remainingQty -= matchedQty;
                        if (buy.qty <= 0)
                            buyQueue.shift();
                    }
                    pnlResults.push(Math.round(totalPnl * 100) / 100);
                }
            }
        }
        return pnlResults;
    }
};
exports.CoachService = CoachService;
exports.CoachService = CoachService = CoachService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_orchestrator_service_1.AIOrchestratorService])
], CoachService);
//# sourceMappingURL=coach.service.js.map