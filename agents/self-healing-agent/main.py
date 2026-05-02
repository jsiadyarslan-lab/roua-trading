"""
وكيل الإصلاح الذاتي لمنصة Roua Trading — الحلقة الرئيسية
يعمل 24/7 على Railway كخدمة مستقلة.

سير العمل:
1. كل 60 ثانية، يستدعي monitor.py لفحص نقاط النهاية
2. إذا اكتشف خطأ، يستدعي logger_fetcher.py لجلب سجلات Railway
3. يستدعي error_analyzer.py لتحليل الخطأ عبر GLM-5.1
4. يستدعي fix_generator.py لتوليد الإصلاح
5. يستدعي test_runner.py لإنشاء فرع وتطبيق الإصلاح واختباره
6. إذا نجحت الاختبارات، يستدعي github_pr_manager.py لفتح PR
7. يستدعي human_approval.py لإرسال إشعار Telegram
8. إذا فشلت الاختبارات، يرسل تنبيه فشل ويحذف الفرع

إجراءات الأمان:
- لا يدمج (merge) أي PR أبداً. المراجعة البشرية إجبارية.
- إذا فشلت الاختبارات، لا يفتح PR ويبلّغ عن الفشل.
- يبدأ بإصلاح أخطاء TypeScript وأخطاء API فقط.
- لا يلمس منطق التداول أو الأمان أو إدارة المخاطر.
"""

import os
import time
import signal
import sys
import json
import hashlib
import threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# خادم فحص الصحة المدمج (يعمل فوراً قبل أي استيراد آخر)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", os.environ.get("PORT", "8081")))
_agent_status = {
    "healthy": True,
    "agent_name": "self-healing-agent",
    "uptime_seconds": 0,
    "total_checks": 0,
    "total_errors": 0,
    "last_check": "never",
    "startup_error": None,
}
_start_time = 0


class _BuiltInHealthHandler(BaseHTTPRequestHandler):
    """معالج طلبات فحص الصحة المدمج — لا يعتمد على أي مكتبة خارجية."""

    def do_GET(self) -> None:
        if self.path == "/health" or self.path == "/":
            status_code = 200 if _agent_status.get("healthy", False) else 503
            response = json.dumps({
                "status": "healthy" if _agent_status.get("healthy") else "unhealthy",
                "agent": _agent_status.get("agent_name", "self-healing-agent"),
                "uptime_seconds": _agent_status.get("uptime_seconds", 0),
                "total_checks": _agent_status.get("total_checks", 0),
                "total_errors": _agent_status.get("total_errors", 0),
                "last_check": _agent_status.get("last_check", "never"),
                "startup_error": _agent_status.get("startup_error"),
            }, ensure_ascii=False)

            self.send_response(status_code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(response.encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args) -> None:  # type: ignore[override]
        """كتم سجلات HTTP الافتراضية."""
        pass


def _start_builtin_health_server():
    """يبدأ خادم فحص الصحة المدمج فوراً في خيط خلفي."""
    global _start_time
    try:
        server = HTTPServer(("0.0.0.0", HEALTH_PORT), _BuiltInHealthHandler)
        _start_time = time.monotonic()
        thread = threading.Thread(
            target=server.serve_forever,
            daemon=True,
            name="health-builtin",
        )
        thread.start()
        print(f"🏥 خادم فحص الصحة المدمج يعمل على المنفذ {HEALTH_PORT}")
        return server
    except Exception as e:
        print(f"⚠️ فشل بدء خادم فحص الصحة المدمج: {e}")
        return None


def _update_health(healthy: bool = True, total_checks: Optional[int] = None,
                   total_errors: Optional[int] = None, last_check: Optional[str] = None):
    """يحدّث حالة الوكيل لخادم الصحة."""
    _agent_status["healthy"] = healthy
    if _start_time > 0:
        _agent_status["uptime_seconds"] = round(time.monotonic() - _start_time)
    if total_checks is not None:
        _agent_status["total_checks"] = total_checks
    if total_errors is not None:
        _agent_status["total_errors"] = total_errors
    if last_check is not None:
        _agent_status["last_check"] = last_check


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# بدء خادم الصحة فوراً (قبل أي استيراد قد يفشل)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_health_server = _start_builtin_health_server()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استيراد الإعدادات (آمن — لا يعتمد على مكتبات خارجية)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
from config import (
    GLM_API_KEY, GLM_MODEL, PLATFORM_URL,
    TELEGRAM_TOKEN, TELEGRAM_CHAT_ID,
    GITHUB_TOKEN, GITHUB_REPO,
    CHECK_INTERVAL, REQUEST_TIMEOUT, ALERT_COOLDOWN,
    MAX_CONSECUTIVE_FAILURES, MAX_FIX_ATTEMPTS_PER_ERROR,
    FIX_COOLDOWN, ALLOWED_FIX_SCOPES, FORBIDDEN_SCOPES,
    REDIS_URL, DATABASE_URL,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استيراد الوحدات المحلية (مع معالجة الأخطاء)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_MODULES_AVAILABLE = False
_monitor = None
_logger_fetcher = None
_error_analyzer = None
_fix_generator = None
_test_runner = None
_github_pr_manager = None
_human_approval = None

try:
    from monitor import (
        run_health_checks, check_railway_status,
        get_fixable_errors, build_check_report, HealthResult,
    )
    from logger_fetcher import fetch_logs, extract_error_patterns
    from error_analyzer import analyze_error
    from fix_generator import generate_fix
    from test_runner import create_fix_branch, run_tests, delete_branch
    from github_pr_manager import create_pull_request
    from human_approval import (
        send_approval_notification, send_failure_alert,
        send_unsafe_fix_alert, send_periodic_summary,
    )
    _MODULES_AVAILABLE = True
    print("✅ تم تحميل جميع وحدات الإصلاح بنجاح")
except ImportError as e:
    _agent_status["startup_error"] = f"Import error: {e}"
    _agent_status["healthy"] = True  # Still healthy — just limited
    print(f"⚠️ فشل تحميل بعض الوحدات: {e}")
    print("⚠️ الوكيل سيعمل في وضع المراقبة فقط (بدون إصلاح تلقائي)")
except Exception as e:
    _agent_status["startup_error"] = f"Startup error: {e}"
    _agent_status["healthy"] = True  # Still healthy — just limited
    print(f"⚠️ خطأ أثناء تحميل الوحدات: {e}")


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# استيراد الوحدات المشتركة (اختياري)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_shared_paths = [
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'shared'),  # محلي
    os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shared'),        # بديل محلي
    '/app/shared',                                                              # داخل الحاوية
]
for _p in _shared_paths:
    if os.path.isdir(_p):
        sys.path.insert(0, _p)
        break

_SHARED_AVAILABLE = False
try:
    from logger import ColoredLogger
    _SHARED_AVAILABLE = True
except ImportError:
    pass


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# حالات التشغيل
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
running = True
consecutive_failures = 0
total_checks = 0
total_errors = 0
total_fixes = 0
total_prs = 0
total_failed_fixes = 0
last_summary_time = 0.0

# سجل محاولات الإصلاح (لتجنب التكرار)
# المفتاح: hash(نوع_الخطأ + الملف + الرسالة)
# القيمة: {timestamp, attempts}
_fix_attempts: dict[str, dict] = {}


def _signal_handler(sig, frame):
    """معالجة إشارات الإنهاء للأغلاق النظيف."""
    global running
    print("\n🛑 تم استلام إشارة الإنهاء — جارٍ الإغلاق...")
    running = False


signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# المسجّل
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
if _SHARED_AVAILABLE:
    log = ColoredLogger("self-healing", "INFO")
else:
    class _SimpleLogger:
        def info(self, msg): print(f"[INFO] {msg}")
        def warning(self, msg): print(f"[WARNING] {msg}")
        def error(self, msg): print(f"[ERROR] {msg}")
        def critical(self, msg): print(f"[CRITICAL] {msg}")
        def banner(self, lines):
            print("=" * 55)
            for line in lines:
                print(f"  {line}")
            print("=" * 55)
    log = _SimpleLogger()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إنشاء مفتاح فريد للخطأ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def _error_key(error_info: dict) -> str:
    """ينشئ مفتاحاً فريداً للخطأ لتتبع محاولات الإصلاح."""
    raw = f"{error_info.get('type', '')}:{error_info.get('file', '')}:{error_info.get('message', '')[:100]}"
    return hashlib.md5(raw.encode()).hexdigest()


def _should_attempt_fix(error_info: dict) -> bool:
    """يتحقق مما إذا كان يجب محاولة إصلاح هذا الخطأ (لم يتجاوز الحد)."""
    key = _error_key(error_info)
    now = time.time()

    if key not in _fix_attempts:
        _fix_attempts[key] = {"timestamp": now, "attempts": 1}
        return True

    record = _fix_attempts[key]

    # التحقق من فترة التبريد
    if now - record["timestamp"] < FIX_COOLDOWN:
        print(f"  ⏳ الإصلاح في فترة تبريد (بقي {int(FIX_COOLDOWN - (now - record['timestamp']))}ث)")
        return False

    # التحقق من عدد المحاولات
    if record["attempts"] >= MAX_FIX_ATTEMPTS_PER_ERROR:
        print(f"  🚫 تجاوز عدد محاولات الإصلاح ({MAX_FIX_ATTEMPTS_PER_ERROR})")
        return False

    # تحديث السجل
    record["timestamp"] = now
    record["attempts"] += 1
    return True


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# سير عمل الإصلاح الذاتي
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def self_heal_workflow(failed_result) -> dict:
    """
    ينفذ سير عمل الإصلاح الذاتي لخطأ مكتشف.

    الخطوات:
    1. جلب السجلات من Railway
    2. استخراج أنماط الأخطاء
    3. تحليل الخطأ عبر GLM-5.1
    4. توليد الإصلاح
    5. إنشاء فرع وتطبيق الإصلاح
    6. تشغيل الاختبارات
    7. فتح PR (إذا نجحت الاختبارات)
    8. إرسال إشعار الموافقة البشرية

    يعيد:
        قاموس يحتوي على نتيجة كل خطوة
    """
    if not _MODULES_AVAILABLE:
        print("  ⚠️ وحدات الإصلاح غير متاحة — لا يمكن تنفيذ سير العمل")
        return {"outcome": "modules_unavailable"}

    workflow_result = {
        "error": failed_result.to_dict() if hasattr(failed_result, 'to_dict') else str(failed_result),
        "steps": {},
        "outcome": "unknown",
    }

    print(f"\n  🔧 بدء سير عمل الإصلاح الذاتي: {failed_result.name} ({failed_result.error_type})")

    # ── الخطوة 1: جلب السجلات ──
    print("  📥 الخطوة 1: جلب سجلات Railway...")
    logs_result = fetch_logs(lines=50, filter_error=True)
    workflow_result["steps"]["logs"] = {
        "success": logs_result["success"],
        "line_count": len(logs_result.get("logs", [])),
    }

    if not logs_result["success"]:
        print(f"  ⚠️ فشل جلب السجلات: {logs_result.get('error', 'غير معروف')}")
        workflow_result["outcome"] = "logs_failed"
        return workflow_result

    logs = logs_result["logs"]
    print(f"  ✅ تم جلب {len(logs)} سطر من السجلات")

    # ── الخطوة 2: استخراج أنماط الأخطاء ──
    print("  🔍 الخطوة 2: استخراج أنماط الأخطاء...")
    error_patterns = extract_error_patterns(logs)
    workflow_result["steps"]["patterns"] = {
        "count": len(error_patterns),
    }

    if not error_patterns:
        print("  ⚠️ لم يتم العثور على أنماط أخطاء في السجلات")
        # نستخدم معلومات الخطأ من فحص الصحة مباشرة
        error_patterns = [{
            "type": failed_result.error_type,
            "subtype": "health_check",
            "message": failed_result.error or f"HTTP {failed_result.status_code}",
            "file": None,
            "line": None,
            "raw": f"{failed_result.name}: {failed_result.error or failed_result.status_code}",
        }]
        print(f"  📋 استخدام معلومات فحص الصحة: {failed_result.error_type}")

    # ── الخطوة 3-8: معالجة كل نمط خطأ ──
    for i, error_info in enumerate(error_patterns[:3]):  # حد أقصى 3 أخطاء
        print(f"\n  🎯 معالجة الخطأ {i+1}/{min(len(error_patterns), 3)}: {error_info.get('type', 'unknown')}")

        # التحقق مما إذا يجب محاولة الإصلاح
        if not _should_attempt_fix(error_info):
            continue

        # ── الخطوة 3: تحليل الخطأ ──
        print("  🧠 الخطوة 3: تحليل الخطأ عبر GLM-5.1...")
        health_dict = failed_result.to_dict() if hasattr(failed_result, 'to_dict') else failed_result
        analysis = analyze_error(error_info, logs, health_dict)
        workflow_result["steps"][f"analysis_{i}"] = {
            "success": analysis.get("success"),
            "is_safe": analysis.get("is_safe"),
            "fix_scope": analysis.get("fix_scope"),
        }

        if not analysis.get("success"):
            print(f"  ⚠️ فشل التحليل: {analysis.get('analysis', 'غير معروف')}")
            continue

        if not analysis.get("is_safe"):
            print(f"  🚫 الإصلاح غير آمن: {analysis.get('safety_reason', 'النطاق محظور')}")
            send_unsafe_fix_alert(analysis, error_info)
            continue

        print(f"  ✅ التحليل ناجح: {analysis.get('explanation', '')[:80]}")

        # ── الخطوة 4: توليد الإصلاح ──
        print("  🔨 الخطوة 4: توليد الإصلاح...")
        fix = generate_fix(analysis)
        workflow_result["steps"][f"fix_{i}"] = fix.to_dict()

        if not fix.success:
            print(f"  ⚠️ فشل توليد الإصلاح: {fix.error}")
            continue

        print(f"  ✅ الإصلاح جاهز: {fix.file_path}")

        # ── الخطوة 5: إنشاء فرع وتطبيق الإصلاح ──
        print("  🌿 الخطوة 5: إنشاء فرع وتطبيق الإصلاح...")
        branch_result = create_fix_branch(fix, error_info)
        workflow_result["steps"][f"branch_{i}"] = branch_result

        if not branch_result.get("success"):
            print(f"  ❌ فشل إنشاء الفرع: {branch_result.get('error', 'غير معروف')}")
            continue

        branch_name = branch_result["branch_name"]
        print(f"  ✅ تم إنشاء الفرع: {branch_name}")

        # ── الخطوة 6: تشغيل الاختبارات ──
        print("  🧪 الخطوة 6: تشغيل الاختبارات...")
        test_result = run_tests(branch_name)
        workflow_result["steps"][f"test_{i}"] = test_result.to_dict()

        if not test_result.success:
            print(f"  ❌ فشلت الاختبارات: {test_result.error}")
            total_failed_fixes += 1  # type: ignore

            # حذف الفرع الفاشل
            print(f"  🗑️ حذف الفرع الفاشل: {branch_name}")
            delete_branch(branch_name)

            # إرسال تنبيه الفشل
            send_failure_alert(fix, error_info, test_result.to_dict(), branch_name)
            continue

        print(f"  ✅ نجحت الاختبارات!")

        # ── الخطوة 7: فتح PR ──
        print("  📝 الخطوة 7: فتح Pull Request...")
        pr_result = create_pull_request(fix, error_info, branch_name, test_result.to_dict())
        workflow_result["steps"][f"pr_{i}"] = pr_result.to_dict()

        if not pr_result.success:
            print(f"  ❌ فشل فتح PR: {pr_result.error}")
            total_failed_fixes += 1  # type: ignore
            continue

        total_prs += 1  # type: ignore
        total_fixes += 1  # type: ignore
        print(f"  ✅ تم فتح PR #{pr_result.pr_number}: {pr_result.pr_html_url}")

        # ── الخطوة 8: إرسال إشعار الموافقة البشرية ──
        print("  📲 الخطوة 8: إرسال إشعار الموافقة البشرية...")
        approval = send_approval_notification(pr_result, fix, error_info, test_result.to_dict())

        if approval.get("success"):
            print(f"  ✅ تم إرسال إشعار الموافقة")
        else:
            print(f"  ⚠️ فشل إرسال إشعار الموافقة: {approval.get('error', '')}")

        workflow_result["outcome"] = "fix_applied"

    # إذا لم يتم إصلاح أي خطأ
    if workflow_result["outcome"] == "unknown":
        workflow_result["outcome"] = "no_fix_generated"

    return workflow_result


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# الحلقة الرئيسية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def main():
    global running, consecutive_failures, total_checks, total_alerts
    global total_errors, total_fixes, total_prs, total_failed_fixes, last_summary_time

    # بانر البدء
    log.banner([
        "🤖 وكيل الإصلاح الذاتي — Roua Trading",
        f"⏱️  فترة الفحص: {CHECK_INTERVAL} ثانية",
        f"🌐 المنصة: {PLATFORM_URL}",
        f"🧠 نموذج GLM: {GLM_MODEL}",
        f"🔑 GitHub: {'✅ مضبوط' if GITHUB_TOKEN else '⚠️ غير مضبوط'}",
        f"📲 Telegram: {'✅ مضبوط' if TELEGRAM_TOKEN else '⚠️ غير مضبوط'}",
        f"🛡️ نطاقات مسموحة: {', '.join(ALLOWED_FIX_SCOPES)}",
        f"🚫 نطاقات محظورة: {', '.join(FORBIDDEN_SCOPES)}",
        f"🔄 حد المحاولات: {MAX_FIX_ATTEMPTS_PER_ERROR} لكل خطأ",
        f"⏳ تبريد الإصلاح: {FIX_COOLDOWN} ثانية",
        f"🏥 منفذ الصحة: {HEALTH_PORT}",
        f"📦 الوحدات: {'✅ كاملة' if _MODULES_AVAILABLE else '⚠️ مراقبة فقط'}",
    ])

    # فحص أولي
    print("\n🔍 جارٍ الفحص الأولي...")
    if _MODULES_AVAILABLE:
        railway = check_railway_status(PLATFORM_URL)
        if railway["reachable"]:
            print("✅ المنصة متاحة — بدء المراقبة")
        else:
            print(f"❌ المنصة غير متاحة: {railway.get('error', 'غير معروف')}")
    else:
        print("⚠️ وضع المراقبة فقط — وحدات الإصلاح غير متاحة")

    print()

    while running:
        cycle_start = time.monotonic()
        total_checks += 1
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")

        try:
            if not _MODULES_AVAILABLE:
                # وضع المراقبة فقط — فحص بسيط
                import requests as _req
                try:
                    resp = _req.get(PLATFORM_URL, timeout=REQUEST_TIMEOUT, allow_redirects=True)
                    all_ok = resp.status_code < 500
                except Exception:
                    all_ok = False

                _update_health(
                    healthy=all_ok,
                    total_checks=total_checks,
                    total_errors=total_errors if not all_ok else total_errors,
                    last_check=now_str,
                )

                if all_ok:
                    consecutive_failures = 0
                    print(f"[{now_str}] ✅ المنصة متاحة (وضع المراقبة)")
                else:
                    consecutive_failures += 1
                    total_errors += 1
                    print(f"[{now_str}] ❌ المنصة غير متاحة (وضع المراقبة)")

                # الانتظار حتى الفحص التالي
                elapsed = time.monotonic() - cycle_start
                sleep_time = max(0, CHECK_INTERVAL - elapsed)
                if sleep_time > 0 and running:
                    end_time = time.monotonic() + sleep_time
                    while running and time.monotonic() < end_time:
                        time.sleep(min(2, end_time - time.monotonic()))
                continue

            # ── الوضع الكامل ──
            # 1. فحص حالة Railway
            railway = check_railway_status(PLATFORM_URL, timeout=REQUEST_TIMEOUT)

            # 2. فحص جميع نقاط النهاية
            results = run_health_checks()

            # 3. تحديد الأخطاء
            failed_checks = [r for r in results if not r.status_ok]
            all_ok = len(failed_checks) == 0 and railway["reachable"]

            # 4. تحديث خادم الصحة
            _update_health(
                healthy=all_ok,
                total_checks=total_checks,
                total_errors=total_errors,
                last_check=now_str,
            )

            if all_ok:
                # كل شيء يعمل
                consecutive_failures = 0
                print(f"[{now_str}] ✅ جميع الفحوصات ناجحة ({len(results)} نقطة)")
            else:
                # هناك مشاكل
                consecutive_failures += 1
                total_errors += len(failed_checks)
                failed_names = ", ".join(
                    f"{r.name}(HTTP {r.status_code})" for r in failed_checks
                )
                print(f"[{now_str}] ❌ فشل {len(failed_checks)}/{len(results)} فحص — {failed_names}")

                # 5. محاولة الإصلاح بعد عدد معين من الفشل المتتالي
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    fixable = get_fixable_errors(results)
                    if fixable:
                        print(f"\n🔧 اكتشاف {len(fixable)} خطأ قابل للإصلاح — بدء سير العمل...")

                        for fixable_error in fixable:
                            try:
                                workflow_result = self_heal_workflow(fixable_error)
                                outcome = workflow_result.get("outcome", "unknown")

                                if outcome == "fix_applied":
                                    print(f"  🎉 تم تطبيق الإصلاح بنجاح!")
                                elif outcome == "no_fix_generated":
                                    print(f"  ℹ️ لم يتم توليد إصلاح — يحتاج مراجعة يدوية")
                                else:
                                    print(f"  ⚠️ نتيجة سير العمل: {outcome}")

                            except Exception as e:
                                print(f"  💥 خطأ في سير العمل: {e}")

                        # إعادة تعيين الفشل المتتالي بعد محاولة الإصلاح
                        consecutive_failures = 0

            # 6. ملخص دوري كل 100 فحص
            if total_checks % 100 == 0:
                print(f"\n📊 ملخص: {total_checks} فحص | {total_fixes} إصلاح | {total_prs} PR | {total_failed_fixes} فشل\n")

            # 7. ملخص يومي كل 24 ساعة
            now_mono = time.monotonic()
            if now_mono - last_summary_time >= 86400:
                last_summary_time = now_mono
                if _MODULES_AVAILABLE:
                    send_periodic_summary(
                        total_checks, total_errors,
                        total_fixes, total_prs, total_failed_fixes,
                    )

        except Exception as e:
            consecutive_failures += 1
            error_msg = f"خطأ غير متوقع في الوكيل: {e}"
            print(f"[{now_str}] 💥 {error_msg}")
            _update_health(healthy=False, total_checks=total_checks, total_errors=total_errors, last_check=now_str)

        # الانتظار حتى الفحص التالي
        elapsed = time.monotonic() - cycle_start
        sleep_time = max(0, CHECK_INTERVAL - elapsed)
        if sleep_time > 0 and running:
            end_time = time.monotonic() + sleep_time
            while running and time.monotonic() < end_time:
                time.sleep(min(2, end_time - time.monotonic()))

    # الإغلاق النظيف
    print("\n🏁 وكيل الإصلاح الذاتي توقف.")
    print(f"📊 الإحصائيات: {total_checks} فحص | {total_fixes} إصلاح | {total_prs} PR | {total_failed_fixes} فشل")


if __name__ == "__main__":
    main()
