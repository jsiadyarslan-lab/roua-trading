"""
جالب بيانات السوق لوكيل المحتوى.
يجلب بيانات الأسعار من منصة روعة ويهيئها للتحليل.
"""

import requests
from typing import Optional


def fetch_market_data(
    platform_url: str,
    symbols: list[str],
    logger,
) -> dict[str, dict]:
    """
    يجلب بيانات الأسعار لكل رمز من المنصة.

    المعاملات:
        platform_url: رابط المنصة الأساسي
        symbols: قائمة الرموز مثل ["BTC-USD", "ETH-USD", "AAPL"]
        logger: مسجل ColoredLogger

    يعيد:
        قاموس: رمز → {price, change, change_percent, volume, high, low}
    """
    results: dict[str, dict] = {}

    for symbol in symbols:
        try:
            url = f"{platform_url.rstrip('/')}/api/exchange/quote/{symbol}"
            resp = requests.get(url, timeout=15)

            if resp.status_code == 200:
                data = resp.json()
                quote = data if isinstance(data, dict) else {}

                results[symbol] = {
                    "price": _safe_float(quote.get("price") or quote.get("c")),
                    "change": _safe_float(quote.get("change") or quote.get("d")),
                    "change_percent": _safe_float(
                        quote.get("change_percent")
                        or quote.get("dp")
                        or quote.get("changePercent")
                    ),
                    "volume": _safe_float(quote.get("volume") or quote.get("v")),
                    "high": _safe_float(quote.get("high") or quote.get("h")),
                    "low": _safe_float(quote.get("low") or quote.get("l")),
                }
                logger.info(
                    f"تم جلب بيانات {symbol}: "
                    f"السعر={results[symbol]['price']} "
                    f"التغير={results[symbol]['change_percent']}%"
                )
            else:
                logger.warning(
                    f"فشل جلب بيانات {symbol}: HTTP {resp.status_code}"
                )
                results[symbol] = _empty_quote()

        except requests.exceptions.Timeout:
            logger.error(f"انتهت مهلة جلب بيانات {symbol}")
            results[symbol] = _empty_quote()
        except requests.exceptions.ConnectionError:
            logger.error(f"فشل الاتصال بالمنصة لجلب {symbol}")
            results[symbol] = _empty_quote()
        except Exception as e:
            logger.error(f"خطأ غير متوقع عند جلب {symbol}: {e}")
            results[symbol] = _empty_quote()

    return results


def format_market_summary(data: dict[str, dict]) -> str:
    """
    يهيئ بيانات السوق في ملخص نصي مختصر لإدخالها في طلب الذكاء الاصطناعي.

    المعاملات:
        data: قاموس بيانات السوق من fetch_market_data

    يعيد:
        نص ملخص السوق
    """
    lines = []

    for symbol, quote in data.items():
        price = quote.get("price", 0)
        change_pct = quote.get("change_percent", 0)
        change_abs = quote.get("change", 0)
        volume = quote.get("volume", 0)
        high = quote.get("high", 0)
        low = quote.get("low", 0)

        direction = "▲" if change_pct >= 0 else "▼"

        line = (
            f"{symbol}: ${_fmt(price)} | "
            f"Change: {direction}{_fmt(abs(change_pct))}% ({_fmt_sign(change_abs)}) | "
            f"Vol: {_fmt_vol(volume)} | "
            f"H: ${_fmt(high)} L: ${_fmt(low)}"
        )
        lines.append(line)

    return "\n".join(lines)


def _safe_float(value) -> float:
    """يحول القيمة إلى رقم عشري بأمان."""
    if value is None:
        return 0.0
    try:
        result = float(value)
        if result != result:  # NaN check
            return 0.0
        return result
    except (ValueError, TypeError):
        return 0.0


def _empty_quote() -> dict:
    """يعيد قاموس بيانات فارغ لرمز فاشل."""
    return {
        "price": 0.0,
        "change": 0.0,
        "change_percent": 0.0,
        "volume": 0.0,
        "high": 0.0,
        "low": 0.0,
    }


def _fmt(value: float) -> str:
    """يهيئ رقماً عشرياً للعرض."""
    if abs(value) >= 1000:
        return f"{value:,.2f}"
    elif abs(value) >= 1:
        return f"{value:.2f}"
    else:
        return f"{value:.4f}"


def _fmt_sign(value: float) -> str:
    """يهيئ رقماً مع إشارة + أو -."""
    if value >= 0:
        return f"+{_fmt(value)}"
    return _fmt(value)


def _fmt_vol(value: float) -> str:
    """يهيئ حجم التداول بشكل مختصر."""
    if value >= 1_000_000_000:
        return f"{value / 1_000_000_000:.1f}B"
    elif value >= 1_000_000:
        return f"{value / 1_000_000:.1f}M"
    elif value >= 1_000:
        return f"{value / 1_000:.1f}K"
    else:
        return f"{value:.0f}"
