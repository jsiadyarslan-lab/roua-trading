"""
وكيل الأمان لمنصة روعة التجارية.
يُجري فحوصات أمنية دورية ويرسل تنبيهات عبر Telegram.
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

from config import SecurityConfig
from checks import (
    run_quick_scan,
    run_full_scan,
    group_by_severity,
    count_findings,
)

# جسر الربط بموقع الأخبار
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'shared'))
try:
    from news_bridge import NewsBridge
except ImportError:
    NewsBridge = None


class SecurityAgent:
    """وكيل الأمان — يُجري فحوصات أمنية دورية ويرسل تنبيهات."""

    def __init__(self) -> None:
        self.config = SecurityConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=self.config.CRITICAL_ALERT_COOLDOWN,
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        # جسر الربط بموقع الأخبار المالي
        self.news: NewsBridge | None = None
        if NewsBridge and self.config.NEWS_SITE_URL:
            self.news = NewsBridge(
                news_url=self.config.NEWS_SITE_URL,
                api_key=self.config.NEWS_API_KEY,
                cron_secret=self.config.CRON_SECRET,
                logger=self.logger,
            )

        # حالة الوكيل
        self._running = False
        self._total_scans = 0
        self._total_errors = 0
        self._last_quick_scan = 0.0
        self._last_full_scan = 0.0
        self._last_critical_alert = 0.0
        self._scan_history: list[dict] = []

    # ── بدء التشغيل ──

    def start(self) -> None:
        """يبدأ تشغيل وكيل الأمان."""
        self._running = True

        # بانر البدء
        self.logger.banner([
            "🛡️  وكيل الأمان — روعة التجارية",
            "",
            f"  المنصة المستهدفة: {self.config.PLATFORM_URL}",
            f"  فحص سريع كل: {self.config.SECURITY_CHECK_INTERVAL // 3600} ساعات",
            f"  فحص شامل كل: {self.config.FULL_SCAN_INTERVAL // 3600} ساعات",
            f"  منفذ فحص الصحة: {self.config.HEALTH_PORT}",
            f"  Telegram: {'✅ مضبوط' if self.alerter.is_configured else '❌ غير مضبوط'}",
            f"  موقع الأخبار: {'✅ مربوط' if self.news and self.news.is_configured else '⚠️ غير مربوط'}",
            "",
            "  بدء المراقبة الأمنية...",
        ])

        # بدء خادم فحص الصحة
        self.health.start()

        # تسجيل معالجات الإشارات
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # فحص أولي فوري
        self.logger.info("بدء الفحص الأمني الأولي...")
        self._run_scan(full=True)

        # حلقة المراقبة الرئيسية
        self._main_loop()

    # ── الحلقة الرئيسية ──

    def _main_loop(self) -> None:
        """حلقة المراقبة الرئيسية — تفحص دورياً حسب الجدول."""
        while self._running:
            try:
                now = time.time()
                time_since_quick = now - self._last_quick_scan
                time_since_full = now - self._last_full_scan

                # هل حان وقت الفحص الشامل؟
                if time_since_full >= self.config.FULL_SCAN_INTERVAL:
                    self.logger.info("حان وقت الفحص الأمني الشامل")
                    self._run_scan(full=True)
                # هل حان وقت الفحص السريع؟
                elif time_since_quick >= self.config.SECURITY_CHECK_INTERVAL:
                    self.logger.info("حان وقت الفحص الأمني السريع")
                    self._run_scan(full=False)
                else:
                    # حساب الوقت المتبقي للفحص التالي
                    next_quick = self.config.SECURITY_CHECK_INTERVAL - time_since_quick
                    next_full = self.config.FULL_SCAN_INTERVAL - time_since_full
                    next_scan = min(next_quick, next_full)

                    if next_scan > 60:
                        self.logger.info(
                            f"الفحص التالي بعد {int(next_scan // 60)} دقيقة"
                        )
                    else:
                        self.logger.info(
                            f"الفحص التالي بعد {int(next_scan)} ثانية"
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

    # ── الفحص الأمني ──

    def _run_scan(self, full: bool = False) -> None:
        """يُجري فحصاً أمنياً ويعالج النتائج."""
        scan_type = "شامل" if full else "سريع"
        self.logger.info(f"بدء الفحص الأمني {scan_type}...")

        try:
            # تنفيذ الفحوصات
            start_time = time.time()
            if full:
                results = run_full_scan(self.config.PLATFORM_URL)
            else:
                results = run_quick_scan(self.config.PLATFORM_URL)
            elapsed = round(time.time() - start_time, 2)

            # تحديث أوقات الفحص
            now = time.time()
            self._last_quick_scan = now
            if full:
                self._last_full_scan = now

            self._total_scans += 1

            # تحليل النتائج
            grouped = group_by_severity(results)
            counts = count_findings(results)

            self.logger.info(
                f"اكتمل الفحص {scan_type} في {elapsed} ثانية — "
                f"حرج: {counts['critical_failed']} فشل، "
                f"متوسط: {counts['medium_failed']} فشل، "
                f"منخفض: {counts['low_failed']} فشل"
            )

            # حفظ في السجل
            scan_record = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "type": scan_type,
                "duration": elapsed,
                "results": results,
                "counts": counts,
            }
            self._scan_history.append(scan_record)
            # الاحتفاظ بآخر 50 فحص فقط
            if len(self._scan_history) > 50:
                self._scan_history = self._scan_history[-50:]

            # إرسال تنبيهات حرجة فورية
            self._handle_critical_findings(grouped.get("critical", []))

            # إرسال ملخص عند الفحص الشامل
            if full:
                self._send_daily_summary(results, grouped, counts, elapsed)

            # تحديث حالة الصحة
            has_critical_failures = counts["critical_failed"] > 0
            self._update_health(
                healthy=not has_critical_failures,
                last_check=datetime.now(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            )

            # ── جلب مشاعر السوق من موقع الأخبار ──
            if self.news and self.news.is_configured:
                try:
                    sentiment = self.news.get_market_sentiment()
                    if sentiment:
                        fg = sentiment.get("fearGreedIndex", {})
                        geo = sentiment.get("geopoliticalRiskIndex", {})
                        self.logger.info(
                            f"مؤشر الخوف والطمع: {fg.get('value', '—')} | "
                            f"المخاطر الجيوسياسية: {geo.get('value', '—')}"
                        )
                except Exception as e:
                    self.logger.debug(f"تعذر جلب مشاعر السوق: {e}")

        except Exception as e:
            self._total_errors += 1
            self.logger.error(f"خطأ أثناء الفحص الأمني: {e}")
            self._update_health(
                healthy=False,
                last_check=datetime.now(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            )

    # ── معالجة التنبيهات ──

    def _handle_critical_findings(self, critical_results: list[dict]) -> None:
        """يرسل تنبيهات فورية للنتائج الحرجة."""
        if not critical_results:
            return

        # فلترة النتائج الفاشلة فقط
        failed_critical = [r for r in critical_results if not r.get("passed", True)]
        if not failed_critical:
            return

        self.logger.critical(
            f"تم اكتشاف {len(failed_critical)} ثغرة حرجة!"
        )

        # إرسال تنبيه لكل ثغرة حرجة
        for finding in failed_critical:
            name = finding.get("name", "غير محدد")
            details = finding.get("details", "لا تفاصيل")

            alert_message = self.alerter.format_alert(
                agent_name="🛡️ وكيل الأمان",
                title=f"ثغرة حرجة: {name}",
                details=[details],
                severity="🚨",
            )

            sent = self.alerter.send(
                alert_message,
                cooldown=self.config.CRITICAL_ALERT_COOLDOWN,
            )

            if sent:
                self.logger.info(f"تم إرسال تنبيه حرج: {name}")
            else:
                self.logger.warning(f"تعذر إرسال تنبيه حرج: {name}")

        self._last_critical_alert = time.time()

    def _send_daily_summary(
        self,
        results: list[dict],
        grouped: dict[str, list[dict]],
        counts: dict[str, int],
        elapsed: float,
    ) -> None:
        """يرسل ملخصاً يومياً عبر Telegram."""
        if not self.alerter.is_configured:
            self.logger.warning("Telegram غير مضبوط — تخطي إرسال الملخص اليومي")
            return

        # تجميع التفاصيل حسب الخطورة
        sections = []

        # قسم الثغرات الحرجة
        critical_failed = [
            r for r in grouped.get("critical", []) if not r.get("passed", True)
        ]
        if critical_failed:
            lines = [f"❌ {r['name']}: {r['details'][:100]}" for r in critical_failed]
            sections.append(("الثغرات الحرجة", lines))

        # قسم الثغرات المتوسطة
        medium_failed = [
            r for r in grouped.get("medium", []) if not r.get("passed", True)
        ]
        if medium_failed:
            lines = [f"⚠️ {r['name']}: {r['details'][:100]}" for r in medium_failed]
            sections.append(("الثغرات المتوسطة", lines))

        # قسم الفحوصات الناجحة
        all_passed = [r for r in results if r.get("passed", True)]
        if all_passed:
            lines = [f"✅ {r['name']}" for r in all_passed]
            sections.append(("الفحوصات الناجحة", lines))

        # الإحصائيات
        total_checks = len(results)
        total_failed = sum(
            1 for r in results if not r.get("passed", True)
        )
        total_passed = total_checks - total_failed

        stats = {
            "إجمالي الفحوصات": total_checks,
            "ناجح": total_passed,
            "فاشل": total_failed,
            "حرج فاشل": counts["critical_failed"],
            "متوسط فاشل": counts["medium_failed"],
            "منخفض فاشل": counts["low_failed"],
            "مدة الفحص": f"{elapsed} ثانية",
            "إجمالي الفحوصات المنفذة": self._total_scans,
        }

        summary_message = self.alerter.format_summary(
            agent_name="🛡️ وكيل الأمان",
            stats=stats,
            sections=sections,
        )

        sent = self.alerter.send(
            summary_message,
            cooldown=0,  # الملخص يُرسل دائماً
        )

        if sent:
            self.logger.info("تم إرسال الملخص اليومي بنجاح")
        else:
            self.logger.warning("تعذر إرسال الملخص اليومي")

    # ── فحص الصحة ──

    def _update_health(
        self,
        healthy: bool = True,
        last_check: str | None = None,
    ) -> None:
        """يحدّث حالة فحص الصحة."""
        self.health.update(
            healthy=healthy,
            total_checks=self._total_scans,
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
                agent_name="🛡️ وكيل الأمان",
                title="إيقاف الوكيل",
                details=[
                    f"تم استلام إشارة {signal_name}",
                    f"إجمالي الفحوصات المنفذة: {self._total_scans}",
                    f"إجمالي الأخطاء: {self._total_errors}",
                    "الوكيل يتوقف بشكل آمن...",
                ],
                severity="ℹ️",
            )
            self.alerter.send(shutdown_msg, cooldown=0)

        self._running = False

    def stop(self) -> None:
        """يوقف وكيل الأمان بشكل آمن."""
        self.logger.info("بدء إيقاف وكيل الأمان...")
        self._running = False
        self.health.stop()
        self.logger.info("تم إيقاف وكيل الأمان بنجاح")


# ── نقطة الدخول ──

def main() -> None:
    """نقطة الدخول الرئيسية لوكيل الأمان."""
    agent = SecurityAgent()

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
    agent.logger.info("وكيل الأمان توقف بنجاح")


if __name__ == "__main__":
    main()
