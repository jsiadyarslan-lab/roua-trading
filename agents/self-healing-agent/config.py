"""
وكيل الإصلاح الذاتي لمنصة Roua Trading — الإعدادات
جميع القيم تُقرأ من متغيرات البيئة (Environment Variables)
للتشغيل الآمن على Railway دون تعريض المفاتيح في الكود.
"""

import os

# ── GLM-5.1 API ──
GLM_API_KEY = os.environ.get("GLM_API_KEY", "")
GLM_API_URL = os.environ.get(
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

# ── GitHub ──
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "jsiadyarslan-lab/roua-trading")
GITHUB_DEFAULT_BRANCH = os.environ.get("GITHUB_DEFAULT_BRANCH", "main")

# ── Railway API ──
RAILWAY_API_TOKEN = os.environ.get("RAILWAY_API_TOKEN", "")
RAILWAY_PROJECT_ID = os.environ.get("RAILWAY_PROJECT_ID", "")
RAILWAY_ENVIRONMENT_ID = os.environ.get("RAILWAY_ENVIRONMENT_ID", "")
RAILWAY_SERVICE_ID = os.environ.get("RAILWAY_SERVICE_ID", "")  # معرف خدمة المنصة الرئيسية

# ── إعدادات الفحص ──
CHECK_INTERVAL = int(os.environ.get("CHECK_INTERVAL", "60"))  # كل 60 ثانية
REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "15"))  # ثواني

# ── عتبات التنبيه ──
ALERT_COOLDOWN = int(os.environ.get("ALERT_COOLDOWN", "1800"))  # 30 دقيقة
MAX_CONSECUTIVE_FAILURES = int(os.environ.get("MAX_CONSECUTIVE_FAILURES", "2"))

# ── نقاط الفحص ──
HEALTH_ENDPOINTS = [
    {"name": "لوحة التحكم",   "path": "/dashboard",                   "method": "GET",  "expect_status": [200, 307]},
    {"name": "API الأسعار",    "path": "/api/exchange/quote/AAPL",     "method": "GET",  "expect_status": 200},
    {"name": "API السكانر",    "path": "/api/scanner/scan?timeframe=1h","method": "GET",  "expect_status": 200},
    {"name": "API الإشارات",   "path": "/api/signals/smart",           "method": "GET",  "expect_status": 200},
    {"name": "API المحفظة",    "path": "/api/portfolio/summary",       "method": "GET",  "expect_status": [200, 401, 404]},
    {"name": "API الصحة",      "path": "/api/health",                  "method": "GET",  "expect_status": 200},
    {"name": "API التداول",    "path": "/api/trading/positions",       "method": "GET",  "expect_status": [200, 401]},
    {"name": "API البوت",      "path": "/api/bot/settings",            "method": "GET",  "expect_status": [200, 401]},
]

# ── إعدادات الإصلاح ──
MAX_FIX_ATTEMPTS_PER_ERROR = int(os.environ.get("MAX_FIX_ATTEMPTS_PER_ERROR", "3"))  # حد المحاولات لكل خطأ
FIX_COOLDOWN = int(os.environ.get("FIX_COOLDOWN", "3600"))  # ساعة بين محاولات إصلاح نفس الخطأ

# ── إعدادات الأمان ──
# أنواع الأخطاء المسموح بإصلاحها تلقائياً
ALLOWED_FIX_SCOPES = os.environ.get(
    "ALLOWED_FIX_SCOPES",
    "typescript_error,api_error,missing_import,type_mismatch,undefined_reference"
).split(",")

# أنواع الأخطاء المحظور لمسها أبداً
FORBIDDEN_SCOPES = os.environ.get(
    "FORBIDDEN_SCOPES",
    "trading_logic,security,risk_management,order_execution,position_management"
).split(",")

# ── Redis ──
REDIS_URL = os.environ.get("REDIS_URL", "")

# ── قاعدة البيانات ──
DATABASE_URL = os.environ.get("DATABASE_URL", "")

# ── منفذ فحص الصحة ──
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8081"))
