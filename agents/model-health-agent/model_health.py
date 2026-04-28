"""
وكيل صحة النماذج لمنصة روعة التجارية.
يراقب استهلاك API لكل نموذج ذكاء اصطناعي ويرسل إنذارات عند استنزاف الرصيد.
يعمل كخدمة مستمرة على Railway.
"""

import os
import sys
import time
import signal
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig
from shared.telegram_utils import TelegramAlerter
from shared.logger import ColoredLogger
from shared.health_server import HealthCheckServer

from config import ModelHealthConfig
from cost_tracker import (
    fetch_usage_stats,
    fetch_recent_errors,
    check_budget_thresholds,
    check_latency_anomalies,
    format_daily_report,
)


class ModelHealthAgent:
    """وكيل صحة النماذج — يراقب استهلاك وتكلفة نماذج الذكاء الاصطناعي."""

    def __init__(self) -> None:
        self.config = ModelHealthConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=1800,  # 30 دقيقة تبريد
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        self._running = False
        self._total_checks = 0
        self._total_alerts = 0
        self._total_errors = 0
        self._last_report_day = ""
        self._alert_cache: set[str] = set()  # لمنع التنبيهات المتكررة

    def start(self) -> None:
        """يبدأ تشغيل وكيل صحة النماذج."""
        self._running = True

        self.logger.banner([
            "🧠 وكيل صحة النماذج — روعة التجارية",
            "",
            f"  المنصة: {self.config.PLATFORM_URL}",
            f"  فترة الفحص: {self.config.CHECK_INTERVAL} ثانية",
            f"  الميزانية الشهرية الكلية: ${self.config.MONTHLY_BUDGET_TOTAL}",
            f"  عتبة التنبيه: {self.config.ALERT_THRESHOLD}%",
            f"  عتبة الخطر: {self.config.CRITICAL_THRESHOLD}%",
            f"  تقرير يومي: الساعة {self.config.DAILY_REPORT_HOUR}:00 UTC",
            f"  قاعدة البيانات: {'✅' if self.config.DATABASE_URL else '❌ غير مضبوطة'}",
            f"  Telegram: {'✅' if self.alerter.is_configured else '❌'}",
            "",
            "  بدء مراقبة النماذج...",
        ])

        self.health.start()
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # فحص أولي فوري
        self._run_check()

        # حلقة الفحص الرئيسية
        self._main_loop()

    def _main_loop(self) -> None:
        """حلقة الفحص الدورية."""
        while self._running:
            try:
                self._check_daily_report()
                self._run_check()

                # انتظار مع فحص الإشارات
                self._sleep(self.config.CHECK_INTERVAL)

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة المراقبة: {e}")
                self._update_health(healthy=False)
                self._sleep(120)

    def _run_check(self) -> None:
        """ينفذ فحص صحة النماذج."""
        if not self.config.DATABASE_URL:
            self.logger.warning("DATABASE_URL غير مضبوط — تخطي الفحص")
            return

        self.logger.info("بدء فحص صحة النماذج...")

        # جلب إحصائيات الاستهلاك
        usage_stats = fetch_usage_stats(self.config.DATABASE_URL, self.logger)

        if not usage_stats or usage_stats.get("_total_monthly", 0) == 0:
            self.logger.info("لا توجد بيانات استهلاك بعد — تخطي الفحص")
            self._total_checks += 1
            self._update_health(healthy=True)
            return

        # فحص عتبات الميزانية
        budget_alerts = check_budget_thresholds(usage_stats, self.config, self.logger)

        # فحص زمن الاستجابة
        latency_alerts = check_latency_anomalies(usage_stats, self.config, self.logger)

        # إرسال التنبيهات
        for alert in budget_alerts:
            alert_key = f"budget:{alert['provider']}:{alert['level']}"
            if alert_key not in self._alert_cache:
                self._alert_cache.add(alert_key)
                self._send_budget_alert(alert)

        for alert in latency_alerts:
            alert_key = f"latency:{alert['provider']}"
            if alert_key not in self._alert_cache:
                self._alert_cache.add(alert_key)
                self._send_latency_alert(alert)

        # تسجيل النتائج
        total_monthly = usage_stats.get("_total_monthly", 0)
        total_daily = usage_stats.get("_total_daily", 0)
        self.logger.info(
            f"اكتمل الفحص — شهر: ${total_monthly:.2f} | "
            f"يوم: ${total_daily:.2f} | "
            f"تنبيهات ميزانية: {len(budget_alerts)} | "
            f"تنبيهات استجابة: {len(latency_alerts)}"
        )

        self._total_checks += 1
        self._update_health(healthy=len(budget_alerts) == 0 or all(a["level"] != "critical" for a in budget_alerts))

    def _check_daily_report(self) -> None:
        """يتحقق مما إذا حان وقت التقرير اليومي."""
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")

        if now.hour != self.config.DAILY_REPORT_HOUR:
            # إعادة تعيين ذاكرة التنبيهات عند بداية يوم جديد
            if today != self._last_report_day and self._last_report_day:
                self._alert_cache.clear()
                self.logger.info("تم إعادة تعيين ذاكرة التنبيهات لليوم الجديد")
            return

        if today == self._last_report_day:
            return

        self._last_report_day = today
        self._send_daily_report()

    def _send_daily_report(self) -> None:
        """يرسل التقرير اليومي عبر Telegram."""
        if not self.alerter.is_configured:
            return

        self.logger.info("إعداد التقرير اليومي...")

        usage_stats = fetch_usage_stats(self.config.DATABASE_URL, self.logger)
        budget_alerts = check_budget_thresholds(usage_stats, self.config, self.logger)
        latency_alerts = check_latency_anomalies(usage_stats, self.config, self.logger)
        recent_errors = fetch_recent_errors(self.config.DATABASE_URL, hours=24, logger=self.logger)

        report = format_daily_report(
            usage_stats, budget_alerts, latency_alerts, recent_errors, self.config
        )

        self.alerter.send(report, cooldown=0)
        self.logger.info("تم إرسال التقرير اليومي عبر Telegram")

    def _send_budget_alert(self, alert: dict) -> None:
        """يرسل تنبيه تجاوز ميزانية."""
        if not self.alerter.is_configured:
            return

        self._total_alerts += 1
        level_emoji = "🔴" if alert["level"] == "critical" else "⚠️"
        level_text = "حرج" if alert["level"] == "critical" else "تحذير"

        msg = self.alerter.format_alert(
            agent_name="🧠 وكيل صحة النماذج",
            title=f"تجاوز ميزانية {alert['provider']} — {level_text}",
            details=[
                f"المزود: {alert['provider']}",
                f"المستهلك: ${alert['cost']:.2f}",
                f"الميزانية: ${alert['budget']:.0f}",
                f"النسبة: {alert['percent']}%",
                "",
                "إجراء مطلوب: راقب الاستهلاك أو زِد الميزانية" if alert["level"] == "warning"
                else "إجراء عاجل: فكر في إيقاف النماذج المكلفة أو تفعيل مزود بديل",
            ],
            severity=level_emoji,
        )
        self.alerter.send(msg, cooldown=0)

    def _send_latency_alert(self, alert: dict) -> None:
        """يرسل تنبيه بطء استجابة."""
        if not self.alerter.is_configured:
            return

        self._total_alerts += 1
        level_emoji = "🔴" if alert["level"] == "critical" else "⚠️"

        msg = self.alerter.format_alert(
            agent_name="🧠 وكيل صحة النماذج",
            title=f"بطء استجابة {alert['provider']}",
            details=[
                f"المزود: {alert['provider']}",
                f"متوسط زمن الاستجابة: {alert['avg_latency']}ms",
                f"الحد المسموح: {alert['threshold']}ms",
            ],
            severity=level_emoji,
        )
        self.alerter.send(msg, cooldown=0)

    def _update_health(self, healthy: bool = True) -> None:
        self.health.update(
            healthy=healthy,
            total_checks=self._total_checks,
            total_errors=self._total_errors,
            last_check=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        )

    def _sleep(self, seconds: int) -> None:
        for _ in range(seconds):
            if not self._running:
                break
            time.sleep(1)

    def _handle_signal(self, signum: int, frame) -> None:
        signal_name = signal.Signals(signum).name
        self.logger.info(f"تم استلام إشارة {signal_name} — إيقاف آمن...")
        self._running = False

    def stop(self) -> None:
        self._running = False
        self.health.stop()
        self.logger.info("تم إيقاف وكيل صحة النماذج")


def main() -> None:
    agent = ModelHealthAgent()
    try:
        agent.start()
    except KeyboardInterrupt:
        agent._handle_signal(signal.SIGINT, None)
    except Exception as e:
        agent.logger.critical(f"خطأ قاتل: {e}")
        agent._update_health(healthy=False)
        agent.stop()
        sys.exit(1)
    agent.stop()


if __name__ == "__main__":
    main()
