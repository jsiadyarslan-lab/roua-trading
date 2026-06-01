"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FinnhubQuoteDto = exports.DataSource = exports.GeneratedSignalDto = exports.SignalAction = exports.AnalysisCardDto = exports.TechnicalAnalysisDto = exports.AtrResult = exports.BollingerBandsResult = exports.MacdResult = exports.RsiResult = exports.EmaResult = exports.SmaResult = exports.IndicatorValueDto = exports.AggregatedCandleDto = exports.AggregatedQuoteDto = void 0;
class AggregatedQuoteDto {
}
exports.AggregatedQuoteDto = AggregatedQuoteDto;
class AggregatedCandleDto {
}
exports.AggregatedCandleDto = AggregatedCandleDto;
class IndicatorValueDto {
}
exports.IndicatorValueDto = IndicatorValueDto;
class SmaResult {
}
exports.SmaResult = SmaResult;
class EmaResult {
}
exports.EmaResult = EmaResult;
class RsiResult {
}
exports.RsiResult = RsiResult;
class MacdResult {
}
exports.MacdResult = MacdResult;
class BollingerBandsResult {
}
exports.BollingerBandsResult = BollingerBandsResult;
class AtrResult {
}
exports.AtrResult = AtrResult;
class TechnicalAnalysisDto {
}
exports.TechnicalAnalysisDto = TechnicalAnalysisDto;
class AnalysisCardDto {
}
exports.AnalysisCardDto = AnalysisCardDto;
var SignalAction;
(function (SignalAction) {
    SignalAction["BUY"] = "BUY";
    SignalAction["SELL"] = "SELL";
    SignalAction["WAIT"] = "WAIT";
})(SignalAction || (exports.SignalAction = SignalAction = {}));
class GeneratedSignalDto {
}
exports.GeneratedSignalDto = GeneratedSignalDto;
var DataSource;
(function (DataSource) {
    DataSource["TWELVE_DATA"] = "TwelveData";
    DataSource["BINANCE_CCXT"] = "Binance";
    DataSource["FINNHUB"] = "Finnhub";
})(DataSource || (exports.DataSource = DataSource = {}));
class FinnhubQuoteDto {
}
exports.FinnhubQuoteDto = FinnhubQuoteDto;
//# sourceMappingURL=analytics.types.js.map