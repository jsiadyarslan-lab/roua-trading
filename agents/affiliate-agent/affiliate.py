"""
وكيل الشركاء لمنصة روعة التجارية.
يتتبع أداء روابط الإحالة ويحسب العمولات ويرسل تقارير دورية.
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

from config import AffiliateConfig
from referral_tracker import (
    fetch_binance_referral_stats,
    fetch_alpaca_referral_stats,
    estimate_commission,
    generate_referral_links,
    save_affiliate_history,
    check_performance_targets,
    format_daily_report,
)


class AffiliateAgent:
    """وكيل الشركاء — يتتبع أداء روابط الإحالة والعمولات."""

    def __init__(self) -> None:
        self.config = AffiliateConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=3600,  # ساعة تبريد
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        self._running = False
        self._total_checks = 0
        self._total_alerts = 0
        self._total_errors = 0
        self._last_report_day = ""
        self._last_commission_total = 0.0

    def start(self) -> None:
        """يبدأ تشغيل وكيل الشركاء."""
        self._running = True

        has_binance = "✅" if self.config.BINANCE_REFERRAL_ID else "⚠️ غير مضبوط"
        has_alpaca = "✅" if self.config.ALPACA_REFERRAL_CODE else "⚠️ غير مضبوط"

        self.logger.banner([
            "🤝 وكيل الشركاء — روعة التجارية",
            "",
            f"  المنصة: {self.config.PLATFORM_URL}",
            f"  فترة الفحص: {self.config.CHECK_INTERVAL} ثانية",
            f"  Binance: {has_binance}",
            f"  Alpaca: {has_alpaca}",
            f"  هدف الإحالات الشهري: {self.config.MONTHLY_TARGET_REFERRALS}",
            f"  هدف الإيرادات الشهري: ${self.config.MONTHLY_TARGET_REVENUE}",
            f"  تقرير يومي: الساعة {self.config.DAILY_REPORT_HOUR}:00 UTC",
            f"  Telegram: {'✅' if self.alerter.is_configured else '❌'}",
            "",
            "  بدء تتبع الشركاء...",
        ])

        self.health.start()
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # فحص أولي
        self._run_check()

        self._main_loop()

    def _main_loop(self) -> None:
        """حلقة المراقبة الدورية."""
        while self._running:
            try:
                self._check_daily_report()
                self._run_check()

                self._sleep(self.config.CHECK_INTERVAL)

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة المراقبة: {e}")
                self._update_health(healthy=False)
                self._sleep(300)

    def _run_check(self) -> None:
        """ينفذ فحص أداء الشركاء."""
        self.logger.info("بدء فحص أداء الشركاء...")

        # جلب إحصائيات Binance
        binance_stats = fetch_binance_referral_stats(
            self.config.BINANCE_API_KEY,
            self.config.BINANCE_API_SECRET,
            self.logger,
        )

        # جلب إحصائيات Alpaca
        alpaca_stats = fetch_alpaca_referral_stats(
            self.config.ALPACA_REFERRAL_CODE,
            self.config.ALPACA_REFERRAL_CODE,
            self.config.PLATFORM_URL,
            self.logger,
        )

        # تقدير العمولات
        commission_data = estimate_commission(
            binance_stats, alpaca_stats, self.config, self.logger
        )

        total = commission_data.get("total_estimated", 0)
        self._last_commission_total = total

        # فحص الأهداف
        performance_alerts = check_performance_targets(
            commission_data, self.config, self.logger
        )

        # إرسال تنبيهات الأداء
        for alert in performance_alerts:
            if alert["status"] == "behind":
                self._total_alerts += 1
                self._send_performance_alert(alert, commission_data)

        # حفظ في السجل
        save_affiliate_history(
            commission_data,
            binance_stats,
            alpaca_stats,
            self.config.HISTORY_FILE,
            self.logger,
        )

        self._total_checks += 1

        self.logger.info(
            f"اكتمل الفحص — عمولة مقدرة: ${total:.2f} | "
            f"تنبيهات: {len(performance_alerts)}"
        )

        self._update_health(healthy=True)

    def _check_daily_report(self) -> None:
        """يتحقق مما إذا حان وقت التقرير اليومي."""
        now = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")

        if now.hour != self.config.DAILY_REPORT_HOUR:
            return

        if today == self._last_report_day:
            return

        self._last_report_day = today
        self._send_daily_report()

    def _send_daily_report(self) -> None:
        """يرسل التقرير اليومي عبر Telegram."""
        if not self.alerter.is_configured:
            return

        self.logger.info("إعداد التقرير اليومي للشركاء...")

        # جلب البيانات الحالية
        binance_stats = fetch_binance_referral_stats(
            self.config.BINANCE_API_KEY,
            self.config.BINANCE_API_SECRET,
            self.logger,
        )

        alpaca_stats = fetch_alpaca_referral_stats(
            self.config.ALPACA_REFERRAL_CODE,
            self.config.ALPACA_REFERRAL_CODE,
            self.config.PLATFORM_URL,
            self.logger,
        )

        commission_data = estimate_commission(
            binance_stats, alpaca_stats, self.config, self.logger
        )

        performance_alerts = check_performance_targets(
            commission_data, self.config, self.logger
        )

        referral_links = generate_referral_links(self.config, self.logger)

        report = format_daily_report(
            commission_data,
            binance_stats,
            alpaca_stats,
            performance_alerts,
            referral_links,
            self.config,
        )

        self.alerter.send(report, cooldown=0)
        self.logger.info("تم إرسال التقرير اليومي للشركاء")

    def _send_performance_alert(self, alert: dict, commission_data: dict) -> None:
        """يرسل تنبيه عند التخلف عن الأداء."""
        if not self.alerter.is_configured:
            return

        alert_type = "إحالات" if alert["type"] == "referrals" else "إيرادات"
        current = alert["current"]
        target = alert["target"]
        percent = alert["percent"]

        msg = self.alerter.format_alert(
            agent_name="🤝 وكيل الشركاء",
            title=f"التخلف عن هدف {alert_type}",
            details=[
                f"الحالي: {current}",
                f"الهدف: {target}",
                f"النسبة المحققة: {percent}%",
                "",
                "💡 مقترحات لتحسين الأداء:",
                "  • شارك روابط الإحالة في مجتمعات التداول",
                "  • أنشئ محتوى تعليمي عن المنصة",
                "  • استخدم قوالب الترويج الجاهزة",
            ],
            severity="⚠️",
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
        self.logger.info(f"تم استلام إشارة {signal.Signals(signum).name} — إيقاف آمن...")
        self._running = False

    def stop(self) -> None:
        self._running = False
        self.health.stop()
        self.logger.info("تم إيقاف وكيل الشركاء")


def main() -> None:
    agent = AffiliateAgent()
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
