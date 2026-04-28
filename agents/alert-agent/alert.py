"""
وكيل التنبيهات لمنصة روعة التجارية.
يراقب تنبيهات الأسعار المحددة من المستخدمين ويُفعّل الإشعارات عند تحقق الشروط.
يعمل كخدمة مستمرة على Railway.
"""

import os
import sys
import time
import signal
from datetime import datetime, timezone
from collections import defaultdict

import psycopg2

# إضافة المسار المشترك لاستيراد الوحدات
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '.'))

from shared.config_base import BaseConfig
from shared.telegram_utils import TelegramAlerter
from shared.logger import ColoredLogger
from shared.health_server import HealthCheckServer

from config import AlertConfig
from price_checker import batch_check_prices, check_alert_condition
from notifier import notify_user, mark_alert_triggered

# جسر الربط بموقع الأخبار
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'shared'))
try:
    from news_bridge import NewsBridge
except ImportError:
    NewsBridge = None


class AlertAgent:
    """وكيل التنبيهات — يراقب تنبيهات الأسعار ويُرسل الإشعارات."""

    def __init__(self) -> None:
        self.config = AlertConfig()
        self.logger = ColoredLogger(
            self.config.AGENT_NAME, self.config.LOG_LEVEL
        )
        self.alerter = TelegramAlerter(
            token=self.config.TELEGRAM_TOKEN,
            chat_id=self.config.TELEGRAM_CHAT_ID,
            cooldown=300,  # 5 دقائق تبريد لتنبيهات النظام
        )
        self.health = HealthCheckServer(
            self.config.AGENT_NAME, self.config.HEALTH_PORT
        )

        # اتصال قاعدة البيانات
        self._db_conn = None
        self._db_url = self.config.DATABASE_URL

        # جسر الربط بموقع الأخبار المالي
        self.news: NewsBridge | None = None
        if NewsBridge and self.config.NEWS_SITE_URL:
            self.news = NewsBridge(
                news_url=self.config.NEWS_SITE_URL,
                api_key=self.config.NEWS_API_KEY,
                logger=self.logger,
            )

        # حالة الوكيل
        self._running = False
        self._total_checks = 0
        self._total_triggered = 0
        self._total_notifications = 0
        self._total_errors = 0
        self._consecutive_db_errors = 0

    # ── بدء التشغيل ──

    def start(self) -> None:
        """يبدأ تشغيل وكيل التنبيهات."""
        self._running = True

        # بانر البدء
        self.logger.banner([
            "🔔  وكيل التنبيهات — روعة التجارية",
            "",
            f"  المنصة المستهدفة: {self.config.PLATFORM_URL}",
            f"  فترة الفحص: {self.config.ALERT_CHECK_INTERVAL} ثانية",
            f"  منفذ فحص الصحة: {self.config.HEALTH_PORT}",
            f"  أقصى محاولات الإشعار: {self.config.MAX_RETRIES}",
            f"  قاعدة البيانات: {'✅ متصلة' if self._db_url else '❌ غير مضبوطة'}",
            f"  Telegram: {'✅ مضبوط' if self.alerter.is_configured else '❌ غير مضبوط'}",
            f"  SMTP: {'✅ مضبوط' if self.config.SMTP_HOST else '❌ غير مضبوط'}",
            f"  موقع الأخبار: {'✅ مربوط' if self.news and self.news.is_configured else '⚠️ غير مربوط'}",
            "",
            "  بدء مراقبة التنبيهات...",
        ])

        # بدء خادم فحص الصحة
        self.health.start()

        # تسجيل معالجات الإشارات
        signal.signal(signal.SIGINT, self._handle_signal)
        signal.signal(signal.SIGTERM, self._handle_signal)

        # التحقق من اتصال قاعدة البيانات
        if not self._db_url:
            self.logger.critical(
                "لم يتم ضبط DATABASE_URL — لا يمكن متابعة التشغيل"
            )
            self._update_health(healthy=False)
            self._sleep(10)
            return

        self._ensure_db_connection()

        # حلقة المراقبة الرئيسية
        self._main_loop()

    # ── اتصال قاعدة البيانات ──

    def _ensure_db_connection(self) -> bool:
        """
        يتأكد من وجود اتصال نشط بقاعدة البيانات.
        يعيد الاتصال إذا كان الاتصال الحالي مقطوعاً.

        يعيد:
            True إذا كان الاتصال نشطاً، False إذا فشل
        """
        # التحقق من الاتصال الحالي
        if self._db_conn is not None:
            try:
                cursor = self._db_conn.cursor()
                cursor.execute("SELECT 1")
                cursor.close()
                return True
            except (psycopg2.OperationalError, psycopg2.InterfaceError):
                self.logger.warning("اتصال قاعدة البيانات مقطوع — إعادة الاتصال...")
                self._close_db_connection()

        # محاولة إنشاء اتصال جديد
        try:
            self._db_conn = psycopg2.connect(
                self._db_url,
                connect_timeout=10,
                application_name="alert-agent",
            )
            self._db_conn.autocommit = False
            self._consecutive_db_errors = 0
            self.logger.info("تم الاتصال بقاعدة البيانات بنجاح")
            return True
        except psycopg2.OperationalError as e:
            self._consecutive_db_errors += 1
            self.logger.error(
                f"فشل الاتصال بقاعدة البيانات (محاولة {self._consecutive_db_errors}): {e}"
            )
            return False
        except Exception as e:
            self._consecutive_db_errors += 1
            self.logger.error(f"خطأ غير متوقع في الاتصال بقاعدة البيانات: {e}")
            return False

    def _close_db_connection(self) -> None:
        """يغلق اتصال قاعدة البيانات بأمان."""
        if self._db_conn is not None:
            try:
                self._db_conn.close()
            except Exception:
                pass
            self._db_conn = None

    # ── الحلقة الرئيسية ──

    def _main_loop(self) -> None:
        """حلقة المراقبة الرئيسية — تفحص التنبيهات دورياً."""
        while self._running:
            try:
                cycle_start = time.time()

                self.logger.info("بدء دورة فحص التنبيهات...")

                # 1. جلب التنبيهات النشطة من قاعدة البيانات
                alerts = self._fetch_active_alerts()

                if alerts is None:
                    # خطأ في قاعدة البيانات
                    self._total_errors += 1
                    self._update_health(healthy=False)
                    self._sleep(self.config.ALERT_CHECK_INTERVAL)
                    continue

                if not alerts:
                    self._total_checks += 1
                    self.logger.info("لا توجد تنبيهات نشطة — الانتظار حتى الدورة التالية")
                    self._update_health(healthy=True)
                    self._sleep(self.config.ALERT_CHECK_INTERVAL)
                    continue

                # 2. تجميع التنبيهات حسب الرمز
                alerts_by_symbol = self._group_alerts_by_symbol(alerts)
                symbols = list(alerts_by_symbol.keys())

                self.logger.info(
                    f"تم العثور على {len(alerts)} تنبيه نشط لـ {len(symbols)} رمز"
                )

                # 3. جلب الأسعار الحالية لجميع الرموز
                prices = batch_check_prices(
                    self.config.PLATFORM_URL, symbols, self.logger
                )

                # 4. فحص كل تنبيه مقابل السعر الحالي
                triggered_alerts = []

                for symbol, symbol_alerts in alerts_by_symbol.items():
                    current_price = prices.get(symbol)

                    if current_price is None:
                        self.logger.warning(
                            f"تعذر جلب سعر {symbol} — تخطي {len(symbol_alerts)} تنبيه"
                        )
                        continue

                    for alert in symbol_alerts:
                        if check_alert_condition(alert, current_price):
                            triggered_alerts.append((alert, current_price))

                # 5. جلب أخبار ذات صلة بالرموز المراقبة (لإثراء الإشعارات)
                news_by_symbol: dict[str, str] = {}
                if self.news and self.news.is_configured and symbols:
                    try:
                        # جلب آخر الأخبار المالية
                        news_data = self.news.get_news(limit=10, lang="ar")
                        if news_data and news_data.get("data"):
                            for item in news_data.get("data", []):
                                title = item.get("title", "")
                                # محاولة مطابقة الرمز مع عنوان الخبر
                                for sym in symbols:
                                    base = sym.split("/")[0]
                                    if base in title.upper() or sym in title:
                                        if sym not in news_by_symbol:
                                            news_by_symbol[sym] = title
                                        break
                    except Exception as e:
                        self.logger.debug(f"تعذر جلب الأخبار ذات الصلة: {e}")

                # 6. معالجة التنبيهات المُفعَّلة
                if triggered_alerts:
                    self.logger.info(
                        f"تم تفعيل {len(triggered_alerts)} تنبيه!"
                    )
                    self._process_triggered_alerts(triggered_alerts, news_by_symbol)
                else:
                    self.logger.debug("لم يتم تفعيل أي تنبيه في هذه الدورة")

                # تحديث الإحصائيات
                self._total_checks += 1
                cycle_duration = round(time.time() - cycle_start, 2)
                self.logger.info(
                    f"اكتملت دورة الفحص في {cycle_duration} ثانية — "
                    f"تم فحص {len(alerts)} تنبيه، تم تفعيل {len(triggered_alerts)}"
                )

                # تحديث حالة الصحة
                self._update_health(healthy=True)

            except Exception as e:
                self._total_errors += 1
                self.logger.error(f"خطأ في حلقة المراقبة: {e}")

                # إرسال تنبيه خطأ عبر Telegram
                if self.alerter.is_configured:
                    error_msg = self.alerter.format_alert(
                        agent_name="🔔 وكيل التنبيهات",
                        title="خطأ في حلقة المراقبة",
                        details=[str(e)[:200]],
                        severity="⚠️",
                    )
                    self.alerter.send(error_msg, cooldown=300)

                self._update_health(healthy=False)

            # الانتظار حتى الدورة التالية
            self._sleep(self.config.ALERT_CHECK_INTERVAL)

    # ── جلب التنبيهات ──

    def _fetch_active_alerts(self) -> list[dict] | None:
        """
        يجلب جميع التنبيهات النشطة من قاعدة البيانات.

        يعيد:
            قائمة بالتنبيهات النشطة، أو None في حالة خطأ قاعدة البيانات
        """
        if not self._ensure_db_connection():
            return None

        try:
            cursor = self._db_conn.cursor()

            cursor.execute(
                """
                SELECT "id", "userId", "symbol", "condition", "targetPrice",
                       "isActive", "isTriggered", "createdAt", "updatedAt"
                FROM "Alert"
                WHERE "isActive" = true AND "isTriggered" = false
                ORDER BY "createdAt" DESC
                """
            )

            columns = [desc[0] for desc in cursor.description]
            rows = cursor.fetchall()
            cursor.close()

            alerts = []
            for row in rows:
                alert = dict(zip(columns, row))
                # تحويل Decimal إلى float لضمان التوافق
                if alert.get("targetPrice") is not None:
                    alert["targetPrice"] = float(alert["targetPrice"])
                alerts.append(alert)

            return alerts

        except psycopg2.errors.UndefinedTable:
            self.logger.warning(
                'جدول "Alert" غير موجود في قاعدة البيانات — '
                "تأكد من تشغيل ترحيلات Prisma أولاً"
            )
            # محاولة إغلاق الاتصال التالف
            self._close_db_connection()
            return []
        except psycopg2.OperationalError as e:
            self.logger.error(f"خطأ اتصال في قاعدة البيانات: {e}")
            self._close_db_connection()
            return None
        except psycopg2.Error as e:
            self.logger.error(f"خطأ في استعلام قاعدة البيانات: {e}")
            try:
                self._db_conn.rollback()
            except Exception:
                self._close_db_connection()
            return None
        except Exception as e:
            self.logger.error(f"خطأ غير متوقع في جلب التنبيهات: {e}")
            return None

    def _group_alerts_by_symbol(
        self, alerts: list[dict]
    ) -> dict[str, list[dict]]:
        """
        يجمع التنبيهات حسب رمز الأصل المالي.

        المعاملات:
            alerts: قائمة التنبيهات

        يعيد:
            قاموس من الرمز إلى قائمة التنبيهات
        """
        grouped: dict[str, list[dict]] = defaultdict(list)
        for alert in alerts:
            symbol = alert.get("symbol", "")
            if symbol:
                grouped[symbol].append(alert)
        return dict(grouped)

    # ── معالجة التنبيهات المُفعَّلة ──

    def _process_triggered_alerts(
        self,
        triggered_alerts: list[tuple[dict, float]],
        news_by_symbol: dict[str, str] | None = None,
    ) -> None:
        """
        يعالج التنبيهات المُفعَّلة بإرسال الإشعارات وتحديث الحالة.
        يُضيف أخباراً ذات صلة بالرمز عند توفرها.

        المعاملات:
            triggered_alerts: قائمة من أزواج (التنبيه، السعر الحالي)
            news_by_symbol: قاموس من الرمز إلى آخر خبر ذي صلة
        """
        news_by_symbol = news_by_symbol or {}

        for alert, current_price in triggered_alerts:
            alert_id = alert.get("id", "غير محدد")
            symbol = alert.get("symbol", "غير محدد")

            try:
                self.logger.info(
                    f"معالجة تنبيه مُفعَّل: {symbol} — "
                    f"السعر الحالي: {current_price:,.4f} — "
                    f"الهدف: {alert.get('targetPrice', 0):,.4f}"
                )

                # إرسال الإشعارات بجميع الطرق
                results = notify_user(
                    alert=alert,
                    current_price=current_price,
                    config=self.config,
                    alerter=self.alerter,
                    db_url=self._db_url,
                    logger=self.logger,
                )

                # إرسال خبر ذي صلة عبر Telegram إذا توفر
                related_news = news_by_symbol.get(symbol)
                if related_news and self.alerter.is_configured:
                    news_msg = (
                        f"📰 <b>خبر ذو صلة بـ {symbol}</b>\n"
                        f"{related_news}"
                    )
                    self.alerter.send(news_msg, cooldown=0)

                # تحديث الإحصائيات
                self._total_triggered += 1
                if any(results.values()):
                    self._total_notifications += 1

                self.logger.info(
                    f"تمت معالجة التنبيه {alert_id}: {results}"
                )

            except Exception as e:
                self._total_errors += 1
                self.logger.error(
                    f"خطأ في معالجة التنبيه {alert_id}: {e}"
                )

    # ── فحص الصحة ──

    def _update_health(
        self,
        healthy: bool = True,
        last_check: str | None = None,
    ) -> None:
        """يحدّث حالة فحص الصحة."""
        self.health.update(
            healthy=healthy,
            total_checks=self._total_checks,
            total_errors=self._total_errors,
            last_check=last_check or datetime.now(timezone.utc).strftime(
                "%Y-%m-%d %H:%M UTC"
            ),
        )

    # ── معالجة الإشارات ──

    def _handle_signal(self, signum: int, frame) -> None:
        """يعالج إشارات الإيقاف."""
        signal_name = signal.Signals(signum).name
        self.logger.info(f"تم استلام إشارة {signal_name} — بدء الإيقاف الآمن...")

        # إرسال تنبيه إيقاف
        if self.alerter.is_configured:
            shutdown_msg = self.alerter.format_alert(
                agent_name="🔔 وكيل التنبيهات",
                title="إيقاف الوكيل",
                details=[
                    f"تم استلام إشارة {signal_name}",
                    f"إجمالي دورات الفحص: {self._total_checks}",
                    f"إجمالي التنبيهات المُفعَّلة: {self._total_triggered}",
                    f"إجمالي الإشعارات المُرسلة: {self._total_notifications}",
                    f"إجمالي الأخطاء: {self._total_errors}",
                    "الوكيل يتوقف بشكل آمن...",
                ],
                severity="ℹ️",
            )
            self.alerter.send(shutdown_msg, cooldown=0)

        self._running = False

    # ── الانتظار ──

    def _sleep(self, seconds: int) -> None:
        """ينتظر مع فحص حالة التشغيل."""
        for _ in range(seconds):
            if not self._running:
                break
            time.sleep(1)

    # ── الإيقاف ──

    def stop(self) -> None:
        """يوقف وكيل التنبيهات بشكل آمن."""
        self.logger.info("بدء إيقاف وكيل التنبيهات...")
        self._running = False
        self._close_db_connection()
        self.health.stop()
        self.logger.info("تم إيقاف وكيل التنبيهات بنجاح")


# ── نقطة الدخول ──

def main() -> None:
    """نقطة الدخول الرئيسية لوكيل التنبيهات."""
    agent = AlertAgent()

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
    agent.logger.info("وكيل التنبيهات توقف بنجاح")


if __name__ == "__main__":
    main()
