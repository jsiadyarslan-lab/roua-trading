"""
وكيل الأداء لمنصة روعة التجارية.
يقيس أزمنة الاستجابة دورياً ويكتشف التدهور ويرسل تنبيهات وتقارير أسبوعية عبر Telegram.
يعمل كخدمة مستمرة على Railway.
"""

import os
import sys
import time
import signal
from datetime import datetime, timezone, timedelta
from typing import Optional

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig
from shared.telegram_utils import TelegramAlerter
from shared.logger import ColoredLogger
from shared.health_server import HealthCheckServer

from config import PerformanceConfig
from analyzer import (
    collect_metrics,
    calculate_statistics,
    detect_degradation,
    generate_recommendations,
    save_metrics,
    load_historical_metrics,
    compute_endpoint_stats,
    get_previous_period_stats,
    _METRICS_FILE,
)


class PerformanceAgent:
    """وكيل الأداء — يقيس الأداء ويكتشف التدهور ويرسل التقارير."""

    def __init__(self) -> None:
        self.config = PerformanceConfig()
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
        self._total_collections = 0
        self._total_errors = 0
        self._total_alerts_sent = 0
        self._last_collection = 0.0
        self._last_report = 0.0
        self._current_stats: dict[str, dict] = {}

        # إضافة نقطة نهاية موقع الأخبار إلى المراقبة إذا كان متاحاً
        if self.config.NEWS_SITE_URL:
            news_url = self.config.NEWS_SITE_URL.rstrip("/")
            self.config.PERF_ENDPOINTS.append({
                "name": "موقع الأخبار (صحة)",
                "path": f"{news_url}/api/health",
                "external": True,
            })

    # ── بدء التشغيل ──

    def start(self) -> None:
        """يبدأ تشغيل وكيل الأداء."""
        self._running = True

        # حساب وقت التقرير الأسبوعي القادم (الأحد 6 مساءً UTC)
        self._last_report = self._calculate_last_sunday_18_utc()

        # بانر البدء
        self.logger.banner([
            "⚡ وكيل الأداء — روعة التجارية",
            "",
            f"  المنصة المستهدفة: {self.config.PLATFORM_URL}",
            f"  جمع القياسات كل: {self.config.METRICS_COLLECTION_INTERVAL // 60} دقيقة",
            f"  التقرير الأسبوعي: كل أحد الساعة 18:00 UTC",
            f"  عتبة البطء: {self.config.SLOW_THRESHOLD_MS}ms",
            f"  عتبة P95: {self.config.P95_THRESHOLD_MS}ms",
            f"  عتبة التدهور: {self.config.DEGRADATION_PCT}%",
            f"  نقاط النهاية المراقبة: {len(self.config.PERF_ENDPOINTS)}",
            f"  منفذ فحص الصحة: {self.config.HEALTH_PORT}",
            f"  Telegram: {'✅ مضبوط' if self.alerter.is_configured else '❌ غير مضبوط'}",
            "",
            "  بدء مراقبة الأداء...",
        ])

        # بدء خادم فحص الصحة
        self.health.start()

        # تسجيل معالجات الإشارات
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # جمع أولي فوري
        self.logger.info("بدء جمع القياسات الأولي...")
        self._collect_and_analyze()

        # حلقة المراقبة الرئيسية
        self._main_loop()

    # ── الحلقة الرئيسية ──

    def _main_loop(self) -> None:
        """حلقة المراقبة الرئيسية — تجمع القياسات دورياً وترسل التقارير."""
        while self._running:
            try:
                now = time.time()
                time_since_collect = now - self._last_collection

                # هل حان وقت جمع القياسات؟
                if time_since_collect >= self.config.METRICS_COLLECTION_INTERVAL:
                    self.logger.info("حان وقت جمع القياسات الدوري")
                    self._collect_and_analyze()

                # هل حان وقت التقرير الأسبوعي؟
                if self._should_send_weekly_report(now):
                    self.logger.info("حان وقت إرسال التقرير الأسبوعي")
                    self._send_weekly_report()

                # حساب الوقت المتبقي
                next_collect = self.config.METRICS_COLLECTION_INTERVAL - (now - self._last_collection)
                if next_collect > 60:
                    self.logger.info(
                        f"الجمع التالي بعد {int(next_collect // 60)} دقيقة"
                    )
                else:
                    self.logger.info(
                        f"الجمع التالي بعد {int(next_collect)} ثانية"
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

    # ── جمع القياسات والتحليل ──

    def _collect_and_analyze(self) -> None:
        """يجمع القياسات ويحللها ويرسل تنبيهات إذا لزم الأمر."""
        try:
            # جمع القياسات
            start_time = time.time()
            metrics = collect_metrics(self.config, self.logger)
            elapsed = round(time.time() - start_time, 2)

            self._total_collections += 1
            self._last_collection = time.time()

            if not metrics:
                self.logger.warning("لم يتم جمع أي قياسات")
                return

            # حفظ القياسات
            save_metrics(metrics)

            # حساب إحصائيات الفترة الحالية
            current_stats = compute_endpoint_stats(metrics)
            self._current_stats = current_stats

            # حساب إحصائيات شاملة
            all_times = [
                m["response_time_ms"]
                for m in metrics
                if m.get("response_time_ms") is not None
            ]
            overall_stats = calculate_statistics(all_times)

            self.logger.info(
                f"اكتمل جمع القياسات في {elapsed} ثانية — "
                f"متوسط: {overall_stats.get('avg', 'N/A')}ms، "
                f"P95: {overall_stats.get('p95', 'N/A')}ms، "
                f"P99: {overall_stats.get('p99', 'N/A')}ms"
            )

            # فحص عتبات التنبيه الفورية
            self._check_alert_thresholds(current_stats, overall_stats)

            # اكتشاف التدهور
            self._check_degradation(current_stats)

            # تحديث حالة الصحة
            is_healthy = overall_stats.get("avg") is not None and overall_stats.get("avg", float("inf")) < self.config.SLOW_THRESHOLD_MS
            self._update_health(
                healthy=is_healthy,
                last_check=datetime.now(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            )

        except Exception as e:
            self._total_errors += 1
            self.logger.error(f"خطأ أثناء جمع القياسات: {e}")
            self._update_health(
                healthy=False,
                last_check=datetime.now(timezone.utc).strftime(
                    "%Y-%m-%d %H:%M UTC"
                ),
            )

    def _check_alert_thresholds(
        self,
        current_stats: dict[str, dict],
        overall_stats: dict[str, Optional[float]],
    ) -> None:
        """يفحص عتبات التنبيه ويرسل تنبيهات فورية إذا لزم."""
        if not self.alerter.is_configured:
            return

        # فحص P95 العام
        p95 = overall_stats.get("p95")
        if p95 is not None and p95 > self.config.P95_THRESHOLD_MS:
            self.logger.warning(
                f"P95 يتجاوز العتبة: {round(p95)}ms > {self.config.P95_THRESHOLD_MS}ms"
            )

            details = []
            # إضافة تفاصيل نقاط النهاية البطيئة
            slow_endpoints = []
            for path, stat in current_stats.items():
                if stat.get("avg") is not None and stat["avg"] > self.config.SLOW_THRESHOLD_MS:
                    slow_endpoints.append(
                        f"{stat.get('name', path)}: {round(stat['avg'])}ms"
                    )

            details.append(
                f"P95 العام: {round(p95)}ms (العتبة: {self.config.P95_THRESHOLD_MS}ms)"
            )
            if slow_endpoints:
                details.append(
                    f"نقاط بطيئة: {', '.join(slow_endpoints[:5])}"
                )

            alert_message = self.alerter.format_alert(
                agent_name="⚡ وكيل الأداء",
                title="P95 يتجاوز العتبة",
                details=details,
                analysis=(
                    "زمن الاستجابة P95 مرتفع جداً — قد يكون بسبب ضغط على الخادم "
                    "أو مشاكل في قاعدة البيانات أو استعلامات غير محسّنة"
                ),
                severity="🚨",
            )

            sent = self.alerter.send(alert_message, cooldown=3600)
            if sent:
                self._total_alerts_sent += 1
                self.logger.info("تم إرسال تنبيه P95")

        # فحص نقاط النهاية البطيئة فردية
        for path, stat in current_stats.items():
            avg = stat.get("avg")
            if avg is not None and avg > self.config.SLOW_THRESHOLD_MS:
                name = stat.get("name", path)
                self.logger.warning(
                    f"نقطة نهاية بطيئة: {name} — {round(avg)}ms"
                )

                details = [
                    f"نقطة النهاية: {name} ({path})",
                    f"متوسط زمن الاستجابة: {round(avg)}ms",
                    f"العتبة: {self.config.SLOW_THRESHOLD_MS}ms",
                    f"الحد الأقصى: {round(stat.get('max', 0))}ms",
                    f"P95: {round(stat.get('p95', 0))}ms",
                ]

                alert_message = self.alerter.format_alert(
                    agent_name="⚡ وكيل الأداء",
                    title=f"نقطة نهاية بطيئة: {name}",
                    details=details,
                    severity="⚠️",
                )

                # استخدام مفتاح تبريد خاص بكل نقطة نهاية
                sent = self.alerter.send(alert_message, cooldown=3600)
                if sent:
                    self._total_alerts_sent += 1
                    self.logger.info(f"تم إرسال تنبيه بطء: {name}")

    def _check_degradation(self, current_stats: dict[str, dict]) -> None:
        """يفحص تدهور الأداء مقارنة بالفترة السابقة."""
        if not self.alerter.is_configured:
            return

        period_hours = self.config.METRICS_COLLECTION_INTERVAL // 3600
        if period_hours < 1:
            period_hours = 1

        previous_stats = get_previous_period_stats(
            period_hours=period_hours
        )

        if not previous_stats:
            self.logger.info("لا توجد بيانات سابقة للمقارنة — تخطي فحص التدهور")
            return

        degraded = detect_degradation(
            current_stats, previous_stats, self.config.DEGRADATION_PCT
        )

        if not degraded:
            self.logger.info("لا تدهور في الأداء مقارنة بالفترة السابقة")
            return

        self.logger.warning(
            f"تم اكتشاف تدهور في {len(degraded)} نقطة نهاية"
        )

        details = []
        for d in degraded[:5]:
            details.append(
                f"{d['name']}: من {round(d['previous_avg'])}ms إلى "
                f"{round(d['current_avg'])}ms (+{d['increase_pct']}%)"
            )

        alert_message = self.alerter.format_alert(
            agent_name="⚡ وكيل الأداء",
            title=f"تدهور في الأداء — {len(degraded)} نقطة نهاية",
            details=details,
            analysis=(
                "تم اكتشاف زيادة ملحوظة في أزمنة الاستجابة مقارنة بالفترة السابقة. "
                "قد يكون السبب ضغطاً متزايداً على الخادم أو تراجعاً في أداء قاعدة البيانات."
            ),
            severity="⚠️",
        )

        sent = self.alerter.send(alert_message, cooldown=3600)
        if sent:
            self._total_alerts_sent += 1
            self.logger.info("تم إرسال تنبيه تدهور الأداء")

    # ── التقرير الأسبوعي ──

    def _should_send_weekly_report(self, now: float) -> bool:
        """يتحقق مما إذا كان يجب إرسال التقرير الأسبوعي (الأحد 6 مساءً UTC)."""
        dt = datetime.fromtimestamp(now, tz=timezone.utc)
        # هل هو الأحد بعد الساعة 6 مساءً؟
        is_sunday_after_6 = dt.weekday() == 6 and dt.hour >= 18

        # هل مرت فترة التقرير منذ آخر تقرير؟
        time_since_report = now - self._last_report

        # إرسال إذا كان الأحد بعد 6 مساءً ولم نرسل تقريراً في آخر 6 أيام على الأقل
        return is_sunday_after_6 and time_since_report >= (6 * 24 * 3600)

    def _calculate_last_sunday_18_utc(self) -> float:
        """يحسب طابع زمني آخر أحد الساعة 18:00 UTC."""
        now = datetime.now(timezone.utc)
        days_since_sunday = (now.weekday() + 1) % 7
        if days_since_sunday == 0 and now.hour < 18:
            days_since_sunday = 7
        last_sunday = now - timedelta(days=days_since_sunday)
        last_sunday = last_sunday.replace(hour=18, minute=0, second=0, microsecond=0)
        return last_sunday.timestamp()

    def _send_weekly_report(self) -> None:
        """يرسل تقريراً أسبوعياً شاملاً عبر Telegram."""
        self.logger.info("بدء إعداد التقرير الأسبوعي...")

        try:
            # تحميل بيانات الأسبوع الماضي
            weekly_metrics = load_historical_metrics(hours_back=168)

            if not weekly_metrics:
                self.logger.warning("لا توجد بيانات كافية للتقرير الأسبوعي")
                return

            # حساب إحصائيات الأسبوع
            weekly_stats = compute_endpoint_stats(weekly_metrics)

            # أزمنة الاستجابة الإجمالية
            all_times = [
                m["response_time_ms"]
                for m in weekly_metrics
                if m.get("response_time_ms") is not None
            ]
            overall = calculate_statistics(all_times)

            # إحصائيات الأسبوع السابق للمقارنة
            prev_weekly_metrics = []
            if os.path.exists(_METRICS_FILE):
                import json
                try:
                    with open(_METRICS_FILE, "r", encoding="utf-8") as f:
                        all_data = json.load(f)
                        now_ts = datetime.now(timezone.utc).timestamp()
                        cutoff = now_ts - (14 * 24 * 3600)
                        start = now_ts - (7 * 24 * 3600)
                        for record in all_data:
                            ts_str = record.get("timestamp", "")
                            if not ts_str:
                                continue
                            try:
                                ts = datetime.fromisoformat(ts_str).timestamp()
                                if cutoff <= ts <= start:
                                    prev_weekly_metrics.append(record)
                            except (ValueError, TypeError):
                                continue
                except (json.JSONDecodeError, IOError):
                    pass

            prev_weekly_stats = compute_endpoint_stats(prev_weekly_metrics)

            # اكتشاف التدهور (عتبة 20% للتقرير)
            degraded = detect_degradation(weekly_stats, prev_weekly_stats, 20)

            # إنشاء التوصيات
            recommendations = generate_recommendations(degraded)

            # تحديث وقت آخر تقرير
            self._last_report = time.time()

            # ── بناء التقرير ──

            # إحصائيات عامة
            stats = {
                "إجمالي القياسات": len(weekly_metrics),
                "نقاط النهاية المراقبة": len(weekly_stats),
                "متوسط زمن الاستجابة": f"{overall.get('avg', 'N/A')}ms",
                "P50 (الوسيط)": f"{overall.get('p50', 'N/A')}ms",
                "P95": f"{overall.get('p95', 'N/A')}ms",
                "P99": f"{overall.get('p99', 'N/A')}ms",
                "أبطأ نقطة": f"{overall.get('max', 'N/A')}ms",
                "أسرع نقطة": f"{overall.get('min', 'N/A')}ms",
            }

            # قسم تفاصيل نقاط النهاية
            endpoint_lines = []
            for path, stat in sorted(
                weekly_stats.items(), key=lambda x: x[1].get("avg", 0) or 0, reverse=True
            ):
                name = stat.get("name", path)
                avg = stat.get("avg", "N/A")
                p95 = stat.get("p95", "N/A")
                p99 = stat.get("p99", "N/A")
                count = stat.get("count", 0)

                # تحديد حالة الأداء
                if isinstance(avg, (int, float)):
                    if avg > self.config.SLOW_THRESHOLD_MS:
                        status_icon = "🔴"
                    elif avg > self.config.SLOW_THRESHOLD_MS * 0.6:
                        status_icon = "🟡"
                    else:
                        status_icon = "🟢"
                else:
                    status_icon = "⚪"

                endpoint_lines.append(
                    f"{status_icon} {name}: avg={avg}ms, "
                    f"P95={p95}ms, P99={p99}ms ({count} قياس)"
                )

            # قسم التدهور
            degradation_lines = []
            if degraded:
                for d in degraded:
                    degradation_lines.append(
                        f"⚠️ {d['name']}: {round(d['previous_avg'])}ms → "
                        f"{round(d['current_avg'])}ms (+{d['increase_pct']}%)"
                    )
            else:
                degradation_lines.append("✅ لا تدهور ملحوظ هذا الأسبوع")

            # قسم التوصيات
            rec_lines = []
            for rec in recommendations:
                rec_lines.append(rec)

            # بناء الأقسام
            sections = [
                ("📊 أداء نقاط النهاية", endpoint_lines),
                ("📉 التدهور (زيادة >20%)", degradation_lines),
                ("💡 التوصيات", rec_lines),
            ]

            # إرسال التقرير
            if self.alerter.is_configured:
                report_message = self.alerter.format_summary(
                    agent_name="⚡ وكيل الأداء — تقرير أسبوعي",
                    stats=stats,
                    sections=sections,
                )

                sent = self.alerter.send(report_message, cooldown=0)
                if sent:
                    self._total_alerts_sent += 1
                    self.logger.info("تم إرسال التقرير الأسبوعي بنجاح")
                else:
                    self.logger.warning("تعذر إرسال التقرير الأسبوعي")
            else:
                self.logger.warning("Telegram غير مضبوط — تخطي إرسال التقرير الأسبوعي")

        except Exception as e:
            self._total_errors += 1
            self.logger.error(f"خطأ أثناء إعداد التقرير الأسبوعي: {e}")

    # ── فحص الصحة ──

    def _update_health(
        self,
        healthy: bool = True,
        last_check: str | None = None,
    ) -> None:
        """يحدّث حالة فحص الصحة."""
        self.health.update(
            healthy=healthy,
            total_checks=self._total_collections,
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
                agent_name="⚡ وكيل الأداء",
                title="إيقاف الوكيل",
                details=[
                    f"تم استلام إشارة {signal_name}",
                    f"إجمالي عمليات الجمع: {self._total_collections}",
                    f"إجمالي الأخطاء: {self._total_errors}",
                    f"إجمالي التنبيهات المرسلة: {self._total_alerts_sent}",
                    "الوكيل يتوقف بشكل آمن...",
                ],
                severity="ℹ️",
            )
            self.alerter.send(shutdown_msg, cooldown=0)

        self._running = False

    def stop(self) -> None:
        """يوقف وكيل الأداء بشكل آمن."""
        self.logger.info("بدء إيقاف وكيل الأداء...")
        self._running = False
        self.health.stop()
        self.logger.info("تم إيقاف وكيل الأداء بنجاح")


# ── نقطة الدخول ──

def main() -> None:
    """نقطة الدخول الرئيسية لوكيل الأداء."""
    agent = PerformanceAgent()

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
    agent.logger.info("وكيل الأداء توقف بنجاح")


if __name__ == "__main__":
    main()
