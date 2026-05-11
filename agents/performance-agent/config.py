"""إعدادات وكيل الأداء لمنصة روعة التجارية."""

import os
import sys

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig


class PerformanceConfig(BaseConfig):
    """إعدادات وكيل الأداء — يرث الإعدادات المشتركة ويضيف إعدادات خاصة."""

    AGENT_NAME: str = "performance-agent"
    HEALTH_PORT: int = int(os.environ.get("HEALTH_PORT", "8083"))

    # ── فترات الفحص ──
    METRICS_COLLECTION_INTERVAL: int = int(
        os.environ.get("METRICS_COLLECTION_INTERVAL", "3600")  # ساعة واحدة
    )
    REPORT_INTERVAL: int = int(
        os.environ.get("REPORT_INTERVAL", "604800")  # 7 أيام (تقرير أسبوعي)
    )

    # ── عتبات التنبيه ──
    SLOW_THRESHOLD_MS: int = int(
        os.environ.get("SLOW_THRESHOLD_MS", "5000")  # 5 ثوانٍ
    )
    DEGRADATION_PCT: int = int(
        os.environ.get("DEGRADATION_PCT", "30")  # زيادة 30% = تنبيه
    )
    P95_THRESHOLD_MS: int = int(
        os.environ.get("P95_THRESHOLD_MS", "10000")  # P95 فوق 10 ثوانٍ = تنبيه
    )

    # ── نقاط النهاية المراقبة ──
    PERF_ENDPOINTS = [
        {"name": "لوحة التحكم", "path": "/dashboard"},
        {"name": "API الأسعار", "path": "/api/exchange/quote/AAPL"},
        {"name": "API السكانر", "path": "/api/scanner/scan?timeframe=1h"},
        {"name": "API الإشارات", "path": "/api/signals/smart"},
        {"name": "API المحفظة", "path": "/api/portfolio/summary"},
        {"name": "API الصحة", "path": "/api/health"},
        {"name": "API الأخبار", "path": "/api/news/feed"},
        {"name": "صفحة الدخول", "path": "/dashboard/admin/login"},
        {"name": "API AI", "path": "/api/ai/status"},
        {"name": "API التداول", "path": "/api/trading/positions/summary"},  # FIX: Was /api/trading/account which doesn't exist in NestJS — caused 10s 404 retry loop
    ]

    # ── ربط موقع الأخبار المالي ──
    NEWS_SITE_URL: str = os.environ.get("NEWS_SITE_URL", "")  # https://rouatradingnews-production.up.railway.app
    NEWS_API_KEY: str = os.environ.get("NEWS_API_KEY", "")
