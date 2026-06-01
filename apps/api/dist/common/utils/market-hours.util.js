"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectMarketType = detectMarketType;
exports.isMarketOpen = isMarketOpen;
const CRYPTO_SYMBOLS = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC', 'AVAX', 'LINK', 'UNI'];
const FOREX_SYMBOLS = ['EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD', 'USD'];
const COMMODITY_SYMBOLS = ['XAU', 'XAG', 'XPT', 'XPD'];
const US_STOCK_SYMBOLS = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META'];
function detectMarketType(symbol) {
    const base = symbol.split('/')[0].toUpperCase().replace('USDT', '').replace('USD', '');
    if (CRYPTO_SYMBOLS.includes(base))
        return 'crypto';
    if (COMMODITY_SYMBOLS.includes(base))
        return 'commodity';
    if (symbol.includes('/')) {
        const parts = symbol.split('/');
        if (parts.length === 2 && FOREX_SYMBOLS.includes(parts[0].toUpperCase()) && FOREX_SYMBOLS.includes(parts[1].toUpperCase())) {
            return 'forex';
        }
    }
    if (US_STOCK_SYMBOLS.includes(base))
        return 'stock';
    if (!symbol.includes('/') && base.length <= 5 && base === base.toUpperCase()) {
        return 'stock';
    }
    return 'unknown';
}
function isMarketOpen(symbol, now = new Date()) {
    const marketType = detectMarketType(symbol);
    switch (marketType) {
        case 'crypto':
            return { open: true, reason: 'Crypto market is open 24/7', marketType, nextOpen: null };
        case 'forex':
            return checkForexHours(now);
        case 'stock':
            return checkStockHours(now);
        case 'commodity':
            return checkCommodityHours(now);
        default:
            return { open: true, reason: 'Unknown market type — trading allowed', marketType, nextOpen: null };
    }
}
function checkForexHours(now) {
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;
    if (day === 6) {
        const nextOpen = getNextForexOpen(now);
        return { open: false, reason: 'Forex market closed — weekend (Saturday)', marketType: 'forex', nextOpen };
    }
    if (day === 0) {
        if (timeInMinutes < 22 * 60) {
            const nextOpen = getNextForexOpen(now);
            return { open: false, reason: 'Forex market closed — opens Sunday 22:00 UTC', marketType: 'forex', nextOpen };
        }
        return { open: true, reason: 'Forex market is open', marketType: 'forex', nextOpen: null };
    }
    if (day === 5) {
        if (timeInMinutes >= 22 * 60) {
            const nextOpen = getNextForexOpen(now);
            return { open: false, reason: 'Forex market closed — closed Friday 22:00 UTC', marketType: 'forex', nextOpen };
        }
        return { open: true, reason: 'Forex market is open', marketType: 'forex', nextOpen: null };
    }
    return { open: true, reason: 'Forex market is open', marketType: 'forex', nextOpen: null };
}
function getNextForexOpen(now) {
    const day = now.getUTCDay();
    const nextOpen = new Date(now);
    if (day === 6) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
        nextOpen.setUTCHours(22, 0, 0, 0);
    }
    else if (day === 5) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 2);
        nextOpen.setUTCHours(22, 0, 0, 0);
    }
    else if (day === 0) {
        nextOpen.setUTCHours(22, 0, 0, 0);
    }
    else {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
        nextOpen.setUTCHours(0, 0, 0, 0);
    }
    return nextOpen;
}
function checkStockHours(now) {
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;
    if (day === 0 || day === 6) {
        const reason = day === 6
            ? 'US stock market closed — weekend (Saturday)'
            : 'US stock market closed — weekend (Sunday)';
        const nextOpen = getNextStockOpen(now);
        return { open: false, reason, marketType: 'stock', nextOpen };
    }
    if (isUSHoliday(now)) {
        const nextOpen = getNextStockOpen(now);
        return { open: false, reason: 'US stock market closed — holiday', marketType: 'stock', nextOpen };
    }
    if (timeInMinutes < 14 * 60 + 30) {
        const nextOpen = new Date(now);
        nextOpen.setUTCHours(14, 30, 0, 0);
        return { open: false, reason: 'US stock market closed — opens 14:30 UTC', marketType: 'stock', nextOpen };
    }
    if (timeInMinutes >= 21 * 60) {
        const nextOpen = getNextStockOpen(now);
        return { open: false, reason: 'US stock market closed — after hours', marketType: 'stock', nextOpen };
    }
    return { open: true, reason: 'US stock market is open', marketType: 'stock', nextOpen: null };
}
function checkCommodityHours(now) {
    const day = now.getUTCDay();
    const hour = now.getUTCHours();
    const minute = now.getUTCMinutes();
    const timeInMinutes = hour * 60 + minute;
    if (day === 6) {
        const nextOpen = new Date(now);
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
        nextOpen.setUTCHours(23, 0, 0, 0);
        return { open: false, reason: 'Commodity market closed — weekend', marketType: 'commodity', nextOpen };
    }
    if (day === 0) {
        if (timeInMinutes < 23 * 60) {
            const nextOpen = new Date(now);
            nextOpen.setUTCHours(23, 0, 0, 0);
            return { open: false, reason: 'Commodity market closed — opens Sunday 23:00 UTC', marketType: 'commodity', nextOpen };
        }
        return { open: true, reason: 'Commodity market is open', marketType: 'commodity', nextOpen: null };
    }
    if (day === 5) {
        if (timeInMinutes >= 22 * 60) {
            const nextOpen = new Date(now);
            nextOpen.setUTCDate(nextOpen.getUTCDate() + 2);
            nextOpen.setUTCHours(23, 0, 0, 0);
            return { open: false, reason: 'Commodity market closed — closed Friday 22:00 UTC', marketType: 'commodity', nextOpen };
        }
        return { open: true, reason: 'Commodity market is open', marketType: 'commodity', nextOpen: null };
    }
    return { open: true, reason: 'Commodity market is open', marketType: 'commodity', nextOpen: null };
}
function getNextStockOpen(now) {
    const day = now.getUTCDay();
    const nextOpen = new Date(now);
    nextOpen.setUTCHours(14, 30, 0, 0);
    if (day === 6) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 2);
    }
    else if (day === 0) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
    }
    else if (day === 5) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 3);
    }
    else {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
    }
    let maxAttempts = 10;
    while (isUSHoliday(nextOpen) && maxAttempts > 0) {
        nextOpen.setUTCDate(nextOpen.getUTCDate() + 1);
        maxAttempts--;
    }
    return nextOpen;
}
function isUSHoliday(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    if (month === 1 && day === 1)
        return true;
    if (month === 7 && day === 4)
        return true;
    if (month === 12 && day === 25)
        return true;
    if (month === 11) {
        const thanksgiving = getNthWeekday(year, 10, 4, 4);
        if (day === thanksgiving)
            return true;
    }
    if (month === 1) {
        const mlkDay = getNthWeekday(year, 0, 1, 3);
        if (day === mlkDay)
            return true;
    }
    if (month === 2) {
        const presDay = getNthWeekday(year, 1, 1, 3);
        if (day === presDay)
            return true;
    }
    if (month === 5) {
        const memDay = getLastWeekday(year, 4, 1);
        if (day === memDay)
            return true;
    }
    if (month === 9) {
        const laborDay = getNthWeekday(year, 8, 1, 1);
        if (day === laborDay)
            return true;
    }
    return false;
}
function getNthWeekday(year, month, weekday, n) {
    const date = new Date(Date.UTC(year, month, 1));
    let count = 0;
    while (date.getUTCMonth() === month) {
        if (date.getUTCDay() === weekday) {
            count++;
            if (count === n)
                return date.getUTCDate();
        }
        date.setUTCDate(date.getUTCDate() + 1);
    }
    return -1;
}
function getLastWeekday(year, month, weekday) {
    const date = new Date(Date.UTC(year, month + 1, 0));
    while (date.getUTCMonth() === month) {
        if (date.getUTCDay() === weekday)
            return date.getUTCDate();
        date.setUTCDate(date.getUTCDate() - 1);
    }
    return -1;
}
//# sourceMappingURL=market-hours.util.js.map