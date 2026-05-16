"""
وكيل الإصلاح الذاتي — إشعار الموافقة البشرية
يرسل إشعاراً إلى Telegram مع رابط PR وزرّي [موافقة] [رفض].
يتتبع حالة الموافقة ويعيد النتيجة.
"""

import json
import time
import requests
from datetime import datetime, timezone
from typing import Optional

from config import TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, GITHUB_REPO


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إرسال إشعار الموافقة البشرية
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def send_approval_notification(
    pr_result,
    fix_result,
    error_info: dict,
    test_result: Optional[dict] = None,
) -> dict:
    """
    يرسل إشعاراً إلى Telegram مع رابط PR للموافقة البشرية.

    يعيد:
        قاموس يحتوي:
        - success: هل نجح الإرسال؟
        - message_id: معرف الرسالة
        - error: رسالة الخطأ إن وجدت
    """
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {
            "success": False,
            "message_id": None,
            "error": "TELEGRAM_TOKEN أو TELEGRAM_CHAT_ID غير مضبوط",
        }

    # بناء رسالة Telegram
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    error_type = error_info.get("type", "unknown")
    error_message = error_info.get("message", "غير محدد")
    error_file = error_info.get("file", "غير محدد")

    test_status = "⏳ بانتظار"
    if test_result:
        test_status = "✅ نجحت" if test_result.get("tests_passed") else "❌ فشلت"

    pr_link = pr_result.pr_html_url or f"https://github.com/{GITHUB_REPO}/pull/{pr_result.pr_number}"

    message = f"""🤖 <b>وكيل الإصلاح الذاتي — PR جديد</b>

<b>الخطأ:</b> {error_type}
<b>الرسالة:</b> {error_message}
<b>الملف:</b> <code>{error_file}</code>

<b>الإصلاح:</b> {fix_result.explanation or 'إصلاح تلقائي'}
<b>النطاق:</b> {fix_result.fix_scope or 'غير محدد'}
<b>الأمان:</b> {'✅ آمن' if fix_result.is_safe else '⚠️ يحتاج مراجعة'}
<b>الاختبار:</b> {test_status}

🔗 <b>رابط PR:</b> {pr_link}

━━━━━━━━━━━━━━━━━━━━
⚠️ <b>لا تدمج بدون مراجعة بشرية!</b>
افتح PR، راجع التغييرات، ثم ادمج يدوياً.

🕐 {now}"""

    # إرسال الرسالة مع أزرار inline
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"

    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
        "reply_markup": json.dumps({
            "inline_keyboard": [
                [
                    {
                        "text": "🔗 فتح PR",
                        "url": pr_link,
                    },
                    {
                        "text": "📊 عرض التغييرات",
                        "url": f"{pr_link}/files",
                    },
                ],
                [
                    {
                        "text": "✅ موافقة (ادمج يدوياً)",
                        "callback_data": f"approve:{pr_result.pr_number}",
                    },
                    {
                        "text": "❌ رفض",
                        "callback_data": f"reject:{pr_result.pr_number}",
                    },
                ],
            ]
        }),
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            message_id = data.get("result", {}).get("message_id")
            print(f"  📲 تم إرسال إشعار الموافقة (message_id: {message_id})")
            return {
                "success": True,
                "message_id": message_id,
                "error": None,
            }
        else:
            error_msg = resp.json().get("description", "خطأ غير معروف")
            # محاولة إرسال بدون أزرار inline
            return _send_simple_notification(pr_link, fix_result, error_info, test_status, now)
    except Exception as e:
        return _send_simple_notification(pr_link, fix_result, error_info, test_status, now)


def _send_simple_notification(
    pr_link: str,
    fix_result,
    error_info: dict,
    test_status: str,
    now: str,
) -> dict:
    """يرسل إشعاراً بسيطاً بدون أزرار inline (احتياطي)."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {"success": False, "message_id": None, "error": "Telegram غير مضبوط"}

    error_type = error_info.get("type", "unknown")
    error_message = error_info.get("message", "غير محدد")

    message = f"""🤖 <b>وكيل الإصلاح الذاتي — PR جديد</b>

<b>الخطأ:</b> {error_type}
<b>الرسالة:</b> {error_message}
<b>الإصلاح:</b> {fix_result.explanation or 'إصلاح تلقائي'}
<b>الأمان:</b> {'✅ آمن' if fix_result.is_safe else '⚠️ يحتاج مراجعة'}
<b>الاختبار:</b> {test_status}

🔗 <b>رابط PR:</b> {pr_link}

⚠️ لا تدمج بدون مراجعة بشرية!

🕐 {now}"""

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            message_id = data.get("result", {}).get("message_id")
            return {"success": True, "message_id": message_id, "error": None}
        return {"success": False, "message_id": None, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "message_id": None, "error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إرسال تنبيه فشل الاختبار
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def send_failure_alert(
    fix_result,
    error_info: dict,
    test_result: dict,
    branch_name: str,
) -> dict:
    """
    يرسل تنبيه فشل الاختبار إلى Telegram.
    يُستدعى عندما تفشل الاختبارات بعد تطبيق الإصلاح.
    """
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {"success": False, "error": "Telegram غير مضبوط"}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    error_type = error_info.get("type", "unknown")
    error_message = error_info.get("message", "غير محدد")
    test_error = test_result.get("error", "غير محدد")

    message = f"""❌ <b>وكيل الإصلاح الذاتي — فشل الإصلاح</b>

<b>الخطأ الأصلي:</b> {error_type}
<b>الرسالة:</b> {error_message}
<b>الإصلاح المقترح:</b> {fix_result.explanation or 'غير محدد'}

<b>سبب الفشل:</b>
{test_error}

<b>الفرع:</b> <code>{branch_name}</code>
<b>الإجراء:</b> تم حذف الفرع — الإصلاح يحتاج مراجعة يدوية.

🕐 {now}"""

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            print(f"  📲 تم إرسال تنبيه الفشل")
            return {"success": True, "error": None}
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إرسال تنبيه خطأ غير آمن
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def send_unsafe_fix_alert(
    analysis_result: dict,
    error_info: dict,
) -> dict:
    """
    يرسل تنبيه بأن الإصلاح المقترح غير آمن ولا يمكن تطبيقه تلقائياً.
    """
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {"success": False, "error": "Telegram غير مضبوط"}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    error_type = error_info.get("type", "unknown")
    error_message = error_info.get("message", "غير محدد")
    safety_reason = analysis_result.get("safety_reason", "غير محدد")
    fix_scope = analysis_result.get("fix_scope", "غير محدد")

    message = f"""⚠️ <b>وكيل الإصلاح الذاتي — إصلاح غير آمن</b>

<b>الخطأ:</b> {error_type}
<b>الرسالة:</b> {error_message}
<b>النطاق:</b> {fix_scope}

<b>السبب:</b>
{safety_reason}

<b>الإجراء:</b> تم تخطي الإصلاح التلقائي — يحتاج تدخل يدوي.

🕐 {now}"""

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code == 200:
            print(f"  📲 تم إرسال تنبيه الإصلاح غير الآمن")
            return {"success": True, "error": None}
        return {"success": False, "error": f"HTTP {resp.status_code}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# إرسال ملخص دوري
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
def send_periodic_summary(
    total_checks: int,
    total_errors: int,
    total_fixes: int,
    total_prs: int,
    total_failed: int,
) -> dict:
    """يرسل ملخصاً دورياً إلى Telegram."""
    if not TELEGRAM_TOKEN or not TELEGRAM_CHAT_ID:
        return {"success": False, "error": "Telegram غير مضبوط"}

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    uptime_pct = (max(0, total_checks - total_errors) / total_checks * 100) if total_checks > 0 else 100.0

    message = f"""📋 <b>وكيل الإصلاح الذاتي — ملخص دوري</b>

📊 <b>الإحصائيات:</b>
  • إجمالي الفحوصات: <b>{total_checks}</b>
  • أخطاء مكتشفة: <b>{total_errors}</b>
  • إصلاحات ناجحة: <b>{total_fixes}</b>
  • PRs مفتوحة: <b>{total_prs}</b>
  • إصلاحات فاشلة: <b>{total_failed}</b>
  • نسبة التوفر: <b>{uptime_pct:.1f}%</b>

🕐 {now}"""

    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "parse_mode": "HTML",
    }

    try:
        resp = requests.post(url, json=payload, timeout=15)
        return {"success": resp.status_code == 200, "error": None}
    except Exception as e:
        return {"success": False, "error": str(e)}
