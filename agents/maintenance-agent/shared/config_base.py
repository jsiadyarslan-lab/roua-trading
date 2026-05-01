"""
نمط إعدادات موحد لجميع وكلاء Roua Trading.
كل وكيل يرث من BaseConfig ويضيف إعداداته الخاصة.
"""

import os
from typing import Optional


class BaseConfig:
    """
    الإعدادات الأساسية المشتركة بين جميع الوكلاء.
    جميع القيم تُقرأ من متغيرات البيئة (Environment Variables).
    """

    # ── المنصة المستهدفة ──
    PLATFORM_URL: str = os.environ.get(
        "PLATFORM_URL",
        "https://roua-trading-production.up.railway.app"
    )

    # ── Telegram ──
    TELEGRAM_TOKEN: str = os.environ.get("TELEGRAM_TOKEN", "")
    TELEGRAM_CHAT_ID: str = os.environ.get("TELEGRAM_CHAT_ID", "")

    # ── GLM API ──
    GLM_API_KEY: str = os.environ.get("GLM_API_KEY", "")
    GLM_API_URL: str = os.environ.get(
        "GLM_API_URL",
        "https://open.bigmodel.cn/api/paas/v4/chat/completions"
    )
    GLM_MODEL: str = os.environ.get("GLM_MODEL", "glm-4-flash")

    # ── إعدادات عامة ──
    REQUEST_TIMEOUT: int = int(os.environ.get("REQUEST_TIMEOUT", "15"))
    LOG_LEVEL: str = os.environ.get("LOG_LEVEL", "INFO")

    # ── Redis (اختياري) ──
    REDIS_URL: str = os.environ.get("REDIS_URL", "")

    # ── قاعدة البيانات (اختياري) ──
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "")

    # ── اسم الوكيل (يُعاد تعريفه في كل وكيل) ──
    AGENT_NAME: str = "roua-agent"

    # ── منفذ فحص الصحة ──
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8080"))

    # ── ربط موقع الأخبار المالي ──
    NEWS_SITE_URL: str = os.environ.get("NEWS_SITE_URL", "")
    NEWS_API_KEY: str = os.environ.get("NEWS_API_KEY", "")
    CRON_SECRET: str = os.environ.get("CRON_SECRET", "")
    NEWS_ADMIN_SECRET: str = os.environ.get("NEWS_ADMIN_SECRET", "")

    def __repr__(self) -> str:
        safe_attrs = {}
        for key, value in self.__class__.__dict__.items():
            if key.startswith("_") or not value:
                continue
            val = value
            # إخفاء القيم الحساسة
            if any(s in key.upper() for s in ["TOKEN", "KEY", "PASSWORD", "SECRET", "URL"]):
                if isinstance(val, str) and len(val) > 8:
                    val = f"{val[:4]}...{val[-4:]}"
            safe_attrs[key] = val
        return f"{self.__class__.__name__}({safe_attrs})"
