"""
وكيل المحتوى لمنصة روعة التجارية.
يُولّد تحليلات سوقية دورية وينشرها عبر Telegram و Twitter.
يعمل كخدمة مستمرة على Railway.
"""

import os
import sys
import time
import signal
from datetime import datetime, timezone

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.config_base import BaseConfig
from shared.telegram_utils import TelegramAlerter
from shared.logger import ColoredLogger
from shared.health_server import HealthCheckServer

from config import ContentConfig
from market_fetcher import fetch_market_data, format_market_summary
from ai_writer import generate_analysis, generate_detailed_report
from publisher import (
    publish_to_telegram,
    publish_to_twitter,
    save_to_history,
    check_duplicate,
)


# أوقات النشر اليومية (بالساعات UTC)
POST_SCHEDULE = {
    "morning": 6,    # 6 AM UTC — تحليل مختصر
    "afternoon": 14, # 2 PM UTC — تقرير مفصل مع توصيات
    "evening": 22,   # 10 PM UTC — ملخص نهاية اليوم
}

POST_TYPE_NAMES = {
    "morning": "تحليل صباحي مختصر",
    "afternoon": "تقرير تحليلي مفصل",
    "evening": "ملخص نهاية اليوم",
}


class ContentAgent:
    """وكيل المحتوى — يُولّد تحليلات سوقية دورية وينشرها."""

    def __init__(self) -> None:
        self.config = ContentConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=0,  # لا تبريد — المحتوى دائماً جديد
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        # حالة الوكيل
        self._running = False
        self._total_posts = 0
        self._total_errors = 0
        self._last_post_time = 0.0
        self._last_post_type = ""
        self._posts_today = 0
        self._current_day = ""

    # ── بدء التشغيل ──

    def start(self) -> None:
        """يبدأ تشغيل وكيل المحتوى."""
        self._running = True

        # بانر البدء
        self.logger.banner([
            "📝 وكيل المحتوى — روعة التجارية",
            "",
            f"  المنصة المستهدفة: {self.config.PLATFORM_URL}",
            f"  جدول النشر: {POST_SCHEDULE['morning']}AM / {POST_SCHEDULE['afternoon'] - 12}PM / {POST_SCHEDULE['evening'] - 12}PM (UTC)",
            f"  الرموز المتابعة: {', '.join(self.config.MARKET_SYMBOLS)}",
            f"  اللغة: {self.config.CONTENT_LANGUAGE}",
            f"  منفذ فحص الصحة: {self.config.HEALTH_PORT}",
            f"  Telegram: {'✅ مضبوط' if self.alerter.is_configured else '❌ غير مضبوط'}",
            f"  Twitter: {'✅ مضبوط' if self._twitter_configured() else '❌ غير مضبوط'}",
            "",
            "  بدء خدمة المحتوى...",
        ])

        # بدء خادم فحص الصحة
        self.health.start()

        # تسجيل معالجات الإشارات
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # نشر المحتوى الأولي فوراً إذا حان الوقت
        self._check_and_publish()

        # حلقة المحتوى الرئيسية
        self._main_loop()

    # ── الحلقة الرئيسية ──

    def _main_loop(self) -> None:
        """حلقة المحتوى الرئيسية — تنشر حسب الجدول اليومي."""
        while self._running:
            try:
                self._reset_daily_counter_if_needed()
                self._check_and_publish()

                # حساب الوقت حتى نقطة النشر التالية
                next_post = self._get_next_post_time()
                now = datetime.now(timezone.utc)
                wait_seconds = (next_post - now).total_seconds()

                if wait_seconds < 0:
                    wait_seconds = 60  # انتظار قصير وإعادة المحاولة
                elif wait_seconds > 300:
                    self.logger.info(
                        f"النشر التالي في {next_post.strftime('%H:%M')} UTC "
                        f"(بعد {int(wait_seconds // 60)} دقيقة)"
                    )

                # انتظار مع فحص الإشارات كل 30 ثانية
                self._sleep(min(int(wait_seconds), 60))

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة المحتوى: {e}")
                self._update_health()
                self._sleep(120)

    def _check_and_publish(self) -> None:
        """يتحقق مما إذا حان وقت النشر وينشر المحتوى المناسب."""
        now = datetime.now(timezone.utc)
        current_hour = now.hour

        self._reset_daily_counter_if_needed()

        # التحقق من كل نقطة نشر
        for post_type, scheduled_hour in POST_SCHEDULE.items():
            if current_hour != scheduled_hour:
                continue

            # تجنب النشر المتكرر في نفس الساعة
            if self._last_post_type == post_type:
                time_since_last = time.time() - self._last_post_time
                if time_since_last < 3600:  # أقل من ساعة
                    continue

            self.logger.info(
                f"حان وقت النشر: {POST_TYPE_NAMES[post_type]} "
                f"(الساعة {scheduled_hour}:00 UTC)"
            )
            self._publish_content(post_type)
            return

    def _publish_content(self, post_type: str) -> None:
        """
        ينشر المحتوى حسب النوع المحدد.

        المعاملات:
            post_type: نوع المنشور (morning أو afternoon أو evening)
        """
        try:
            # جلب بيانات السوق
            self.logger.info("جلب بيانات السوق...")
            market_data = fetch_market_data(
                platform_url=self.config.PLATFORM_URL,
                symbols=self.config.MARKET_SYMBOLS,
                logger=self.logger,
            )

            # التحقق من وجود بيانات صالحة
            valid_data = {
                k: v for k, v in market_data.items()
                if v.get("price", 0) > 0
            }
            if not valid_data:
                self.logger.warning("لم يتم الحصول على بيانات سوق صالحة")
                self._send_failure_alert(
                    "فشل جلب بيانات السوق",
                    "لم يتم الحصول على أي بيانات صالحة من المنصة",
                )
                return

            # توليد المحتوى حسب النوع
            content = None
            content_type_label = post_type

            if post_type == "morning":
                # تحليل مختصر بأسلوب التغريدة
                self.logger.info("توليد التحليل الصباحي المختصر...")
                content = generate_analysis(
                    market_data=valid_data,
                    glm_api_key=self.config.GLM_API_KEY,
                    glm_api_url=self.config.GLM_API_URL,
                    glm_model=self.config.GLM_MODEL,
                    language=self.config.CONTENT_LANGUAGE,
                    logger=self.logger,
                )
                content_type_label = "analysis"

            elif post_type == "afternoon":
                # تقرير مفصل مع توصيات
                self.logger.info("توليد التقرير التحليلي المفصل...")
                content = generate_detailed_report(
                    market_data=valid_data,
                    glm_api_key=self.config.GLM_API_KEY,
                    glm_api_url=self.config.GLM_API_URL,
                    glm_model=self.config.GLM_MODEL,
                    language=self.config.CONTENT_LANGUAGE,
                    logger=self.logger,
                    report_type="afternoon",
                )
                content_type_label = "report"

            elif post_type == "evening":
                # ملخص نهاية اليوم
                self.logger.info("توليد ملخص نهاية اليوم...")
                content = generate_detailed_report(
                    market_data=valid_data,
                    glm_api_key=self.config.GLM_API_KEY,
                    glm_api_url=self.config.GLM_API_URL,
                    glm_model=self.config.GLM_MODEL,
                    language=self.config.CONTENT_LANGUAGE,
                    logger=self.logger,
                    report_type="evening",
                )
                content_type_label = "wrapup"

            if not content:
                self.logger.error("فشل توليد المحتوى")
                self._send_failure_alert(
                    "فشل توليد المحتوى",
                    f"لم يتمكن الذكاء الاصطناعي من توليد {POST_TYPE_NAMES[post_type]}",
                )
                return

            # فحص التكرار
            if check_duplicate(content, self.config.HISTORY_FILE, self.logger):
                self.logger.warning("المحتوى مشابه لمحتوى سابق — إعادة التوليد")
                # محاولة واحدة إضافية
                if post_type == "morning":
                    content = generate_analysis(
                        market_data=valid_data,
                        glm_api_key=self.config.GLM_API_KEY,
                        glm_api_url=self.config.GLM_API_URL,
                        glm_model=self.config.GLM_MODEL,
                        language=self.config.CONTENT_LANGUAGE,
                        logger=self.logger,
                    )
                else:
                    content = generate_detailed_report(
                        market_data=valid_data,
                        glm_api_key=self.config.GLM_API_KEY,
                        glm_api_url=self.config.GLM_API_URL,
                        glm_model=self.config.GLM_MODEL,
                        language=self.config.CONTENT_LANGUAGE,
                        logger=self.logger,
                        report_type=post_type,
                    )

                if not content:
                    self.logger.error("فشل إعادة توليد المحتوى")
                    return

            # إضافة ترويسة نوع المحتوى
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
            header = self._build_header(post_type, now_str)
            full_content = f"{header}\n\n{content}"

            # النشر عبر Telegram
            tg_sent = publish_to_telegram(full_content, self.alerter, self.logger)

            # النشر عبر Twitter (للتحليل المختصر فقط)
            tw_sent = False
            if post_type == "morning":
                tw_sent = publish_to_twitter(content, self.config, self.logger)

            # حفظ في السجل
            save_to_history(
                full_content,
                self.config.HISTORY_FILE,
                self.logger,
                content_type=content_type_label,
            )

            # تحديث الحالة
            self._total_posts += 1
            self._posts_today += 1
            self._last_post_time = time.time()
            self._last_post_type = post_type

            self.logger.info(
                f"تم النشر بنجاح — النوع: {POST_TYPE_NAMES[post_type]} | "
                f"Telegram: {'✅' if tg_sent else '❌'} | "
                f"Twitter: {'✅' if tw_sent else '—'}"
            )

            self._update_health(
                healthy=True,
                last_check=datetime.now(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            )

        except Exception as e:
            self._total_errors += 1
            self.logger.error(f"خطأ أثناء نشر المحتوى: {e}")
            self._send_failure_alert(
                "خطأ في نشر المحتوى",
                str(e),
            )
            self._update_health(
                healthy=False,
                last_check=datetime.now(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            )

    # ── أدوات مساعدة ──

    def _build_header(self, post_type: str, now_str: str) -> str:
        """
        يبني ترويسة المحتوى حسب النوع.

        المعاملات:
            post_type: نوع المنشور
            now_str: الوقت الحالي منسقاً

        يعيد:
            نص الترويسة
        """
        if post_type == "morning":
            icon = "🌅"
            title = "تحليل صباحي"
        elif post_type == "afternoon":
            icon = "☀️"
            title = "تقرير تحليلي"
        else:  # evening
            icon = "🌙"
            title = "ملخص اليوم"

        return f"{icon} <b>{title}</b> — روعة للتداول\n🕐 {now_str}"

    def _get_next_post_time(self) -> datetime:
        """
        يحسب وقت النشر التالي.

        يعيد:
            كائن datetime لوقت النشر التالي
        """
        now = datetime.now(timezone.utc)
        today = now.date()

        for post_type, hour in sorted(POST_SCHEDULE.items(), key=lambda x: x[1]):
            scheduled = datetime(
                today.year, today.month, today.day,
                hour, 0, 0, tzinfo=timezone.utc,
            )
            if scheduled > now:
                return scheduled

        # إذا فاتت جميع أوقات اليوم، فالأول في الغد
        first_hour = min(POST_SCHEDULE.values())
        from datetime import timedelta
        next_day = today + timedelta(days=1)
        return datetime(
            next_day.year, next_day.month, next_day.day,
            first_hour, 0, 0, tzinfo=timezone.utc,
        )

    def _reset_daily_counter_if_needed(self) -> None:
        """يعيد عداد المنشورات اليومية عند تغير اليوم."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if today != self._current_day:
            if self._current_day:
                self.logger.info(
                    f"ملخص اليوم السابق: {self._posts_today} منشور"
                )
            self._current_day = today
            self._posts_today = 0
            self._last_post_type = ""

    def _twitter_configured(self) -> bool:
        """يتحقق مما إذا كانت إعدادات Twitter مكتملة."""
        return all([
            self.config.TWITTER_API_KEY,
            self.config.TWITTER_API_SECRET,
            self.config.TWITTER_ACCESS_TOKEN,
            self.config.TWITTER_ACCESS_SECRET,
        ])

    def _send_failure_alert(self, title: str, details: str) -> None:
        """يرسل تنبيه فشل عبر Telegram."""
        if not self.alerter.is_configured:
            return

        alert_message = self.alerter.format_alert(
            agent_name="📝 وكيل المحتوى",
            title=title,
            details=[details],
            severity="⚠️",
        )
        self.alerter.send(alert_message, cooldown=0)

    def _sleep(self, seconds: int) -> None:
        """ينتظر مع فحص حالة التشغيل."""
        for _ in range(seconds):
            if not self._running:
                break
            time.sleep(1)

    # ── فحص الصحة ──

    def _update_health(
        self,
        healthy: bool = True,
        last_check: str | None = None,
    ) -> None:
        """يحدّث حالة فحص الصحة."""
        self.health.update(
            healthy=healthy,
            total_checks=self._total_posts,
            total_errors=self._total_errors,
            last_check=last_check or "never",
        )

    # ── معالجة الإشارات ──

    def _handle_signal(self, signum: int, frame) -> None:
        """يعالج إشارات الإيقاف."""
        signal_name = signal.Signals(signum).name
        self.logger.info(f"تم استلام إشارة {signal_name} — بدء الإيقاف الآمن...")

        # إرسال تنبيه إيقاف
        if self.alerter.is_configured:
            shutdown_msg = self.alerter.format_alert(
                agent_name="📝 وكيل المحتوى",
                title="إيقاف الوكيل",
                details=[
                    f"تم استلام إشارة {signal_name}",
                    f"إجمالي المنشورات: {self._total_posts}",
                    f"إجمالي الأخطاء: {self._total_errors}",
                    "الوكيل يتوقف بشكل آمن...",
                ],
                severity="ℹ️",
            )
            self.alerter.send(shutdown_msg, cooldown=0)

        self._running = False

    def stop(self) -> None:
        """يوقف وكيل المحتوى بشكل آمن."""
        self.logger.info("بدء إيقاف وكيل المحتوى...")
        self._running = False
        self.health.stop()
        self.logger.info("تم إيقاف وكيل المحتوى بنجاح")


# ── نقطة الدخول ──

def main() -> None:
    """نقطة الدخول الرئيسية لوكيل المحتوى."""
    agent = ContentAgent()

    try:
        agent.start()
    except KeyboardInterrupt:
        agent.logger.info("تم الضغط على Ctrl+C — إيقاف الوكيل...")
        agent._handle_signal(signal.SIGINT, None)
    except Exception as e:
        agent.logger.critical(f"خطأ قاتل: {e}")
        agent._update_health(healthy=False)
        agent.stop()
        sys.exit(1)

    agent.stop()
    agent.logger.info("وكيل المحتوى توقف بنجاح")


if __name__ == "__main__":
    main()
