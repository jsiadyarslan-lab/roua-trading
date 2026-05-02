"""
وحدة فحص الأسعار لوكيل التنبيهات.
تجلب الأسعار الحالية من منصة روعة التجارية وتقيم شروط التنبيهات.
"""

import requests
from typing import Optional


def get_current_price(
    platform_url: str, symbol: str, logger
) -> Optional[float]:
    """
    يجلب السعر الحالي لرمز معين من المنصة.

    المعاملات:
        platform_url: رابط المنصة الأساسي
        symbol: رمز الأصل المالي (مثال: "BTC-USD", "AAPL")
        logger: مسجل الأحداث

    يعيد:
        السعر كعدد عشري، أو None في حالة الفشل
    """
    # بناء الرابط — المنصة تستخدم catch-all route:
    #   /api/exchange/quote/BTC/USDT  (للأزواج)
    #   /api/exchange/quote/AAPL      (للأسهم)
    url = f"{platform_url.rstrip('/')}/api/exchange/quote/{symbol}"

    try:
        response = requests.get(url, timeout=15)
        if response.status_code != 200:
            logger.warning(
                f"فشل جلب سعر {symbol}: HTTP {response.status_code}"
            )
            return None

        raw = response.json()

        # المنصة تُعيد: { "success": true, "data": { ... } }
        data = raw.get("data", raw) if isinstance(raw, dict) else raw

        # محاولة استخراج السعر من عدة حقول محتملة
        price = None
        if isinstance(data, dict):
            for key in ("price", "currentPrice", "lastPrice", "close", "c"):
                if key in data and data[key]:
                    price = data[key]
                    break

        if price is None:
            logger.warning(
                f"لم يتم العثور على السعر في استجابة {symbol}: {list(data.keys())}"
            )
            return None

        return float(price)

    except requests.exceptions.Timeout:
        logger.error(f"انتهت مهلة جلب سعر {symbol}")
        return None
    except requests.exceptions.ConnectionError:
        logger.error(f"فشل الاتصال بالمنصة لجلب سعر {symbol}")
        return None
    except (ValueError, TypeError) as e:
        logger.error(f"خطأ في تحليل سعر {symbol}: {e}")
        return None
    except Exception as e:
        logger.error(f"خطأ غير متوقع عند جلب سعر {symbol}: {e}")
        return None


def check_alert_condition(alert: dict, current_price: float) -> bool:
    """
    يقيّم شرط التنبيه مقابل السعر الحالي.

    المعاملات:
        alert: قاموس التنبيه يحتوي على:
            - id: معرّف التنبيه
            - userId: معرّف المستخدم
            - symbol: رمز الأصل المالي
            - condition: نوع الشرط (above, below, crosses_up, crosses_down)
            - targetPrice: السعر المستهدف
            - isActive: هل التنبيه نشط
        current_price: السعر الحالي

    يعيد:
        True إذا تحقق الشرط، False إذا لم يتحقق
    """
    condition = alert.get("condition", "").lower()
    target_price = float(alert.get("targetPrice", 0))

    if condition == "above":
        return current_price > target_price
    elif condition == "below":
        return current_price < target_price
    elif condition == "crosses_up":
        return current_price >= target_price
    elif condition == "crosses_down":
        return current_price <= target_price
    else:
        return False


def batch_check_prices(
    platform_url: str, symbols: list[str], logger
) -> dict[str, Optional[float]]:
    """
    يجلب أسعار عدة رموز دفعة واحدة بشكل متوازي.

    المعاملات:
        platform_url: رابط المنصة الأساسي
        symbols: قائمة الرموز المطلوب جلب أسعارها
        logger: مسجل الأحداث

    يعيد:
        قاموس من الرمز إلى السعر (أو None إذا فشل الجلب)
    """
    import concurrent.futures

    results: dict[str, Optional[float]] = {}

    if not symbols:
        return results

    # استخدام الترابط المتوازي لجلب الأسعار بكفاءة
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        future_to_symbol = {
            executor.submit(get_current_price, platform_url, symbol, logger): symbol
            for symbol in symbols
        }

        for future in concurrent.futures.as_completed(future_to_symbol):
            symbol = future_to_symbol[future]
            try:
                price = future.result()
                results[symbol] = price
                if price is not None:
                    logger.debug(f"سعر {symbol}: {price}")
                else:
                    logger.warning(f"تعذر جلب سعر {symbol}")
            except Exception as e:
                logger.error(f"خطأ في جلب سعر {symbol}: {e}")
                results[symbol] = None

    successful = sum(1 for p in results.values() if p is not None)
    logger.info(
        f"تم جلب أسعار {successful}/{len(symbols)} رمز بنجاح"
    )

    return results
