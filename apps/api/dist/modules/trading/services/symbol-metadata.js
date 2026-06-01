"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetClass = void 0;
exports.getSymbolMetadata = getSymbolMetadata;
exports.lotsToUnits = lotsToUnits;
exports.unitsToLots = unitsToLots;
exports.roundLotSize = roundLotSize;
exports.calculateNotionalValue = calculateNotionalValue;
exports.calculateMargin = calculateMargin;
exports.calculatePipValue = calculatePipValue;
exports.calculateRisk = calculateRisk;
exports.calculatePositionSizeFromRisk = calculatePositionSizeFromRisk;
var AssetClass;
(function (AssetClass) {
    AssetClass["FOREX"] = "FOREX";
    AssetClass["CRYPTO"] = "CRYPTO";
    AssetClass["COMMODITY"] = "COMMODITY";
    AssetClass["STOCK"] = "STOCK";
    AssetClass["INDEX"] = "INDEX";
})(AssetClass || (exports.AssetClass = AssetClass = {}));
const SYMBOL_REGISTRY = {
    'EUR/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'GBP/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'USD/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
    'USD/CHF': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'AUD/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'NZD/USD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'USD/CAD': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'EUR/GBP': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'EUR/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
    'GBP/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
    'EUR/CHF': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.0001, priceDecimals: 5, defaultLeverage: 50 },
    'AUD/JPY': { assetClass: AssetClass.FOREX, contractSize: 100000, pipSize: 0.01, priceDecimals: 3, defaultLeverage: 50 },
    'XAU/USD': { assetClass: AssetClass.COMMODITY, contractSize: 100, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 20 },
    'XAG/USD': { assetClass: AssetClass.COMMODITY, contractSize: 5000, pipSize: 0.001, priceDecimals: 3, defaultLeverage: 20 },
    'BTC/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.00001, minLot: 0.00001, maxLot: 1000, pipSize: 1, priceDecimals: 2, defaultLeverage: 1 },
    'BTC/USD': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.00001, minLot: 0.00001, maxLot: 1000, pipSize: 1, priceDecimals: 2, defaultLeverage: 1 },
    'ETH/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.0001, minLot: 0.0001, maxLot: 10000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
    'ETH/USD': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.0001, minLot: 0.0001, maxLot: 10000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
    'SOL/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.01, minLot: 0.01, maxLot: 50000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
    'BNB/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 0.001, minLot: 0.001, maxLot: 5000, pipSize: 0.01, priceDecimals: 2, defaultLeverage: 1 },
    'XRP/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 1, minLot: 1, maxLot: 500000, pipSize: 0.0001, priceDecimals: 4, defaultLeverage: 1 },
    'ADA/USDT': { assetClass: AssetClass.CRYPTO, contractSize: 1, lotStep: 1, minLot: 1, maxLot: 500000, pipSize: 0.0001, priceDecimals: 4, defaultLeverage: 1 },
};
const DEFAULT_METADATA = {
    assetClass: AssetClass.CRYPTO,
    contractSize: 1,
    lotStep: 0.00001,
    minLot: 0.00001,
    maxLot: 1000000,
    defaultLeverage: 1,
    pipSize: 0.01,
    priceDecimals: 2,
};
const FOREX_DEFAULT = {
    assetClass: AssetClass.FOREX,
    contractSize: 100000,
    lotStep: 0.01,
    minLot: 0.01,
    maxLot: 100,
    defaultLeverage: 50,
    pipSize: 0.0001,
    priceDecimals: 5,
};
function getSymbolMetadata(symbol) {
    const upper = symbol.toUpperCase();
    if (SYMBOL_REGISTRY[upper]) {
        const partial = SYMBOL_REGISTRY[upper];
        return { ...DEFAULT_METADATA, ...partial };
    }
    if (upper.endsWith('/USDT')) {
        const usdEquivalent = upper.replace('/USDT', '/USD');
        if (SYMBOL_REGISTRY[usdEquivalent]) {
            const partial = SYMBOL_REGISTRY[usdEquivalent];
            return { ...DEFAULT_METADATA, ...partial };
        }
    }
    const NO_SLASH_QUOTES = ['USDT', 'BUSD', 'USDC', 'USD', 'JPY', 'EUR', 'GBP', 'CHF', 'AUD', 'NZD', 'CAD', 'SGD', 'HKD'];
    for (const quote of NO_SLASH_QUOTES) {
        if (upper.endsWith(quote) && upper.length > quote.length) {
            const base = upper.slice(0, upper.length - quote.length);
            if (base.length >= 3) {
                const withSlash = `${base}/${quote}`;
                if (SYMBOL_REGISTRY[withSlash]) {
                    const partial = SYMBOL_REGISTRY[withSlash];
                    return { ...DEFAULT_METADATA, ...partial };
                }
                if (quote === 'USDT' || quote === 'BUSD' || quote === 'USDC') {
                    const usdSlash = `${base}/USD`;
                    if (SYMBOL_REGISTRY[usdSlash]) {
                        const partial = SYMBOL_REGISTRY[usdSlash];
                        return { ...DEFAULT_METADATA, ...partial };
                    }
                }
            }
        }
    }
    if (upper.includes('JPY')) {
        return { ...FOREX_DEFAULT, pipSize: 0.01, priceDecimals: 3 };
    }
    const pairMatch = upper.match(/^([A-Z]{3})\/([A-Z]{3,})$/);
    if (pairMatch) {
        const base = pairMatch[1];
        const quote = pairMatch[2];
        const FIAT_CURRENCIES = ['EUR', 'GBP', 'USD', 'AUD', 'NZD', 'CAD', 'CHF', 'JPY',
            'SGD', 'HKD', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'ZAR',
            'MXN', 'BRL', 'RUB', 'CNY', 'INR', 'KRW', 'THB'];
        if (FIAT_CURRENCIES.includes(base)) {
            return { ...FOREX_DEFAULT, pipSize: quote === 'JPY' ? 0.01 : 0.0001, priceDecimals: quote === 'JPY' ? 3 : 5 };
        }
        const CRYPTO_BASES = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT',
            'AVAX', 'LINK', 'MATIC', 'UNI', 'ATOM', 'LTC', 'SHIB', 'APE', 'ARB', 'OP',
            'FIL', 'NEAR', 'FTM', 'ALGO', 'VET', 'SAND', 'MANA', 'AXS', 'CRV'];
        if (!CRYPTO_BASES.includes(base) && ['USD', 'USDT', 'BUSD', 'USDC', 'CHF', 'CAD'].includes(quote)) {
            return { ...FOREX_DEFAULT };
        }
    }
    if (upper.includes('XAU') || upper.includes('XAG')) {
        return {
            ...DEFAULT_METADATA,
            assetClass: AssetClass.COMMODITY,
            contractSize: 100,
            pipSize: 0.01,
            priceDecimals: 2,
            defaultLeverage: 20,
        };
    }
    return { ...DEFAULT_METADATA };
}
function lotsToUnits(lots, symbol) {
    const meta = getSymbolMetadata(symbol);
    return lots * meta.contractSize;
}
function unitsToLots(units, symbol) {
    const meta = getSymbolMetadata(symbol);
    if (meta.contractSize <= 0)
        return 0;
    return units / meta.contractSize;
}
function roundLotSize(lots, symbol) {
    const meta = getSymbolMetadata(symbol);
    const step = meta.lotStep;
    const rounded = Math.floor(lots / step) * step;
    return parseFloat(rounded.toFixed(8));
}
function calculateNotionalValue(quantity, price) {
    return Math.abs(quantity * price);
}
function calculateMargin(quantity, price, symbol, customLeverage) {
    const meta = getSymbolMetadata(symbol);
    const leverage = customLeverage || meta.defaultLeverage;
    const notional = calculateNotionalValue(quantity, price);
    if (leverage <= 0)
        return notional;
    return notional / leverage;
}
function calculatePipValue(quantity, symbol) {
    const meta = getSymbolMetadata(symbol);
    return meta.pipSize * quantity;
}
function calculateRisk(entryPrice, stopLoss, quantity) {
    return Math.abs(entryPrice - stopLoss) * quantity;
}
function calculatePositionSizeFromRisk(riskBudget, entryPrice, stopLoss, symbol) {
    const meta = getSymbolMetadata(symbol);
    const priceRisk = Math.abs(entryPrice - stopLoss);
    if (priceRisk <= 0 || entryPrice <= 0) {
        return { quantityUnits: 0, quantityLots: 0, margin: 0, risk: 0, notional: 0 };
    }
    let quantityUnits = riskBudget / priceRisk;
    let quantityLots = unitsToLots(quantityUnits, symbol);
    quantityLots = roundLotSize(quantityLots, symbol);
    if (quantityLots < meta.minLot) {
        quantityLots = 0;
    }
    if (quantityLots > meta.maxLot) {
        quantityLots = meta.maxLot;
    }
    quantityUnits = lotsToUnits(quantityLots, symbol);
    const notional = calculateNotionalValue(quantityUnits, entryPrice);
    const margin = calculateMargin(quantityUnits, entryPrice, symbol);
    const risk = calculateRisk(entryPrice, stopLoss, quantityUnits);
    return { quantityUnits, quantityLots, margin, risk, notional };
}
//# sourceMappingURL=symbol-metadata.js.map