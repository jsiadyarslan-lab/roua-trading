"""
وكيل مراقبة Roua Trading — الإعدادات
جميع القيم تُقرأ من متغيرات البيئة (Environment Variables)
للتشغيل الآمن على Railway دون تعريض المفاتيح في الكود.
"""

import os

# ── GLM-5.1 API ──
API_KEY = os.environ.get("GLM_API_KEY", "")
API_URL = os.environ.get(
    "GLM_API_URL",
    "https://open.bigmodel.cn/api/paas/v4/chat/completions"
)
GLM_MODEL = os.environ.get("GLM_MODEL", "glm-4-flash")

# ── المنصة المستهدفة ──
PLATFORM_URL = os.environ.get(
    "PLATFORM_URL",
    "https://roua-trading-production.up.railway.app"
)

# ── Telegram ──
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

# ── إعدادات الفحص ──
CHECK_INTERVAL = int(os.environ.get("CHECK_INTERVAL", "300"))  # 5 دقائق افتراضياً
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "15"))  # ثواني

# ── عتبات التنبيه ──
ALERT_COOLDOWN = int(os.environ.get("ALERT_COOLDOWN", "1800"))  # 30 دقيقة بين التنبيهات المتكررة
MAX_CONSECUTIVE_FAILURES = int(os.environ.get("MAX_CONSECUTIVE_FAILURES", "2"))

# ── نقاط الفحص (مسارات API والصفحات) ──
HEALTH_ENDPOINTS = [
    {"name": "لوحة التحكم",   "path": "/dashboard",                   "method": "GET",  "expect_status": 200},
    {"name": "API الأسعار",    "path": "/api/exchange/quote/AAPL",     "method": "GET",  "expect_status": 200},
    {"name": "API السكانر",    "path": "/api/scanner/scan?timeframe=1h","method": "GET",  "expect_status": 200},
    {"name": "API الإشارات",   "path": "/api/signals/smart",           "method": "GET",  "expect_status": 200},
    {"name": "API المحفظة",    "path": "/api/portfolio/summary",       "method": "GET",  "expect_status": [200, 401, 404]},
    {"name": "API الصحة",      "path": "/api/health",                  "method": "GET",  "expect_status": 200},
]

# ── فحص التبعيات ──
REDIS_URL = os.environ.get("REDIS_URL", "")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
TWELVE_DATA_API_KEY = os.environ.get("TWELVE_DATA_API_KEY", "")
WEBSOCKET_URL = os.environ.get("WEBSOCKET_URL", "")

# ── فترات الفحص المتقدمة ──
DEPENDENCY_CHECK_INTERVAL = int(os.environ.get("DEPENDENCY_CHECK_INTERVAL", "300"))  # 5 دقائق
DAILY_SUMMARY_INTERVAL = int(os.environ.get("DAILY_SUMMARY_INTERVAL", "86400"))     # 24 ساعة
