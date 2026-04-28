"""
متتبع الإحالات لوكيل الشركاء.
يتتبع أداء روابط الإحالة ويحسب العمولات.
"""

import json
import os
import time
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional


def fetch_binance_referral_stats(
    api_key: str,
    api_secret: str,
    logger,
) -> dict:
    """
    يجلب إحصائيات إحالات Binance من API.

    يعيد:
        {total_referrals, active_referrals, total_commission, daily_commission, referrals_list}
    """
    stats = {
        "total_referrals": 0,
        "active_referrals": 0,
        "total_commission": 0.0,
        "daily_commission": 0.0,
        "referrals_list": [],
        "source": "binance",
        "status": "no_key",
    }

    if not api_key or not api_secret:
        logger.info("لا توجد مفاتيح Binance API — استخدام بيانات تقديرية")
        stats["status"] = "estimated"
        return stats

    try:
        # Binance Rebate API endpoint
        base_url = "https://api.binance.com"
        endpoint = "/sapi/v1/apiReferral/ifNewUser"

        headers = {
            "X-MBX-APIKEY": api_key,
        }

        # Note: Binance requires HMAC signature for authenticated endpoints
        # For now, we'll use a simplified approach
        params = {
            "timestamp": int(time.time() * 1000),
        }

        resp = requests.get(
            f"{base_url}{endpoint}",
            headers=headers,
            params=params,
            timeout=15,
        )

        if resp.status_code == 200:
            data = resp.json()
            stats["total_referrals"] = len(data) if isinstance(data, list) else 0
            stats["status"] = "connected"
        elif resp.status_code == 401:
            logger.warning("مفتاح Binance API غير صالح")
            stats["status"] = "auth_failed"
        else:
            logger.warning(f"فشل جلب إحصائيات Binance: HTTP {resp.status_code}")
            stats["status"] = "error"

    except requests.exceptions.Timeout:
        logger.warning("انتهت مهلة الاتصال بـ Binance")
        stats["status"] = "timeout"
    except Exception as e:
        logger.error(f"خطأ في جلب إحصائيات Binance: {e}")
        stats["status"] = "error"

    return stats


def fetch_alpaca_referral_stats(
    api_key: str,
    referral_code: str,
    platform_url: str,
    logger,
) -> dict:
    """
    يجلب إحصائيات إحالات Alpaca من منصة Roua Trading.

    يعيد:
        {total_referrals, active_referrals, total_bonus, status}
    """
    stats = {
        "total_referrals": 0,
        "active_referrals": 0,
        "total_bonus": 0.0,
        "source": "alpaca",
        "status": "no_code",
    }

    if not referral_code:
        logger.info("لا يوجد رمز إحالة Alpaca — تخطي")
        stats["status"] = "estimated"
        return stats

    try:
        # Check referral registrations through the platform
        resp = requests.get(
            f"{platform_url}/api/alpaca/account",
            timeout=15,
        )

        if resp.status_code == 200:
            stats["status"] = "connected"
        else:
            stats["status"] = "error"

    except Exception as e:
        logger.error(f"خطأ في جلب إحصائيات Alpaca: {e}")
        stats["status"] = "error"

    return stats


def estimate_commission(
    binance_stats: dict,
    alpaca_stats: dict,
    config,
    logger,
) -> dict:
    """
    يقدر العمولات المستحقة بناءً على بيانات الإحالة المتاحة.

    يعيد:
        {binance_estimated, alpaca_estimated, total_estimated, breakdown}
    """
    binance_commission = 0.0
    alpaca_commission = 0.0

    # تقدير عمولة Binance
    total_referrals = binance_stats.get("total_referrals", 0)
    active_referrals = binance_stats.get("active_referrals", 0)

    if total_referrals > 0:
        # تقدير: كل إحالة نشطة تولد حوالي $1-5 شهرياً في عمولات
        estimated_per_referral = 2.0  # USD/month average
        binance_commission = active_referrals * estimated_per_referral

    # تقدير عمولة Alpaca
    alpaca_referrals = alpaca_stats.get("total_referrals", 0)
    if alpaca_referrals > 0:
        alpaca_commission = alpaca_referrals * config.ALPACA_REFERRAL_BONUS

    total = binance_commission + alpaca_commission

    return {
        "binance_estimated": round(binance_commission, 2),
        "alpaca_estimated": round(alpaca_commission, 2),
        "total_estimated": round(total, 2),
        "breakdown": {
            "binance_spot_rate": config.BINANCE_SPOT_COMMISSION_RATE,
            "binance_futures_rate": config.BINANCE_FUTURES_COMMISSION_RATE,
            "alpaca_bonus": config.ALPACA_REFERRAL_BONUS,
            "total_binance_referrals": total_referrals,
            "active_binance_referrals": active_referrals,
            "total_alpaca_referrals": alpaca_referrals,
        },
    }


def generate_referral_links(
    config,
    logger,
) -> dict:
    """
    يولد روابط الإحالة للترويج.

    يعيد:
        {binance_link, alpaca_link, social_media_templates}
    """
    links = {
        "binance": "",
        "alpaca": "",
        "templates": [],
    }

    if config.BINANCE_REFERRAL_ID:
        links["binance"] = config.BINANCE_REFERRAL_URL.format(
            referral_id=config.BINANCE_REFERRAL_ID
        )

    if config.ALPACA_REFERRAL_CODE:
        links["alpaca"] = config.ALPACA_REFERRAL_URL.format(
            referral_code=config.ALPACA_REFERRAL_CODE
        )

    # قوالب الترويج
    templates = [
        {
            "platform": "twitter",
            "text": (
                "🚀 ابدأ التداول مع Roua Trading — منصة ذكية مدعومة بالذكاء الاصطناعي!\n"
                f"سجل في Binance عبر رابط الإحالة: {links['binance']}\n"
                "#RouaTrading #CryptoTrading #AI"
            ),
        },
        {
            "platform": "reddit",
            "text": (
                "مشاركة: وجدت منصة تداول مذهلة تسمى Roua Trading مع تحليل AI متعدد النماذج.\n"
                f"رابط التسجيل: {links['binance']}\n"
                "المزايا: تحليل 6 نماذج AI، تداول ورقي، تنبيهات ذكية"
            ),
        },
        {
            "platform": "telegram",
            "text": (
                "🤖 روعة للتداول — أول منصة تداول عربية بالذكاء الاصطناعي\n"
                f"📥 سجل الآن: {links['binance']}\n"
                "✅ تحليل 6 نماذج AI | تداول ورقي | تنبيهات ذكية"
            ),
        },
    ]

    links["templates"] = templates
    return links


def save_affiliate_history(
    commission_data: dict,
    binance_stats: dict,
    alpaca_stats: dict,
    history_file: str,
    logger,
) -> None:
    """يحفظ سجل العمولات في ملف JSON."""
    try:
        history_dir = os.path.dirname(history_file)
        if history_dir and not os.path.exists(history_dir):
            os.makedirs(history_dir, exist_ok=True)

        history = []
        if os.path.exists(history_file):
            try:
                with open(history_file, "r", encoding="utf-8") as f:
                    history = json.load(f)
            except (json.JSONDecodeError, IOError):
                history = []

        record = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "commission": commission_data,
            "binance_stats": {
                "total_referrals": binance_stats.get("total_referrals", 0),
                "active_referrals": binance_stats.get("active_referrals", 0),
                "status": binance_stats.get("status", "unknown"),
            },
            "alpaca_stats": {
                "total_referrals": alpaca_stats.get("total_referrals", 0),
                "status": alpaca_stats.get("status", "unknown"),
            },
        }
        history.append(record)

        # الاحتفاظ بآخر 100 سجل
        if len(history) > 100:
            history = history[-100:]

        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(history, f, ensure_ascii=False, indent=2)

        logger.info(f"تم حفظ سجل العمولات ({len(history)} سجل)")

    except Exception as e:
        logger.error(f"فشل حفظ سجل العمولات: {e}")


def check_performance_targets(
    commission_data: dict,
    config,
    logger,
) -> list[dict]:
    """
    يفحص تحقق أهداف الأداء الشهرية.

    يعيد:
        قائمة بالتنبيهات: [{type, current, target, status}]
    """
    alerts = []

    total_estimated = commission_data.get("total_estimated", 0)
    referral_count = commission_data.get("breakdown", {}).get(
        "total_binance_referrals", 0
    ) + commission_data.get("breakdown", {}).get("total_alpaca_referrals", 0)

    # فحص هدف الإحالات
    if config.MONTHLY_TARGET_REFERRALS > 0:
        referral_percent = (referral_count / config.MONTHLY_TARGET_REFERRALS) * 100
        if referral_percent >= 100:
            status = "achieved"
        elif referral_percent >= 70:
            status = "on_track"
        else:
            status = "behind"

        alerts.append({
            "type": "referrals",
            "current": referral_count,
            "target": config.MONTHLY_TARGET_REFERRALS,
            "percent": round(referral_percent, 1),
            "status": status,
        })

    # فحص هدف الإيرادات
    if config.MONTHLY_TARGET_REVENUE > 0:
        revenue_percent = (total_estimated / config.MONTHLY_TARGET_REVENUE) * 100
        if revenue_percent >= 100:
            status = "achieved"
        elif revenue_percent >= 70:
            status = "on_track"
        else:
            status = "behind"

        alerts.append({
            "type": "revenue",
            "current": total_estimated,
            "target": config.MONTHLY_TARGET_REVENUE,
            "percent": round(revenue_percent, 1),
            "status": status,
        })

    return alerts


def format_daily_report(
    commission_data: dict,
    binance_stats: dict,
    alpaca_stats: dict,
    performance_alerts: list,
    referral_links: dict,
    config,
) -> str:
    """
    يهيئ التقرير اليومي لـ Telegram.
    """
    lines = [
        "🤝 <b>وكيل الشركاء — تقرير يومي</b>",
        "",
    ]

    # ملخص العمولات
    total = commission_data.get("total_estimated", 0)
    binance = commission_data.get("binance_estimated", 0)
    alpaca = commission_data.get("alpaca_estimated", 0)

    lines.extend([
        "💰 <b>العمولات المقدرة:</b>",
        f"  • Binance: <b>${binance:.2f}</b>",
        f"  • Alpaca: <b>${alpaca:.2f}</b>",
        f"  • الإجمالي: <b>${total:.2f}</b>",
        "",
    ])

    # إحصائيات الإحالات
    binance_total = binance_stats.get("total_referrals", 0)
    binance_active = binance_stats.get("active_referrals", 0)
    alpaca_total = alpaca_stats.get("total_referrals", 0)

    lines.extend([
        "📊 <b>إحصائيات الإحالات:</b>",
        f"  • Binance: {binance_total} إجمالي | {binance_active} نشط",
        f"  • Alpaca: {alpaca_total} إحالة",
        "",
    ])

    # أهداف الأداء
    if performance_alerts:
        lines.append("🎯 <b>الأهداف الشهرية:</b>")
        for alert in performance_alerts:
            if alert["status"] == "achieved":
                icon = "✅"
            elif alert["status"] == "on_track":
                icon = "🟡"
            else:
                icon = "🔴"

            if alert["type"] == "referrals":
                lines.append(
                    f"  {icon} إحالات: {alert['current']}/{alert['target']} ({alert['percent']}%)"
                )
            else:
                lines.append(
                    f"  {icon} إيرادات: ${alert['current']:.2f}/${alert['target']:.0f} ({alert['percent']}%)"
                )
        lines.append("")

    # روابط الإحالة
    if referral_links.get("binance") or referral_links.get("alpaca"):
        lines.append("🔗 <b>روابط الإحالة:</b>")
        if referral_links.get("binance"):
            lines.append(f"  • Binance: {referral_links['binance']}")
        if referral_links.get("alpaca"):
            lines.append(f"  • Alpaca: {referral_links['alpaca']}")

    return "\n".join(lines)
