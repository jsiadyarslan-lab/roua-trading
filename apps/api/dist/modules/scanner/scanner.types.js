"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SCANNER_SYMBOLS = exports.MarketOverviewDto = exports.ScannerScanResponseDto = exports.DeepAnalysisDto = exports.MultiTfResultDto = exports.TimeframeAnalysisDto = exports.HeatmapItemDto = exports.ScannerItemDto = exports.CandlePattern = exports.VolumeProfileResult = exports.VolumeProfileLevel = exports.DivergenceResult = exports.FibonacciLevel = exports.ParabolicSarResult = exports.CciResult = exports.ObvResult = exports.IchimokuResult = exports.PatternDetection = exports.SupportResistanceLevel = exports.VwapResult = exports.AdxResult = exports.StochResult = exports.TimeFrame = exports.SignalClass = exports.SignalDirection = exports.MarketCategory = void 0;
var MarketCategory;
(function (MarketCategory) {
    MarketCategory["ALL"] = "ALL";
    MarketCategory["CRYPTO"] = "CRYPTO";
    MarketCategory["FOREX"] = "FOREX";
    MarketCategory["STOCK"] = "STOCK";
    MarketCategory["COMMODITY"] = "COMMODITY";
})(MarketCategory || (exports.MarketCategory = MarketCategory = {}));
var SignalDirection;
(function (SignalDirection) {
    SignalDirection["STRONG_BUY"] = "STRONG_BUY";
    SignalDirection["BUY"] = "BUY";
    SignalDirection["NEUTRAL"] = "NEUTRAL";
    SignalDirection["SELL"] = "SELL";
    SignalDirection["STRONG_SELL"] = "STRONG_SELL";
})(SignalDirection || (exports.SignalDirection = SignalDirection = {}));
var SignalClass;
(function (SignalClass) {
    SignalClass["TREND"] = "TREND";
    SignalClass["REVERSION"] = "REVERSION";
    SignalClass["BREAKOUT"] = "BREAKOUT";
    SignalClass["CONSOLIDATION"] = "CONSOLIDATION";
    SignalClass["WATCH"] = "WATCH";
})(SignalClass || (exports.SignalClass = SignalClass = {}));
var TimeFrame;
(function (TimeFrame) {
    TimeFrame["M15"] = "15min";
    TimeFrame["H1"] = "1h";
    TimeFrame["H4"] = "4h";
    TimeFrame["D1"] = "1day";
})(TimeFrame || (exports.TimeFrame = TimeFrame = {}));
class StochResult {
}
exports.StochResult = StochResult;
class AdxResult {
}
exports.AdxResult = AdxResult;
class VwapResult {
}
exports.VwapResult = VwapResult;
class SupportResistanceLevel {
}
exports.SupportResistanceLevel = SupportResistanceLevel;
class PatternDetection {
}
exports.PatternDetection = PatternDetection;
class IchimokuResult {
}
exports.IchimokuResult = IchimokuResult;
class ObvResult {
}
exports.ObvResult = ObvResult;
class CciResult {
}
exports.CciResult = CciResult;
class ParabolicSarResult {
}
exports.ParabolicSarResult = ParabolicSarResult;
class FibonacciLevel {
}
exports.FibonacciLevel = FibonacciLevel;
class DivergenceResult {
}
exports.DivergenceResult = DivergenceResult;
class VolumeProfileLevel {
}
exports.VolumeProfileLevel = VolumeProfileLevel;
class VolumeProfileResult {
}
exports.VolumeProfileResult = VolumeProfileResult;
class CandlePattern {
}
exports.CandlePattern = CandlePattern;
class ScannerItemDto {
}
exports.ScannerItemDto = ScannerItemDto;
class HeatmapItemDto {
}
exports.HeatmapItemDto = HeatmapItemDto;
class TimeframeAnalysisDto {
}
exports.TimeframeAnalysisDto = TimeframeAnalysisDto;
class MultiTfResultDto {
}
exports.MultiTfResultDto = MultiTfResultDto;
class DeepAnalysisDto {
}
exports.DeepAnalysisDto = DeepAnalysisDto;
class ScannerScanResponseDto {
}
exports.ScannerScanResponseDto = ScannerScanResponseDto;
class MarketOverviewDto {
}
exports.MarketOverviewDto = MarketOverviewDto;
exports.SCANNER_SYMBOLS = [
    { symbol: 'BTC/USD', name: 'بيتكوين', category: MarketCategory.CRYPTO },
    { symbol: 'ETH/USD', name: 'إيثريوم', category: MarketCategory.CRYPTO },
    { symbol: 'SOL/USD', name: 'سولانا', category: MarketCategory.CRYPTO },
    { symbol: 'BNB/USD', name: 'بينانس كوين', category: MarketCategory.CRYPTO },
    { symbol: 'XRP/USD', name: 'ريبيل', category: MarketCategory.CRYPTO },
    { symbol: 'ADA/USD', name: 'كاردانو', category: MarketCategory.CRYPTO },
    { symbol: 'EUR/USD', name: 'يورو/دولار', category: MarketCategory.FOREX },
    { symbol: 'GBP/USD', name: 'جنيه/دولار', category: MarketCategory.FOREX },
    { symbol: 'USD/JPY', name: 'دولار/ين', category: MarketCategory.FOREX },
    { symbol: 'XAU/USD', name: 'الذهب', category: MarketCategory.COMMODITY },
    { symbol: 'AAPL', name: 'أبل', category: MarketCategory.STOCK },
    { symbol: 'TSLA', name: 'تسلا', category: MarketCategory.STOCK },
    { symbol: 'NVDA', name: 'إنفيديا', category: MarketCategory.STOCK },
];
//# sourceMappingURL=scanner.types.js.map