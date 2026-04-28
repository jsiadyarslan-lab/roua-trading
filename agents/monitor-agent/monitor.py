"""
وكيل مراقبة Roua Trading — السكريبت الرئيسي
يعمل 24/7 على Railway كخدمة مستقلة.
يستخدم GLM-5.1 API لتحليل نتائج الفحوصات ويرسل تنبيهات Telegram.
"""

import time
import json
import signal
import sys
import requests
from datetime import datetime, timezone

from config import (
    API_KEY, API_URL, GLM_MODEL, PLATFORM_URL,
    TELEGRAM_TOKEN, TELEGRAM_CHAT_ID,
    CHECK_INTERVAL, REQUEST_TIMEOUT, ALERT_COOLDOWN,
    MAX_CONSECUTIVE_FAILURES, HEALTH_ENDPOINTS,
    REDIS_URL, DATABASE_URL, TWELVE_DATA_API_KEY,
    WEBSOCKET_URL, DEPENDENCY_CHECK_INTERVAL, DAILY_SUMMARY_INTERVAL,
    NEWS_SITE_URL, NEWS_API_KEY,
)
from tools import (
    check_website_health, query_api_endpoint,
    check_railway_status, send_telegram_alert, format_alert_message,
    check_websocket_health, check_redis_connection, check_database_connection,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# حالات التشغيل
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
running = True
consecutive_failures = 0
total_checks = 0
total_alerts = 0
total_errors = 0
last_dependency_check = 0.0
last_daily_summary = 0.0
# سجل أزمنة الاستجابة لكل نقطة نهاية — يُستخدم للملخص اليومي
_response_times_log: dict[str, list[float]] = {}


def _signal_handler(sig, frame):
    """معالجة إشارات الإنهاء للأغلاق النظيف."""
    global running
    print("\n🛑 تم استلام إشارة الإنهاء — جارٍ الإغلاق...")
    running = False


signal.signal(signal.SIGTERM, _signal_handler)
signal.signal(signal.SIGINT, _signal_handler)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# GLM-5.1 API — العقل المدبر
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def ask_glm(prompt: str) -> str:
    """يرسل موجهًا إلى GLM-5.1 ويعيد الرد."""
    if not API_KEY:
        return "⚠️ GLM_API_KEY غير مضبوط — تم تخطي تحليل GLM"

    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
    }
    data = {
        "model": GLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3,
        "max_tokens": 512,
    }

    try:
        resp = requests.post(API_URL, headers=headers, json=data, timeout=30)
        resp_json = resp.json()

        if resp.status_code != 200:
            return f"⚠️ خطأ من GLM API: HTTP {resp.status_code}"

        return resp_json.get("choices", [{}])[0].get("message", {}).get("content", "لا يوجد رد")

    except Exception as e:
        return f"⚠️ فشل الاتصال بـ GLM API: {e}"


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص شامل لجميع نقاط النهاية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def run_health_checks() -> list[dict]:
    """ينفذ جميع فحوصات الصحة ويعيد قائمة بالنتائج."""
    results = []

    for ep in HEALTH_ENDPOINTS:
        url = f"{PLATFORM_URL}{ep['path']}"
        result = query_api_endpoint(url, timeout=REQUEST_TIMEOUT)
        result["name"] = ep["name"]
        result["path"] = ep["path"]
        result["expected"] = ep.get("expect_status", 200)

        # التحقق من كود الحالة المتوقع
        if isinstance(result["expected"], list):
            result["status_ok"] = result["status_code"] in result["expected"]
        else:
            result["status_ok"] = result["status_code"] == result["expected"]

        results.append(result)

    # ── فحوصات إضافية: /login ──
    login_url = f"{PLATFORM_URL}/dashboard/admin/login"
    login_result = check_website_health(login_url, timeout=REQUEST_TIMEOUT)
    login_result["name"] = "صفحة الدخول"
    login_result["path"] = "/dashboard/admin/login"
    login_result["expected"] = 200
    login_result["status_ok"] = login_result["status_code"] == 200
    results.append(login_result)

    # ── فحوصات إضافية: /api/news/feed ──
    news_url = f"{PLATFORM_URL}/api/news/feed"
    news_result = query_api_endpoint(news_url, timeout=REQUEST_TIMEOUT)
    news_result["name"] = "API الأخبار"
    news_result["path"] = "/api/news/feed"
    news_result["expected"] = [200, 401, 404]
    news_result["status_ok"] = news_result["status_code"] in [200, 401, 404]
    results.append(news_result)

    # ─ـ فحص WebSocket (إذا كان متاحاً) ──
    if WEBSOCKET_URL:
        ws_ok = check_websocket_health(WEBSOCKET_URL)
        results.append({
            "name": "WebSocket",
            "path": WEBSOCKET_URL,
            "status_code": 0 if ws_ok else -1,
            "response_time": 0,
            "expected": 0,
            "status_ok": ws_ok,
            "ok": ws_ok,
            "error": None if ws_ok else "فشل اتصال WebSocket",
            "data": None,
        })

    return results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# بناء تقرير الفحص لموجه GLM
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def build_check_report(results: list[dict], railway: dict) -> str:
    """يبني تقرير الفحص بشكل نصي للموجه."""
    lines = []
    for r in results:
        status_icon = "✅" if r["status_ok"] else "❌"
        lines.append(
            f"{status_icon} {r['name']} ({r['path']}): "
            f"كود={r['status_code']}, زمن={r['response_time']}ms"
        )
        if r["error"]:
            lines.append(f"   خطأ: {r['error']}")

    railway_icon = "✅" if railway["reachable"] else "❌"
    lines.append(f"{railway_icon} Railway: متاح={railway['reachable']}, SSL={railway['ssl_valid']}, زمن={railway['response_time']}ms")
    if railway.get("error"):
        lines.append(f"   خطأ: {railway['error']}")

    return "\n".join(lines)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# فحص التبعيات (يُنفذ كل 5 دقائق)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def run_dependency_checks() -> dict:
    """
    يفحص التبعيات الخارجية: Twelve Data API, Redis, قاعدة البيانات.
    يعيد قاموساً بنتائج كل فحص.
    """
    dep_results = {}

    # ── فحص Twelve Data API ──
    if TWELVE_DATA_API_KEY:
        try:
            resp = requests.get(
                "https://api.twelvedata.com/price",
                params={"symbol": "AAPL", "apikey": TWELVE_DATA_API_KEY},
                timeout=10,
            )
            dep_results["twelve_data"] = resp.status_code == 200
            if resp.status_code != 200:
                print(f"  ⚠️ Twelve Data API: HTTP {resp.status_code}")
        except Exception as e:
            dep_results["twelve_data"] = False
            print(f"  ❌ Twelve Data API: {e}")
    else:
        dep_results["twelve_data"] = None  # غير مضبوط

    # ── فحص Redis ──
    if REDIS_URL:
        dep_results["redis"] = check_redis_connection(REDIS_URL)
    else:
        dep_results["redis"] = None  # غير مضبوط

    # ─ـ فحص قاعدة البيانات ──
    if DATABASE_URL:
        dep_results["database"] = check_database_connection(DATABASE_URL)
    else:
        dep_results["database"] = None  # غير مضبوط

    # ── فحص موقع الأخبار المالي ──
    if NEWS_SITE_URL:
        try:
            news_health_url = f"{NEWS_SITE_URL}/api/health"
            resp = requests.get(news_health_url, timeout=10)
            dep_results["news_site"] = resp.status_code == 200
            if resp.status_code != 200:
                print(f"  ⚠️ موقع الأخبار: HTTP {resp.status_code}")
        except Exception as e:
            dep_results["news_site"] = False
            print(f"  ❌ موقع الأخبار: {e}")
    else:
        dep_results["news_site"] = None  # غير مضبوط

    return dep_results


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# الملخص اليومي (يُرسل كل 24 ساعة)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def send_daily_summary() -> None:
    """
    يُرسل ملخصاً يومياً إلى Telegram يحتوي على:
    - إجمالي الفحوصات
    - إجمالي الأخطاء
    - متوسط زمن الاستجابة لكل نقطة نهاية
    - نسبة التوفر (Uptime)
    """
    global total_errors

    # حساب نسبة التوفر
    uptime_pct = ((total_checks - total_errors) / total_checks * 100) if total_checks > 0 else 100.0

    # بناء ملخص أزمنة الاستجابة لكل نقطة نهاية
    avg_lines = []
    for name, times in _response_times_log.items():
        if times:
            avg_ms = round(sum(times) / len(times), 1)
            min_ms = round(min(times), 1)
            max_ms = round(max(times), 1)
            avg_lines.append(f"  • {name}: μ={avg_ms}ms (min={min_ms}, max={max_ms})")

    avg_text = "\n".join(avg_lines) if avg_lines else "  لا توجد بيانات بعد"

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    msg = f"""📋 <b>الملخص اليومي — Roua Trading Monitor</b>

📊 <b>الإحصائيات:</b>
  • إجمالي الفحوصات: <b>{total_checks}</b>
  • إجمالي الأخطاء: <b>{total_errors}</b>
  • إجمالي التنبيهات: <b>{total_alerts}</b>
  • نسبة التوفر: <b>{uptime_pct:.1f}%</b>

⏱️ <b>متوسط زمن الاستجابة:</b>
{avg_text}

🕐 {now}"""

    send_telegram_alert(msg, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, cooldown=0)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# الحلقة الرئيسية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def main():
    global running, consecutive_failures, total_checks, total_alerts
    global total_errors, last_dependency_check, last_daily_summary

    print("━" * 55)
    print("🚀 وكيل مراقبة Roua Trading بدأ العمل")
    print(f"⏱️  فترة الفحص: {CHECK_INTERVAL} ثانية")
    print(f"🌐 المنصة المستهدفة: {PLATFORM_URL}")
    print(f"🤖 نموذج GLM: {GLM_MODEL}")
    print(f"📲 Telegram: {'مضبوط ✅' if TELEGRAM_TOKEN else 'غير مضبوط ⚠️'}")
    print(f"🔑 GLM API Key: {'مضبوط ✅' if API_KEY else 'غير مضبوط ⚠️'}")
    print(f"🔗 WebSocket: {WEBSOCKET_URL or 'غير مضبوط ⚠️'}")
    print(f"💾 Redis: {'مضبوط ✅' if REDIS_URL else 'غير مضبوط ⚠️'}")
    print(f"🗄️ Database: {'مضبوط ✅' if DATABASE_URL else 'غير مضبوط ⚠️'}")
    print(f"📡 Twelve Data: {'مضبوط ✅' if TWELVE_DATA_API_KEY else 'غير مضبوط ⚠️'}")
    print(f"📰 موقع الأخبار: {'مضبوط ✅' if NEWS_SITE_URL else 'غير مضبوط ⚠️'}")
    print(f"⏰ فحص التبعيات: كل {DEPENDENCY_CHECK_INTERVAL} ثانية")
    print(f"📋 الملخص اليومي: كل {DAILY_SUMMARY_INTERVAL} ثانية")
    print("━" * 55)

    # فحص أولي سريع
    print("\n🔍 جارٍ الفحص الأولي...")
    railway = check_railway_status(PLATFORM_URL)
    if railway["reachable"]:
        print("✅ المنصة متاحة — بدء المراقبة المستمرة")
    else:
        print(f"❌ المنصة غير متاحة: {railway.get('error', 'غير معروف')}")
        send_telegram_alert(
            format_alert_message(
                "المنصة غير متاحة عند بدء المراقبة",
                [f"الخطأ: {railway.get('error', 'غير معروف')}"],
                "يحتاج فحص يدوي فوري"
            ),
            TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, cooldown=0
        )

    print()

    while running:
        cycle_start = time.monotonic()
        total_checks += 1
        now_str = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")

        try:
            # 1. فحص حالة Railway
            railway = check_railway_status(PLATFORM_URL, timeout=REQUEST_TIMEOUT)

            # 2. فحص جميع نقاط النهاية
            results = run_health_checks()

            # 3. تحديد ما إذا كانت هناك مشاكل
            failed_checks = [r for r in results if not r["status_ok"]]
            all_ok = len(failed_checks) == 0 and railway["reachable"]

            # 4. بناء تقرير الفحص
            report = build_check_report(results, railway)

            if all_ok:
                # كل شيء يعمل
                consecutive_failures = 0
                print(f"[{now_str}] ✅ جميع الفحوصات ناجحة ({len(results)} نقطة)")

                # فحص أوقات الاستجابة البطيئة
                slow = [r for r in results if r["response_time"] > 5000]
                if slow:
                    slow_names = ", ".join(f"{r['name']}({r['response_time']}ms)" for r in slow)
                    print(f"  ⚠️ استجابة بطيئة: {slow_names}")

            else:
                # هناك مشاكل
                consecutive_failures += 1
                total_errors += len(failed_checks)
                failed_names = ", ".join(f"{r['name']}(HTTP {r['status_code']})" for r in failed_checks)
                print(f"[{now_str}] ❌ فشل {len(failed_checks)}/{len(results)} فحص — {failed_names}")

                # 5. تحليل GLM-5.1 فقط عند وجود مشاكل
                prompt = f"""أنت وكيل مراقبة ذكي لمنصة Roua Trading. مهمتك تحليل نتائج الفحوصات وتقديم تشخيص دقيق.

نتائج الفحوصات الحالية:
{report}

عدد الفشل المتتالي: {consecutive_failures}

أجب باختصار بالعربية:
1. ما سبب المشكلة الأرجح؟
2. ما الإجراء المطلوب؟

إذا كانت المشكلة مؤقتة (timeout أو connection error بسيط)، قل "إشعار: المشكلة قد تكون مؤقتة — المراقبة مستمرة".
إذا كانت المشكلة خطيرة (5xx أو SSL أو خدمة متوقفة)، ابدأ بـ "🚨 تنبيه عاجل:"."""

                analysis = ask_glm(prompt)
                print(f"  🤖 GLM: {analysis[:120]}...")

                # 6. إرسال تنبيه فقط بعد عدد معين من الفشل المتتالي
                if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                    details = []
                    for r in failed_checks:
                        err_info = f"خطأ: {r['error']}" if r["error"] else f"HTTP {r['status_code']}"
                        details.append(f"{r['name']}: {err_info} (زمن: {r['response_time']}ms)")
                    if not railway["reachable"]:
                        details.append(f"Railway: {railway.get('error', 'غير متاح')}")

                    msg = format_alert_message(
                        f"فشل {len(failed_checks)}/{len(results)} فحص (متتالي: {consecutive_failures})",
                        details,
                        analysis
                    )

                    sent = send_telegram_alert(msg, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, cooldown=ALERT_COOLDOWN)
                    if sent:
                        total_alerts += 1

            # 7. ملخص دوري كل 10 فحوصات
            if total_checks % 10 == 0:
                print(f"\n📊 ملخص: {total_checks} فحص | {total_alerts} تنبيه | فشل متتالي: {consecutive_failures}\n")

            # 8. تسجيل أزمنة الاستجابة للملخص اليومي
            for r in results:
                name = r.get("name", r.get("path", "unknown"))
                rt = r.get("response_time", 0)
                if rt > 0:
                    if name not in _response_times_log:
                        _response_times_log[name] = []
                    _response_times_log[name].append(rt)
                    # الاحتفاظ بآخر 1000 قراءة فقط لكل نقطة نهاية
                    if len(_response_times_log[name]) > 1000:
                        _response_times_log[name] = _response_times_log[name][-500:]

            # 9. فحص التبعيات كل DEPENDENCY_CHECK_INTERVAL ثانية
            now_mono = time.monotonic()
            if now_mono - last_dependency_check >= DEPENDENCY_CHECK_INTERVAL:
                last_dependency_check = now_mono
                dep_results = run_dependency_checks()
                dep_ok = all(v is None or v for v in dep_results.values())
                if dep_ok:
                    ok_parts = [k for k, v in dep_results.items() if v is True]
                    skipped_parts = [k for k, v in dep_results.items() if v is None]
                    msg = f"[{now_str}] ✅ التبعيات سليمة: {', '.join(ok_parts)}"
                    if skipped_parts:
                        msg += f" (غير مضبوط: {', '.join(skipped_parts)})"
                    print(msg)
                else:
                    failed_deps = [f"{k}={'❌' if v is False else '⚪'}" for k, v in dep_results.items()]
                    print(f"[{now_str}] ⚠️ مشاكل في التبعيات: {', '.join(failed_deps)}")

            # 10. الملخص اليومي كل DAILY_SUMMARY_INTERVAL ثانية
            if now_mono - last_daily_summary >= DAILY_SUMMARY_INTERVAL:
                last_daily_summary = now_mono
                print(f"\n📋 إرسال الملخص اليومي...")
                send_daily_summary()
                print(f"📋 تم إرسال الملخص اليومي ✅\n")

        except Exception as e:
            consecutive_failures += 1
            error_msg = f"خطأ غير متوقع في الوكيل: {e}"
            print(f"[{now_str}] 💥 {error_msg}")
            send_telegram_alert(
                format_alert_message("خطأ في وكيل المراقبة", [error_msg], "يحتاج فحص يدوي"),
                TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, cooldown=ALERT_COOLDOWN
            )

        # الانتظار حتى الفحص التالي
        elapsed = time.monotonic() - cycle_start
        sleep_time = max(0, CHECK_INTERVAL - elapsed)
        if sleep_time > 0 and running:
            # الانتظار بشكل مجزأ للتحقق من إشارات الإنهاء
            end_time = time.monotonic() + sleep_time
            while running and time.monotonic() < end_time:
                time.sleep(min(2, end_time - time.monotonic()))

    print("\n🏁 وكيل المراقبة توقف.")
    print(f"📊 الإحصائيات: {total_checks} فحص | {total_alerts} تنبيه")


if __name__ == "__main__":
    main()
