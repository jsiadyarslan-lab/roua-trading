"""
وكيل مراقبة Roua Trading — أدوات الفحص والتنبيه
"""

import time
import json
import requests
from datetime import datetime, timezone

# واردات اختيارية — تعمل حتى لو لم تكن المكتبات مثبتة
try:
    import websocket
    _WS_AVAILABLE = True
except ImportError:
    _WS_AVAILABLE = False

try:
    import redis as redis_lib
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

try:
    import psycopg2
    _PSYCOPG2_AVAILABLE = True
except ImportError:
    _PSYCOPG2_AVAILABLE = False

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# سجل التنبيهات — يمنع إرسال نفس التنبيه مرتين خلال فترة التبريد
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_alert_timestamps: dict[str, float] = {}


def _should_alert(key: str, cooldown: int) -> bool:
    """يتحقق مما إذا كان يجب إرسال التنبيه (لم يُرسل خلال فترة التبريد)."""
    now = time.time()
    last = _alert_timestamps.get(key, 0)
    if now - last >= cooldown:
        _alert_timestamps[key] = now
        return True
    return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص الموقع الرئيسي
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_website_health(url: str, timeout: int = 15) -> dict:
    """
    يفحص حالة الموقع ويعيد قاموساً بالنتائج:
    - status_code: كود HTTP أو -1 عند الفشل
    - response_time: زمن الاستجابة بالمللي ثانية
    - ok: هل الاستجابة ناجحة؟
    - error: رسالة الخطأ إن وجدت
    """
    result = {"url": url, "status_code": -1, "response_time": 0, "ok": False, "error": None}
    try:
        start = time.monotonic()
        resp = requests.get(url, timeout=timeout, allow_redirects=True,
                           headers={"User-Agent": "RouaMonitor/1.0"})
        elapsed = (time.monotonic() - start) * 1000
        result["status_code"] = resp.status_code
        result["response_time"] = round(elapsed, 0)
        result["ok"] = resp.status_code < 500
        if resp.status_code >= 400:
            result["error"] = f"HTTP {resp.status_code}"
    except requests.exceptions.Timeout:
        result["error"] = "انتهت مهلة الطلب (Timeout)"
    except requests.exceptions.ConnectionError:
        result["error"] = "فشل الاتصال بالخادم (ConnectionError)"
    except Exception as e:
        result["error"] = str(e)
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص نقطة نهاية API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def query_api_endpoint(url: str, timeout: int = 15) -> dict:
    """
    يفحص نقطة نهاية API ويعيد القاموس مع البيانات إن أمكن.
    """
    result = {"url": url, "status_code": -1, "response_time": 0, "data": None, "ok": False, "error": None}
    try:
        start = time.monotonic()
        resp = requests.get(url, timeout=timeout,
                           headers={"User-Agent": "RouaMonitor/1.0", "Accept": "application/json"})
        elapsed = (time.monotonic() - start) * 1000
        result["status_code"] = resp.status_code
        result["response_time"] = round(elapsed, 0)

        if resp.status_code < 500:
            result["ok"] = True
            try:
                result["data"] = resp.json()
            except (json.JSONDecodeError, ValueError):
                result["data"] = resp.text[:200]
        else:
            result["error"] = f"HTTP {resp.status_code}"
            try:
                result["data"] = resp.json()
            except (json.JSONDecodeError, ValueError):
                pass
    except requests.exceptions.Timeout:
        result["error"] = "انتهت مهلة الطلب (Timeout)"
    except requests.exceptions.ConnectionError:
        result["error"] = "فشل الاتصال بالخادم (ConnectionError)"
    except Exception as e:
        result["error"] = str(e)
    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص حالة Railway
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_railway_status(platform_url: str, timeout: int = 15) -> dict:
    """
    يفحص مؤشرات تشغيل Railway عبر عدة اختبارات سريعة.
    """
    result = {"reachable": False, "ssl_valid": False, "response_time": 0, "error": None}

    # فحص إمكانية الوصول عبر HTTPS
    try:
        start = time.monotonic()
        resp = requests.get(platform_url, timeout=timeout, allow_redirects=True,
                           headers={"User-Agent": "RouaMonitor/1.0"})
        elapsed = (time.monotonic() - start) * 1000
        result["reachable"] = True
        result["response_time"] = round(elapsed, 0)
        result["ssl_valid"] = resp.url.startswith("https://")
    except requests.exceptions.SSLError:
        result["reachable"] = True
        result["error"] = "مشكلة في شهادة SSL"
    except requests.exceptions.ConnectionError:
        result["error"] = "الخادم غير متاح (ConnectionError)"
    except Exception as e:
        result["error"] = str(e)

    return result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إرسال تنبيه عبر Telegram
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def send_telegram_alert(message: str, token: str, chat_id: str, cooldown: int = 1800) -> bool:
    """
    يرسل رسالة تنبيه عبر Telegram.
    يستخدم نظام التبريد لمنع إرسال نفس التنبيه مراراً.
    """
    if not token or not chat_id:
        print("⚠️ تنبيه: TELEGRAM_TOKEN أو TELEGRAM_CHAT_ID غير مضبوط — تخطي الإرسال")
        return False

    # التحقق من التبريد
    alert_key = f"tg:{hash(message) % 10000}"
    if not _should_alert(alert_key, cooldown):
        print(f"⏳ تنبيه مكرر — تخطي الإرسال (فترة التبريد: {cooldown}ث)")
        return False

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        resp = requests.post(url, json=payload, timeout=10)
        if resp.status_code == 200:
            print("📲 تم إرسال تنبيه Telegram بنجاح")
            return True
        else:
            print(f"❌ فشل إرسال Telegram: HTTP {resp.status_code} — {resp.text[:200]}")
            return False
    except Exception as e:
        print(f"❌ فشل إرسال Telegram: {e}")
        return False


def format_alert_message(title: str, details: list[str], analysis: str) -> str:
    """
    ينسّق رسالة التنبيه بشكل احترافي لـ Telegram.
    """
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    details_text = "\n".join(f"  • {d}" for d in details)
    msg = f"""🚨 <b>Roua Trading Monitor</b>

<b>{title}</b>

{details_text}

<b>تحليل GLM-5.1:</b>
{analysis}

🕐 {now}"""
    return msg


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص WebSocket
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_websocket_health(url: str, timeout: int = 10) -> bool:
    """
    يحاول الاتصال بـ WebSocket.
    يعيد True إذا نجح الاتصال، False إذا فشل.
    """
    if not _WS_AVAILABLE:
        print("⚠️ مكتبة websocket-client غير مثبتة — تخطي فحص WebSocket")
        return False

    try:
        ws = websocket.create_connection(url, timeout=timeout)
        ws.close()
        return True
    except Exception as e:
        print(f"❌ فشل اتصال WebSocket ({url}): {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص Redis
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_redis_connection(redis_url: str, timeout: int = 5) -> bool:
    """
    يحاول الاتصال بـ Redis.
    يعيد True إذا نجح الاتصال، False إذا فشل.
    """
    if not _REDIS_AVAILABLE:
        print("⚠️ مكتبة redis غير مثبتة — تخطي فحص Redis")
        return False

    try:
        client = redis_lib.from_url(redis_url, socket_timeout=timeout, socket_connect_timeout=timeout)
        result = client.ping()
        client.close()
        return result
    except Exception as e:
        print(f"❌ فشل اتصال Redis ({redis_url.split('@')[-1] if '@' in redis_url else redis_url}): {e}")
        return False


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص قاعدة البيانات
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_database_connection(db_url: str, timeout: int = 10) -> bool:
    """
    ينفذ استعلام SELECT 1 للتحقق من اتصال قاعدة البيانات.
    يعيد True إذا نجح، False إذا فشل.
    """
    if not _PSYCOPG2_AVAILABLE:
        print("⚠️ مكتبة psycopg2 غير مثبتة — تخطي فحص قاعدة البيانات")
        return False

    conn = None
    try:
        conn = psycopg2.connect(db_url, connect_timeout=timeout)
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.fetchone()
        cursor.close()
        return True
    except Exception as e:
        # إخفاء كلمة المرور من رسالة الخطأ
        safe_url = db_url.split('@')[-1] if '@' in db_url else db_url
        print(f"❌ فشل اتصال قاعدة البيانات ({safe_url}): {e}")
        return False
    finally:
        if conn is not None:
            try:
                conn.close()
            except Exception:
                pass
