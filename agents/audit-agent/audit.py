"""
وكيل التدقيق لمنصة روعة التجارية.
يفحص سجلات قاعدة البيانات يومياً للبحث عن أنماط مشبوهة واحتيالية.
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

from config import AuditConfig
from pattern_detector import detect_suspicious_patterns, format_audit_report


class AuditAgent:
    """وكيل التدقيق — يفحص سجلات المنصة بحثاً عن أنشطة مشبوهة."""

    def __init__(self) -> None:
        self.config = AuditConfig()
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

        self._running = False
        self._total_checks = 0
        self._total_findings = 0
        self._total_errors = 0
        self._last_report_day = ""
        self._last_findings_count = 0

    def start(self) -> None:
        """يبدأ تشغيل وكيل التدقيق."""
        self._running = True

        self.logger.banner([
            "🔍 وكيل التدقيق — روعة التجارية",
            "",
            f"  المنصة: {self.config.PLATFORM_URL}",
            f"  فترة الفحص: {self.config.CHECK_INTERVAL} ثانية",
            f"  الحد الأقصى للأوامر/ساعة: {self.config.MAX_ORDERS_PER_HOUR}",
            f"  الحد الأقصى للأوامر المرفوضة/يوم: {self.config.MAX_FAILED_ORDERS_PER_DAY}",
            f"  تقرير يومي: الساعة {self.config.DAILY_REPORT_HOUR}:00 UTC",
            f"  قاعدة البيانات: {'✅' if self.config.DATABASE_URL else '❌'}",
            f"  Telegram: {'✅' if self.alerter.is_configured else '❌'}",
            "",
            "  بدء التدقيق...",
        ])

        self.health.start()
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # فحص أولي
        self._run_audit_check()

        self._main_loop()

    def _main_loop(self) -> None:
        """حلقة التدقيق الدورية."""
        while self._running:
            try:
                self._check_daily_report()
                self._run_audit_check()

                self._sleep(self.config.CHECK_INTERVAL)

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة التدقيق: {e}")
                self._update_health(healthy=False)
                self._sleep(120)

    def _run_audit_check(self) -> None:
        """ينفذ فحص التدقيق."""
        if not self.config.DATABASE_URL:
            self.logger.warning("DATABASE_URL غير مضبوط — تخطي الفحص")
            return

        self.logger.info("بدء فحص التدقيق...")

        findings = detect_suspicious_patterns(
            self.config.DATABASE_URL, self.config, self.logger
        )

        self._total_checks += 1
        self._total_findings += len(findings)
        self._last_findings_count = len(findings)

        if findings:
            # إرسال تنبيهات فورية للأنماط عالية الخطورة فقط
            high_severity = [f for f in findings if f.get("severity") == "high"]
            for f in high_severity:
                self._send_instant_alert(f)

            self.logger.info(
                f"اكتمل الفحص — {len(findings)} نمط مشبوه "
                f"({len(high_severity)} عالي الخطورة)"
            )
        else:
            self.logger.info("اكتمل الفحص — لا أنماط مشبوهة")

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

        self.logger.info("إعداد تقرير التدقيق اليومي...")

        findings = detect_suspicious_patterns(
            self.config.DATABASE_URL, self.config, self.logger
        )

        report = format_audit_report(findings, self.logger)

        self.alerter.send(report, cooldown=0)
        self.logger.info("تم إرسال تقرير التدقيق اليومي")

    def _send_instant_alert(self, finding: dict) -> None:
        """يرسل تنبيه فوري لنمط عالي الخطورة."""
        if not self.alerter.is_configured:
            return

        type_names = {
            "multi_ip_login": "تسجيل دخول من عناوين متعددة",
            "high_trading_volume": "حجم تداول غير عادي",
            "high_rejected_orders": "أوامر مرفوضة بكثرة",
            "frequent_credential_changes": "تعديلات متكررة على بيانات Exchange",
            "ai_api_abuse": "استخدام مفرط للذكاء الاصطناعي",
            "stale_sessions": "جلسات منتهية لم تُحذف",
        }

        msg = self.alerter.format_alert(
            agent_name="🔍 وكيل التدقيق",
            title=f"نمط مشبوه: {type_names.get(finding['type'], finding['type'])}",
            details=[
                f"المستخدم: {finding.get('user_id', 'غير محدد')}",
                finding.get("details", ""),
            ],
            severity="🔴",
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
        self.logger.info("تم إيقاف وكيل التدقيق")


def main() -> None:
    agent = AuditAgent()
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
