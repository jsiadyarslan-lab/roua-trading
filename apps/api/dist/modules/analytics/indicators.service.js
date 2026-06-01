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
var TechnicalIndicatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TechnicalIndicatorService = void 0;
const common_1 = require("@nestjs/common");
let TechnicalIndicatorService = TechnicalIndicatorService_1 = class TechnicalIndicatorService {
    constructor() {
        this.logger = new common_1.Logger(TechnicalIndicatorService_1.name);
        this.logger.log('📈 Technical Indicator Service initialized — pure JS indicators ready');
    }
    async analyze(candles, symbol, interval = '1day') {
        this.logger.debug(`📈 Computing technical analysis for ${symbol} (${candles.length} candles)`);
        const closes = candles.map((c) => c.close);
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const volumes = candles.map((c) => c.volume);
        const sma20 = this.sma(closes, 20);
        const sma50 = this.sma(closes, 50);
        const sma200 = this.sma(closes, 200);
        const ema12 = this.ema(closes, 12);
        const ema26 = this.ema(closes, 26);
        const ema50 = this.ema(closes, 50);
        const rsiResult = this.rsi(closes, 14);
        const macdResult = this.macd(closes, 12, 26, 9);
        const bbResult = this.bollingerBands(closes, 20, 2);
        const atrResult = this.atr(highs, lows, closes, 14);
        const technicalScore = this._calculateTechnicalScore(closes, sma20, sma50, ema12, ema26, rsiResult, macdResult, bbResult);
        const summary = this._generateSummary(symbol, closes, rsiResult, macdResult, bbResult, technicalScore);
        return {
            symbol,
            interval,
            candleCount: candles.length,
            timestamp: new Date(),
            sma: [
                { period: 20, values: sma20 },
                { period: 50, values: sma50 },
                { period: 200, values: sma200 },
            ],
            ema: [
                { period: 12, values: ema12 },
                { period: 26, values: ema26 },
                { period: 50, values: ema50 },
            ],
            rsi: rsiResult ? {
                period: 14,
                values: rsiResult.values,
                interpretation: rsiResult.interpretation,
            } : null,
            macd: macdResult,
            bollingerBands: bbResult,
            atr: atrResult,
            technicalScore,
            summary,
        };
    }
    sma(data, period) {
        if (data.length < period)
            return [];
        const result = [];
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        result.push(sum / period);
        for (let i = period; i < data.length; i++) {
            sum += data[i] - data[i - period];
            result.push(sum / period);
        }
        return result;
    }
    ema(data, period) {
        if (data.length < period)
            return [];
        const k = 2 / (period + 1);
        const result = [];
        let sum = 0;
        for (let i = 0; i < period; i++) {
            sum += data[i];
        }
        result.push(sum / period);
        for (let i = period; i < data.length; i++) {
            const emaValue = data[i] * k + result[result.length - 1] * (1 - k);
            result.push(emaValue);
        }
        return result;
    }
    rsi(data, period = 14) {
        if (data.length < period + 1)
            return null;
        const values = [];
        let avgGain = 0;
        let avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            const change = data[i] - data[i - 1];
            if (change > 0) {
                avgGain += change;
            }
            else {
                avgLoss += Math.abs(change);
            }
        }
        avgGain /= period;
        avgLoss /= period;
        if (avgLoss === 0) {
            values.push(100);
        }
        else {
            const rs = avgGain / avgLoss;
            values.push(100 - 100 / (1 + rs));
        }
        for (let i = period + 1; i < data.length; i++) {
            const change = data[i] - data[i - 1];
            const gain = change > 0 ? change : 0;
            const loss = change < 0 ? Math.abs(change) : 0;
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            if (avgLoss === 0) {
                values.push(100);
            }
            else {
                const rs = avgGain / avgLoss;
                values.push(100 - 100 / (1 + rs));
            }
        }
        const latestRsi = values[values.length - 1];
        let interpretation;
        if (latestRsi >= 70) {
            interpretation = 'OVERBOUGHT';
        }
        else if (latestRsi <= 30) {
            interpretation = 'OVERSOLD';
        }
        else {
            interpretation = 'NEUTRAL';
        }
        return { period, values, interpretation };
    }
    macd(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (data.length < slowPeriod + signalPeriod)
            return null;
        const fastEma = this.ema(data, fastPeriod);
        const slowEma = this.ema(data, slowPeriod);
        if (fastEma.length === 0 || slowEma.length === 0)
            return null;
        const offset = slowPeriod - fastPeriod;
        const macdLine = [];
        for (let i = 0; i < slowEma.length; i++) {
            const fastIdx = i + offset;
            if (fastIdx < fastEma.length) {
                macdLine.push(fastEma[fastIdx] - slowEma[i]);
            }
        }
        if (macdLine.length < signalPeriod)
            return null;
        const signalLine = this.ema(macdLine, signalPeriod);
        const histogram = [];
        const histOffset = macdLine.length - signalLine.length;
        for (let i = 0; i < signalLine.length; i++) {
            histogram.push(macdLine[i + histOffset] - signalLine[i]);
        }
        let crossover = 'NONE';
        if (histogram.length >= 2) {
            const prev = histogram[histogram.length - 2];
            const curr = histogram[histogram.length - 1];
            if (prev < 0 && curr >= 0) {
                crossover = 'BULLISH_CROSSOVER';
            }
            else if (prev >= 0 && curr < 0) {
                crossover = 'BEARISH_CROSSOVER';
            }
        }
        const resultLen = Math.min(macdLine.length, signalLine.length, histogram.length);
        const startOffset = macdLine.length - resultLen;
        return {
            macd: macdLine.slice(startOffset),
            signal: signalLine.slice(signalLine.length - resultLen),
            histogram: histogram.slice(histogram.length - resultLen),
            crossover,
        };
    }
    bollingerBands(data, period = 20, multiplier = 2) {
        if (data.length < period)
            return null;
        const middle = this.sma(data, period);
        const upper = [];
        const lower = [];
        const bandwidth = [];
        for (let i = 0; i < middle.length; i++) {
            const dataIdx = i + period - 1;
            const window = data.slice(dataIdx - period + 1, dataIdx + 1);
            const mean = middle[i];
            const variance = window.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
            const stdDev = Math.sqrt(variance);
            const upperBand = mean + multiplier * stdDev;
            const lowerBand = mean - multiplier * stdDev;
            upper.push(upperBand);
            lower.push(lowerBand);
            bandwidth.push(mean !== 0 ? (upperBand - lowerBand) / mean : 0);
        }
        let position = 'WITHIN';
        if (data.length > 0 && upper.length > 0 && lower.length > 0) {
            const latestPrice = data[data.length - 1];
            const latestUpper = upper[upper.length - 1];
            const latestLower = lower[lower.length - 1];
            if (latestPrice > latestUpper) {
                position = 'ABOVE_UPPER';
            }
            else if (latestPrice < latestLower) {
                position = 'BELOW_LOWER';
            }
        }
        return { upper, middle, lower, bandwidth, position };
    }
    atr(highs, lows, closes, period = 14) {
        if (highs.length < period + 1)
            return null;
        const trueRanges = [];
        for (let i = 1; i < highs.length; i++) {
            const hl = highs[i] - lows[i];
            const hpc = Math.abs(highs[i] - closes[i - 1]);
            const lpc = Math.abs(lows[i] - closes[i - 1]);
            trueRanges.push(Math.max(hl, hpc, lpc));
        }
        if (trueRanges.length < period)
            return null;
        const values = [];
        let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
        values.push(atr);
        for (let i = period; i < trueRanges.length; i++) {
            atr = (atr * (period - 1) + trueRanges[i]) / period;
            values.push(atr);
        }
        let volatilityLevel = 'NORMAL';
        if (values.length >= 20) {
            const recentAtr = values[values.length - 1];
            const atrSma = values.slice(-20).reduce((a, b) => a + b, 0) / 20;
            if (recentAtr > atrSma * 1.5) {
                volatilityLevel = 'HIGH';
            }
            else if (recentAtr < atrSma * 0.5) {
                volatilityLevel = 'LOW';
            }
        }
        return { period, values, volatilityLevel };
    }
    _calculateTechnicalScore(closes, sma20, sma50, ema12, ema26, rsiResult, macdResult, bbResult) {
        let score = 0;
        let weight = 0;
        const latestPrice = closes[closes.length - 1];
        if (sma20.length > 0) {
            const latestSma20 = sma20[sma20.length - 1];
            score += latestPrice > latestSma20 ? 15 : -15;
            weight += 15;
        }
        if (sma50.length > 0) {
            const latestSma50 = sma50[sma50.length - 1];
            score += latestPrice > latestSma50 ? 15 : -15;
            weight += 15;
        }
        if (ema12.length > 0 && ema26.length > 0) {
            const latestEma12 = ema12[ema12.length - 1];
            const latestEma26 = ema26[ema26.length - 1];
            score += latestEma12 > latestEma26 ? 20 : -20;
            weight += 20;
        }
        if (rsiResult && rsiResult.values.length > 0) {
            const latestRsi = rsiResult.values[rsiResult.values.length - 1];
            if (latestRsi > 70) {
                score -= 15;
            }
            else if (latestRsi < 30) {
                score += 15;
            }
            else if (latestRsi > 50) {
                score += 5;
            }
            else {
                score -= 5;
            }
            weight += 15;
        }
        if (macdResult) {
            if (macdResult.crossover === 'BULLISH_CROSSOVER') {
                score += 20;
            }
            else if (macdResult.crossover === 'BEARISH_CROSSOVER') {
                score -= 20;
            }
            else if (macdResult.histogram.length > 0) {
                const latestHist = macdResult.histogram[macdResult.histogram.length - 1];
                score += latestHist > 0 ? 10 : -10;
            }
            weight += 20;
        }
        if (bbResult) {
            if (bbResult.position === 'BELOW_LOWER') {
                score += 15;
            }
            else if (bbResult.position === 'ABOVE_UPPER') {
                score -= 15;
            }
            weight += 15;
        }
        if (weight > 0) {
            return Math.round((score / weight) * 100);
        }
        return 0;
    }
    _generateSummary(symbol, closes, rsiResult, macdResult, bbResult, technicalScore) {
        const latestPrice = closes[closes.length - 1];
        const parts = [];
        if (technicalScore > 30) {
            parts.push(`الاتجاه العام صاعد بقوة (${technicalScore}+)`);
        }
        else if (technicalScore > 10) {
            parts.push(`الاتجاه العام صاعد بشكل معتدل (${technicalScore}+)`);
        }
        else if (technicalScore < -30) {
            parts.push(`الاتجاه العام هابط بقوة (${technicalScore})`);
        }
        else if (technicalScore < -10) {
            parts.push(`الاتجاه العام هابط بشكل معتدل (${technicalScore})`);
        }
        else {
            parts.push(`الاتجاه العام محايد (${technicalScore})`);
        }
        if (rsiResult && rsiResult.values.length > 0) {
            const latestRsi = rsiResult.values[rsiResult.values.length - 1].toFixed(1);
            if (rsiResult.interpretation === 'OVERBOUGHT') {
                parts.push(`RSI عند ${latestRsi} يشير إلى تشبع شرائي`);
            }
            else if (rsiResult.interpretation === 'OVERSOLD') {
                parts.push(`RSI عند ${latestRsi} يشير إلى تشبع بيعي`);
            }
            else {
                parts.push(`RSI عند ${latestRsi} في منطقة محايدة`);
            }
        }
        if (macdResult) {
            if (macdResult.crossover === 'BULLISH_CROSSOVER') {
                parts.push('MACD يعطي إشارة تقاطع صعودي');
            }
            else if (macdResult.crossover === 'BEARISH_CROSSOVER') {
                parts.push('MACD يعطي إشارة تقاطع هبوطي');
            }
        }
        if (bbResult) {
            if (bbResult.position === 'ABOVE_UPPER') {
                parts.push('السعر فوق الحد العلوي لبولنجر — احتمال تراجع');
            }
            else if (bbResult.position === 'BELOW_LOWER') {
                parts.push('السعر تحت الحد السفلي لبولنجر — احتمال ارتداد');
            }
        }
        return parts.join('. ') + '.';
    }
};
exports.TechnicalIndicatorService = TechnicalIndicatorService;
exports.TechnicalIndicatorService = TechnicalIndicatorService = TechnicalIndicatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], TechnicalIndicatorService);
//# sourceMappingURL=indicators.service.js.map