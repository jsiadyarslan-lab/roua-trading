"""
وحدة الإشعارات لوكيل التنبيهات.
ترسل إشعارات عبر عدة قنوات (Push، بريد إلكتروني، Telegram)
وتحدّث حالة التنبيه في قاعدة البيانات.
"""

import time
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone

import requests
import psycopg2

from typing import Optional


def send_push_notification(
    user_id: str, alert: dict, platform_url: str, logger
) -> bool:
    """
    يرسل إشعاراً فورياً عبر واجهة برمجة التطبيقات للمنصة.

    المعاملات:
        user_id: معرّف المستخدم
        alert: قاموس التنبيه
        platform_url: رابط المنصة الأساسي
        logger: مسجل الأحداث

    يعيد:
        True إذا نجح الإرسال، False إذا فشل
    """
    url = f"{platform_url}/api/notifications/push"

    symbol = alert.get("symbol", "غير محدد")
    condition = alert.get("condition", "above")
    target_price = alert.get("targetPrice", 0)

    condition_text = {
        "above": "أعلى من",
        "below": "أدنى من",
        "crosses_up": "اخترق لأعلى",
        "crosses_down": "اخترق لأدنى",
    }.get(condition, condition)

    payload = {
        "userId": user_id,
        "type": "price_alert",
        "title": f"تنبيه سعر: {symbol}",
        "body": f"تنبيه! {symbol} أصبح {condition_text} {target_price}",
        "data": {
            "alertId": alert.get("id", ""),
            "symbol": symbol,
            "condition": condition,
            "targetPrice": target_price,
            # i18n data for frontend translation
            "notificationType": "priceAlert",
            "params": {
                "symbol": symbol,
                "condition": condition_text,
                "targetPrice": str(target_price),
            },
        },
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code in (200, 201, 204):
            logger.info(f"تم إرسال إشعار فوري للمستخدم {user_id}")
            return True
        else:
            logger.warning(
                f"فشل إرسال إشعار فوري: HTTP {response.status_code}"
            )
            return False
    except requests.exceptions.Timeout:
        logger.error("انتهت مهلة إرسال الإشعار الفوري")
        return False
    except requests.exceptions.ConnectionError:
        logger.error("فشل الاتصال بالمنصة لإرسال الإشعار الفوري")
        return False
    except Exception as e:
        logger.error(f"خطأ في إرسال الإشعار الفوري: {e}")
        return False


def send_email_notification(
    user_id: str,
    alert: dict,
    current_price: float,
    config,
    logger,
) -> bool:
    """
    يرسل إشعاراً عبر البريد الإلكتروني باستخدام SMTP.

    المعاملات:
        user_id: معرّف المستخدم
        alert: قاموس التنبيه
        current_price: السعر الحالي
        config: إعدادات الوكيل
        logger: مسجل الأحداث

    يعيد:
        True إذا نجح الإرسال، False إذا فشل أو كانت الإعدادات غير مكتملة
    """
    # التحقق من إعدادات SMTP
    if not config.SMTP_HOST or not config.SMTP_USER:
        logger.debug("إعدادات SMTP غير مكتملة — تخطي إرسال البريد")
        return False

    # جلب بريد المستخدم من قاعدة البيانات
    user_email = _get_user_email(user_id, config.DATABASE_URL, logger)
    if not user_email:
        logger.warning(f"لم يتم العثور على بريد المستخدم {user_id}")
        return False

    symbol = alert.get("symbol", "غير محدد")
    condition = alert.get("condition", "above")
    target_price = float(alert.get("targetPrice", 0))

    condition_text = {
        "above": "أصبح أعلى من",
        "below": "أصبح أدنى من",
        "crosses_up": "اخترق لأعلى سعر",
        "crosses_down": "اخترق لأدنى سعر",
    }.get(condition, condition)

    subject = f"🔔 تنبيه سعر: {symbol} — {condition_text} {target_price}"

    body = f"""
مرحباً،

تم تفعيل تنبيه السعر الخاص بك:

  الرمز: {symbol}
  الشرط: {condition_text} {target_price}
  السعر الحالي: {current_price}
  الوقت: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}

مع تحيات فريق روعة التجارية
"""

    try:
        msg = MIMEMultipart()
        msg["From"] = config.EMAIL_FROM
        msg["To"] = user_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain", "utf-8"))

        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT) as server:
            server.starttls()
            server.login(config.SMTP_USER, config.SMTP_PASS)
            server.send_message(msg)

        logger.info(f"تم إرسال بريد إلكتروني إلى {user_email}")
        return True

    except smtplib.SMTPAuthenticationError:
        logger.error("فشل مصادقة SMTP — تحقق من بيانات الدخول")
        return False
    except smtplib.SMTPConnectError:
        logger.error("فشل الاتصال بخادم SMTP")
        return False
    except Exception as e:
        logger.error(f"خطأ في إرسال البريد الإلكتروني: {e}")
        return False


def send_telegram_notification(
    user_chat_id: str,
    alert: dict,
    current_price: float,
    alerter,
    logger,
) -> bool:
    """
    يرسل إشعاراً عبر Telegram.

    المعاملات:
        user_chat_id: معرّف محادثة Telegram للمستخدم
        alert: قاموس التنبيه
        current_price: السعر الحالي
        alerter: مرسل تنبيهات Telegram
        logger: مسجل الأحداث

    يعيد:
        True إذا نجح الإرسال، False إذا فشل
    """
    if not alerter.is_configured:
        logger.debug("Telegram غير مضبوط — تخطي إرسال الإشعار")
        return False

    symbol = alert.get("symbol", "غير محدد")
    condition = alert.get("condition", "above")
    target_price = float(alert.get("targetPrice", 0))

    condition_text = {
        "above": "أصبح أعلى من",
        "below": "أصبح أدنى من",
        "crosses_up": "اخترق لأعلى",
        "crosses_down": "اخترق لأدنى",
    }.get(condition, condition)

    details = [
        f"الرمز: {symbol}",
        f"الشرط: {condition_text} {target_price:,.4f}",
        f"السعر الحالي: {current_price:,.4f}",
        f"الانحراف: {current_price - target_price:+,.4f}",
    ]

    message = alerter.format_alert(
        agent_name="🔔 وكيل التنبيهات",
        title=f"تنبيه سعر مُفعَّل: {symbol}",
        details=details,
        severity="🔔",
    )

    # إرسال مباشر بدون تبريد (تنبيهات المستخدمين يجب أن تصل فوراً)
    try:
        url = f"https://api.telegram.org/bot{alerter._token}/sendMessage"
        payload = {
            "chat_id": user_chat_id,
            "text": message,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            logger.info(f"تم إرسال إشعار Telegram للمحادثة {user_chat_id}")
            return True
        else:
            logger.warning(
                f"فشل إرسال Telegram: HTTP {response.status_code}"
            )
            return False
    except Exception as e:
        logger.error(f"خطأ في إرسال إشعار Telegram: {e}")
        return False


def mark_alert_triggered(alert_id: str, db_url: str, logger) -> bool:
    """
    يحدّث حالة التنبيه في قاعدة البيانات إلى "مُفعَّل" وغير نشط.

    المعاملات:
        alert_id: معرّف التنبيه
        db_url: رابط قاعدة البيانات
        logger: مسجل الأحداث

    يعيد:
        True إذا نجح التحديث، False إذا فشل
    """
    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        cursor.execute(
            """
            UPDATE "Alert"
            SET "isActive" = false, "isTriggered" = true, "updatedAt" = NOW()
            WHERE "id" = %s
            """,
            (alert_id,),
        )

        affected = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()

        if affected > 0:
            logger.info(f"تم تحديث حالة التنبيه {alert_id} إلى مُفعَّل")
            return True
        else:
            logger.warning(f"لم يتم العثور على التنبيه {alert_id} للتحديث")
            return False

    except psycopg2.Error as e:
        logger.error(f"خطأ في قاعدة البيانات عند تحديث التنبيه {alert_id}: {e}")
        return False
    except Exception as e:
        logger.error(f"خطأ غير متوقع عند تحديث التنبيه {alert_id}: {e}")
        return False


def notify_user(
    alert: dict,
    current_price: float,
    config,
    alerter,
    db_url: str,
    logger,
) -> dict[str, bool]:
    """
    ينسّق جميع طرق الإشعار لتنبيه معين مع منطق إعادة المحاولة.

    المعاملات:
        alert: قاموس التنبيه
        current_price: السعر الحالي
        config: إعدادات الوكيل
        alerter: مرسل تنبيهات Telegram
        db_url: رابط قاعدة البيانات
        logger: مسجل الأحداث

    يعيد:
        قاموس من طريقة الإشعار إلى نتيجتها (True/False)
    """
    results: dict[str, bool] = {}
    user_id = alert.get("userId", "")
    alert_id = alert.get("id", "")

    # ── 1. إشعار فوري عبر المنصة ──
    push_sent = _retry_operation(
        lambda: send_push_notification(
            user_id, alert, config.PLATFORM_URL, logger
        ),
        max_retries=config.MAX_RETRIES,
        base_delay=config.RETRY_DELAY,
        operation_name="إشعار فوري",
        logger=logger,
    )
    results["push"] = push_sent

    # ── 2. إشعار بريد إلكتروني ──
    email_sent = _retry_operation(
        lambda: send_email_notification(
            user_id, alert, current_price, config, logger
        ),
        max_retries=config.MAX_RETRIES,
        base_delay=config.RETRY_DELAY,
        operation_name="بريد إلكتروني",
        logger=logger,
    )
    results["email"] = email_sent

    # ── 3. إشعار Telegram (للمستخدمين المسجلين) ──
    user_chat_id = _get_user_telegram_chat_id(user_id, db_url, logger)
    if user_chat_id:
        telegram_sent = _retry_operation(
            lambda: send_telegram_notification(
                user_chat_id, alert, current_price, alerter, logger
            ),
            max_retries=config.MAX_RETRIES,
            base_delay=config.RETRY_DELAY,
            operation_name="Telegram",
            logger=logger,
        )
        results["telegram"] = telegram_sent
    else:
        results["telegram"] = False
        logger.debug(f"لا يوجد معرّف Telegram للمستخدم {user_id}")

    # ── 4. تحديث حالة التنبيه في قاعدة البيانات ──
    marked = _retry_operation(
        lambda: mark_alert_triggered(alert_id, db_url, logger),
        max_retries=config.MAX_RETRIES,
        base_delay=config.RETRY_DELAY,
        operation_name="تحديث حالة التنبيه",
        logger=logger,
    )
    results["db_marked"] = marked

    # ملخص نتائج الإشعار
    success_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    logger.info(
        f"نتيجة إشعار التنبيه {alert_id}: "
        f"{success_count}/{total_count} ناجح — {results}"
    )

    return results


# ── دوال مساعدة ──


def _retry_operation(
    operation,
    max_retries: int,
    base_delay: int,
    operation_name: str,
    logger,
) -> bool:
    """
    يعيد محاولة عملية مع تأخير أسيّ.

    المعاملات:
        operation: الدالة المراد تنفيذها
        max_retries: عدد المحاولات الأقصى
        base_delay: التأخير الأساسي بالثواني
        operation_name: اسم العملية للسجلات
        logger: مسجل الأحداث

    يعيد:
        True إذا نجحت العملية، False إذا فشلت جميع المحاولات
    """
    for attempt in range(1, max_retries + 1):
        try:
            result = operation()
            if result:
                return True
            # العملية أرجعت False — إعادة المحاولة
            if attempt < max_retries:
                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    f"فشل {operation_name} (محاولة {attempt}/{max_retries}) — "
                    f"إعادة المحاولة بعد {delay} ثانية"
                )
                time.sleep(delay)
        except Exception as e:
            if attempt < max_retries:
                delay = base_delay * (2 ** (attempt - 1))
                logger.warning(
                    f"خطأ في {operation_name} (محاولة {attempt}/{max_retries}): {e} — "
                    f"إعادة المحاولة بعد {delay} ثانية"
                )
                time.sleep(delay)
            else:
                logger.error(
                    f"فشلت جميع محاولات {operation_name} ({max_retries}): {e}"
                )

    return False


def _get_user_email(user_id: str, db_url: str, logger) -> Optional[str]:
    """يجلب بريد المستخدم الإلكتروني من قاعدة البيانات."""
    if not db_url:
        return None

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        cursor.execute(
            'SELECT "email" FROM "User" WHERE "id" = %s LIMIT 1',
            (user_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row:
            return row[0]
        return None

    except psycopg2.Error as e:
        logger.debug(f"خطأ في جلب بريد المستخدم {user_id}: {e}")
        return None


def _get_user_telegram_chat_id(
    user_id: str, db_url: str, logger
) -> Optional[str]:
    """يجلب معرّف محادثة Telegram للمستخدم من قاعدة البيانات."""
    if not db_url:
        return None

    try:
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()

        # محاولة جلب من حقل telegramChatId في جدول المستخدم
        cursor.execute(
            'SELECT "telegramChatId" FROM "User" WHERE "id" = %s LIMIT 1',
            (user_id,),
        )
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if row and row[0]:
            return row[0]
        return None

    except psycopg2.Error as e:
        logger.debug(
            f"خطأ في جلب معرّف Telegram للمستخدم {user_id}: {e}"
        )
        return None
