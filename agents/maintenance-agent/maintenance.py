"""
وكيل الصيانة لمنصة روعة التجارية.
ينفذ النسخ الاحتياطي الدوري والتنظيف التلقائي ويرسل تنبيهات عبر Telegram.
يعمل كخدمة مستمرة على Railway.
"""

import os
import sys
import time
import signal
from datetime import datetime, timezone

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig
from shared.telegram_utils import TelegramAlerter
from shared.logger import ColoredLogger
from shared.health_server import HealthCheckServer

from config import MaintenanceConfig
from backup import run_backup_cycle, format_bytes
from cleanup import run_cleanup_cycle

# جسر الربط بموقع الأخبار
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'shared'))
try:
    from news_bridge import NewsBridge
except ImportError:
    NewsBridge = None


class MaintenanceAgent:
    """وكيل الصيانة — نسخ احتياطي دوري وتنظيف تلقائي."""

    def __init__(self) -> None:
        self.config = MaintenanceConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=1800,
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        # حالة الوكيل
        self._running = False
        self._total_backups = 0
        self._total_cleanups = 0
        self._total_errors = 0
        self._last_backup_time = 0.0
        self._last_cleanup_time = 0.0
        self._last_backup_success = False
        self._last_cleanup_success = False

        # جسر الربط بموقع الأخبار المالي
        self.news: NewsBridge | None = None
        if NewsBridge and self.config.NEWS_SITE_URL:
            self.news = NewsBridge(
                news_url=self.config.NEWS_SITE_URL,
                api_key=self.config.NEWS_API_KEY,
                cron_secret=self.config.CRON_SECRET,
                logger=self.logger,
            )

        # حساب وقت النسخ الاحتياطي المجدول التالي (2:00 صباحاً بالتوقيت العالمي)
        self._next_scheduled_backup = self._calculate_next_scheduled_backup()

    # ── بدء التشغيل ──

    def start(self) -> None:
        """يبدأ تشغيل وكيل الصيانة."""
        self._running = True

        # بانر البدء
        self.logger.banner([
            "🔧  وكيل الصيانة — روعة التجارية",
            "",
            f"  المنصة المستهدفة: {self.config.PLATFORM_URL}",
            f"  نسخ احتياطي كل: {self.config.BACKUP_INTERVAL // 3600} ساعات",
            f"  تنظيف كل: {self.config.CLEANUP_INTERVAL // 3600} ساعات",
            f"  تخزين النسخ: {self.config.BACKUP_STORAGE_TYPE}",
            f"  التحقق من النسخ: {'نعم' if self.config.VERIFY_BACKUP else 'لا'}",
            f"  منفذ فحص الصحة: {self.config.HEALTH_PORT}",
            f"  Telegram: {'مضبوط' if self.alerter.is_configured else 'غير مضبوط'}",
            f"  DATABASE_URL: {'مضبوط' if self.config.DATABASE_URL else 'غير مضبوط'}",
            f"  موقع الأخبار: {'✅ مربوط' if self.news and self.news.is_configured else '⚠️ غير مربوط'}",
            "",
            "  بدء خدمات الصيانة...",
        ])

        # بدء خادم فحص الصحة
        self.health.start()

        # تسجيل معالجات الإشارات
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # إنشاء المجلدات اللازمة
        self._ensure_directories()

        # إرسال تنبيه بدء التشغيل
        if self.alerter.is_configured:
            startup_msg = self.alerter.format_alert(
                agent_name="🔧 وكيل الصيانة",
                title="بدء تشغيل الوكيل",
                details=[
                    f"المنصة: {self.config.PLATFORM_URL}",
                    f"فاصل النسخ الاحتياطي: {self.config.BACKUP_INTERVAL // 3600} ساعات",
                    f"فاصل التنظيف: {self.config.CLEANUP_INTERVAL // 3600} ساعات",
                    f"التخزين: {self.config.BACKUP_STORAGE_TYPE}",
                ],
                severity="ℹ️",
            )
            self.alerter.send(startup_msg, cooldown=0)

        # تنفيذ دورة أولية فورية
        self.logger.info("بدء دورة صيانة أولية...")
        self._run_backup()
        self._run_cleanup()

        # تشغيل خط أنابيب الأخبار إذا كان متاحاً
        self._trigger_news_pipeline()

        # حلقة المراقبة الرئيسية
        self._main_loop()

    # ── الحلقة الرئيسية ──

    def _main_loop(self) -> None:
        """حلقة المراقبة الرئيسية — تنفذ النسخ الاحتياطي والتنظيف حسب الجدول."""
        while self._running:
            try:
                now = time.time()
                time_since_backup = now - self._last_backup_time
                time_since_cleanup = now - self._last_cleanup_time

                # هل حان وقت النسخ الاحتياطي؟
                if time_since_backup >= self.config.BACKUP_INTERVAL:
                    self.logger.info("حان وقت النسخ الاحتياطي المجدول")
                    self._run_backup()
                # هل حان وقت التنظيف؟
                elif time_since_cleanup >= self.config.CLEANUP_INTERVAL:
                    self.logger.info("حان وقت التنظيف المجدول")
                    self._run_cleanup()
                else:
                    # حساب الوقت المتبقي
                    next_backup = self.config.BACKUP_INTERVAL - time_since_backup
                    next_cleanup = self.config.CLEANUP_INTERVAL - time_since_cleanup
                    next_action = min(next_backup, next_cleanup)

                    if next_action > 60:
                        action_type = "النسخ الاحتياطي" if next_backup < next_cleanup else "التنظيف"
                        self.logger.info(
                            f"المهمة التالية ({action_type}) بعد {int(next_action // 60)} دقيقة"
                        )

                # انتظار مع فحص الإشارات كل 30 ثانية
                self._sleep(30)

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة المراقبة: {e}")
                self._update_health()
                self._sleep(60)

    def _sleep(self, seconds: int) -> None:
        """ينتظر مع فحص حالة التشغيل."""
        for _ in range(seconds):
            if not self._running:
                break
            time.sleep(1)

    # ── تنفيذ المهام ──

    def _run_backup(self) -> None:
        """ينفذ دورة النسخ الاحتياطي."""
        self.logger.info("بدء دورة النسخ الاحتياطي...")

        try:
            start_time = time.time()
            result = run_backup_cycle(self.config, self.alerter, self.logger)
            elapsed = round(time.time() - start_time, 2)

            self._last_backup_time = time.time()
            self._total_backups += 1
            self._last_backup_success = result["overall_success"]

            if result["overall_success"]:
                self.logger.info(f"اكتملت دورة النسخ الاحتياطي بنجاح في {elapsed} ثانية")
            else:
                self._total_errors += 1
                self.logger.error("فشلت دورة النسخ الاحتياطي")

                # إرسال تنبيه فشل إضافي إذا لم يتم إرساله في run_backup_cycle
                if self.alerter.is_configured and not result.get("backup", {}).get("success", False):
                    alert = self.alerter.format_alert(
                        agent_name="🔧 وكيل الصيانة",
                        title="فشل النسخ الاحتياطي",
                        details=[
                            "فشلت دورة النسخ الاحتياطي بالكامل",
                            f"المدة: {elapsed} ثانية",
                            result.get("backup", {}).get("error", "خطأ غير معروف")[:200],
                        ],
                        severity="🚨",
                    )
                    self.alerter.send(alert, cooldown=0)

            self._update_health(
                last_check=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            )

        except Exception as e:
            self._total_errors += 1
            self._last_backup_success = False
            self.logger.error(f"خطأ قاتل أثناء النسخ الاحتياطي: {e}")

            if self.alerter.is_configured:
                alert = self.alerter.format_alert(
                    agent_name="🔧 وكيل الصيانة",
                    title="خطأ قاتل في النسخ الاحتياطي",
                    details=[f"خطأ غير معالج: {str(e)[:200]}"],
                    severity="🚨",
                )
                self.alerter.send(alert, cooldown=0)

            self._update_health()

    def _run_cleanup(self) -> None:
        """ينفذ دورة التنظيف."""
        self.logger.info("بدء دورة التنظيف...")

        try:
            start_time = time.time()
            result = run_cleanup_cycle(self.config, self.alerter, self.logger)
            elapsed = round(time.time() - start_time, 2)

            self._last_cleanup_time = time.time()
            self._total_cleanups += 1
            self._last_cleanup_success = result["overall_success"]

            if result["overall_success"]:
                self.logger.info(f"اكتملت دورة التنظيف بنجاح في {elapsed} ثانية")
            else:
                self._total_errors += 1
                self.logger.error("فشلت دورة التنظيف جزئياً")

            self._update_health(
                last_check=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            )

        except Exception as e:
            self._total_errors += 1
            self._last_cleanup_success = False
            self.logger.error(f"خطأ قاتل أثناء التنظيف: {e}")

            if self.alerter.is_configured:
                alert = self.alerter.format_alert(
                    agent_name="🔧 وكيل الصيانة",
                    title="خطأ قاتل في التنظيف",
                    details=[f"خطأ غير معالج: {str(e)[:200]}"],
                    severity="🚨",
                )
                self.alerter.send(alert, cooldown=0)

            self._update_health()

    # ── خط أنابيب الأخبار ──

    def _trigger_news_pipeline(self) -> None:
        """يُشغّل خط أنابيب الأخبار على الموقع كمهمة صيانة."""
        if not self.news or not self.news.is_configured:
            return

        try:
            self.logger.info("تشغيل خط أنابيب الأخبار...")
            result = self.news.trigger_pipeline(max_items=5, min_impact=3)
            if result:
                published = result.get("articlesPublished", 0)
                self.logger.info(f"خط أنابيب الأخبار: نُشر {published} مقال")
            else:
                self.logger.debug("لم يُرجع خط أنابيب الأخبار نتائج")
        except Exception as e:
            self.logger.debug(f"تعذر تشغيل خط أنابيب الأخبار: {e}")

    # ── الحسابات المساعدة ──

    def _calculate_next_scheduled_backup(self) -> float:
        """يحسب وقت النسخ الاحتياطي المجدول التالي (2:00 صباحاً بالتوقيت العالمي)."""
        now = datetime.now(timezone.utc)
        target = now.replace(hour=2, minute=0, second=0, microsecond=0)

        if now >= target:
            target = target.replace(day=now.day + 1)
            # معالجة نهاية الشهر
            if target.day != (now.day + 1):
                import calendar
                last_day = calendar.monthrange(now.year, now.month)[1]
                if now.day >= last_day:
                    if now.month == 12:
                        target = target.replace(year=now.year + 1, month=1, day=1)
                    else:
                        target = target.replace(month=now.month + 1, day=1)

        return target.timestamp()

    def _ensure_directories(self) -> None:
        """ينشئ المجلدات اللازمة إذا لم تكن موجودة."""
        from pathlib import Path

        dirs = [self.config.BACKUP_DIR, self.config.LOG_DIR, self.config.TEMP_DIR]
        for dir_path in dirs:
            if dir_path:
                try:
                    Path(dir_path).mkdir(parents=True, exist_ok=True)
                    self.logger.info(f"مجلد جاهز: {dir_path}")
                except OSError as e:
                    self.logger.warning(f"تعذر إنشاء المجلد {dir_path}: {e}")

    # ── فحص الصحة ──

    def _update_health(
        self,
        healthy: bool | None = None,
        last_check: str | None = None,
    ) -> None:
        """يحدّث حالة فحص الصحة."""
        if healthy is None:
            healthy = self._last_backup_success or self._last_cleanup_success

        self.health.update(
            healthy=healthy,
            total_checks=self._total_backups + self._total_cleanups,
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
                agent_name="🔧 وكيل الصيانة",
                title="إيقاف الوكيل",
                details=[
                    f"تم استلام إشارة {signal_name}",
                    f"إجمالي النسخ الاحتياطية: {self._total_backups}",
                    f"إجمالي عمليات التنظيف: {self._total_cleanups}",
                    f"إجمالي الأخطاء: {self._total_errors}",
                    "الوكيل يتوقف بشكل آمن...",
                ],
                severity="ℹ️",
            )
            self.alerter.send(shutdown_msg, cooldown=0)

        self._running = False

    def stop(self) -> None:
        """يوقف وكيل الصيانة بشكل آمن."""
        self.logger.info("بدء إيقاف وكيل الصيانة...")
        self._running = False

        # إرسال ملخص نهائي
        if self.alerter.is_configured:
            final_stats = {
                "إجمالي النسخ الاحتياطية": self._total_backups,
                "إجمالي عمليات التنظيف": self._total_cleanups,
                "إجمالي الأخطاء": self._total_errors,
                "آخر نسخة احتياطية": "ناجحة" if self._last_backup_success else "فاشلة",
                "آخر تنظيف": "ناجح" if self._last_cleanup_success else "فاشل",
            }

            final_msg = self.alerter.format_summary(
                agent_name="🔧 وكيل الصيانة",
                stats=final_stats,
            )
            final_msg = final_msg.replace("ملخص دوري", "ملخص الإيقاف النهائي")
            self.alerter.send(final_msg, cooldown=0)

        self.health.stop()
        self.logger.info("تم إيقاف وكيل الصيانة بنجاح")


# ── نقطة الدخول ──

def main() -> None:
    """نقطة الدخول الرئيسية لوكيل الصيانة."""
    agent = MaintenanceAgent()

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
    agent.logger.info("وكيل الصيانة توقف بنجاح")


if __name__ == "__main__":
    main()
