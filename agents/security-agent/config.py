"""إعدادات وكيل الأمان لمنصة روعة التجارية."""

import os
import sys

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig


class SecurityConfig(BaseConfig):
    """إعدادات وكيل الأمان — يرث الإعدادات المشتركة ويضيف إعدادات خاصة."""

    AGENT_NAME: str = "security-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8081"))

    # ── فترات الفحص ──
    SECURITY_CHECK_INTERVAL: int = int(
        os.environ.get("SECURITY_CHECK_INTERVAL", "21600")  # 6 ساعات
    )
    FULL_SCAN_INTERVAL: int = int(
        os.environ.get("FULL_SCAN_INTERVAL", "86400")  # 24 ساعة
    )

    # ── عتبات التنبيه ──
    CRITICAL_ALERT_COOLDOWN: int = int(
        os.environ.get("CRITICAL_ALERT_COOLDOWN", "3600")  # ساعة واحدة
    )
    WARNING_ALERT_COOLDOWN: int = int(
        os.environ.get("WARNING_ALERT_COOLDOWN", "7200")  # ساعتان
    )

    # ── ربط موقع الأخبار المالي ──
    NEWS_SITE_URL: str = os.environ.get("NEWS_SITE_URL", "")  # https://rouatradingnews-production.up.railway.app
    NEWS_API_KEY: str = os.environ.get("NEWS_API_KEY", "")
