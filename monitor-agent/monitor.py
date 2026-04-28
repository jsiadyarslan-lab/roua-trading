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
)
from tools import (
    check_website_health, query_api_endpoint,
    check_railway_status, send_telegram_alert, format_alert_message,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# حالات التشغيل
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
running = True
consecutive_failures = 0
total_checks = 0
total_alerts = 0


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
# الحلقة الرئيسية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def main():
    global running, consecutive_failures, total_checks, total_alerts

    print("━" * 55)
    print("🚀 وكيل مراقبة Roua Trading بدأ العمل")
    print(f"⏱️  فترة الفحص: {CHECK_INTERVAL} ثانية")
    print(f"🌐 المنصة المستهدفة: {PLATFORM_URL}")
    print(f"🤖 نموذج GLM: {GLM_MODEL}")
    print(f"📲 Telegram: {'مضبوط ✅' if TELEGRAM_TOKEN else 'غير مضبوط ⚠️'}")
    print(f"🔑 GLM API Key: {'مضبوط ✅' if API_KEY else 'غير مضبوط ⚠️'}")
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
