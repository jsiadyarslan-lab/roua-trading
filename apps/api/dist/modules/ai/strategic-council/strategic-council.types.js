"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_SLOW_TIMEFRAMES = exports.AGENT_FAST_TIMEFRAMES = exports.MIN_CONSENSUS_SCORE = exports.MIN_BRIEF_CONFIDENCE = exports.AGENT_TIMEFRAMES = exports.EXECUTOR_TIMEFRAMES = exports.TIMEFRAME_RR = exports.TIMEFRAME_EXPIRY_MS = exports.COUNCIL_TIMEFRAMES = exports.ALL_COUNCIL_PAIRS = exports.NON_BINANCE_PAIRS = exports.BINANCE_SUPPORTED_PAIRS = exports.COUNCIL_PAIRS = void 0;
exports.isSymbolSupportedByExchange = isSymbolSupportedByExchange;
exports.isExecutorTimeframe = isExecutorTimeframe;
exports.isAgentTimeframe = isAgentTimeframe;
exports.COUNCIL_PAIRS = {
    CRYPTO: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'DOGE/USDT'],
    FOREX: ['EUR/USD', 'GBP/USD', 'USD/JPY'],
    STOCKS: ['AAPL', 'MSFT', 'GOOGL', 'TSLA'],
    COMMODITIES: ['XAU/USD'],
};
exports.BINANCE_SUPPORTED_PAIRS = [
    ...exports.COUNCIL_PAIRS.CRYPTO,
];
exports.NON_BINANCE_PAIRS = [
    ...exports.COUNCIL_PAIRS.FOREX,
    ...exports.COUNCIL_PAIRS.STOCKS,
    ...exports.COUNCIL_PAIRS.COMMODITIES,
];
exports.ALL_COUNCIL_PAIRS = [
    ...exports.COUNCIL_PAIRS.CRYPTO,
    ...exports.COUNCIL_PAIRS.FOREX,
    ...exports.COUNCIL_PAIRS.STOCKS,
    ...exports.COUNCIL_PAIRS.COMMODITIES,
];
function isSymbolSupportedByExchange(symbol, exchange) {
    const exchangeId = exchange.toLowerCase().replace('_test', '').replace('-test', '');
    switch (exchangeId) {
        case 'binance':
            return exports.BINANCE_SUPPORTED_PAIRS.includes(symbol);
        default:
            return exports.BINANCE_SUPPORTED_PAIRS.includes(symbol);
    }
}
exports.COUNCIL_TIMEFRAMES = ['M1', 'M5', 'M15'];
exports.TIMEFRAME_EXPIRY_MS = {
    M1: 1 * 60 * 1000,
    M5: 5 * 60 * 1000,
    M15: 15 * 60 * 1000,
    M30: 30 * 60 * 1000,
    H1: 1 * 60 * 60 * 1000,
    H4: 4 * 60 * 60 * 1000,
    D1: 24 * 60 * 60 * 1000,
    W1: 7 * 24 * 60 * 60 * 1000,
};
exports.TIMEFRAME_RR = {
    M1: { sl: 0.005, tp: 0.010, maxSlippage: 0.002 },
    M5: { sl: 0.008, tp: 0.016, maxSlippage: 0.003 },
    M15: { sl: 0.010, tp: 0.020, maxSlippage: 0.004 },
    M30: { sl: 0.012, tp: 0.024, maxSlippage: 0.005 },
    H1: { sl: 0.015, tp: 0.030, maxSlippage: 0.005 },
    H4: { sl: 0.02, tp: 0.04, maxSlippage: 0.005 },
    D1: { sl: 0.03, tp: 0.06, maxSlippage: 0.008 },
    W1: { sl: 0.05, tp: 0.10, maxSlippage: 0.010 },
};
exports.EXECUTOR_TIMEFRAMES = ['M1', 'M5', 'M15'];
exports.AGENT_TIMEFRAMES = ['M30', 'H1', 'H4', 'D1', 'W1'];
function isExecutorTimeframe(tf) {
    return exports.EXECUTOR_TIMEFRAMES.includes(tf);
}
function isAgentTimeframe(tf) {
    return exports.AGENT_TIMEFRAMES.includes(tf);
}
exports.MIN_BRIEF_CONFIDENCE = 50;
exports.MIN_CONSENSUS_SCORE = 55;
exports.AGENT_FAST_TIMEFRAMES = ['M30', 'H1'];
exports.AGENT_SLOW_TIMEFRAMES = ['H4', 'D1', 'W1'];
//# sourceMappingURL=strategic-council.types.js.map