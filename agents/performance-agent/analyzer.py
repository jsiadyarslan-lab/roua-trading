"""
دوال تحليل الأداء لمنصة روعة التجارية.
يتضمن جمع القياسات، حساب الإحصائيات، اكتشاف التدهور، وإنشاء التوصيات.
"""

import json
import math
import os
import requests
from datetime import datetime, timezone
from typing import Optional


# ── ثوابت ──
_TIMEOUT = 15
_USER_AGENT = (
    "ROUA-Performance-Agent/1.0 "
    "(Performance Monitoring; +https://roua-trading-production.up.railway.app)"
)

# مسار ملف البيانات الافتراضي
_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
_METRICS_FILE = os.path.join(_DATA_DIR, "metrics_history.json")


def collect_metrics(config, logger) -> list[dict]:
    """
    يقيس زمن الاستجابة لجميع نقاط النهاية المعرّفة في PERF_ENDPOINTS.

    المعاملات:
        config: كائن الإعدادات (PerformanceConfig)
        logger: كائن التسجيل (ColoredLogger)

    يعيد:
        قائمة من القواميس تحتوي على:
        {name, path, response_time_ms, status_code, timestamp}
    """
    results = []
    base_url = config.PLATFORM_URL.rstrip("/")
    timestamp = datetime.now(timezone.utc).isoformat()

    for endpoint in config.PERF_ENDPOINTS:
        name = endpoint["name"]
        path = endpoint["path"]
        url = f"{base_url}{path}"

        try:
            start = _now_ms()
            resp = requests.get(
                url,
                headers={"User-Agent": _USER_AGENT},
                timeout=_TIMEOUT,
                allow_redirects=True,
                verify=True,
            )
            elapsed = _now_ms() - start

            results.append({
                "name": name,
                "path": path,
                "response_time_ms": round(elapsed, 2),
                "status_code": resp.status_code,
                "timestamp": timestamp,
            })

            status_icon = "✅" if resp.status_code < 400 else "⚠️"
            logger.debug(
                f"{status_icon} {name} ({path}): "
                f"{round(elapsed, 0)}ms — حالة {resp.status_code}"
            )

        except requests.exceptions.Timeout:
            results.append({
                "name": name,
                "path": path,
                "response_time_ms": None,
                "status_code": None,
                "timestamp": timestamp,
                "error": "انتهت المهلة",
            })
            logger.warning(f"⏱️ {name} ({path}): انتهت مهلة الطلب")

        except requests.exceptions.ConnectionError:
            results.append({
                "name": name,
                "path": path,
                "response_time_ms": None,
                "status_code": None,
                "timestamp": timestamp,
                "error": "خطأ اتصال",
            })
            logger.warning(f"🔌 {name} ({path}): فشل الاتصال")

        except Exception as e:
            results.append({
                "name": name,
                "path": path,
                "response_time_ms": None,
                "status_code": None,
                "timestamp": timestamp,
                "error": str(e),
            })
            logger.error(f"❌ {name} ({path}): خطأ غير متوقع — {e}")

    return results


def calculate_statistics(times: list[float]) -> dict[str, Optional[float]]:
    """
    يحسب الإحصائيات لقائمة أزمنة الاستجابة.

    الإحصائيات المحسوبة:
    - avg: المتوسط الحسابي
    - min: القيمة الأصغر
    - max: القيمة الأكبر
    - p50: النسبة المئوية 50 (الوسيط)
    - p95: النسبة المئوية 95
    - p99: النسبة المئوية 99
    - stddev: الانحراف المعياري

    المعاملات:
        times: قائمة أزمنة الاستجابة بالمللي ثانية

    يعيد:
        قاموس بالإحصائيات، أو قاموس بقيم None إذا كانت القائمة فارغة
    """
    empty_result = {
        "avg": None,
        "min": None,
        "max": None,
        "p50": None,
        "p95": None,
        "p99": None,
        "stddev": None,
        "count": 0,
    }

    if not times:
        return empty_result

    # فلترة القيم الفارغة
    valid_times = [t for t in times if t is not None]
    if not valid_times:
        return empty_result

    n = len(valid_times)
    sorted_times = sorted(valid_times)

    # المتوسط الحسابي
    avg = sum(sorted_times) / n

    # النسب المئوية — استخدام طريقة الاستكمال الخطي
    p50 = _percentile(sorted_times, 50)
    p95 = _percentile(sorted_times, 95)
    p99 = _percentile(sorted_times, 99)

    # الانحراف المعياري (عينة)
    if n > 1:
        variance = sum((x - avg) ** 2 for x in sorted_times) / (n - 1)
        stddev = math.sqrt(variance)
    else:
        stddev = 0.0

    return {
        "avg": round(avg, 2),
        "min": round(sorted_times[0], 2),
        "max": round(sorted_times[-1], 2),
        "p50": round(p50, 2),
        "p95": round(p95, 2),
        "p99": round(p99, 2),
        "stddev": round(stddev, 2),
        "count": n,
    }


def _percentile(sorted_data: list[float], percent: float) -> float:
    """
    يحسب النسبة المئوية باستخدام طريقة الاستكمال الخطي.

    هذه هي الطريقة القياسية لحساب النسب المئوية:
    1. حساب الرتبة: rank = (percent / 100) * (n - 1)
    2. الاستكمال الخطي بين القيمتين المحيطتين

    المعاملات:
        sorted_data: قائمة مرتبة تصاعدياً
        percent: النسبة المئوية (0-100)

    يعيد:
        قيمة النسبة المئوية
    """
    n = len(sorted_data)
    if n == 1:
        return sorted_data[0]

    rank = (percent / 100.0) * (n - 1)
    lower = int(math.floor(rank))
    upper = int(math.ceil(rank))

    if lower == upper:
        return sorted_data[lower]

    # استكمال خطي
    fraction = rank - lower
    return sorted_data[lower] + fraction * (sorted_data[upper] - sorted_data[lower])


def detect_degradation(
    current_stats: dict[str, dict],
    previous_stats: dict[str, dict],
    threshold_pct: int,
) -> list[dict]:
    """
    يقارن إحصائيات الفترة الحالية بالفترة السابقة لاكتشاف التدهور.

    المعاملات:
        current_stats: قاموس {اسم_نقطة: إحصائيات} للفترة الحالية
        previous_stats: قاموس {اسم_نقطة: إحصائيات} للفترة السابقة
        threshold_pct: عتبة النسبة المئوية للتدهور (مثلاً 30 تعني زيادة 30%)

    يعيد:
        قائمة من القواميس تحتوي على نقاط النهاية المتدهورة:
        {name, path, current_avg, previous_avg, increase_pct}
    """
    degraded = []

    for path, curr in current_stats.items():
        prev = previous_stats.get(path)
        if prev is None:
            continue

        curr_avg = curr.get("avg")
        prev_avg = prev.get("avg")

        if curr_avg is None or prev_avg is None or prev_avg == 0:
            continue

        increase_pct = ((curr_avg - prev_avg) / prev_avg) * 100

        if increase_pct >= threshold_pct:
            degraded.append({
                "name": curr.get("name", path),
                "path": path,
                "current_avg": round(curr_avg, 2),
                "previous_avg": round(prev_avg, 2),
                "increase_pct": round(increase_pct, 1),
            })

    # ترتيب حسب نسبة الزيادة تنازلياً
    degraded.sort(key=lambda x: x["increase_pct"], reverse=True)
    return degraded


def generate_recommendations(findings: list[dict]) -> list[str]:
    """
    يُنشئ توصيات لتحسين الأداء بناءً على النتائج المكتشفة.

    المعاملات:
        findings: قائمة من القواميس تحتوي على {name, path, current_avg, ...}

    يعيد:
        قائمة من سلاسل التوصيات النصية
    """
    recommendations = []

    # خريطة التوصيات حسب نقطة النهاية
    path_recommendations = {
        "/api/scanner/scan?timeframe=1h": (
            "إضافة تخزين مؤقت Redis لنقطة /api/scanner/scan — "
            "نتائج المسح لا تتغير بشكل متكرر ويمكن تخزينها مؤقتاً لمدة 5-15 دقيقة"
        ),
        "/api/portfolio/summary": (
            "تحسين استعلامات قاعدة البيانات لنقطة /api/portfolio/summary — "
            "إضافة فهارس على أعمدة المستخدم والتاريخ، واستخدام التحميل الكسول للبيانات الثانوية"
        ),
        "/api/signals/smart": (
            "تحسين أداء /api/signals/smart — "
            "تخزين مؤقت للإشارات الذكية مع تحديث دوري كل دقيقة بدلاً من الحساب الفوري"
        ),
        "/api/news/feed": (
            "تحسين /api/news/feed — "
            "استخدام CDN لتخزين الأخبار مؤقتاً وتقليل عدد الاستعلامات لمصادر الأخبار الخارجية"
        ),
        "/api/exchange/quote/AAPL": (
            "تحسين /api/exchange/quote — "
            "تخزين مؤقت للأسعار مع TTL قصير (5-10 ثوانٍ) واستخدام WebSocket للتحديثات الفورية"
        ),
        "/dashboard": (
            "تحسين لوحة التحكم /dashboard — "
            "تقليل حجم الحزم الأولى، استخدام التحميل الكسول للمكونات، وضغط الصور والموارد الثابتة"
        ),
        "/api/ai/status": (
            "تحسين /api/ai/status — "
            "تخزين مؤقت لحالة AI مع تحديث كل 30 ثانية بدلاً من الفحص الفوري لكل طلب"
        ),
        "/api/trading/account": (
            "تحسين /api/trading/account — "
            "فصل استعلامات الحساب عن استعلامات التداول وتخزين بيانات الحساب الأساسية مؤقتاً"
        ),
        "/dashboard/admin/login": (
            "تحسين صفحة الدخول — "
            "تقليل حجم الموارد المحملة وضمان تحميل سريع عبر CDN وتحسين تجميع الأصول"
        ),
        "/api/health": (
            "تحسين /api/health — "
            "يجب أن تكون نقطة فحص الصحة سريعة جداً — "
            "تأكد من أنها لا تُجري استعلامات قاعدة بيانات أو اتصالات خارجية"
        ),
    }

    for finding in findings:
        path = finding.get("path", "")
        name = finding.get("name", path)
        current_avg = finding.get("current_avg", 0)
        increase_pct = finding.get("increase_pct", 0)

        # توصية مخصصة حسب نقطة النهاية
        specific_rec = path_recommendations.get(path)
        if specific_rec:
            recommendations.append(
                f"📌 {name}: {specific_rec}"
            )
        else:
            # توصية عامة بناءً على متوسط زمن الاستجابة
            if current_avg > 5000:
                recommendations.append(
                    f"📌 {name} ({path}): زمن استجابة مرتفع جداً ({round(current_avg)}ms) — "
                    f"يجب فحص استعلامات قاعدة البيانات وإضافة تخزين مؤقت"
                )
            elif current_avg > 2000:
                recommendations.append(
                    f"📌 {name} ({path}): زمن استجابة متوسط مرتفع ({round(current_avg)}ms) — "
                    f"يُنصح بتحسين الأداء وإضافة تخزين مؤقت"
                )

        # توصية عامة عن التدهور
        if increase_pct > 50:
            recommendations.append(
                f"🔴 {name}: تدهور حاد بنسبة {increase_pct}% — "
                f"يتطلب تحقيقاً عاجلاً في سبب تباطؤ الاستجابة"
            )

    # توصيات عامة إذا لم توجد توصيات محددة
    if not recommendations:
        recommendations.append("✅ الأداء مستقر — لا توجد توصيات عاجلة في هذه الفترة")

    return recommendations


def save_metrics(data: list[dict], filepath: Optional[str] = None) -> None:
    """
    يحفظ بيانات القياسات إلى ملف JSON (وضع الإضافة).

    المعاملات:
        data: قائمة من سجلات القياسات
        filepath: مسار الملف (الافتراضي: data/metrics_history.json)
    """
    if filepath is None:
        filepath = _METRICS_FILE

    # التأكد من وجود المجلد
    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    # قراءة البيانات الحالية
    existing = []
    if os.path.exists(filepath):
        try:
            with open(filepath, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if not isinstance(existing, list):
                    existing = []
        except (json.JSONDecodeError, IOError):
            existing = []

    # إضافة البيانات الجديدة
    existing.extend(data)

    # حفظ البيانات المحدّثة
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)


def load_historical_metrics(
    filepath: Optional[str] = None,
    hours_back: int = 168,
) -> list[dict]:
    """
    يحمّل بيانات القياسات من آخر N ساعة.

    المعاملات:
        filepath: مسار الملف (الافتراضي: data/metrics_history.json)
        hours_back: عدد الساعات للرجوع للخلف (الافتراضي: 168 = أسبوع)

    يعيد:
        قائمة من سجلات القياسات ضمن الفترة المحددة
    """
    if filepath is None:
        filepath = _METRICS_FILE

    if not os.path.exists(filepath):
        return []

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            all_metrics = json.load(f)
            if not isinstance(all_metrics, list):
                return []
    except (json.JSONDecodeError, IOError):
        return []

    # فلترة حسب الوقت
    cutoff = datetime.now(timezone.utc).timestamp() - (hours_back * 3600)
    filtered = []

    for record in all_metrics:
        ts_str = record.get("timestamp", "")
        if not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(ts_str).timestamp()
            if ts >= cutoff:
                filtered.append(record)
        except (ValueError, TypeError):
            continue

    return filtered


def compute_endpoint_stats(metrics: list[dict]) -> dict[str, dict]:
    """
    يحسب إحصائيات كل نقطة نهاية من قائمة القياسات.

    المعاملات:
        metrics: قائمة من سجلات القياسات

    يعيد:
        قاموس {مسار: {name, avg, min, max, p50, p95, p99, stddev, count}}
    """
    # تجميع أزمنة الاستجابة حسب المسار
    path_times: dict[str, list[float]] = {}
    path_names: dict[str, str] = {}

    for record in metrics:
        path = record.get("path", "")
        rt = record.get("response_time_ms")
        name = record.get("name", path)

        if rt is not None:
            path_times.setdefault(path, []).append(rt)
            path_names[path] = name

    # حساب الإحصائيات لكل مسار
    stats = {}
    for path, times in path_times.items():
        stat = calculate_statistics(times)
        stat["name"] = path_names.get(path, path)
        stats[path] = stat

    return stats


def get_previous_period_stats(
    filepath: Optional[str] = None,
    period_hours: int = 1,
) -> dict[str, dict]:
    """
    يحصل على إحصائيات الفترة السابقة للمقارنة.

    المعاملات:
        filepath: مسار ملف القياسات
        period_hours: مدة الفترة بالساعات

    يعيد:
        قاموس إحصائيات نقاط النهاية للفترة السابقة
    """
    if filepath is None:
        filepath = _METRICS_FILE

    if not os.path.exists(filepath):
        return {}

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            all_metrics = json.load(f)
            if not isinstance(all_metrics, list):
                return {}
    except (json.JSONDecodeError, IOError):
        return {}

    now = datetime.now(timezone.utc).timestamp()

    # الفترة السابقة: من (الآن - 2*فترة) إلى (الآن - فترة)
    period_start = now - (2 * period_hours * 3600)
    period_end = now - (period_hours * 3600)

    filtered = []
    for record in all_metrics:
        ts_str = record.get("timestamp", "")
        if not ts_str:
            continue
        try:
            ts = datetime.fromisoformat(ts_str).timestamp()
            if period_start <= ts <= period_end:
                filtered.append(record)
        except (ValueError, TypeError):
            continue

    return compute_endpoint_stats(filtered)


# ── دوال مساعدة ──

def _now_ms() -> float:
    """يعيد الوقت الحالي بالمللي ثانية (دقة عالية)."""
    return __import__("time").perf_counter() * 1000
