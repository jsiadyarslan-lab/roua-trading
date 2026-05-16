"""
وكيل الإصلاح الذاتي — مراقب نقاط النهاية
يفحص جميع نقاط نهاية المنصة ويعيد كود الحالة والتفاصيل.
يُعيد قائمة بالأخطاء المكتشفة مع تصنيفها.
"""

import time
import json
import requests
from datetime import datetime, timezone
from typing import Optional

from config import (
    PLATFORM_URL, HEALTH_ENDPOINTS, REQUEST_TIMEOUT,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# أنواع الأخطاء
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
class ErrorType:
    """تصنيف أنواع الأخطاء المكتشفة."""
    TYPE_ERROR = "typescript_error"        # خطأ TypeScript
    API_ERROR = "api_error"                # خطأ API (5xx)
    TIMEOUT = "timeout_error"              # انتهاء المهلة
    CONNECTION = "connection_error"        # فشل الاتصال
    AUTH_ERROR = "auth_error"              # خطأ مصادقة (401/403)
    NOT_FOUND = "not_found_error"          # غير موجود (404)
    RATE_LIMIT = "rate_limit_error"        # تجاوز الحد (429)
    UNKNOWN = "unknown_error"              # غير معروف


class HealthResult:
    """نتيجة فحص نقطة نهاية واحدة."""

    def __init__(
        self,
        name: str,
        path: str,
        status_code: int = -1,
        response_time: float = 0,
        error: Optional[str] = None,
        data: Optional[dict] = None,
        expected: int = 200,
        ok: bool = False,
    ):
        self.name = name
        self.path = path
        self.status_code = status_code
        self.response_time = response_time
        self.error = error
        self.data = data
        self.expected = expected
        self.ok = ok

    @property
    def status_ok(self) -> bool:
        """هل كود الحالة ضمن المتوقع؟"""
        if isinstance(self.expected, list):
            return self.status_code in self.expected
        return self.status_code == self.expected

    @property
    def error_type(self) -> str:
        """تصنيف الخطأ حسب كود الحالة."""
        if self.ok and self.status_ok:
            return ""
        if self.status_code == -1 and self.error:
            if "Timeout" in self.error or "timeout" in self.error:
                return ErrorType.TIMEOUT
            if "Connection" in self.error or "connection" in self.error:
                return ErrorType.CONNECTION
            return ErrorType.UNKNOWN
        if self.status_code in (401, 403):
            return ErrorType.AUTH_ERROR
        if self.status_code == 404:
            return ErrorType.NOT_FOUND
        if self.status_code == 429:
            return ErrorType.RATE_LIMIT
        if self.status_code >= 500:
            return ErrorType.API_ERROR
        if self.status_code >= 400:
            return ErrorType.API_ERROR
        return ErrorType.UNKNOWN

    @property
    def is_fixable(self) -> bool:
        """هل يمكن محاولة إصلاح هذا الخطأ تلقائياً؟"""
        non_fixable = {ErrorType.TIMEOUT, ErrorType.CONNECTION, ErrorType.RATE_LIMIT}
        return self.error_type not in non_fixable

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "path": self.path,
            "status_code": self.status_code,
            "response_time": self.response_time,
            "error": self.error,
            "error_type": self.error_type,
            "expected": self.expected,
            "status_ok": self.status_ok,
            "is_fixable": self.is_fixable,
        }

    def __repr__(self) -> str:
        icon = "✅" if self.status_ok else "❌"
        return f"{icon} {self.name} ({self.path}): HTTP {self.status_code} — {self.response_time}ms"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص نقطة نهاية API
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def check_endpoint(
    url: str,
    timeout: int = 15,
    method: str = "GET",
) -> dict:
    """
    يفحص نقطة نهاية API ويعيد القاموس مع البيانات إن أمكن.
    """
    result = {
        "status_code": -1,
        "response_time": 0,
        "data": None,
        "ok": False,
        "error": None,
        "body_text": "",
    }
    try:
        start = time.monotonic()
        resp = requests.request(
            method,
            url,
            timeout=timeout,
            headers={"User-Agent": "RouaSelfHealing/1.0", "Accept": "application/json"},
            allow_redirects=True,
        )
        elapsed = (time.monotonic() - start) * 1000
        result["status_code"] = resp.status_code
        result["response_time"] = round(elapsed, 0)

        if resp.status_code < 500:
            result["ok"] = resp.status_code < 400
            try:
                result["data"] = resp.json()
            except (json.JSONDecodeError, ValueError):
                result["body_text"] = resp.text[:500]
        else:
            result["error"] = f"HTTP {resp.status_code}"
            try:
                result["data"] = resp.json()
            except (json.JSONDecodeError, ValueError):
                result["body_text"] = resp.text[:500]

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
    """يفحص مؤشرات تشغيل Railway عبر عدة اختبارات سريعة."""
    result = {"reachable": False, "ssl_valid": False, "response_time": 0, "error": None}
    try:
        start = time.monotonic()
        resp = requests.get(
            platform_url,
            timeout=timeout,
            allow_redirects=True,
            headers={"User-Agent": "RouaSelfHealing/1.0"},
        )
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
# فحص شامل لجميع نقاط النهاية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def run_health_checks() -> list[HealthResult]:
    """ينفذ جميع فحوصات الصحة ويعيد قائمة بنتائج HealthResult."""
    results: list[HealthResult] = []

    for ep in HEALTH_ENDPOINTS:
        url = f"{PLATFORM_URL}{ep['path']}"
        raw = check_endpoint(url, timeout=REQUEST_TIMEOUT, method=ep.get("method", "GET"))

        result = HealthResult(
            name=ep["name"],
            path=ep["path"],
            status_code=raw["status_code"],
            response_time=raw["response_time"],
            error=raw["error"],
            data=raw["data"],
            expected=ep.get("expect_status", 200),
            ok=raw["ok"],
        )
        results.append(result)

    return results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استخراج الأخطاء القابلة للإصلاح
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def get_fixable_errors(results: list[HealthResult]) -> list[HealthResult]:
    """يعيد فقط الأخطاء التي يمكن محاولة إصلاحها تلقائياً."""
    return [r for r in results if not r.status_ok and r.is_fixable]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# بناء تقرير الفحص
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def build_check_report(results: list[HealthResult], railway: dict) -> str:
    """يبني تقرير الفحص بشكل نصي للموجه."""
    lines = []
    for r in results:
        status_icon = "✅" if r.status_ok else "❌"
        lines.append(
            f"{status_icon} {r.name} ({r.path}): "
            f"كود={r.status_code}, زمن={r.response_time}ms"
        )
        if r.error:
            lines.append(f"   خطأ: {r.error}")
        if not r.status_ok and r.data:
            lines.append(f"   بيانات: {json.dumps(r.data, ensure_ascii=False)[:200]}")

    railway_icon = "✅" if railway["reachable"] else "❌"
    lines.append(
        f"{railway_icon} Railway: متاح={railway['reachable']}, "
        f"SSL={railway['ssl_valid']}, زمن={railway['response_time']}ms"
    )
    if railway.get("error"):
        lines.append(f"   خطأ: {railway['error']}")

    return "\n".join(lines)
