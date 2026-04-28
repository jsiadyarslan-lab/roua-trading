"""إعدادات وكيل التنبيهات لمنصة روعة التجارية."""

import os
import sys

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.config_base import BaseConfig


class AlertConfig(BaseConfig):
    """إعدادات وكيل التنبيهات — يرث الإعدادات المشتركة ويضيف إعدادات خاصة."""

    AGENT_NAME: str = "alert-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8085"))

    # ── فترة فحص التنبيهات ──
    ALERT_CHECK_INTERVAL: int = int(
        os.environ.get("ALERT_CHECK_INTERVAL", "30")  # 30 ثانية
    )

    # ── إعدادات إعادة المحاولة ──
    MAX_RETRIES: int = int(os.environ.get("MAX_RETRIES", "3"))
    RETRY_DELAY: int = int(os.environ.get("RETRY_DELAY", "5"))  # ثوانٍ

    # ── إعدادات البريد الإلكتروني (اختياري) ──
    SMTP_HOST: str = os.environ.get("SMTP_HOST", "")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER: str = os.environ.get("SMTP_USER", "")
    SMTP_PASS: str = os.environ.get("SMTP_PASS", "")
    EMAIL_FROM: str = os.environ.get("EMAIL_FROM", "alerts@roua-trading.com")
